-- Etapa 2: venda, itens, estoque e financeiro atomicos e idempotentes.
-- Migration aditiva. As FKs legadas usam NOT VALID para proteger novas escritas
-- sem bloquear o rollout por dados historicos ainda nao saneados.

create table if not exists public.sale_operations (
  tenant_id uuid not null references public.tenants(id),
  operation_id uuid not null,
  sale_id text not null,
  action text not null check (action in ('create', 'update', 'cancel')),
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (tenant_id, operation_id)
);

alter table public.sale_operations enable row level security;

revoke all on table public.sale_operations from anon, authenticated;

alter table public.sales
  add column if not exists stock_effects jsonb;

alter table public.financials
  add column if not exists sale_id text,
  add column if not exists operation_id uuid,
  add column if not exists event_type text;

alter table public.stock_movements
  add column if not exists sale_id text,
  add column if not exists operation_id uuid,
  add column if not exists event_type text;

create unique index if not exists sales_tenant_id_id_uidx
  on public.sales (tenant_id, id);

create unique index if not exists products_tenant_id_id_uidx
  on public.products (tenant_id, id);

create index if not exists sale_items_tenant_sale_idx
  on public.sale_items (tenant_id, sale_id);

create index if not exists sale_items_tenant_product_idx
  on public.sale_items (tenant_id, product_id);

create index if not exists sale_operations_sale_idx
  on public.sale_operations (tenant_id, sale_id, created_at desc);

create index if not exists financials_tenant_sale_idx
  on public.financials (tenant_id, sale_id);

create index if not exists stock_movements_tenant_sale_idx
  on public.stock_movements (tenant_id, sale_id);

create unique index if not exists financials_sale_operation_uidx
  on public.financials (tenant_id, operation_id)
  where operation_id is not null;

