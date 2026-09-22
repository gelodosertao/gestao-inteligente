-- Espaço operacional de conciliação. Todas as leituras e correções passam por
-- RPCs que derivam o tenant e exigem administrador ativo.

alter table public.financial_reconciliation_cases
  add column if not exists resolution_action text,
  add column if not exists resolution_payload_hash text,
  add column if not exists resolved_by text;

alter table public.financial_reconciliation_cases
  drop constraint if exists financial_reconciliation_cases_status_check;

alter table public.financial_reconciliation_cases
  add constraint financial_reconciliation_cases_status_check
  check (status in ('PENDING_REVIEW', 'APPLIED', 'RESOLVED'));

create or replace function public.get_financial_reconciliation_cases()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.app_users%rowtype;
  v_cases jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select * into v_user
  from public.app_users
  where id = auth.uid()::text;

  if not found or not v_user.is_active or v_user.must_change_password or v_user.role <> 'ADMIN' then
    raise exception using errcode = '42501', message = 'Only active administrators can access reconciliation cases';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'caseKey', reconciliation.case_key,
    'caseType', reconciliation.case_type,
    'status', reconciliation.status,
    'saleId', reconciliation.sale_id,
    'financialId', reconciliation.financial_id,
    'adjustmentFinancialId', reconciliation.adjustment_financial_id,
    'proposedAmount', reconciliation.proposed_amount,
    'evidence', reconciliation.evidence,
    'resolutionNote', reconciliation.resolution_note,
    'resolutionAction', reconciliation.resolution_action,
    'createdAt', reconciliation.created_at,
    'resolvedAt', reconciliation.resolved_at,
    'sale', case when sale.id is null then null else jsonb_build_object(
      'id', sale.id,
      'date', sale.date,
      'customerName', sale.customer_name,
      'total', sale.total,
      'status', sale.status,
      'branch', sale.branch,
      'paymentMethod', sale.payment_method
    ) end,
    'financials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', financial.id,
        'date', financial.date,
        'description', financial.description,
        'amount', financial.amount,
        'paymentMethod', financial.payment_method
      ) order by financial.date, financial.id)
      from public.financials financial
      where financial.tenant_id = reconciliation.tenant_id
        and (
          financial.id = reconciliation.financial_id
          or financial.id = reconciliation.adjustment_financial_id
          or exists (
            select 1
            from jsonb_array_elements_text(coalesce(reconciliation.evidence -> 'financialIds', '[]'::jsonb)) candidate(id)
            where candidate.id = financial.id
          )
        )
    ), '[]'::jsonb)
  ) order by
    case reconciliation.status when 'PENDING_REVIEW' then 0 when 'APPLIED' then 1 else 2 end,
    reconciliation.created_at desc), '[]'::jsonb)
  into v_cases
  from public.financial_reconciliation_cases reconciliation
  left join public.sales sale
    on sale.tenant_id = reconciliation.tenant_id
   and sale.id = reconciliation.sale_id
  where reconciliation.tenant_id = v_user.tenant_id;

  return v_cases;
end;
$$;

