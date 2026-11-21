import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run against an ephemeral, in-memory Postgres. No remote credentials are used.
const modulePath = process.env.PGLITE_MODULE_PATH ?? resolve(process.env.TEMP ?? '/tmp', 'gelo-production-sql-test/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
let sequence = 0;
const operationId = () => `33333333-3333-4333-8333-${String(++sequence).padStart(12, '0')}`;
const schema = `
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table tenants(id uuid primary key);
create table app_users(id text primary key, tenant_id uuid, name text, role text, is_active boolean, must_change_password boolean, allowed_modules text[]);
create table products(id text primary key,name text,category text,price_matriz numeric,price_filial numeric,cost numeric,
stock_matriz_ibotirama numeric,stock_matriz_barreiras numeric,stock_filial integer,unit text,min_stock integer,
pack_size integer,price_pack numeric,is_stock_controlled boolean,combo_items jsonb,image text,recipe jsonb,
recipe_batch_size numeric,operational_cost numeric,options jsonb,barcode text,expiration_date date,tenant_id uuid);
create table stock_movements(id text primary key,date text,product_id text,product_name text,quantity numeric,type text,
reason text,branch text,matriz_deposit text,tenant_id uuid,operation_id uuid,event_type text);
create unique index stock_events on stock_movements(tenant_id,operation_id,product_id,event_type) where operation_id is not null;
create table financials(id text primary key,date text,description text,amount numeric,type text,category text,branch text,
tenant_id uuid,operation_id uuid,event_type text);
create unique index financial_operation on financials(tenant_id,operation_id) where operation_id is not null;
insert into tenants values ('${tenant}');
insert into app_users values ('${user}','${tenant}','Operador teste','ADMIN',true,false,'{}');
set test.uid='${user}';
`;
const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0].value;
const count = table => scalar(`select count(*)::int as value from ${table}`);
const stocks = async id => (await db.query('select stock_matriz_ibotirama::float8 as ibotirama, stock_matriz_barreiras::float8 as barreiras, stock_filial::float8 as filial from products where id=$1', [id])).rows[0];
const product = (id, overrides = {}) => ({ id, name: `Gelo ${id}`, category: 'Gelo Cubo', priceMatriz: 6, priceFilial: 8, cost: 3, stockMatrizIbotirama: 100, stockMatrizBarreiras: 10, stockFilial: 2, unit: 'un', minStock: 0, ...overrides });
const create = (id, p) => db.query('select create_inventory_product($1,$2::jsonb,$3)', [id, JSON.stringify(p), tenant]);
const mutate = op => db.query('select mutate_inventory_stock($1::jsonb)', [JSON.stringify(op)]);
const receipt = (id, key, items, deposit = 'Barreiras') => db.query('select receive_inventory_xml($1,$2,$3,$4::jsonb)', [id, key, deposit, JSON.stringify(items)]);
try {
  await db.exec(schema);
  await db.exec(await readFile(new URL('../supabase/migrations/202611160001_inventory_operations.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202611210001_archive_inventory_products.sql', import.meta.url), 'utf8'));
  const saleMigration = await readFile(new URL('../supabase/migrations/202609220001_atomic_sale_operations.sql', import.meta.url), 'utf8');
  const stockProductFk = saleMigration.match(/alter table public\.stock_movements\s+add constraint stock_movements_tenant_product_fk[\s\S]*?not valid;/)?.[0];
  assert.ok(stockProductFk, 'Use the actual stock/product foreign key from the sale migration');
  await db.exec('create unique index products_tenant_id_id_uidx on products(tenant_id,id)');
  await db.exec(stockProductFk);
  const initialId = operationId();
  const initial = product('ice');
  await create(initialId, initial);
  assert.equal(await count('stock_movements'), 3);
  assert.deepEqual(await stocks('ice'), { ibotirama: 100, barreiras: 10, filial: 2 });
  await create(initialId, initial);
  assert.equal(await count('stock_movements'), 3);
  await assert.rejects(create(initialId, { ...initial, name: 'Alterado' }), /dados diferentes/);

  const transfer = { operationId: operationId(), action: 'transfer', productId: 'ice', fromDeposit: 'Ibotirama', toDeposit: 'Barreiras', quantity: 20, reason: 'Reposição' };
  await mutate(transfer); await mutate(transfer);
  assert.deepEqual(await stocks('ice'), { ibotirama: 80, barreiras: 30, filial: 2 });
  assert.equal(await count('stock_movements'), 5);
  for (const quantity of [-5, 0, 1000, 'NaN', 'Infinity']) {
    await assert.rejects(mutate({ ...transfer, operationId: operationId(), quantity }));
  }
  await assert.rejects(mutate({ ...transfer, operationId: operationId(), toDeposit: 'Inexistente' }));
  assert.deepEqual(await stocks('ice'), { ibotirama: 80, barreiras: 30, filial: 2 });
  assert.equal(await count('stock_movements'), 5);

  const loss = { operationId: operationId(), action: 'loss', productId: 'ice', deposit: 'Barreiras', quantity: 5, reason: 'Derretimento' };
  await mutate(loss); await mutate(loss);
  assert.equal(await scalar('select amount::float8 as value from financials'), 15);
  assert.equal(await count('financials'), 1);
  assert.deepEqual(await stocks('ice'), { ibotirama: 80, barreiras: 25, filial: 2 });
  const adjust = { operationId: operationId(), action: 'adjust', productId: 'ice', deposit: 'Barreiras', quantity: 23, expectedStock: 25, reason: 'Contagem física' };
  await mutate(adjust); await mutate(adjust);
  await assert.rejects(mutate({ ...adjust, operationId: operationId() }), /saldo mudou/);
  assert.equal(await scalar("select quantity::float8 as value from stock_movements where type='ADJUSTMENT'"), -2);

  const key = '1'.repeat(44);
  const receiptId = operationId();
  const items = [{ productId: 'ice', quantity: 1.5, supplierCode: 'ABC' }];
  await receipt(receiptId, key, items, 'Filial'); await receipt(receiptId, key, items, 'Filial');
  assert.equal((await stocks('ice')).filial, 3.5);
  await assert.rejects(receipt(operationId(), key, items), /já foi recebida/);
  await assert.rejects(receipt(receiptId, key, [{ productId: 'ice', quantity: 8 }]), /dados diferentes/);
  const before = await stocks('ice');
  await assert.rejects(receipt(operationId(), '2'.repeat(44), [{ productId: 'ice', quantity: 2 }, { productId: 'missing', quantity: 3 }]));
  assert.deepEqual(await stocks('ice'), before);
  assert.equal(await count('inventory_receipts'), 1);
  const newProduct = product('new', { stockMatrizIbotirama: 0, stockMatrizBarreiras: 0, stockFilial: 0 });
  await receipt(operationId(), '3'.repeat(44), [{ productId: 'new', product: newProduct, quantity: 7 }]);
  assert.equal((await stocks('new')).barreiras, 7);
  await assert.rejects(create(operationId(), product('invalid', { stockFilial: -1 })));
  assert.equal(await scalar("select count(*)::int as value from products where id='invalid'"), 0);

  // Independent identities serialize their stock changes; insufficient balance rolls back everything.
  const exits = [4, 4].map(quantity => mutate({ operationId: operationId(), action: 'loss', productId: 'new', deposit: 'Barreiras', quantity, reason: 'Avaria' }));
  const results = await Promise.allSettled(exits);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await stocks('new')).barreiras, 3);
  await db.exec('grant select, update on products to authenticated; set role authenticated;');
  await assert.rejects(db.exec("update products set stock_matriz_barreiras=999 where id='new'"), /operação de estoque/);
  await db.exec("update products set name='Gelo novo' where id='new'");
  await mutate({ ...transfer, operationId: operationId(), productId: 'new', fromDeposit: 'Barreiras', toDeposit: 'Filial', quantity: 1 });
  await assert.rejects(db.query('select inventory_actor()'), /permission denied/);
  await db.exec('reset role;');
  assert.deepEqual(await stocks('new'), { ibotirama: 0, barreiras: 2, filial: 1 });
  const ledgerBeforeInvalidCost = await count('stock_movements');
  await db.exec("update products set cost=-1 where id='new'");
  await assert.rejects(mutate({ ...loss, operationId: operationId(), productId: 'new', quantity: 1 }), /Custo do produto inválido/);
  assert.equal(await count('stock_movements'), ledgerBeforeInvalidCost);
  assert.equal((await stocks('new')).barreiras, 2);
  // Reproduce the original failure using a real product and its initial ledger entries.
  await assert.rejects(db.query("delete from products where id='ice'"), error => error.code === '23503');
  const movementsBeforeArchive = await count('stock_movements');
  const balancesBeforeArchive = await stocks('ice');
  const archive = (id = 'ice', factory = tenant) => db.query('select archive_inventory_product($1,$2)', [id, factory]);
  await db.exec("update products set recipe='[{\"ingredientId\":\"ice\",\"quantity\":1}]' where id='new'");
  await assert.rejects(archive(), /combo ou receita/);
  await db.exec("update products set recipe=null,combo_items='[{\"productId\":\"ice\",\"quantity\":1}]' where id='new'");
  await assert.rejects(archive(), /combo ou receita/);
  await db.exec("update products set combo_items=null where id='new'; set role authenticated;");
  await archive();
  await archive();
  await assert.rejects(archive('missing'), /Produto não encontrado/);
  await assert.rejects(archive('new', '55555555-5555-4555-8555-555555555555'), /Fábrica inválida/);
  await db.exec('reset role');
  assert.equal(await scalar("select count(*)::int as value from products where id='ice' and archived_at is not null"), 1);
  assert.equal(await scalar("select count(*)::int as value from products where id='ice' and archived_at is null"), 0);
  assert.equal(await count('stock_movements'), movementsBeforeArchive);
  assert.deepEqual(await stocks('ice'), balancesBeforeArchive);
  await db.exec(`update app_users set is_active=false where id='${user}'`);
  await assert.rejects(archive('new'), /Apenas administradores/);
  await db.exec(`update app_users set is_active=true,must_change_password=true where id='${user}'`);
  await assert.rejects(archive('new'), /Apenas administradores/);
  await db.exec(`update app_users set must_change_password=false where id='${user}'`);
  await db.exec(`insert into app_users values ('44444444-4444-4444-8444-444444444444','${tenant}','Vendedor','WHOLESALE_REPRESENTATIVE',true,false,'{}'); set test.uid='44444444-4444-4444-8444-444444444444';`);
  await assert.rejects(mutate({ ...loss, operationId: operationId() }), /sem acesso/);
  await assert.rejects(archive('new'), /Apenas administradores/);
  await db.exec(`set test.uid='${user}'; update app_users set tenant_id='55555555-5555-4555-8555-555555555555' where id='${user}'; insert into tenants values ('55555555-5555-4555-8555-555555555555');`);
  await assert.rejects(mutate({ ...loss, operationId: operationId() }), /indisponível/);
  await assert.rejects(archive('new', '55555555-5555-4555-8555-555555555555'), /Produto não encontrado/);
  console.log('Product archival verified: original FK failure, preserved history/balances, active catalogue filter, retry, recipe/combo dependencies, admin permissions and tenant isolation.');
  console.log('Inventory SQL verified: atomic creation, transfer, loss/finance, adjustment conflicts, receipt deduplication, rollback, fractional units, authenticated balance guard, permissions and tenant isolation.');
} finally {
  await db.close();
}
