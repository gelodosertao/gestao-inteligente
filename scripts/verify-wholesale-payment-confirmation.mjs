import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Runs in a disposable in-memory PostgreSQL. Set PGLITE_MODULE to an installed module file.
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const tenant = '00000000-0000-0000-0000-000000000001';
const user = '00000000-0000-0000-0000-000000000002';
const baseMigration = await readFile(new URL('../supabase/migrations/202611160002_wholesale_confirmation.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202611160005_wholesale_payment_confirmation.sql', import.meta.url), 'utf8');
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
try { await db.exec(baseMigration); await db.exec(migration); } catch (error) {
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
    paymentSplits: record.payment_splits, sellerId: record.seller_id,
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
  await call('create', order('first'));
  check(await stock(), { ibo: 100, bar: 20 });
  check(await finance('first'), { total: 0, events: 0 });
  await reject(() => call('update', { ...order('first'), fulfillmentStatus: 'dispatched' }), /pagamento positivo/);
  await reject(() => call('update', { ...order('first'), status: 'Completed' }), /status/);
  const firstSnapshot = await snapshot('first');
  const firstPayment = { ...firstSnapshot, amountPaid: 40, paymentHistory: [receipt('first-cash', 40, '2026-11-15', 'Cash')] };
  const firstOperation = operation();
  await call('update', firstPayment, firstOperation);
  await call('update', firstPayment, firstOperation);
  check(await stock(), { ibo: 100, bar: 10 });
  check(await finance('first'), { total: 40, events: 1 });
  check((await row('first')).status, 'Pending');
  check((await row('first')).fulfillment_status, 'dispatched');
  check(Boolean((await row('first')).dispatched_at), true);
  check((await row('first')).payment_history.length, 1);
  await db.exec(`insert into products(id,tenant_id,name,is_stock_controlled,stock_matriz_barreiras)
    values('changed-component','${tenant}','Componente posterior',true,100);
    update products set combo_items='[{"productId":"changed-component","quantity":2}]'::jsonb where id='ice';`);
  const secondSnapshot = await snapshot('first');
  await call('update', { ...secondSnapshot, amountPaid: 80, paymentHistory: [...secondSnapshot.paymentHistory, receipt('second-pix', 40)] });
  check(await stock(), { ibo: 100, bar: 10 });
  check(await finance('first'), { total: 80, events: 2 });
  check((await row('first')).status, 'Pending');
  check(Number((await db.query("select stock_matriz_barreiras from products where id='changed-component'")).rows[0].stock_matriz_barreiras), 100);
  await db.exec("update products set combo_items=null where id='ice'");
  const thirdSnapshot = await snapshot('first');
  await call('update', { ...thirdSnapshot, status: 'Completed', amountPaid: 100, paymentHistory: [...thirdSnapshot.paymentHistory, receipt('last-pix', 20)] });
  check(await stock(), { ibo: 100, bar: 10 });
  check(await finance('first'), { total: 100, events: 3 });
  await reject(() => call('update', { ...firstSnapshot, amountPaid: 10, paymentHistory: [receipt('stale', 10)] }), /atualizado/);

  await call('create', order('old-no-origin', { matrizDeposit: 'Ibotirama' }));
  await db.exec("update sales set fulfillment_status=null,matriz_deposit=null where id='old-no-origin'");
  const missingOrigin = await snapshot('old-no-origin');
  await reject(() => call('update', { ...missingOrigin, amountPaid: 20, paymentHistory: [receipt('old-pay', 20)] }), /depósito/);
  check(Number((await row('old-no-origin')).amount_paid), 0);
  check(await finance('old-no-origin'), { total: 0, events: 0 });
  await call('update', { ...missingOrigin, matrizDeposit: 'Ibotirama', amountPaid: 20, paymentHistory: [receipt('old-pay', 20)] });
  check(await stock(), { ibo: 90, bar: 10 });
  check((await row('old-no-origin')).fulfillment_status, 'dispatched');

  await call('create', order('shortage', { total: 200, items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 20, priceAtSale: 10 }] }));
  const shortage = await snapshot('shortage');
  const shortagePayment = { ...shortage, amountPaid: 25, paymentHistory: [receipt('short-pay', 25)] };
  const shortageOperation = operation();
  await reject(() => call('update', shortagePayment, shortageOperation), /Insufficient stock/);
  check((await row('shortage')).revision, 0);
  check((await row('shortage')).payment_history, []);
  check(Number((await row('shortage')).amount_paid), 0);
  check(await finance('shortage'), { total: 0, events: 0 });
  check(await stock(), { ibo: 90, bar: 10 });
  // Failed operations roll back the idempotency record too: retry the same payment safely.
  await db.exec("update products set stock_matriz_barreiras=20 where id='ice'");
  await call('update', shortagePayment, shortageOperation);
  await call('update', shortagePayment, shortageOperation);
  check(await stock(), { ibo: 90, bar: 0 });
  check(await finance('shortage'), { total: 25, events: 1 });

  await call('create', order('modern-paid', { matrizDeposit: 'Ibotirama' }));
  await db.query("update sales set amount_paid=100,status='Completed',payment_history=$1::jsonb where id='modern-paid'", [JSON.stringify([receipt('known-paid', 100, '2026-11-01', 'Cash')])]);
  await db.exec(`insert into financials(id,date,amount,type,category,tenant_id,sale_id,payment_method,event_type)
    values('known-paid-income','2026-11-01',100,'Income','Vendas','${tenant}','modern-paid','Cash','sale_receipt:payment-known-paid');`);
  const alreadyPaid = await snapshot('modern-paid');
  await call('update', { ...alreadyPaid, fulfillmentStatus: 'dispatched' });
  check(await stock(), { ibo: 80, bar: 0 });
  check((await row('modern-paid')).payment_history.length, 1);
  check(await finance('modern-paid'), { total: 100, events: 1 });

  await call('create', order('legacy-final', { matrizDeposit: 'Ibotirama' }));
  await db.exec(`update sales set fulfillment_status=null,status='Completed',stock_effects='{"ice":10}'::jsonb where id='legacy-final';
    update products set stock_matriz_ibotirama=stock_matriz_ibotirama-10 where id='ice';
    insert into financials(id,date,amount,type,category,tenant_id,sale_id,event_type)
      values('legacy-final-income','2026-11-01',100,'Income','Vendas','${tenant}','legacy-final','sale_adjustment');`);
  const legacy = await snapshot('legacy-final');
  await call('update', legacy);
  check(await stock(), { ibo: 70, bar: 0 });
  check((await row('legacy-final')).fulfillment_status, 'dispatched');
  check(Number((await row('legacy-final')).amount_paid), 100);

  const pendingCancel = await snapshot('first');
  const cancelOperation = operation();
  await call('cancel', pendingCancel, cancelOperation);
  await call('cancel', pendingCancel, cancelOperation);
  check(await stock(), { ibo: 70, bar: 10 });
  check(await finance('first'), { total: 0, events: 5 });
  check((await row('first')).payment_history.length, 3);
  check((await db.query("select payment_method,sum(amount)::float amount from financials where sale_id='first' and event_type like 'sale_reversal:%' group by payment_method order by payment_method")).rows, [{ payment_method: 'Cash', amount: -40 }, { payment_method: 'Pix', amount: -60 }]);

  // Authorized representatives can confirm their own orders, without a production role.
  await call('create', order('rep-own', { matrizDeposit: 'Ibotirama', sellerId: user }));
  await call('create', order('rep-foreign', { matrizDeposit: 'Ibotirama', sellerId: 'another-representative' }));
  await db.exec("update app_users set role='WHOLESALE_REPRESENTATIVE',allowed_modules='{ATACADO}'");
  const ownOrder = await snapshot('rep-own');
  await call('update', { ...ownOrder, amountPaid: 30, paymentHistory: [receipt('rep-received', 30)] });
  check(await stock(), { ibo: 60, bar: 10 });
  check((await row('rep-own')).fulfillment_status, 'dispatched');
  await reject(async () => call('update', { ...await snapshot('rep-foreign'), amountPaid: 30, paymentHistory: [receipt('foreign-received', 30)] }), /sem acesso/);
  check(await finance('rep-foreign'), { total: 0, events: 0 });
  await db.exec("update app_users set role='ADMIN'");

  // Concurrent snapshots cannot double-receive or double-debit a first payment.
  await call('create', order('race', { matrizDeposit: 'Ibotirama' }));
  const race = await snapshot('race');
  const attempts = await Promise.allSettled([
    call('update', { ...race, amountPaid: 20, paymentHistory: [receipt('race-one', 20)] }),
    call('update', { ...race, amountPaid: 30, paymentHistory: [receipt('race-two', 30)] }),
  ]);
  check(attempts.filter(result => result.status === 'fulfilled').length, 1);
  check((await row('race')).payment_history.length, 1);
  check(await stock(), { ibo: 50, bar: 10 });

  // The real fiscal guards accept payment+stock confirmation but still reject item/context edits.
  await call('create', order('fiscal', { matrizDeposit: 'Ibotirama' }));
  await db.exec("update sales set nfe_number='123' where id='fiscal'");
  const fiscalOrder = { ...await snapshot('fiscal'), nfeNumber: '123' };
  await call('update', { ...fiscalOrder, amountPaid: 10, paymentHistory: [receipt('fiscal-first', 10)] });
  check(await stock(), { ibo: 40, bar: 10 });
  check(await finance('fiscal'), { total: 10, events: 1 });
  const fiscalRevision = { ...await snapshot('fiscal'), nfeNumber: '123' };
  await reject(() => call('update', { ...fiscalRevision, total: 120, items: [{ ...fiscalRevision.items[0], quantity: 12 }] }), /immutable/);
  await reject(() => call('update', { ...fiscalRevision, customerId: 'another-customer' }), /immutable/);

  await db.exec("update products set stock_filial=50 where id='ice'");
  await call('create', order('retail', { source: 'POS', branch: 'Filial (Adega)', status: 'Completed', fulfillmentStatus: undefined, matrizDeposit: undefined }));
  check(Number((await db.query("select stock_filial from products where id='ice'")).rows[0].stock_filial), 40);
  check(await finance('retail'), { total: 100, events: 1 });
  console.log(JSON.stringify({ passed: checks, database: 'disposable in-memory PostgreSQL', migrations: ['002', '005'], remoteChanges: false }));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, code: error.code, where: error.where, actual: error.actual, expected: error.expected, stack: error.stack?.split('\n').slice(0,4) }));
  process.exitCode = 1;
} finally {
  await db.close();
}
