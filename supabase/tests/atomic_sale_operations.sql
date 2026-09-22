-- Execute somente em ambiente descartavel, depois da migration da etapa 2.
-- O teste inteiro roda em uma transacao e termina com rollback.

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

insert into public.tenants (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Atomic Sale Tenant A'),
  ('10000000-0000-0000-0000-000000000002', 'Atomic Sale Tenant B');

insert into public.app_users (
  id, name, email, role, tenant_id, is_active, must_change_password
) values
  ('20000000-0000-0000-0000-000000000001', 'Admin A', 'atomic-a@example.test', 'ADMIN', '10000000-0000-0000-0000-000000000001', true, false),
  ('20000000-0000-0000-0000-000000000002', 'Admin B', 'atomic-b@example.test', 'ADMIN', '10000000-0000-0000-0000-000000000002', true, false),
  ('20000000-0000-0000-0000-000000000003', 'Inactive A', 'atomic-inactive@example.test', 'ADMIN', '10000000-0000-0000-0000-000000000001', false, false);

insert into public.products (
  id, name, tenant_id, stock_filial, stock_matriz_ibotirama,
  stock_matriz_barreiras, is_stock_controlled
) values
  ('atomic-product-a', 'Gelo A', '10000000-0000-0000-0000-000000000001', 10, 10, 10, true),
  ('atomic-last-item-a', 'Ultimo item A', '10000000-0000-0000-0000-000000000001', 1, 0, 0, true),
  ('atomic-product-b', 'Gelo B', '10000000-0000-0000-0000-000000000002', 10, 10, 10, true);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001"}', true);

select public.apply_sale_operation(
  '30000000-0000-0000-0000-000000000001',
  'atomic-sale-success',
  'create',
  '{
    "date":"2026-09-22",
    "customerName":"Consumidor Final",
    "total":12,
    "items":[{"productId":"atomic-product-a","productName":"Gelo A","quantity":2,"priceAtSale":6}],
    "branch":"Filial (Adega)",
    "status":"Completed",
    "paymentMethod":"Cash",
    "hasInvoice":false,
    "tenantId":"10000000-0000-0000-0000-000000000002"
  }'::jsonb
);

select pg_temp.assert_true(
  (select tenant_id = '10000000-0000-0000-0000-000000000001'::uuid from public.sales where id = 'atomic-sale-success'),
  'tenant must come from app_users, not from payload'
);
select pg_temp.assert_true(
  (select stock_filial = 8 from public.products where id = 'atomic-product-a'),
  'completed sale must deduct stock once'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.sale_items where sale_id = 'atomic-sale-success'),
  'sale items must be persisted'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.financials where sale_id = 'atomic-sale-success'),
  'completed sale must create one financial event'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.stock_movements where sale_id = 'atomic-sale-success'),
  'completed sale must create one stock event'
);

-- O mesmo operation_id e payload deve devolver o resultado sem repetir efeitos.
select public.apply_sale_operation(
  '30000000-0000-0000-0000-000000000001',
  'atomic-sale-success',
  'create',
  '{
    "date":"2026-09-22",
    "customerName":"Consumidor Final",
    "total":12,
    "items":[{"productId":"atomic-product-a","productName":"Gelo A","quantity":2,"priceAtSale":6}],
    "branch":"Filial (Adega)",
    "status":"Completed",
    "paymentMethod":"Cash",
    "hasInvoice":false,
    "tenantId":"10000000-0000-0000-0000-000000000002"
  }'::jsonb
);

select pg_temp.assert_true(
  (select stock_filial = 8 from public.products where id = 'atomic-product-a'),
  'idempotent retry must not deduct stock twice'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.financials where sale_id = 'atomic-sale-success'),
  'idempotent retry must not duplicate financial event'
);

do $$
begin
  perform public.apply_sale_operation(
    '30000000-0000-0000-0000-000000000001',
    'atomic-sale-success',
    'create',
    '{"different":true}'::jsonb
  );
  raise exception 'expected idempotency conflict';
exception
  when unique_violation then null;
end;
$$;

-- Estoque insuficiente deve desfazer venda, itens, operacao e financeiro.
do $$
begin
  perform public.apply_sale_operation(
    '30000000-0000-0000-0000-000000000002',
    'atomic-sale-rollback',
    'create',
    '{
      "date":"2026-09-22",
      "customerName":"Rollback",
      "total":594,
      "items":[{"productId":"atomic-product-a","productName":"Gelo A","quantity":99,"priceAtSale":6}],
      "branch":"Filial (Adega)",
      "status":"Completed",
      "paymentMethod":"Cash",
      "hasInvoice":false
    }'::jsonb
  );
  raise exception 'expected insufficient stock';
