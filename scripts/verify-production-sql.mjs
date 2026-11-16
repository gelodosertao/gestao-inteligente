import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH ?? resolve(process.env.TEMP ?? '/tmp', 'gelo-production-sql-test/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
let sequence = 0;
const id = () => `77777777-7777-4777-8777-${String(++sequence).padStart(12, '0')}`;
const batch = (operationId, ingredients, quantity = 10) => db.query('select register_production_batch($1,$2::jsonb,$3::jsonb)',
  [operationId, JSON.stringify({ productId: 'ice', quantity, shift: 'Manhã' }), JSON.stringify(ingredients)]);
const value = async sql => (await db.query(sql)).rows[0].value;
try {
  // Same isolated schema as the inventory verifier, extracted before its test body.
  const fixture = await readFile(new URL('./verify-inventory-sql.mjs', import.meta.url), 'utf8');
  const schema = fixture.match(/const schema = `([\s\S]*?)`;/)[1]
    .replaceAll('${tenant}', tenant).replaceAll('${user}', user);
  await db.exec(schema);
  await db.exec(`create table production_logs(id text primary key, date text, product_id text, product_name text,
    quantity numeric, shift text, responsible text, notes text, tenant_id uuid);`);
  for (const migration of ['202611120001_production_stock_operations.sql', '202611160001_inventory_operations.sql', '202611160003_production_integrity.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  await db.exec(`insert into products(id,name,category,unit,tenant_id,stock_matriz_ibotirama,recipe,recipe_batch_size,cost)
    values ('ice','Gelo 5kg','Gelo Cubo','un','${tenant}',0,'[{"ingredientId":"bag","quantity":100}]',100,3),
      ('bag','Saco','Insumo','un','${tenant}',10,null,null,1);`);
  await assert.rejects(batch(id(), [{ ingredientId: 'bag', quantity: 12 }]), /insuficiente/);
  assert.equal(await value('select count(*)::int as value from production_logs'), 0);
  assert.equal(await value('select count(*)::int as value from stock_movements'), 0);
  await assert.rejects(batch(id(), []), /todos e somente/);
  await assert.rejects(batch(id(), [{ ingredientId: 'missing', quantity: 1 }]), /todos e somente/);
  for (const quantity of [0, -1, 'NaN', 'Infinity']) await assert.rejects(batch(id(), [{ ingredientId: 'bag', quantity }]));
  await db.exec(`grant usage on schema public, auth to authenticated; set role authenticated;`);
  const first = id();
  const ingredients = [{ ingredientId: 'bag', quantity: 2 }, { ingredientId: 'bag', quantity: 3 }];
  await batch(first, ingredients); await batch(first, ingredients);
  await db.exec('reset role');
  assert.equal(await value("select stock_matriz_ibotirama::float8 as value from products where id='bag'"), 5);
  assert.equal(await value("select stock_matriz_ibotirama::float8 as value from products where id='ice'"), 10);
  assert.equal(await value('select count(*)::int as value from stock_movements'), 2);
  await assert.rejects(batch(first, [{ ingredientId: 'bag', quantity: 1 }]), /identificador/);
  const concurrent = await Promise.allSettled([batch(id(), [{ ingredientId: 'bag', quantity: 4 }]), batch(id(), [{ ingredientId: 'bag', quantity: 4 }])]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await value("select stock_matriz_ibotirama::float8 as value from products where id='bag'"), 1);
  const loss = id();
  await db.query("select register_production_loss($1,'ice',1,'Derretimento')", [loss]);
  await db.query("select register_production_loss($1,'ice',1,'Derretimento')", [loss]);
  assert.equal(await value('select count(*)::int as value from financials'), 1);
  await db.exec(`update products set recipe='[{"ingredientId":"missing","quantity":1}]' where id='ice';`);
  await assert.rejects(batch(id(), [{ ingredientId: 'missing', quantity: 1 }]), /indisponível/);
  await db.exec(`update app_users set role='OPERATOR' where id='${user}';`);
  await assert.rejects(batch(id(), []), /sem acesso/);
  await db.exec(`update app_users set role='FACTORY',tenant_id='99999999-9999-4999-8999-999999999999' where id='${user}';`);
  await assert.rejects(batch(id(), []), /indisponível/);
  console.log('Production SQL verified: shortage rollback, complete recipe, positive consumption, authenticated definer path, consolidated demand, retry, serialized exits, loss finance, missing ingredients, authorization and tenant isolation.');
} finally { await db.close(); }