create or replace function public.resolve_financial_reconciliation_case(
  p_case_key text,
  p_action text,
  p_financial_id text default null,
  p_sale_id text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.app_users%rowtype;
  v_case public.financial_reconciliation_cases%rowtype;
  v_sale public.sales%rowtype;
  v_financial public.financials%rowtype;
  v_payload_hash text;
  v_adjustment_id text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select * into v_user
  from public.app_users
  where id = auth.uid()::text;

  if not found or not v_user.is_active or v_user.must_change_password or v_user.role <> 'ADMIN' then
    raise exception using errcode = '42501', message = 'Only active administrators can resolve reconciliation cases';
  end if;

  if p_action not in ('review', 'create_missing_revenue', 'reverse_financial', 'link_financial') then
    raise exception using errcode = '22023', message = 'Unsupported reconciliation action';
  end if;

  if nullif(btrim(p_note), '') is null then
    raise exception using errcode = '22023', message = 'A resolution note is required';
  end if;

  v_payload_hash := md5(concat_ws(':', p_action, coalesce(p_financial_id, ''), coalesce(p_sale_id, ''), coalesce(p_note, '')));

  select * into v_case
  from public.financial_reconciliation_cases
  where case_key = p_case_key
    and tenant_id = v_user.tenant_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Reconciliation case not found';
  end if;

  if v_case.status <> 'PENDING_REVIEW' then
    if v_case.status = 'RESOLVED'
       and v_case.resolution_action = p_action
       and v_case.resolution_payload_hash = v_payload_hash then
      return jsonb_build_object(
        'caseKey', v_case.case_key,
        'status', v_case.status,
        'adjustmentFinancialId', v_case.adjustment_financial_id,
        'idempotent', true
      );
    end if;
    raise exception using errcode = '23505', message = 'Reconciliation case was already resolved';
  end if;

  if p_action = 'create_missing_revenue' then
    if v_case.case_type <> 'missing_revenue' or v_case.sale_id is null then
      raise exception using errcode = '22023', message = 'This case cannot create a missing revenue';
    end if;

    select * into v_sale
    from public.sales
    where id = v_case.sale_id
      and tenant_id = v_user.tenant_id
    for update;

    if not found or v_sale.status not in ('Completed', 'Finalizado pela Fábrica') then
      raise exception using errcode = '22023', message = 'Only completed sales can receive a reconciliation revenue';
    end if;

    if exists (
      select 1 from public.financials financial
      where financial.tenant_id = v_user.tenant_id
        and financial.type = 'Income'
        and financial.category = 'Vendas'
        and (
          financial.sale_id = v_sale.id
          or substring(financial.description from '#([^[:space:]]+)') = v_sale.id
        )
    ) then
      raise exception using errcode = '23505', message = 'The sale already has a revenue record';
    end if;

    v_adjustment_id := 'reconciliation:' || v_case.case_key || ':income-v1';
    insert into public.financials (
      id, date, description, amount, type, category, branch, payment_method,
      tenant_id, sale_id, event_type
    ) values (
      v_adjustment_id, v_sale.date,
      'Receita conciliada da venda #' || v_sale.id,
      v_sale.total, 'Income', 'Vendas', v_sale.branch, v_sale.payment_method,
      v_user.tenant_id, v_sale.id, 'reconciliation_income'
    ) on conflict (id) do nothing;

  elsif p_action = 'reverse_financial' then
    if p_financial_id is null then
      raise exception using errcode = '22023', message = 'A financial record is required for reversal';
    end if;

    select * into v_financial
    from public.financials
    where id = p_financial_id
      and tenant_id = v_user.tenant_id
    for update;

    if not found or v_financial.type <> 'Income' or v_financial.amount <= 0
       or v_financial.id like 'reconciliation:%' then
      raise exception using errcode = '22023', message = 'Invalid financial record for reversal';
    end if;

    if v_financial.id is distinct from v_case.financial_id
       and not exists (
         select 1
         from jsonb_array_elements_text(coalesce(v_case.evidence -> 'financialIds', '[]'::jsonb)) candidate(id)
         where candidate.id = v_financial.id
       ) then
      raise exception using errcode = '42501', message = 'Financial record is not part of this reconciliation case';
    end if;

    v_adjustment_id := 'reconciliation:' || v_case.case_key || ':reversal:' || v_financial.id;
    insert into public.financials (
      id, date, description, amount, type, category, branch, payment_method,
      tenant_id, sale_id, event_type
    ) values (
      v_adjustment_id, v_financial.date,
      'Estorno de conciliação do lançamento #' || v_financial.id,
      -v_financial.amount, 'Income', 'Vendas', v_financial.branch, v_financial.payment_method,
      v_user.tenant_id, v_case.sale_id, 'reconciliation_reversal'
    ) on conflict (id) do nothing;

  elsif p_action = 'link_financial' then
    if v_case.case_type <> 'orphan_revenue' or p_financial_id is null or p_sale_id is null
       or p_financial_id is distinct from v_case.financial_id then
      raise exception using errcode = '22023', message = 'Only an orphan revenue can be linked to a sale';
    end if;

    select * into v_sale
    from public.sales
    where id = p_sale_id
      and tenant_id = v_user.tenant_id
    for update;

    if not found then
      raise exception using errcode = '42501', message = 'Selected sale is not available for this tenant';
    end if;

    select * into v_financial
    from public.financials
    where id = p_financial_id
      and tenant_id = v_user.tenant_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Financial record not found';
    end if;

    update public.financials
    set sale_id = v_sale.id,
        event_type = coalesce(event_type, 'reconciliation_link')
    where id = v_financial.id
      and tenant_id = v_user.tenant_id;

    update public.financial_reconciliation_cases
    set sale_id = v_sale.id
    where case_key = v_case.case_key;
  end if;

  update public.financial_reconciliation_cases
  set status = 'RESOLVED',
      adjustment_financial_id = case when p_action in ('create_missing_revenue', 'reverse_financial') then v_adjustment_id else adjustment_financial_id end,
      resolution_action = p_action,
      resolution_payload_hash = v_payload_hash,
      resolution_note = nullif(btrim(p_note), ''),
      resolved_by = v_user.id,
      resolved_at = now(),
      updated_at = now()
  where case_key = v_case.case_key
    and tenant_id = v_user.tenant_id;

  select jsonb_build_object(
    'caseKey', case_key,
    'status', status,
    'adjustmentFinancialId', adjustment_financial_id,
    'idempotent', false
  ) into v_result
  from public.financial_reconciliation_cases
  where case_key = v_case.case_key
    and tenant_id = v_user.tenant_id;

  return v_result;
end;
$$;

revoke all on function public.get_financial_reconciliation_cases() from public, anon;
revoke all on function public.resolve_financial_reconciliation_case(text, text, text, text, text) from public, anon;
grant execute on function public.get_financial_reconciliation_cases() to authenticated;
grant execute on function public.resolve_financial_reconciliation_case(text, text, text, text, text) to authenticated;
