-- Reconciliação financeira histórica aprovada em 2026-09-22.
-- Não remove receitas legadas: o ajuste é um lançamento compensatório e os
-- demais casos ficam registrados para decisão humana.

create table if not exists public.financial_reconciliation_cases (
  case_key text primary key,
  tenant_id uuid not null references public.tenants(id),
  case_type text not null check (case_type in (
    'missing_revenue', 'orphan_revenue', 'duplicate_revenue',
    'amount_mismatch', 'pending_sale_revenue', 'duplicate_reversal'
  )),
  status text not null check (status in ('PENDING_REVIEW', 'APPLIED')),
  sale_id text,
  financial_id text references public.financials(id),
  adjustment_financial_id text references public.financials(id),
  proposed_amount numeric,
  evidence jsonb not null default '{}'::jsonb,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (tenant_id, sale_id) references public.sales(tenant_id, id)
);

alter table public.financial_reconciliation_cases enable row level security;
revoke all on table public.financial_reconciliation_cases from anon, authenticated;

create index if not exists financial_reconciliation_cases_tenant_status_idx
  on public.financial_reconciliation_cases (tenant_id, status, case_type);
create index if not exists financial_reconciliation_cases_sale_idx
  on public.financial_reconciliation_cases (tenant_id, sale_id) where sale_id is not null;

do $$
declare
  v_sale public.sales%rowtype;
  v_count integer;
  v_sum numeric;
  v_adjustment_id constant text := 'reconciliation:679d0975-7a09-46ff-86f7-d32db1e53024:reversal-v1';
begin
  select * into v_sale from public.sales
  where id = '679d0975-7a09-46ff-86f7-d32db1e53024' for update;

  if not found or v_sale.status not in ('Completed', 'Finalizado pela Fábrica') or v_sale.total <> 300 then
    raise exception 'Precondition failed for approved reconciliation reversal';
  end if;

  select count(*), coalesce(sum(financial.amount), 0) into v_count, v_sum
  from public.financials financial
  where financial.tenant_id = v_sale.tenant_id
    and financial.type = 'Income'
    and financial.category = 'Vendas'
    and substring(financial.description from '#([^[:space:]]+)') = v_sale.id
    and financial.amount = 300
    and financial.date = v_sale.date
    and financial.payment_method = 'Cash';

  if v_count <> 2 or v_sum <> 600 then
    raise exception 'Precondition failed for approved reconciliation reversal';
  end if;

  insert into public.financials (
    id, date, description, amount, type, category, branch, payment_method,
    tenant_id, sale_id, event_type
  ) values (
    v_adjustment_id, v_sale.date,
    'Estorno de reconciliação: receita duplicada da venda #' || v_sale.id,
    -300, 'Income', 'Vendas', v_sale.branch, 'Cash', v_sale.tenant_id,
    v_sale.id, 'reconciliation_reversal'
  ) on conflict (id) do nothing;

  insert into public.financial_reconciliation_cases (
    case_key, tenant_id, case_type, status, sale_id,
    adjustment_financial_id, proposed_amount, evidence, resolution_note, resolved_at
  ) values (
    'duplicate-reversal:679d0975-7a09-46ff-86f7-d32db1e53024', v_sale.tenant_id,
    'duplicate_reversal', 'APPLIED', v_sale.id, v_adjustment_id, -300,
    jsonb_build_object('reason', 'two exact legacy revenues of R$300 on the sale date',
      'legacyRevenueCount', v_count, 'legacyRevenueTotal', v_sum),
    'Compensating reversal approved by the responsible user on 2026-09-22.', now()
  ) on conflict (case_key) do nothing;
end
$$;

