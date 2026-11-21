import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Additive migration proof in an isolated database; no remote credentials/data.
const modulePath = process.env.PGLITE_MODULE_PATH ?? resolve(process.env.TEMP ?? '/tmp', 'gelo-production-sql-test/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
let sequence = 0;
let checks = 0;
const id = () => `88888888-8888-4888-8888-${String(++sequence).padStart(12, '0')}`;
const sqlFile = file => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const reject = async (promise, pattern) => { await assert.rejects(promise, pattern); checks++; };
const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0].value;
const stocks = async productId => (await db.query('select stock_matriz_ibotirama::float8 as ibotirama, stock_matriz_barreiras::float8 as barreiras, stock_filial::float8 as filial from products where id=$1', [productId])).rows[0];
const mutate = operation => db.query('select mutate_inventory_stock($1::jsonb)', [JSON.stringify(operation)]);
const create = product => db.query('select create_inventory_product($1,$2::jsonb,$3)', [id(), JSON.stringify(product), tenant]);
const receipt = (deposit, items) => db.query('select receive_inventory_xml($1,$2,$3,$4::jsonb)', [id(), String(sequence).padStart(44, '0'), deposit, JSON.stringify(items)]);
const product = (productId, overrides = {}) => ({ id: productId, name: 'Gelo 5kg', category: 'Gelo Cubo', unit: 'un', cost: 3, priceMatriz: 10, priceFilial: 12, minStock: 0, stockMatrizIbotirama: 10, stockMatrizBarreiras: 20, ...overrides });
const history = async () => (await db.query(`select jsonb_build_object(
  'products', (select jsonb_agg(to_jsonb(p) order by id) from products p),
  'movements', (select jsonb_agg(to_jsonb(m) order by id) from stock_movements m),
  'financials', (select jsonb_agg(to_jsonb(f) order by id) from financials f)
) as value`)).rows[0].value;

