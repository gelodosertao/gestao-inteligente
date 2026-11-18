import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Runs in a disposable in-memory PostgreSQL. Set PGLITE_MODULE to an installed module file.
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const tenant = '00000000-0000-0000-0000-000000000001';
const user = '00000000-0000-0000-0000-000000000002';
const baseMigration = await readFile(new URL('../supabase/migrations/202611160002_wholesale_confirmation.sql', import.meta.url), 'utf8');
const previousMigration = await readFile(new URL('../supabase/migrations/202611160005_wholesale_payment_confirmation.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202611180001_wholesale_order_stock_commitment.sql', import.meta.url), 'utf8');
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
try { await db.exec(baseMigration); await db.exec(previousMigration); await db.exec(migration); } catch (error) {
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
  const movementCount = async id => Number((await db.query('select count(*)::int count from stock_movements where sale_id=$1', [id])).rows[0].count);
  const seedLegacy = async (id, changes = {}, tenantId = tenant) => {
    const value = order(id, changes);
    await db.query(`insert into sales(id,date,customer_name,total,branch,matriz_deposit,status,payment_method,
      items,amount_paid,payment_history,source,tenant_id,stock_effects,fulfillment_status,revision,seller_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13,'{}'::jsonb,null,0,$14)`,
      [id,value.date,value.customerName,value.total,value.branch,value.matrizDeposit || null,value.status,value.paymentMethod,
        JSON.stringify(value.items),value.amountPaid,JSON.stringify(value.paymentHistory),value.source,tenantId,value.sellerId || null]);
  };
  const payment = (sale, amount, receiptId, method = 'Pix') => ({ ...sale, amountPaid: sale.amountPaid + amount,
    status: sale.amountPaid + amount === sale.total ? 'Completed' : 'Pending',
    paymentHistory: [...sale.paymentHistory, receipt(receiptId, amount, '2026-11-18', method)] });

  const createOperation = operation();
  await call('create', order('modern', { fulfillmentStatus: 'dispatched' }), createOperation);
  await call('create', order('modern', { fulfillmentStatus: 'dispatched' }), createOperation);
  check(await stock(), { ibo: 100, bar: 10 });
  check(await finance('modern'), { total: 0, events: 0 });
  check((await row('modern')).fulfillment_status, 'committed');
  check((await row('modern')).dispatched_at, null);
  check((await row('modern')).status, 'Pending');
  check(await movementCount('modern'), 1);
  // Compatibility: older checkouts still send pending, but availability is committed on create.
  await call('create', order('older-checkout', { total: 40, items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 4, priceAtSale: 10 }] }));
  check(await stock(), { ibo: 100, bar: 6 });
  check((await row('older-checkout')).fulfillment_status, 'committed');
  await reject(() => call('create', order('insufficient', { total: 70, items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 7, priceAtSale: 10 }] })), /Insufficient stock/);
  check(await row('insufficient'), undefined);
  check(await movementCount('insufficient'), 0);
  check(await finance('insufficient'), { total: 0, events: 0 });
  await reject(() => call('create', order('no-origin', { matrizDeposit: undefined })), /depósito/);

  const first = payment(await snapshot('modern'), 40, 'modern-cash', 'Cash');
  const firstOperation = operation();
  await call('update', first, firstOperation);
  await call('update', first, firstOperation);
  await call('update', payment(await snapshot('modern'), 60, 'modern-pix'));
  check((await row('modern')).fulfillment_status, 'committed');
  check((await row('modern')).dispatched_at, null);
  await reject(async () => call('update', { ...await snapshot('modern'), fulfillmentStatus: 'dispatched' }), /Situação.*inválida/);
  await reject(async () => call('update', { ...await snapshot('modern'), fulfillmentStatus: 'pending' }), /Situação.*inválida/);
  check(await stock(), { ibo: 100, bar: 6 });
  check(await movementCount('modern'), 1);
  check(await finance('modern'), { total: 100, events: 2 });
  const beforeEdit = await snapshot('modern');
  await call('update', { ...beforeEdit, total: 120, status: 'Pending', items: [{ ...beforeEdit.items[0], quantity: 12 }] });
  check(await stock(), { ibo: 100, bar: 4 });
  const beforePrice = await snapshot('modern');
  await call('update', { ...beforePrice, total: 132, items: [{ ...beforePrice.items[0], priceAtSale: 11 }] });
  check(await stock(), { ibo: 100, bar: 4 });
  check(await movementCount('modern'), 2);
  await reject(async () => call('update', { ...await snapshot('modern'), matrizDeposit: 'Ibotirama' }), /depósito.*alterado/);
  const beforeDecrease = await snapshot('modern');
  await call('update', { ...beforeDecrease, total: 121, items: [{ ...beforeDecrease.items[0], quantity: 11 }] });
  check(await stock(), { ibo: 100, bar: 5 });
  const cancellation = await snapshot('modern');
  const cancellationOperation = operation();
  await call('cancel', cancellation, cancellationOperation);
  await call('cancel', cancellation, cancellationOperation);
  check(await stock(), { ibo: 100, bar: 16 });
  check(await finance('modern'), { total: 0, events: 4 });

  // Explicit historical declaration never requires new availability or a second physical debit.
  await seedLegacy('historical', { matrizDeposit: 'Ibotirama' });
  await db.exec("update products set stock_matriz_ibotirama=0 where id='ice'");
  const historical = await snapshot('historical');
  await reject(() => call('update', payment(historical, 40, 'without-declaration')), /administrador.*descontado/);
  check(Number((await row('historical')).amount_paid), 0);
  check((await row('historical')).fulfillment_status, null);
  check(await finance('historical'), { total: 0, events: 0 });
  check(await stock(), { ibo: 0, bar: 16 });
  const declaration = { ...payment(historical, 40, 'historical-cash', 'Cash'), historicalStockAlreadyDebited: true };
  const declarationOperation = operation();
  const firstDeclaration = (await call('update', declaration, declarationOperation)).rows[0].result;
  const repeatedDeclaration = (await call('update', declaration, declarationOperation)).rows[0].result;
  check(firstDeclaration, repeatedDeclaration);
  check(firstDeclaration.historicalStockAlreadyDebited, true);
  check(firstDeclaration.historicalStockDeclaration.declaredBy, user);
  check(firstDeclaration.historicalStockDeclaration.deposit, 'Ibotirama');
  check(firstDeclaration.historicalStockDeclaration.stockEffects, { ice: 10 });
  check(Boolean(firstDeclaration.historicalStockDeclaration.declaredAt), true);
  check((await db.query('select payload_hash = md5($1 || $2::jsonb::text) valid from sale_operations where operation_id=$3', ['update:historical:', JSON.stringify(declaration), declarationOperation])).rows[0].valid, true);
  await reject(() => call('update', { ...declaration, historicalStockAlreadyDebited: false }, declarationOperation), /Idempotency key/);
  check(await stock(), { ibo: 0, bar: 16 });
  check(await movementCount('historical'), 0);
  check((await row('historical')).stock_effects, { ice: 10 });
  check((await row('historical')).dispatched_at, null);
  check((await row('historical')).fulfillment_status, 'dispatched');
  check(await finance('historical'), { total: 40, events: 1 });
  await reject(async () => call('update', { ...await snapshot('historical'), fulfillmentStatus: 'committed' }), /Situação.*inválida/);
  await call('update', payment(await snapshot('historical'), 60, 'historical-pix'));
  check(await stock(), { ibo: 0, bar: 16 });
  check(await movementCount('historical'), 0);
  check(await finance('historical'), { total: 100, events: 2 });
  const historicalCancellation = await snapshot('historical');
  const historicalCancelOperation = operation();
  await call('cancel', historicalCancellation, historicalCancelOperation);
  await call('cancel', historicalCancellation, historicalCancelOperation);
  check(await stock(), { ibo: 10, bar: 16 });
  check(await movementCount('historical'), 1);
  check(await finance('historical'), { total: 0, events: 4 });

  // Already-recorded partial receipts can be reconciled without adding a zero-value installment.
  await seedLegacy('previous-payment', { matrizDeposit: undefined, amountPaid: 20, paymentHistory: [receipt('known-old', 20, '2026-11-01', 'Cash')] });
  const previous = await snapshot('previous-payment');
  await call('update', { ...previous, matrizDeposit: 'Barreiras', historicalStockAlreadyDebited: true });
  check(await stock(), { ibo: 10, bar: 16 });
  check((await row('previous-payment')).payment_history.length, 1);
  check(await finance('previous-payment'), { total: 20, events: 1 });
  check(await movementCount('previous-payment'), 0);

  await seedLegacy('metadata', { amountPaid: 20, paymentHistory: [] });
  await call('update', { ...await snapshot('metadata'), customerName: 'Cliente corrigido' });
  check((await row('metadata')).fulfillment_status, null);
  check(await finance('metadata'), { total: 0, events: 0 });
  check(await movementCount('metadata'), 0);
  await reject(async () => call('cancel', await snapshot('metadata')), /Concilie.*histórica/);

  await seedLegacy('strict', { matrizDeposit: 'Ibotirama' });
  const strict = await snapshot('strict');
  const strictPayment = { ...payment(strict, 10, 'strict-pay'), historicalStockAlreadyDebited: true };
  await reject(() => call('update', { ...strictPayment, total: 110, items: [{ ...strict.items[0], quantity: 11 }] }), /Preserve.*itens/);
  await reject(() => call('update', { ...strictPayment, customerName: 'Outro cliente' }), /Preserve/);
  await reject(() => call('update', { ...strictPayment, matrizDeposit: 'Barreiras' }), /Preserve/);
  await reject(() => call('update', { ...strictPayment, date: '2026-11-18' }), /Preserve/);
  await reject(() => call('update', { ...strictPayment, historicalStockAlreadyDebited: 'true' }), /inválida/);
  await reject(() => call('update', { ...strict, historicalStockAlreadyDebited: true }), /recebimento/);
  await reject(() => call('create', { ...order('flag-create'), historicalStockAlreadyDebited: true }), /exclusiva/);
  await reject(async () => call('update', { ...await snapshot('older-checkout'), historicalStockAlreadyDebited: true }), /exclusiva/);
  await db.exec("update app_users set role='OPERATOR'");
  await reject(() => call('update', strictPayment), /Somente administradores/);
  await reject(() => call('update', declaration, declarationOperation), /Somente administradores/);
  await db.exec("update app_users set role='ADMIN'");
  await seedLegacy('another-tenant', {}, '00000000-0000-0000-0000-000000000099');
  const other = await snapshot('another-tenant');
  await reject(() => call('update', { ...payment(other, 10, 'foreign'), historicalStockAlreadyDebited: true }), /another tenant/);
  check(await movementCount('strict'), 0);
  check(await finance('strict'), { total: 0, events: 0 });

  // Fiscal guards remain effective after the new stock timing and historical exception.
  await call('create', order('fiscal', { matrizDeposit: 'Ibotirama' }));
  check(await stock(), { ibo: 0, bar: 16 });
  await db.exec("update sales set nfe_number='123' where id='fiscal'");
  const fiscalOrder = { ...await snapshot('fiscal'), nfeNumber: '123' };
  await call('update', payment(fiscalOrder, 10, 'fiscal-receipt'));
  check(await stock(), { ibo: 0, bar: 16 });
  const fiscalRevision = { ...await snapshot('fiscal'), nfeNumber: '123' };
  await reject(() => call('update', { ...fiscalRevision, total: 120, items: [{ ...fiscalRevision.items[0], priceAtSale: 12 }] }), /immutable/);
  await reject(() => call('update', { ...fiscalRevision, customerId: 'another-customer' }), /immutable/);
  check(await finance('fiscal'), { total: 10, events: 1 });

  // The older explicit pending marker also requires an administrator's declaration.
  await seedLegacy('pre-rule-pending', { matrizDeposit: 'Ibotirama', amountPaid: 20, paymentHistory: [receipt('pre-rule-receipt', 20)] });
  await db.exec("update sales set fulfillment_status='pending' where id='pre-rule-pending'");
  const beforePreRule = await stock();
  const preRule = await snapshot('pre-rule-pending');
  await reject(() => call('update', payment(preRule, 10, 'without-pre-rule-flag')), /administrador.*descontado/);
  await call('update', { ...preRule, historicalStockAlreadyDebited: true });
  check(await stock(), beforePreRule);
  check(await movementCount('pre-rule-pending'), 0);
  check((await row('pre-rule-pending')).fulfillment_status, 'dispatched');

  // Representatives may create and receive their own new orders, but cannot declare history.
  await db.exec("update products set stock_matriz_ibotirama=20 where id='ice'");
  await call('create', order('rep-other', { matrizDeposit: 'Ibotirama', total: 10, sellerId: 'another-representative', items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 1, priceAtSale: 10 }] }));
  await db.exec("update app_users set role='WHOLESALE_REPRESENTATIVE',allowed_modules='{ATACADO}'");
  await call('create', order('rep-own', { matrizDeposit: 'Ibotirama', total: 50, sellerId: user, items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 5, priceAtSale: 10 }] }));
  check((await stock()).ibo, 14);
  await call('update', payment(await snapshot('rep-own'), 20, 'rep-payment'));
  check((await stock()).ibo, 14);
  await reject(async () => call('update', payment(await snapshot('rep-other'), 10, 'not-owned')), /sem acesso/);
  await db.exec("update app_users set role='ADMIN'");

  // Competing creations consume availability once; the losing order has no partial records.
  const createAttempts = await Promise.allSettled([
    call('create', order('race-a')),
    call('create', order('race-b')),
  ]);
  check(createAttempts.filter(result => result.status === 'fulfilled').length, 1);
  check((await stock()).bar, 6);
  check(Number((await db.query("select count(*)::int count from sales where id in ('race-a','race-b')")).rows[0].count), 1);
  check(Number((await db.query("select count(*)::int count from stock_movements where sale_id in ('race-a','race-b')")).rows[0].count), 1);
  await call('create', order('committed-client', { fulfillmentStatus: 'committed', matrizDeposit: 'Ibotirama', total: 10,
    items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 1, priceAtSale: 10 }] }));
  check((await row('committed-client')).fulfillment_status, 'committed');
  check((await row('committed-client')).dispatched_at, null);
  check((await stock()).ibo, 13);
  check(await finance('committed-client'), { total: 0, events: 0 });
  const unpaidBeforePrice = await snapshot('committed-client');
  await call('update', { ...unpaidBeforePrice, total: 12, items: [{ ...unpaidBeforePrice.items[0], priceAtSale: 12 }] });
  check((await stock()).ibo, 13);
  check((await row('committed-client')).dispatched_at, null);
  check(await movementCount('committed-client'), 1);
  const unpaidCancellation = await snapshot('committed-client');
  const unpaidCancelOperation = operation();
  await call('cancel', unpaidCancellation, unpaidCancelOperation);
  await call('cancel', unpaidCancellation, unpaidCancelOperation);
  check((await stock()).ibo, 14);
  check(await finance('committed-client'), { total: 0, events: 0 });
  check((await row('committed-client')).dispatched_at, null);

  // Previously paid modern pending orders can acknowledge an earlier physical debit explicitly.
  await seedLegacy('paid-without-stock', { matrizDeposit: 'Ibotirama', status: 'Completed', amountPaid: 100,
    paymentHistory: [receipt('already-paid-full', 100, '2026-11-01', 'Cash')] });
  await db.exec("update sales set fulfillment_status='pending' where id='paid-without-stock'");
  const paidWithoutStock = await snapshot('paid-without-stock');
  const beforeAcknowledgement = await stock();
  await reject(() => call('update', { ...paidWithoutStock, fulfillmentStatus: 'dispatched' }), /administrador.*descontado/);
  const acknowledgePaid = { ...paidWithoutStock, historicalStockAlreadyDebited: true };
  const acknowledgeOperation = operation();
  await call('update', acknowledgePaid, acknowledgeOperation);
  await call('update', acknowledgePaid, acknowledgeOperation);
  check(await stock(), beforeAcknowledgement);
  check(await movementCount('paid-without-stock'), 0);
  check((await row('paid-without-stock')).fulfillment_status, 'dispatched');
  check((await row('paid-without-stock')).status, 'Completed');
  check((await row('paid-without-stock')).payment_history, paidWithoutStock.paymentHistory);
  check((await row('paid-without-stock')).dispatched_at, null);
  check(await finance('paid-without-stock'), { total: 100, events: 1 });
  console.log(JSON.stringify({ passed: checks, database: 'disposable in-memory PostgreSQL', migrations: ['002', '005', '202611180001'], remoteChanges: false }));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, code: error.code, where: error.where, actual: error.actual, expected: error.expected, stack: error.stack?.split('\n').slice(0,4) }));
  process.exitCode = 1;
} finally {
  await db.close();
}