-- The legacy reference is only the token immediately after #; amount/date are
-- evidence, never an automatic relationship inference.
with legacy_revenues as (
  select financial.*, substring(financial.description from '#([^[:space:]]+)') as referenced_sale_id
  from public.financials financial
  where financial.type = 'Income' and financial.category = 'Vendas'
    and financial.description like '%#%'
), revenue_rollup as (
  select tenant_id, referenced_sale_id,
    count(*) filter (where id not like 'reconciliation:%') as legacy_count,
    coalesce(sum(amount) filter (where id not like 'reconciliation:%'), 0) as legacy_total,
    jsonb_agg(id order by id) filter (where id not like 'reconciliation:%') as financial_ids
  from legacy_revenues
  where referenced_sale_id is not null
  group by tenant_id, referenced_sale_id
), pending_cases as (
  select 'missing-revenue:' || sale.id as case_key, sale.tenant_id,
    'missing_revenue'::text as case_type, sale.id as sale_id, null::text as financial_id,
    sale.total as proposed_amount,
    jsonb_build_object('saleDate', sale.date, 'saleTotal', sale.total) as evidence
  from public.sales sale
  left join revenue_rollup revenue on revenue.tenant_id = sale.tenant_id
    and revenue.referenced_sale_id = sale.id
  where sale.status in ('Completed', 'Finalizado pela Fábrica')
    and coalesce(revenue.legacy_count, 0) = 0

  union all

  select 'orphan-revenue:' || revenue.id, revenue.tenant_id, 'orphan_revenue'::text,
    null::text, revenue.id, revenue.amount,
    jsonb_build_object('date', revenue.date, 'description', revenue.description,
      'referencedSaleId', revenue.referenced_sale_id)
  from legacy_revenues revenue
  left join public.sales sale on sale.tenant_id = revenue.tenant_id
    and sale.id = revenue.referenced_sale_id
  where revenue.id not like 'reconciliation:%' and revenue.referenced_sale_id is not null
    and sale.id is null

  union all

  select 'duplicate-review:' || sale.id, sale.tenant_id, 'duplicate_revenue'::text,
    sale.id, null::text, revenue.legacy_total - sale.total,
    jsonb_build_object('saleTotal', sale.total, 'legacyRevenueCount', revenue.legacy_count,
      'legacyRevenueTotal', revenue.legacy_total, 'financialIds', revenue.financial_ids)
  from public.sales sale join revenue_rollup revenue on revenue.tenant_id = sale.tenant_id
    and revenue.referenced_sale_id = sale.id
  where sale.status in ('Completed', 'Finalizado pela Fábrica') and revenue.legacy_count > 1
    and sale.id <> '679d0975-7a09-46ff-86f7-d32db1e53024'

  union all

  select 'amount-review:' || sale.id, sale.tenant_id, 'amount_mismatch'::text,
    sale.id, null::text, revenue.legacy_total - sale.total,
    jsonb_build_object('saleTotal', sale.total, 'legacyRevenueTotal', revenue.legacy_total,
      'financialIds', revenue.financial_ids)
  from public.sales sale join revenue_rollup revenue on revenue.tenant_id = sale.tenant_id
    and revenue.referenced_sale_id = sale.id
  where sale.status in ('Completed', 'Finalizado pela Fábrica') and revenue.legacy_count = 1
    and revenue.legacy_total <> sale.total

  union all

  select 'pending-sale-revenue:' || sale.id, sale.tenant_id, 'pending_sale_revenue'::text,
    sale.id, null::text, revenue.legacy_total,
    jsonb_build_object('saleTotal', sale.total, 'legacyRevenueTotal', revenue.legacy_total,
      'financialIds', revenue.financial_ids)
  from public.sales sale join revenue_rollup revenue on revenue.tenant_id = sale.tenant_id
    and revenue.referenced_sale_id = sale.id
  where sale.status = 'Pending' and revenue.legacy_count > 0
)
insert into public.financial_reconciliation_cases (
  case_key, tenant_id, case_type, status, sale_id, financial_id, proposed_amount, evidence
)
select case_key, tenant_id, case_type, 'PENDING_REVIEW', sale_id, financial_id, proposed_amount, evidence
from pending_cases
on conflict (case_key) do update
set proposed_amount = excluded.proposed_amount,
    evidence = excluded.evidence,
    updated_at = now()
where public.financial_reconciliation_cases.status = 'PENDING_REVIEW';
