import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Integration proof in a disposable database; never opens a remote connection.
// A single PGlite connection exercises transaction behavior, not real lock races.
const modulePath = process.env.PGLITE_MODULE_PATH ?? resolve(process.env.TEMP ?? '/tmp', 'gelo-production-sql-test/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
let sequence = 0;
let checks = 0;
const id = () => `99999999-9999-4999-8999-${String(++sequence).padStart(12, '0')}`;
const sqlFile = file => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const reject = async (promise, pattern) => { await assert.rejects(promise, pattern); checks++; };
const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0].value;
const stocks = async productId => (await db.query('select stock_matriz_ibotirama::float8 as ibotirama, stock_matriz_barreiras::float8 as barreiras, stock_filial::float8 as filial from products where id=$1', [productId])).rows[0];
const finance = saleId => scalar("select coalesce(sum(amount),0)::float8 as value from financials where sale_id=$1 and type='Income'", [saleId]);
const mutate = operation => db.query('select mutate_inventory_stock($1::jsonb)', [JSON.stringify(operation)]);
const create = product => db.query('select create_inventory_product($1,$2::jsonb,$3)', [id(), JSON.stringify(product), tenant]);
const stockProduct = (productId, overrides = {}) => ({ id: productId, name: productId === 'ice' ? 'Gelo 5kg' : 'Sacos', category: productId === 'ice' ? 'Gelo Cubo' : 'Insumo (Matéria-prima)', unit: 'un', minStock: 0, priceMatriz: 10, priceFilial: 12, cost: productId === 'ice' ? 3 : 0.5, stockMatrizIbotirama: 0, stockMatrizBarreiras: 0, stockFilial: 0, ...overrides });
const callSale = (action, sale, operation = id()) => db.query('select apply_sale_operation($1,$2,$3,$4::jsonb)', [operation, sale.id, action, JSON.stringify(sale)]);
const snapshot = async saleId => {
  const sale = (await db.query('select * from sales where id=$1', [saleId])).rows[0];
  return { id: sale.id, date: sale.date, customerName: sale.customer_name, total: Number(sale.total),
    items: sale.items, branch: sale.branch, matrizDeposit: sale.matriz_deposit, status: sale.status,
    source: sale.source, amountPaid: Number(sale.amount_paid), paymentHistory: sale.payment_history ?? [],
    paymentMethod: sale.payment_method, fulfillmentStatus: sale.fulfillment_status, revision: sale.revision,
    deliveryFee: Number(sale.delivery_fee ?? 0), discount: Number(sale.discount ?? 0) };
};

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
    create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
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
  // Apply the actual sale foundation, including all foreign keys and unique indexes.
  await db.exec(await sqlFile('202609220001_atomic_sale_operations.sql'));
  // Preserve actual fiscal item/context guards around the replaced sale command.
  const fiscal = await sqlFile('202610060001_nfe_drafts_and_rules.sql');
  const itemsStart = fiscal.indexOf('create or replace function public.protect_authorized_nfe_items()');
  const itemsEnd = fiscal.indexOf('end $$;', itemsStart) + 'end $$;'.length;
  const contextStart = fiscal.indexOf('create function public.protect_nfe_commercial_context()');
  const contextEnd = fiscal.indexOf('for each row execute function public.protect_nfe_commercial_context();', contextStart) + 'for each row execute function public.protect_nfe_commercial_context();'.length;
  await db.exec(fiscal.slice(itemsStart, itemsEnd));
  await db.exec('create trigger protect_authorized_nfe_items before insert or update or delete on sale_items for each row execute function public.protect_authorized_nfe_items()');
  await db.exec(fiscal.slice(contextStart, contextEnd));
  for (const migration of ['202611120001_production_stock_operations.sql', '202611160001_inventory_operations.sql', '202611160002_wholesale_confirmation.sql', '202611160003_production_integrity.sql']) {
    await db.exec(await sqlFile(migration));
  }
  await db.exec('grant usage on schema public, auth, private to authenticated; grant select, update on products to authenticated; grant select on sales, sale_items, financials, stock_movements, production_logs to authenticated; set role authenticated;');

  await create(stockProduct('bag'));
  await create(stockProduct('ice', { recipe: [{ ingredientId: 'bag', quantity: 100 }], recipeBatchSize: 100 }));
  const receiptId = id();
  const invoiceItems = [{ productId: 'bag', quantity: 200, supplierCode: 'EMB-10' }];
  await db.query('select receive_inventory_xml($1,$2,$3,$4::jsonb)', [receiptId, '1'.repeat(44), 'Ibotirama', JSON.stringify(invoiceItems)]);
  await db.query('select receive_inventory_xml($1,$2,$3,$4::jsonb)', [receiptId, '1'.repeat(44), 'Ibotirama', JSON.stringify(invoiceItems)]);
  check(await stocks('bag'), { ibotirama: 200, barreiras: 0, filial: 0 });

  const productionId = id();
  const batch = { productId: 'ice', quantity: 100, shift: 'Manhã' };
  const ingredients = [{ ingredientId: 'bag', quantity: 100 }];
  await db.query('select register_production_batch($1,$2::jsonb,$3::jsonb)', [productionId, JSON.stringify(batch), JSON.stringify(ingredients)]);
  await db.query('select register_production_batch($1,$2::jsonb,$3::jsonb)', [productionId, JSON.stringify(batch), JSON.stringify(ingredients)]);
  check(await stocks('ice'), { ibotirama: 100, barreiras: 0, filial: 0 });
  check(await stocks('bag'), { ibotirama: 100, barreiras: 0, filial: 0 });
  await mutate({ operationId: id(), action: 'transfer', productId: 'ice', fromDeposit: 'Ibotirama', toDeposit: 'Barreiras', quantity: 30, reason: 'Reposição' });
  await mutate({ operationId: id(), action: 'loss', productId: 'ice', deposit: 'Barreiras', quantity: 2, reason: 'Derretimento' });
  check(await stocks('ice'), { ibotirama: 70, barreiras: 28, filial: 0 });
  check(await scalar("select sum(amount)::float8 as value from financials where event_type='inventory_loss'"), 6);
  await reject(db.exec("update products set stock_matriz_barreiras=500 where id='ice'"), /operação de estoque/);

  const sale = { id: 'factory-order', date: '2026-11-16', customerName: 'Cliente fábrica', total: 100,
    items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 10, priceAtSale: 10 }], branch: 'Matriz (Fábrica)',
    matrizDeposit: 'Barreiras', status: 'Pending', source: 'ATACADO', amountPaid: 0, paymentHistory: [],
    paymentMethod: 'Pix', fulfillmentStatus: 'pending', revision: 0 };
  const saleId = id();
  await callSale('create', sale, saleId); await callSale('create', sale, saleId);
  check(await stocks('ice'), { ibotirama: 70, barreiras: 28, filial: 0 });
  check(await finance(sale.id), 0);
  const partialId = id();
  const partial = { ...await snapshot(sale.id), amountPaid: 40, paymentHistory: [{ id: 'p1', amount: 40, date: '2026-11-16', method: 'Pix' }] };
  await callSale('update', partial, partialId); await callSale('update', partial, partialId);
  check(await finance(sale.id), 40);
  check((await stocks('ice')).barreiras, 28);
  const dispatchId = id();
  const dispatch = { ...await snapshot(sale.id), fulfillmentStatus: 'dispatched' };
  await callSale('update', dispatch, dispatchId); await callSale('update', dispatch, dispatchId);
  check(await stocks('ice'), { ibotirama: 70, barreiras: 18, filial: 0 });
  const paid = await snapshot(sale.id);
  await callSale('update', { ...paid, amountPaid: 100, status: 'Completed', paymentHistory: [...paid.paymentHistory, { id: 'p2', amount: 60, date: '2026-11-16', method: 'Cash' }] });
  check(await finance(sale.id), 100);
  check((await stocks('ice')).barreiras, 18);
  const cancelId = id();
  const cancel = await snapshot(sale.id);
  await callSale('cancel', cancel, cancelId); await callSale('cancel', cancel, cancelId);
  check(await stocks('ice'), { ibotirama: 70, barreiras: 28, filial: 0 });
  check(await finance(sale.id), 0);
  check(await scalar("select count(*)::int as value from financials where sale_id='factory-order' and event_type like 'sale_receipt:%'"), 2);

  // Production's legacy entry point shares inventory loss/financial behavior after 003.
  const productionLossId = id();
  await db.query("select register_production_loss($1,'ice',1,'Avaria fábrica')", [productionLossId]);
  await db.query("select register_production_loss($1,'ice',1,'Avaria fábrica')", [productionLossId]);
  check(await stocks('ice'), { ibotirama: 69, barreiras: 28, filial: 0 });
  check(await scalar("select sum(amount)::float8 as value from financials where event_type='inventory_loss'"), 9);
  check(await scalar("select count(*)::int as value from financials where event_type='inventory_loss'"), 2);
  await mutate({ operationId: id(), action: 'transfer', productId: 'bag', fromDeposit: 'Ibotirama', toDeposit: 'Filial', quantity: 0.5, reason: 'Conferência de unidade' });
  check(await stocks('bag'), { ibotirama: 99.5, barreiras: 0, filial: 0.5 });
  const movementsBefore = await scalar('select count(*)::int as value from stock_movements');
  const batchesBefore = await scalar('select count(*)::int as value from production_logs');
  await reject(db.query('select register_production_batch($1,$2::jsonb,$3::jsonb)', [id(), JSON.stringify(batch), JSON.stringify([{ ingredientId: 'bag', quantity: 1000 }])]), /insuficiente/);
  check(await scalar('select count(*)::int as value from stock_movements'), movementsBefore);
  check(await scalar('select count(*)::int as value from production_logs'), batchesBefore);
  check((await stocks('ice')).ibotirama, 69);
  check(await scalar("select count(*)::int as value from financials where type='Expense'"), 2);
  await db.exec('reset role');
  check(await scalar("select count(*)::int as value from pg_indexes where indexname='financials_sale_operation_uidx' and indexdef like '%event_type%'"), 1);
  console.log(JSON.stringify({ passed: checks, migrationsApplied: ['sale-foundation', 'production-20261112', 'inventory-001', 'wholesale-002', 'production-003'], path: 'purchase → production → transfer → loss → receipt → dispatch → cancellation', database: 'disposable single-connection PGlite', remoteChanges: false }));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, code: error.code, where: error.where, detail: error.detail, actual: error.actual, expected: error.expected, stack: error.stack?.split('\n').slice(0, 5) }));
  process.exitCode = 1;
} finally {
  await db.close();
}
