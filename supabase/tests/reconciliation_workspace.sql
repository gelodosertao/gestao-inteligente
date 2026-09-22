-- Execute depois das migrations 001, 002 e 003. O teste não persiste dados.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'assertion failed: %', p_message; end if;
end;
$$;

insert into public.tenants (id, name) values
  ('10000000-0000-0000-0000-000000000031', 'Reconciliation Tenant A'),
  ('10000000-0000-0000-0000-000000000032', 'Reconciliation Tenant B');

insert into public.app_users (id, name, email, role, tenant_id, is_active, must_change_password) values
  ('20000000-0000-0000-0000-000000000031', 'Recon Admin', 'recon-admin@example.test', 'ADMIN', '10000000-0000-0000-0000-000000000031', true, false),
  ('20000000-0000-0000-0000-000000000032', 'Recon Operator', 'recon-operator@example.test', 'OPERATOR', '10000000-0000-0000-0000-000000000031', true, false);

insert into public.products (id, name, tenant_id, stock_filial, stock_matriz_ibotirama, stock_matriz_barreiras, is_stock_controlled) values
  ('recon-product-a', 'Gelo reconciliação', '10000000-0000-0000-0000-000000000031', 10, 0, 0, true);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000031', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000031"}', true);

select public.apply_sale_operation(
  '30000000-0000-0000-0000-000000000031', 'recon-sale-a', 'create',
  '{"date":"2026-09-22","customerName":"Cliente de teste","total":10,"items":[{"productId":"recon-product-a","productName":"Gelo reconciliação","quantity":1,"priceAtSale":10}],"branch":"Filial (Adega)","status":"Completed","paymentMethod":"Cash","hasInvoice":false}'::jsonb
);

delete from public.financials where tenant_id = '10000000-0000-0000-0000-000000000031' and sale_id = 'recon-sale-a';

insert into public.financial_reconciliation_cases (case_key, tenant_id, case_type, status, sale_id, proposed_amount, evidence) values
  ('missing-revenue:recon-sale-a', '10000000-0000-0000-0000-000000000031', 'missing_revenue', 'PENDING_REVIEW', 'recon-sale-a', 10, '{}'::jsonb),
  ('orphan-revenue:recon-finance-a', '10000000-0000-0000-0000-000000000031', 'orphan_revenue', 'PENDING_REVIEW', null, 15, '{}'::jsonb),
  ('tenant-b-case', '10000000-0000-0000-0000-000000000032', 'missing_revenue', 'PENDING_REVIEW', null, 1, '{}'::jsonb);

insert into public.financials (id, date, description, amount, type, category, branch, payment_method, tenant_id) values
  ('recon-finance-a', '2026-09-22', 'Receita sem venda', 15, 'Income', 'Vendas', 'Filial (Adega)', 'Cash', '10000000-0000-0000-0000-000000000031');

select pg_temp.assert_true(
  (select jsonb_array_length(public.get_financial_reconciliation_cases()) = 2),
  'admin must only see reconciliation cases from its tenant'
);

select public.resolve_financial_reconciliation_case(
  'missing-revenue:recon-sale-a', 'create_missing_revenue', null, null, 'Comprovante bancário confirmou a receita da venda.'
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.financials where sale_id = 'recon-sale-a' and event_type = 'reconciliation_income'),
  'missing revenue must create one linked income'
);
select pg_temp.assert_true(
  (select status = 'RESOLVED' and resolution_action = 'create_missing_revenue' from public.financial_reconciliation_cases where case_key = 'missing-revenue:recon-sale-a'),
  'missing revenue case must be resolved with an audit action'
);

select pg_temp.assert_true(
  (public.resolve_financial_reconciliation_case(
    'missing-revenue:recon-sale-a', 'create_missing_revenue', null, null, 'Comprovante bancário confirmou a receita da venda.'
  ) ->> 'idempotent')::boolean,
  'identical retry must return the saved result'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.financials where sale_id = 'recon-sale-a' and event_type = 'reconciliation_income'),
  'identical retry must not duplicate income'
);

select public.resolve_financial_reconciliation_case(
  'orphan-revenue:recon-finance-a', 'reverse_financial', 'recon-finance-a', null, 'Receita não possui venda válida; estorno autorizado.'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.financials where id = 'recon-finance-a' and amount = 15),
  'original financial record must be preserved'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.financials where event_type = 'reconciliation_reversal' and amount = -15),
  'reversal must be compensating and auditable'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000032"}', true);
do $$
begin
  perform public.get_financial_reconciliation_cases();
  raise exception 'expected non-admin rejection';
exception when insufficient_privilege then null;
end;
$$;

rollback;
