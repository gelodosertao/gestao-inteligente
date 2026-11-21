import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Runs in a disposable in-memory PostgreSQL. Set PGLITE_MODULE to an installed module file.
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const tenant = '00000000-0000-0000-0000-000000000001';
const user = '00000000-0000-0000-0000-000000000002';
const migration = await readFile(new URL('../supabase/migrations/202611160002_wholesale_confirmation.sql', import.meta.url), 'utf8');
const foundation = await readFile(new URL('../supabase/migrations/202609220001_atomic_sale_operations.sql', import.meta.url), 'utf8');
const fiscal = await readFile(new URL('../supabase/migrations/202610060001_nfe_drafts_and_rules.sql', import.meta.url), 'utf8');
const resolver = foundation.slice(foundation.indexOf('create or replace function public.resolve_sale_stock_effects('), foundation.indexOf('revoke all on function public.resolve_sale_stock_effects'));
const saleColumns = migration.match(/insert into public\.sales \(([\s\S]*?)\) values/)[1].split(',').map(column => column.trim());
const jsonColumns = new Set(['payment_splits', 'items', 'payment_history', 'customer_details', 'stock_effects', 'fiscal_context']);
const numericColumns = new Set(['total', 'cash_received', 'change_amount', 'amount_paid', 'delivery_fee', 'discount', 'commission_amount']);
const salesSchema = saleColumns.map(column => `${column} ${column === 'id' ? 'text primary key' : column === 'tenant_id' ? 'uuid' : jsonColumns.has(column) ? 'jsonb' : numericColumns.has(column) ? 'numeric' : ['created_at', 'nfe_issued_at'].includes(column) ? 'timestamptz' : column === 'has_invoice' ? 'boolean' : 'text'}`).join(',');
let checks = 0;
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema private;
  create function auth.uid() returns uuid language sql stable as $$select '${user}'::uuid$$;
  create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
  create function private.current_user_can_any(text[]) returns boolean language sql as $$select true$$;
  create table app_users(id text primary key, tenant_id uuid, is_active boolean, must_change_password boolean, role text, allowed_modules text[]);
  insert into app_users values ('${user}','${tenant}',true,false,'ADMIN','{ATACADO}');
  create table products(id text primary key, tenant_id uuid, name text, is_stock_controlled boolean, combo_items jsonb,
    stock_filial numeric default 0, stock_matriz_ibotirama numeric default 0, stock_matriz_barreiras numeric default 0);
  insert into products(id,tenant_id,name,is_stock_controlled,stock_matriz_ibotirama,stock_matriz_barreiras)
    values ('ice','${tenant}','Gelo 5kg',true,100,20);
  create table sales(${salesSchema});
  alter table sales add column nfe_environment smallint;
  create table sale_items(id bigserial primary key,tenant_id uuid,sale_id text,product_id text,product_name text,
    quantity numeric,price_at_sale numeric,selected_options jsonb,notes text,ncm text,cfop text,cst text);
  create table sale_operations(tenant_id uuid,operation_id uuid,sale_id text,action text,payload_hash text,result jsonb,
    completed_at timestamptz,primary key(tenant_id,operation_id));
  create table stock_movements(id text primary key,date text,product_id text,product_name text,quantity numeric,type text,
    reason text,branch text,matriz_deposit text,tenant_id uuid,sale_id text,operation_id uuid,event_type text);
  create table financials(id text primary key,date text,description text,amount numeric,type text,category text,branch text,
    payment_method text,tenant_id uuid,sale_id text,operation_id uuid,event_type text);
  create unique index financials_sale_operation_uidx on financials(tenant_id,operation_id) where operation_id is not null;