exception
  when check_violation then null;
end;
$$;

select pg_temp.assert_true(
  not exists (select 1 from public.sales where id = 'atomic-sale-rollback'),
  'failed operation must roll back the sale'
);
select pg_temp.assert_true(
  not exists (select 1 from public.sale_operations where operation_id = '30000000-0000-0000-0000-000000000002'),
  'failed operation must roll back the idempotency row'
);

-- Uma falha tardia, depois de venda/itens/estoque, tambem deve desfazer tudo.
create or replace function pg_temp.fail_atomic_sale_financial()
returns trigger
language plpgsql
as $$
begin
  if new.sale_id = 'atomic-sale-late-failure' then
    raise exception 'forced late failure';
  end if;
  return new;
end;
$$;

create trigger test_fail_atomic_sale_financial
before insert on public.financials
for each row execute function pg_temp.fail_atomic_sale_financial();

do $$
begin
  perform public.apply_sale_operation(
    '30000000-0000-0000-0000-000000000006',
    'atomic-sale-late-failure',
    'create',
    '{
      "date":"2026-09-22",
      "customerName":"Late failure",
      "total":6,
      "items":[{"productId":"atomic-product-a","productName":"Gelo A","quantity":1,"priceAtSale":6}],
      "branch":"Filial (Adega)",
      "status":"Completed",
      "paymentMethod":"Cash",
      "hasInvoice":false
    }'::jsonb
  );
  raise exception 'expected forced late failure';
exception
  when raise_exception then
    if sqlerrm <> 'forced late failure' then
      raise;
    end if;
end;
$$;

drop trigger test_fail_atomic_sale_financial on public.financials;

select pg_temp.assert_true(
  not exists (select 1 from public.sales where id = 'atomic-sale-late-failure'),
  'late failure must roll back the sale'
);
select pg_temp.assert_true(
  not exists (select 1 from public.sale_items where sale_id = 'atomic-sale-late-failure'),
  'late failure must roll back sale items'
);
select pg_temp.assert_true(
  not exists (select 1 from public.stock_movements where sale_id = 'atomic-sale-late-failure'),
  'late failure must roll back stock movements'
);
select pg_temp.assert_true(
  (select stock_filial = 8 from public.products where id = 'atomic-product-a'),
  'late failure must restore product stock'
);
select pg_temp.assert_true(
  not exists (select 1 from public.sale_operations where operation_id = '30000000-0000-0000-0000-000000000006'),
  'late failure must roll back the idempotency row'
);

-- Duas vendas disputando o ultimo item: somente a primeira pode concluir.
select public.apply_sale_operation(
  '30000000-0000-0000-0000-000000000003',
  'atomic-sale-race-winner',
  'create',
  '{
    "date":"2026-09-22",
    "customerName":"Winner",
    "total":5,
    "items":[{"productId":"atomic-last-item-a","productName":"Ultimo item A","quantity":1,"priceAtSale":5}],
    "branch":"Filial (Adega)",
    "status":"Completed",
    "paymentMethod":"Cash",
    "hasInvoice":false
  }'::jsonb
);

do $$
begin
  perform public.apply_sale_operation(
    '30000000-0000-0000-0000-000000000004',
    'atomic-sale-race-loser',
    'create',
    '{
      "date":"2026-09-22",
      "customerName":"Loser",
      "total":5,
      "items":[{"productId":"atomic-last-item-a","productName":"Ultimo item A","quantity":1,"priceAtSale":5}],
      "branch":"Filial (Adega)",
      "status":"Completed",
      "paymentMethod":"Cash",
      "hasInvoice":false
    }'::jsonb
  );
  raise exception 'expected competing sale to fail';
exception
  when check_violation then null;
end;
$$;

select pg_temp.assert_true(
  (select stock_filial = 0 from public.products where id = 'atomic-last-item-a'),
  'competing sales must not make stock negative'
);
select pg_temp.assert_true(
  not exists (select 1 from public.sales where id = 'atomic-sale-race-loser'),
  'losing competing sale must roll back'
);

-- Usuario inativo nao pode iniciar uma operacao.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000003"}', true);

do $$
begin
  perform public.apply_sale_operation(
    '30000000-0000-0000-0000-000000000005',
    'atomic-sale-inactive',
    'create',
    '{}'::jsonb
  );
  raise exception 'expected inactive user rejection';
exception
  when insufficient_privilege then null;
end;
$$;

rollback;