try {
  const fixture = await readFile(new URL('./verify-inventory-sql.mjs', import.meta.url), 'utf8');
  const schema = fixture.match(/const schema = `([\s\S]*?)`;/)[1]
    .replaceAll('${tenant}', tenant).replaceAll('${user}', user)
    .replace(/create unique index financial_operation[^;]*;/, '')
    .replace(/create unique index stock_events[^;]*;/, '');
  const wholesale = await sqlFile('202611160002_wholesale_confirmation.sql');
  const saleColumns = wholesale.match(/insert into public\.sales \(([\s\S]*?)\) values/)[1].split(',').map(column => column.trim());
  const jsonColumns = new Set(['payment_splits', 'items', 'payment_history', 'customer_details', 'stock_effects', 'fiscal_context']);
  const numericColumns = new Set(['total', 'cash_received', 'change_amount', 'amount_paid', 'delivery_fee', 'discount', 'commission_amount']);
  const salesSchema = saleColumns.map(column => `${column} ${column === 'id' ? 'text primary key' : column === 'tenant_id' ? 'uuid' : jsonColumns.has(column) ? 'jsonb' : numericColumns.has(column) ? 'numeric' : ['created_at', 'nfe_issued_at'].includes(column) ? 'timestamptz' : column === 'has_invoice' ? 'boolean' : 'text'}`).join(',');
  await db.exec(schema);
  await db.exec(`
    create schema private;
    create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
    create function private.current_user_can_any(p_modules text[]) returns boolean language sql stable as $$
      select exists(select from app_users where id=auth.uid()::text and is_active and not must_change_password
        and (role='ADMIN' or allowed_modules && p_modules)) $$;
    create table sales(${salesSchema});
    alter table sales add column nfe_environment smallint;
    create table sale_items(id bigserial primary key,tenant_id uuid,sale_id text,product_id text,product_name text,
      quantity numeric,price_at_sale numeric,selected_options jsonb,notes text,ncm text,cfop text,cst text);
    alter table stock_movements add column sale_id text;
    alter table financials add column payment_method text, add column sale_id text;
    create table production_logs(id text primary key,date text,product_id text,product_name text,
      quantity numeric,shift text,responsible text,notes text,tenant_id uuid);
  `);
  for (const migration of ['202609220001_atomic_sale_operations.sql', '202611120001_production_stock_operations.sql', '202611160001_inventory_operations.sql', '202611160002_wholesale_confirmation.sql', '202611160003_production_integrity.sql']) {
    await db.exec(await sqlFile(migration));
  }
  await create(product('historic', { stockFilial: 7 }));
  await mutate({ operationId: id(), action: 'loss', productId: 'historic', deposit: 'Filial', quantity: 2, reason: 'Perda histórica' });
  const historyBefore = await history();
  const filialBefore = (await stocks('historic')).filial;
  const legacyFunctionsBefore = (await db.query(`select oid::regprocedure::text as signature, prosrc from pg_proc
    where oid in ('public.apply_sale_operation(uuid,text,text,jsonb)'::regprocedure,
      'public.register_production_batch(uuid,jsonb,jsonb)'::regprocedure,
      'public.register_production_loss(uuid,text,numeric,text)'::regprocedure) order by signature`)).rows;
  check(filialBefore, 5);
  await db.exec(await sqlFile('202611160004_factory_deposits.sql'));
  check(await history(), historyBefore);
  check((await db.query(`select oid::regprocedure::text as signature, prosrc from pg_proc
    where oid in ('public.apply_sale_operation(uuid,text,text,jsonb)'::regprocedure,
      'public.register_production_batch(uuid,jsonb,jsonb)'::regprocedure,
      'public.register_production_loss(uuid,text,numeric,text)'::regprocedure) order by signature`)).rows, legacyFunctionsBefore);
  await db.exec('grant usage on schema public,auth to authenticated; grant select on products,stock_movements,financials to authenticated; set role authenticated;');

  const invalidOperations = [
    { action: 'loss', deposit: 'Filial', quantity: 1 },
    { action: 'adjust', deposit: 'Filial', quantity: 0, expectedStock: filialBefore },
    { action: 'transfer', fromDeposit: 'Ibotirama', toDeposit: 'Filial', quantity: 1 },
    { action: 'transfer', fromDeposit: 'Filial', toDeposit: 'Barreiras', quantity: 1 },
    { action: 'transfer', fromDeposit: null, toDeposit: 'Barreiras', quantity: 1 },
    { action: 'loss', deposit: null, quantity: 1 },
    { action: 'loss', deposit: 'Depósito inventado', quantity: 1 }
  ];
  for (const operation of invalidOperations) {
    await reject(mutate({ operationId: id(), productId: 'historic', reason: 'Operação recusada', ...operation }), /Ibotirama|Barreiras/);
  }
  await reject(receipt('Filial', [{ productId: 'historic', quantity: 1 }]), /Ibotirama|Barreiras/);
  await reject(receipt(null, [{ productId: 'historic', quantity: 1 }]), /Ibotirama|Barreiras/);
  for (const stockFilial of [1, -1, 'NaN', 'Infinity']) {
    await reject(create(product(`blocked-${sequence}`, { stockFilial })), /somente em Ibotirama e Barreiras/);
  }
  check(await history(), historyBefore);

  const transfer = { operationId: id(), action: 'transfer', productId: 'historic', fromDeposit: 'Ibotirama', toDeposit: 'Barreiras', quantity: 2, reason: 'Reposição fábrica' };
  await mutate(transfer); await mutate(transfer);
  check(await stocks('historic'), { ibotirama: 8, barreiras: 22, filial: filialBefore });
  await mutate({ operationId: id(), action: 'loss', productId: 'historic', deposit: 'Barreiras', quantity: 1, reason: 'Derretimento' });
  await mutate({ operationId: id(), action: 'adjust', productId: 'historic', deposit: 'Ibotirama', quantity: 12, expectedStock: 8, reason: 'Conferência' });
  await receipt('Barreiras', [{ productId: 'historic', quantity: 3 }]);
  check(await stocks('historic'), { ibotirama: 12, barreiras: 24, filial: filialBefore });
  await create(product('new-omitted', { stockMatrizIbotirama: 4, stockMatrizBarreiras: 6 }));
  await create(product('new-zero', { stockFilial: 0 }));
  check(await stocks('new-omitted'), { ibotirama: 4, barreiras: 6, filial: 0 });
  check((await stocks('new-zero')).filial, 0);
  const productionLoss = id();
  await db.query("select register_production_loss($1,'historic',1,'Perda fábrica')", [productionLoss]);
  check(await stocks('historic'), { ibotirama: 11, barreiras: 24, filial: filialBefore });

  await reject(db.query('select mutate_inventory_stock_v1_private($1::jsonb)', [JSON.stringify({ ...transfer, operationId: id() })]), /permission denied/);
  await reject(db.query('select receive_inventory_xml_v1_private($1,$2,$3,$4::jsonb)', [id(), '7'.repeat(44), 'Filial', JSON.stringify([{ productId: 'historic', quantity: 1 }])]), /permission denied/);
  await reject(db.query('select create_inventory_product_v1_private($1,$2::jsonb,$3)', [id(), JSON.stringify(product('bypass', { stockFilial: 1 })), tenant]), /permission denied/);
  await db.exec('reset role');
  for (const role of ['authenticated', 'anon']) {
    for (const signature of ['mutate_inventory_stock_v1_private(jsonb)', 'receive_inventory_xml_v1_private(uuid,text,text,jsonb)', 'create_inventory_product_v1_private(uuid,jsonb,uuid)']) {
      check(await scalar('select has_function_privilege($1,$2,$3) as value', [role, signature, 'EXECUTE']), false);
    }
  }
  await db.exec(`update app_users set is_active=false where id='${user}'; set role authenticated;`);
  await reject(mutate({ ...transfer, operationId: id() }), /sem acesso/);
  await db.exec('reset role');
  // Historical Filial records and their monetary amounts remain byte-for-byte.
  check((await stocks('historic')).filial, filialBefore);
  for (const record of historyBefore.movements) {
    check((await db.query('select to_jsonb(m) as value from stock_movements m where id=$1', [record.id])).rows[0].value, record);
  }
  for (const record of historyBefore.financials) {
    check((await db.query('select to_jsonb(f) as value from financials f where id=$1', [record.id])).rows[0].value, record);
  }
  console.log(JSON.stringify({ passed: checks, migrationsApplied: ['001', '002', '003', '004'], activeDeposits: ['Ibotirama', 'Barreiras'], historicFilialBalance: filialBefore, historyPreserved: true, privateRpcAccessDenied: true, database: 'disposable single-connection PGlite', remoteChanges: false }));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, code: error.code, where: error.where, detail: error.detail, actual: error.actual, expected: error.expected, stack: error.stack?.split('\n').slice(0, 5) }));
  process.exitCode = 1;
} finally {
  await db.close();
}