`);
await db.exec(resolver);
const itemsGuardStart = fiscal.indexOf('create or replace function public.protect_authorized_nfe_items()');
const itemsGuardEnd = fiscal.indexOf('end $$;', itemsGuardStart) + 'end $$;'.length;
const contextGuardStart = fiscal.indexOf('create function public.protect_nfe_commercial_context()');
const contextGuardEnd = fiscal.indexOf('for each row execute function public.protect_nfe_commercial_context();', contextGuardStart) + 'for each row execute function public.protect_nfe_commercial_context();'.length;
await db.exec(fiscal.slice(itemsGuardStart, itemsGuardEnd));
await db.exec('create trigger protect_authorized_nfe_items before insert or update or delete on sale_items for each row execute function public.protect_authorized_nfe_items()');
await db.exec(fiscal.slice(contextGuardStart, contextGuardEnd));
try { await db.exec(migration); } catch (error) {
  console.error(JSON.stringify({ stage: 'migration', message: error.message, code: error.code, where: error.where, position: error.position }));
  await db.close();
  process.exit(1);
}

let sequence = 1;
const operation = () => `10000000-0000-0000-0000-${String(sequence++).padStart(12, '0')}`;
const call = (action, sale, id = operation()) => db.query('select public.apply_sale_operation($1::uuid,$2,$3,$4::jsonb) result', [id, sale.id, action, JSON.stringify(sale)]);
const row = async id => (await db.query('select * from sales where id=$1', [id])).rows[0];
const stock = async () => (await db.query('select stock_matriz_ibotirama::float ibo,stock_matriz_barreiras::float bar from products where id=$1', ['ice'])).rows[0];
const finance = async id => (await db.query('select coalesce(sum(amount),0)::float total,count(*)::int events from financials where sale_id=$1', [id])).rows[0];
const snapshot = async id => {
  const record = await row(id);
  return { id, date: record.date, customerName: record.customer_name, total: Number(record.total), items: record.items,
    branch: record.branch, matrizDeposit: record.matriz_deposit, status: record.status, source: record.source,
    amountPaid: Number(record.amount_paid), paymentHistory: record.payment_history || [], paymentMethod: record.payment_method,
    paymentSplits: record.payment_splits,
    fiscalContext: record.fiscal_context, customerDetails: record.customer_details,
    fulfillmentStatus: record.fulfillment_status, revision: record.revision, deliveryFee: Number(record.delivery_fee || 0), discount: Number(record.discount || 0) };
};
const order = (id, overrides = {}) => ({ id, date: '2026-11-16', customerName: 'Cliente', total: 100,
  items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 10, priceAtSale: 10 }],
  branch: 'Matriz (Fábrica)', matrizDeposit: 'Barreiras', status: 'Pending', paymentMethod: 'Pix', source: 'ATACADO',
  amountPaid: 0, paymentHistory: [], fulfillmentStatus: 'pending', revision: 0, ...overrides });
const receipt = (id, amount, date = '2026-11-16', method = 'Pix') => ({ id, amount, date, method, notes: '' });
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const reject = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };

try {
  await reject(() => call('create', order('missing-origin', { matrizDeposit: undefined })), /depósito/);
  await reject(() => call('create', order('fake-paid', { status: 'Completed' })), /status/);
  const createId = operation();
  await call('create', order('one'), createId);
  await call('create', order('one'), createId);
  check(await stock(), { ibo: 100, bar: 20 });
  check(await finance('one'), { total: 0, events: 0 });

  const stale = await snapshot('one');
  const partial = { ...stale, amountPaid: 40, paymentHistory: [receipt('p1', 40, '2026-11-15')] };
  const partialId = operation();
  await call('update', partial, partialId);
  await call('update', partial, partialId);
  check(await finance('one'), { total: 40, events: 1 });
  check(await stock(), { ibo: 100, bar: 20 });
  await reject(() => call('update', { ...stale, amountPaid: 30, paymentHistory: [receipt('stale', 30)] }), /atualizado/);
  const paid = await snapshot('one');
  await reject(() => call('update', { ...paid, paymentHistory: [] }), /recebimento|removidos/i);
  await reject(() => call('update', { ...paid, status: 'Completed' }), /status/);
  await call('update', { ...paid, amountPaid: 100, status: 'Completed', paymentHistory: [...paid.paymentHistory, receipt('p2', 60, '2026-11-16', 'Cash')] });
  check(await finance('one'), { total: 100, events: 2 });
  check(await stock(), { ibo: 100, bar: 20 });
  const dispatch = { ...await snapshot('one'), fulfillmentStatus: 'dispatched' };
  const dispatchId = operation();
  await call('update', dispatch, dispatchId);
  await call('update', dispatch, dispatchId);
  check(await stock(), { ibo: 100, bar: 10 });
  check(Boolean((await row('one')).dispatched_at), true);

  await call('create', order('unpaid'));
  await call('update', { ...await snapshot('unpaid'), fulfillmentStatus: 'dispatched' });
  check(await stock(), { ibo: 100, bar: 0 });
  check(await finance('unpaid'), { total: 0, events: 0 });
  await call('create', order('shortage'));
  await reject(() => call('update', { ...order('shortage'), fulfillmentStatus: 'dispatched' }), /Insufficient stock/);
  check((await row('shortage')).revision, 0);
  check((await row('shortage')).fulfillment_status, 'pending');

  const cancel = await snapshot('one');
  const cancelId = operation();
  await call('cancel', cancel, cancelId);
  await call('cancel', cancel, cancelId);
  check(await stock(), { ibo: 100, bar: 10 });
  check(await finance('one'), { total: 0, events: 4 });
  check((await db.query("select payment_method,sum(amount)::float amount from financials where sale_id='one' and event_type like 'sale_reversal:%' group by payment_method order by payment_method")).rows, [{ payment_method: 'Cash', amount: -60 }, { payment_method: 'Pix', amount: -40 }]);
  check((await row('one')).payment_history.length, 2);
  check((await row('one')).fulfillment_status, 'dispatched');
  check(Boolean((await row('one')).cancelled_at), true);
  await reject(() => call('cancel', { ...cancel, revision: cancel.revision + 1 }), /cancelado/);

  // Competing operator snapshots: only the first receipt can consume this revision.
  await call('create', order('concurrent', { matrizDeposit: 'Ibotirama' }));
  const current = await snapshot('concurrent');
  const attempts = await Promise.allSettled([
    call('update', { ...current, amountPaid: 30, paymentHistory: [receipt('c1', 30)] }),
    call('update', { ...current, amountPaid: 20, paymentHistory: [receipt('c2', 20)] }),
  ]);
  check(attempts.filter(result => result.status === 'fulfilled').length, 1);
  check((await row('concurrent')).payment_history.length, 1);
  check(await stock(), { ibo: 100, bar: 10 });

  // A dispatched unpaid order can be corrected without touching cash receipts.
  await call('update', { ...await snapshot('unpaid'), matrizDeposit: 'Ibotirama' });
  check(await stock(), { ibo: 90, bar: 20 });
  const amended = await snapshot('unpaid');
  await call('update', { ...amended, total: 80, items: [{ ...amended.items[0], quantity: 8 }] });
  check(await stock(), { ibo: 92, bar: 20 });
  check(await finance('unpaid'), { total: 0, events: 0 });

  await call('create', order('charges', { deliveryFee: 20, discount: 5, total: 115 }));
  check(Number((await row('charges')).total), 115);
  await reject(async () => call('update', { ...await snapshot('charges'), discount: -5, total: 125 }), /negativos/);
  await reject(async () => call('update', { ...await snapshot('charges'), amountPaid: 10, paymentHistory: [receipt('invalid', 11)] }), /parcela/);
  await reject(async () => call('update', { ...await snapshot('charges'), amountPaid: 10, paymentHistory: [receipt('invalid-date', 10, '2026-02-30')] }), /date|range|Parcela/i);

  await call('create', order('legacy-partial'));
  await db.query('update sales set fulfillment_status=null,amount_paid=20,payment_history=$1::jsonb where id=$2', [JSON.stringify([receipt('old-partial', 20, '2026-11-01')]), 'legacy-partial']);
  const legacyPartial = await snapshot('legacy-partial');
  await call('update', { ...legacyPartial, amountPaid: 50, paymentHistory: [...legacyPartial.paymentHistory, receipt('new-partial', 30)] });
  check(await finance('legacy-partial'), { total: 50, events: 2 });
  check((await db.query("select date from financials where sale_id='legacy-partial' order by date")).rows.map(record => record.date), ['2026-11-01', '2026-11-16']);

  await call('create', order('legacy-final', { matrizDeposit: 'Ibotirama' }));
  await db.exec(`update sales set fulfillment_status=null,status='Completed',stock_effects='{"ice":10}'::jsonb where id='legacy-final';
    update products set stock_matriz_ibotirama=stock_matriz_ibotirama-10 where id='ice';
    insert into financials(id,date,amount,type,category,tenant_id,sale_id,event_type) values('legacy-income','2026-11-01',100,'Income','Vendas','${tenant}','legacy-final','sale_adjustment');`);
  const beforeLegacyCancel = await stock();
  await call('cancel', await snapshot('legacy-final'));
  check((await stock()).ibo, beforeLegacyCancel.ibo + 10);
  check(Number((await row('legacy-final')).amount_paid), 100);
  check(await finance('legacy-final'), { total: 0, events: 4 });

  await call('create', order('cash-refund'));
  await call('update', { ...await snapshot('cash-refund'), amountPaid: 40, paymentHistory: [receipt('cash-paid', 40, '2026-11-15', 'Cash')] });
  await call('cancel', await snapshot('cash-refund'));
  check((await db.query("select payment_method,amount::float amount from financials where sale_id='cash-refund' and event_type like 'sale_reversal:%'")).rows, [{ payment_method: 'Cash', amount: -40 }]);
  check(await finance('cash-refund'), { total: 0, events: 2 });

  await call('create', order('split-refund', { paymentMethod: 'Split', paymentSplits: [{ method: 'Pix', amount: 30 }, { method: 'Cash', amount: 70 }] }));
  await db.exec(`update sales set amount_paid=100,status='Completed' where id='split-refund';
    insert into financials(id,date,amount,type,category,tenant_id,sale_id,payment_method,event_type)
      values('old-split-income','2026-11-01',100,'Income','Vendas','${tenant}','split-refund','Split','sale_adjustment');`);
  const splitCancelOperation = operation();
  const splitCancellation = await snapshot('split-refund');
  await call('cancel', splitCancellation, splitCancelOperation);
  await call('cancel', splitCancellation, splitCancelOperation);
  check((await db.query("select payment_method,amount::float amount from financials where sale_id='split-refund' and event_type like 'sale_reversal:%' order by payment_method")).rows, [{ payment_method: 'Cash', amount: -70 }, { payment_method: 'Pix', amount: -30 }]);
  check((await db.query("select payment_method,sum(amount)::float amount from financials where sale_id='split-refund' group by payment_method order by payment_method")).rows, [{ payment_method: 'Cash', amount: 0 }, { payment_method: 'Pix', amount: 0 }, { payment_method: 'Split', amount: 0 }]);

  // Authorization cannot be bypassed by calling the RPC directly as a representative.
  await db.exec("update app_users set role='WHOLESALE_REPRESENTATIVE'");
  await reject(async () => call('update', { ...await snapshot('charges'), fulfillmentStatus: 'dispatched' }), /permissão/);
  await db.exec("update app_users set role='ADMIN'");

  // Existing fiscal item/context protections remain active for receipts and dispatch.
  await call('create', order('fiscal', { matrizDeposit: 'Ibotirama' }));
  await db.exec("update sales set nfe_number='123' where id='fiscal'");
  const fiscalSnapshot = { ...await snapshot('fiscal'), nfeNumber: '123' };
  await call('update', { ...fiscalSnapshot, amountPaid: 20, paymentHistory: [receipt('fiscal-payment', 20)] });
  check(await finance('fiscal'), { total: 20, events: 1 });
  const fiscalRevision = { ...await snapshot('fiscal'), nfeNumber: '123' };
  await reject(() => call('update', { ...fiscalRevision, total: 120, items: [{ ...fiscalRevision.items[0], quantity: 12 }] }), /immutable/);
  await reject(() => call('update', { ...fiscalRevision, paymentMethod: 'Cash' }), /forma original/);
  await reject(() => call('update', { ...fiscalRevision, customerId: 'another-customer' }), /immutable/);
  check((await row('fiscal')).revision, fiscalRevision.revision);

  // Retail retains its original immediate stock/revenue behavior.
  await db.exec("update products set stock_filial=50 where id='ice'");
  await call('create', order('retail', { source: 'POS', branch: 'Filial (Adega)', status: 'Completed', fulfillmentStatus: undefined, matrizDeposit: undefined }));
  check(Number((await db.query("select stock_filial from products where id='ice'")).rows[0].stock_filial), 40);
  check(await finance('retail'), { total: 100, events: 1 });

  const competingItems = [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 15, priceAtSale: 10 }];
  await call('create', order('stock-race-a', { items: competingItems, total: 150 }));
  await call('create', order('stock-race-b', { items: competingItems, total: 150 }));
  const stockAttempts = await Promise.allSettled([
    call('update', { ...await snapshot('stock-race-a'), fulfillmentStatus: 'dispatched' }),
    call('update', { ...await snapshot('stock-race-b'), fulfillmentStatus: 'dispatched' }),
  ]);
  check(stockAttempts.filter(result => result.status === 'fulfilled').length, 1);
  check((await stock()).bar, 5);

  console.log(JSON.stringify({ passed: checks, database: 'disposable in-memory PostgreSQL', remoteChanges: false }));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, code: error.code, where: error.where, actual: error.actual, expected: error.expected, stack: error.stack?.split('\n').slice(0, 4) }));
  process.exitCode = 1;
} finally {
  await db.close();
}
