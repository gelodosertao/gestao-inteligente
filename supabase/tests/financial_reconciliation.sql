begin;

\ir ../migrations/202609220001_atomic_sale_operations.sql
\ir ../migrations/202609220002_financial_reconciliation.sql

do $$
declare v_pending integer;
begin
  if not exists (
    select 1 from public.financials
    where id = 'reconciliation:679d0975-7a09-46ff-86f7-d32db1e53024:reversal-v1'
      and amount = -300 and event_type = 'reconciliation_reversal'
  ) then raise exception 'Approved R$300 reversal was not created'; end if;

  if (select count(*) from public.financials
      where tenant_id = (select tenant_id from public.sales where id = '679d0975-7a09-46ff-86f7-d32db1e53024')
        and type = 'Income' and category = 'Vendas'
        and substring(description from '#([^[:space:]]+)') = '679d0975-7a09-46ff-86f7-d32db1e53024'
        and amount = 300) <> 2 then
    raise exception 'Legacy revenues must be preserved';
  end if;

  if not exists (
    select 1 from public.financial_reconciliation_cases
    where case_key = 'duplicate-reversal:679d0975-7a09-46ff-86f7-d32db1e53024'
      and status = 'APPLIED' and proposed_amount = -300
  ) then raise exception 'Approved reconciliation audit case was not recorded'; end if;

  select count(*) into v_pending from public.financial_reconciliation_cases
  where status = 'PENDING_REVIEW';
  if v_pending < 63 then raise exception 'Expected the identified review cases, found only %', v_pending; end if;

  if not exists (select 1 from public.financial_reconciliation_cases where case_key = 'duplicate-review:232dbf2f-b120-43fb-ad8d-f1d756ae0313')
    or not exists (select 1 from public.financial_reconciliation_cases where case_key = 'duplicate-review:bec0ca5e-fce9-4b13-a515-855f8831e716')
    or not exists (select 1 from public.financial_reconciliation_cases where case_key = 'duplicate-review:4174') then
    raise exception 'Known ambiguous duplicate cases were not retained for review';
  end if;
end
$$;

rollback;