create unique index if not exists stock_movements_sale_event_uidx
  on public.stock_movements (tenant_id, operation_id, product_id, event_type)
  where operation_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sale_items_tenant_sale_fk') then
    alter table public.sale_items
      add constraint sale_items_tenant_sale_fk
      foreign key (tenant_id, sale_id)
      references public.sales (tenant_id, id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sale_items_tenant_product_fk') then
    alter table public.sale_items
      add constraint sale_items_tenant_product_fk
      foreign key (tenant_id, product_id)
      references public.products (tenant_id, id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'financials_tenant_sale_fk') then
    alter table public.financials
      add constraint financials_tenant_sale_fk
      foreign key (tenant_id, sale_id)
      references public.sales (tenant_id, id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'stock_movements_tenant_sale_fk') then
    alter table public.stock_movements
      add constraint stock_movements_tenant_sale_fk
      foreign key (tenant_id, sale_id)
      references public.sales (tenant_id, id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'stock_movements_tenant_product_fk') then
    alter table public.stock_movements
      add constraint stock_movements_tenant_product_fk
      foreign key (tenant_id, product_id)
      references public.products (tenant_id, id)
      not valid;
  end if;
end
$$;

create or replace function public.resolve_sale_stock_effects(
  p_tenant_id uuid,
  p_items jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with item_rows as (
    select
      item ->> 'productId' as product_id,
      (item ->> 'quantity')::numeric as quantity
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
  ),
  expanded as (
    select
      component.value ->> 'productId' as product_id,
      item.quantity * (component.value ->> 'quantity')::numeric as quantity
    from item_rows item
    join public.products product
      on product.id = item.product_id
     and product.tenant_id = p_tenant_id
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(product.combo_items) = 'array'
         and jsonb_array_length(product.combo_items) > 0
          then product.combo_items
        else jsonb_build_array(jsonb_build_object(
          'productId', product.id,
          'quantity', 1
        ))
      end
    ) component
  ),
  controlled as (
    select expanded.product_id, expanded.quantity
    from expanded
    join public.products product
      on product.id = expanded.product_id
     and product.tenant_id = p_tenant_id
    where coalesce(product.is_stock_controlled, true)
  ),
  totals as (
    select product_id, sum(quantity) as quantity
    from controlled
    group by product_id
  )
  select coalesce(jsonb_object_agg(product_id, quantity), '{}'::jsonb)
  from totals;
$$;

revoke all on function public.resolve_sale_stock_effects(uuid, jsonb) from public, anon, authenticated;

create or replace function public.apply_sale_operation(
  p_operation_id uuid,
  p_sale_id text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.app_users%rowtype;
  v_old_sale public.sales%rowtype;
  v_has_old_sale boolean := false;
  v_inserted boolean := false;
  v_payload_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
  v_items jsonb := coalesce(p_payload -> 'items', '[]'::jsonb);
  v_old_items jsonb := '[]'::jsonb;
  v_status text;
  v_branch text;
  v_matriz_deposit text;
  v_old_final boolean := false;
  v_new_final boolean := false;
  v_old_effects jsonb := '{}'::jsonb;
  v_new_effects jsonb := '{}'::jsonb;
  v_deltas jsonb := '{}'::jsonb;
  v_items_total numeric := 0;
  v_total numeric := 0;
  v_old_revenue numeric := 0;
  v_new_revenue numeric := 0;
  v_financial_delta numeric := 0;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select *
  into v_user
  from public.app_users
  where id = auth.uid()::text;

  if not found or v_user.tenant_id is null then
    raise exception using errcode = '42501', message = 'Active application user not found';
  end if;

  if not v_user.is_active or v_user.must_change_password then
    raise exception using errcode = '42501', message = 'User is not allowed to create sales';
  end if;

  if p_operation_id is null or nullif(btrim(p_sale_id), '') is null then
    raise exception using errcode = '22023', message = 'operation_id and sale_id are required';
  end if;

  if p_action not in ('create', 'update', 'cancel') then
    raise exception using errcode = '22023', message = 'Unsupported sale action';
  end if;

  if p_action = 'cancel' and v_user.role <> 'ADMIN' then
    raise exception using errcode = '42501', message = 'Only administrators can cancel sales';
  end if;

  v_payload_hash := md5(p_action || ':' || p_sale_id || ':' || coalesce(p_payload, '{}'::jsonb)::text);

  insert into public.sale_operations (
    tenant_id, operation_id, sale_id, action, payload_hash
  ) values (
    v_user.tenant_id, p_operation_id, p_sale_id, p_action, v_payload_hash
  )
  on conflict (tenant_id, operation_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    select payload_hash, result
    into v_existing_hash, v_existing_result
    from public.sale_operations
    where tenant_id = v_user.tenant_id
      and operation_id = p_operation_id;

    if v_existing_hash is distinct from v_payload_hash then
      raise exception using errcode = '23505', message = 'Idempotency key already used with a different payload';
    end if;

    if v_existing_result is null then
      raise exception using errcode = '40001', message = 'Sale operation is still in progress';
    end if;

    return v_existing_result;
  end if;

  select *
  into v_old_sale
  from public.sales
  where id = p_sale_id
  for update;

  v_has_old_sale := found;

  if v_has_old_sale and v_old_sale.tenant_id is distinct from v_user.tenant_id then
    raise exception using errcode = '42501', message = 'Sale belongs to another tenant';
  end if;

  if p_action = 'create' and v_has_old_sale then
    raise exception using errcode = '23505', message = 'Sale already exists';
  end if;

  if p_action in ('update', 'cancel') and not v_has_old_sale then
    raise exception using errcode = 'P0002', message = 'Sale not found';
  end if;

  if v_has_old_sale then
    v_old_final := v_old_sale.status in ('Completed', 'Finalizado pela Fábrica');

    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', item.product_id,
      'productName', item.product_name,
      'quantity', item.quantity,
      'priceAtSale', item.price_at_sale,
      'selectedOptions', item.selected_options,
      'notes', item.notes,
      'ncm', item.ncm,
      'cfop', item.cfop,
      'cst', item.cst
    ) order by item.id), v_old_sale.items, '[]'::jsonb)
    into v_old_items
    from public.sale_items item
    where item.tenant_id = v_user.tenant_id
      and item.sale_id = p_sale_id;

    if v_old_final then
      v_old_effects := coalesce(
        v_old_sale.stock_effects,
        public.resolve_sale_stock_effects(v_user.tenant_id, v_old_items),
        '{}'::jsonb
      );
      v_old_revenue := coalesce(v_old_sale.total, 0);
    end if;
  end if;

  if p_action = 'cancel' then
    v_status := 'Cancelled';
    v_branch := v_old_sale.branch;
    v_matriz_deposit := v_old_sale.matriz_deposit;
    v_items := v_old_items;
  else
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
      raise exception using errcode = '22023', message = 'Sale must contain at least one item';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_items) item
      where nullif(item ->> 'productId', '') is null
         or coalesce((item ->> 'quantity')::numeric, 0) <= 0
         or coalesce((item ->> 'priceAtSale')::numeric, -1) < 0
    ) then
      raise exception using errcode = '22023', message = 'Invalid sale item';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_items) item
      left join public.products product
        on product.id = item ->> 'productId'
       and product.tenant_id = v_user.tenant_id
      where product.id is null
    ) then
      raise exception using errcode = '23503', message = 'Sale contains a product from another tenant or an unknown product';
    end if;

    select coalesce(sum(
      (item ->> 'quantity')::numeric * (item ->> 'priceAtSale')::numeric
    ), 0)
    into v_items_total
    from jsonb_array_elements(v_items) item;

    v_total := coalesce((p_payload ->> 'total')::numeric, 0);

    if abs(v_total - (
      v_items_total
      + coalesce((p_payload ->> 'deliveryFee')::numeric, 0)
      - coalesce((p_payload ->> 'discount')::numeric, 0)
    )) > 0.01 then
      raise exception using errcode = '22023', message = 'Sale total does not match its items';
    end if;

    v_status := p_payload ->> 'status';
    v_branch := p_payload ->> 'branch';
    v_matriz_deposit := p_payload ->> 'matrizDeposit';

    if v_status not in ('Completed', 'Pending', 'Cancelled', 'Finalizado pela Fábrica') then
      raise exception using errcode = '22023', message = 'Invalid sale status';
    end if;

    if v_status = 'Cancelled' then
      raise exception using errcode = '22023', message = 'Use the cancel action to cancel a sale';
    end if;

    if v_branch not in ('Filial (Adega)', 'Matriz (Fábrica)') then
      raise exception using errcode = '22023', message = 'Invalid sale branch';
    end if;

    v_new_final := v_status in ('Completed', 'Finalizado pela Fábrica');

    if v_new_final then
      v_new_effects := public.resolve_sale_stock_effects(v_user.tenant_id, v_items);
      v_new_revenue := v_total;

      if v_branch = 'Matriz (Fábrica)'
         and v_matriz_deposit not in ('Ibotirama', 'Barreiras')
         and v_new_effects <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'A matriz deposit is required for a completed sale';
      end if;
    end if;
  end if;

  if exists (
    select 1
    from (
      select key as product_id from jsonb_each(v_old_effects)
      union
      select key from jsonb_each(v_new_effects)
    ) effect
    left join public.products product
      on product.id = effect.product_id
     and product.tenant_id = v_user.tenant_id
    where product.id is null
  ) then
    raise exception using errcode = '23503', message = 'A combo contains a product from another tenant or an unknown product';
  end if;

  perform 1
  from public.products product
  where product.tenant_id = v_user.tenant_id
    and (v_old_effects ? product.id or v_new_effects ? product.id)
  order by product.id
  for update;

  with changes as (
    select
      effect.key as product_id,
      case when v_old_sale.branch = 'Filial (Adega)' then effect.value::numeric else 0 end as filial,
      case when v_old_sale.branch = 'Matriz (Fábrica)' and v_old_sale.matriz_deposit = 'Ibotirama' then effect.value::numeric else 0 end as ibotirama,
      case when v_old_sale.branch = 'Matriz (Fábrica)' and v_old_sale.matriz_deposit = 'Barreiras' then effect.value::numeric else 0 end as barreiras
    from jsonb_each_text(v_old_effects) effect
    union all
    select
      effect.key,
      case when v_branch = 'Filial (Adega)' then -effect.value::numeric else 0 end,
      case when v_branch = 'Matriz (Fábrica)' and v_matriz_deposit = 'Ibotirama' then -effect.value::numeric else 0 end,
      case when v_branch = 'Matriz (Fábrica)' and v_matriz_deposit = 'Barreiras' then -effect.value::numeric else 0 end
    from jsonb_each_text(v_new_effects) effect
  ),
  totals as (
    select product_id, sum(filial) filial, sum(ibotirama) ibotirama, sum(barreiras) barreiras
    from changes
    group by product_id
  )
  select coalesce(jsonb_object_agg(product_id, jsonb_build_object(
    'filial', filial,
    'ibotirama', ibotirama,
    'barreiras', barreiras
  )), '{}'::jsonb)
  into v_deltas
  from totals;

  if exists (
    select 1
    from jsonb_each(v_deltas) delta
    join public.products product
      on product.id = delta.key
     and product.tenant_id = v_user.tenant_id
    where coalesce(product.stock_filial, 0) + (delta.value ->> 'filial')::numeric < 0
       or coalesce(product.stock_matriz_ibotirama, 0) + (delta.value ->> 'ibotirama')::numeric < 0
       or coalesce(product.stock_matriz_barreiras, 0) + (delta.value ->> 'barreiras')::numeric < 0
  ) then
    raise exception using errcode = '23514', message = 'Insufficient stock';
  end if;

  if p_action = 'create' then
    insert into public.sales (
      id, date, customer_name, total, branch, matriz_deposit, status,
      payment_method, payment_splits, has_invoice, items, cash_received,
      change_amount, amount_paid, payment_history, created_at, delivery_fee,
      discount, source, seller_id, seller_name, seller_role,
      commission_amount, nfe_status, nfe_number, nfe_series, nfe_xml,
      nfe_issued_at, customer_details, invoice_key, invoice_url, tenant_id,
      stock_effects
    ) values (
      p_sale_id,
      p_payload ->> 'date',
      p_payload ->> 'customerName',
      v_total,
      v_branch,
      v_matriz_deposit,
      v_status,
      p_payload ->> 'paymentMethod',
      p_payload -> 'paymentSplits',
      coalesce((p_payload ->> 'hasInvoice')::boolean, false),
      v_items,
      (p_payload ->> 'cashReceived')::numeric,
      (p_payload ->> 'changeAmount')::numeric,
      (p_payload ->> 'amountPaid')::numeric,
      p_payload -> 'paymentHistory',
      coalesce((p_payload ->> 'createdAt')::timestamptz, now()),
      (p_payload ->> 'deliveryFee')::numeric,
      (p_payload ->> 'discount')::numeric,
      p_payload ->> 'source',
      p_payload ->> 'sellerId',
      p_payload ->> 'sellerName',
      p_payload ->> 'sellerRole',
      (p_payload ->> 'commissionAmount')::numeric,
      p_payload ->> 'nfeStatus',
      p_payload ->> 'nfeNumber',
      p_payload ->> 'nfeSeries',
      p_payload ->> 'nfeXml',
      (p_payload ->> 'nfeIssuedAt')::timestamptz,
      p_payload -> 'customerDetails',
      p_payload ->> 'invoiceKey',
      p_payload ->> 'invoiceUrl',
      v_user.tenant_id,
      v_new_effects
    );
  elsif p_action = 'update' then
    update public.sales
    set date = p_payload ->> 'date',
        customer_name = p_payload ->> 'customerName',
        total = v_total,
        branch = v_branch,
        matriz_deposit = v_matriz_deposit,
        status = v_status,
        payment_method = p_payload ->> 'paymentMethod',
        payment_splits = p_payload -> 'paymentSplits',
        has_invoice = coalesce((p_payload ->> 'hasInvoice')::boolean, false),
        items = v_items,
        cash_received = (p_payload ->> 'cashReceived')::numeric,
        change_amount = (p_payload ->> 'changeAmount')::numeric,
        amount_paid = (p_payload ->> 'amountPaid')::numeric,
        payment_history = p_payload -> 'paymentHistory',
        delivery_fee = (p_payload ->> 'deliveryFee')::numeric,
        discount = (p_payload ->> 'discount')::numeric,
        source = p_payload ->> 'source',
        seller_id = p_payload ->> 'sellerId',
        seller_name = p_payload ->> 'sellerName',
        seller_role = p_payload ->> 'sellerRole',
        commission_amount = (p_payload ->> 'commissionAmount')::numeric,
        nfe_status = p_payload ->> 'nfeStatus',
        nfe_number = p_payload ->> 'nfeNumber',
        nfe_series = p_payload ->> 'nfeSeries',
        nfe_xml = p_payload ->> 'nfeXml',
        nfe_issued_at = (p_payload ->> 'nfeIssuedAt')::timestamptz,
        customer_details = p_payload -> 'customerDetails',
        invoice_key = p_payload ->> 'invoiceKey',
        invoice_url = p_payload ->> 'invoiceUrl',
        stock_effects = v_new_effects
    where id = p_sale_id
      and tenant_id = v_user.tenant_id;
  else
    update public.sales
    set status = 'Cancelled',
        stock_effects = '{}'::jsonb
    where id = p_sale_id
      and tenant_id = v_user.tenant_id;
  end if;

  if p_action in ('create', 'update') then
    delete from public.sale_items
    where sale_id = p_sale_id
      and tenant_id = v_user.tenant_id;

    insert into public.sale_items (
      sale_id, product_id, product_name, quantity, price_at_sale,
      selected_options, notes, ncm, cfop, cst, tenant_id
    )
    select
      p_sale_id,
      item ->> 'productId',
      item ->> 'productName',
      (item ->> 'quantity')::numeric,
      (item ->> 'priceAtSale')::numeric,
      item -> 'selectedOptions',
      item ->> 'notes',
      item ->> 'ncm',
      item ->> 'cfop',
      item ->> 'cst',
      v_user.tenant_id
    from jsonb_array_elements(v_items) item;
  end if;

  update public.products product
  set stock_filial = coalesce(product.stock_filial, 0) + (delta.value ->> 'filial')::numeric,
      stock_matriz_ibotirama = coalesce(product.stock_matriz_ibotirama, 0) + (delta.value ->> 'ibotirama')::numeric,
      stock_matriz_barreiras = coalesce(product.stock_matriz_barreiras, 0) + (delta.value ->> 'barreiras')::numeric
  from jsonb_each(v_deltas) delta
  where product.id = delta.key
    and product.tenant_id = v_user.tenant_id;

  insert into public.stock_movements (
    id, date, product_id, product_name, quantity, type, reason, branch,
    matriz_deposit, tenant_id, sale_id, operation_id, event_type
  )
  select
    p_operation_id::text || ':stock:' || product.id || ':' || movement.location,
    coalesce(p_payload ->> 'date', v_old_sale.date),
    product.id,
    product.name,
    movement.quantity,
    'ADJUSTMENT',
    case p_action
      when 'create' then 'Venda concluída #' || p_sale_id
      when 'update' then 'Ajuste da venda #' || p_sale_id
      else 'Estorno da venda #' || p_sale_id
    end,
    case when movement.location = 'filial' then 'Filial (Adega)' else 'Matriz (Fábrica)' end,
    case movement.location when 'ibotirama' then 'Ibotirama' when 'barreiras' then 'Barreiras' end,
    v_user.tenant_id,
    p_sale_id,
    p_operation_id,
    'stock_' || movement.location
  from jsonb_each(v_deltas) delta
  join public.products product
    on product.id = delta.key
   and product.tenant_id = v_user.tenant_id
  cross join lateral (values
    ('filial', (delta.value ->> 'filial')::numeric),
    ('ibotirama', (delta.value ->> 'ibotirama')::numeric),
    ('barreiras', (delta.value ->> 'barreiras')::numeric)
  ) movement(location, quantity)
  where movement.quantity <> 0;

  v_financial_delta := v_new_revenue - v_old_revenue;

  if v_financial_delta <> 0 then
    insert into public.financials (
      id, date, description, amount, type, category, branch,
      payment_method, tenant_id, sale_id, operation_id, event_type
    ) values (
      p_operation_id::text || ':financial',
      coalesce(p_payload ->> 'date', v_old_sale.date),
      case p_action
        when 'create' then 'Venda #' || p_sale_id || ' - ' || coalesce(p_payload ->> 'customerName', '')
        when 'update' then 'Ajuste da venda #' || p_sale_id
        else 'Estorno da venda #' || p_sale_id
      end,
      v_financial_delta,
      'Income',
      'Vendas',
      coalesce(v_branch, v_old_sale.branch),
      coalesce(p_payload ->> 'paymentMethod', v_old_sale.payment_method),
      v_user.tenant_id,
      p_sale_id,
      p_operation_id,
      case p_action when 'cancel' then 'sale_reversal' else 'sale_adjustment' end
    );
  end if;

  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'saleId', p_sale_id,
    'action', p_action,
    'status', case when p_action = 'cancel' then 'Cancelled' else v_status end
  );

  update public.sale_operations
  set result = v_result,
      completed_at = now()
  where tenant_id = v_user.tenant_id
    and operation_id = p_operation_id;

  return v_result;
end;
$$;

revoke all on function public.apply_sale_operation(uuid, text, text, jsonb) from public, anon;
grant execute on function public.apply_sale_operation(uuid, text, text, jsonb) to authenticated;
