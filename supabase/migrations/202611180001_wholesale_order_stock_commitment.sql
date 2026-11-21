-- Commit wholesale stock when the order is created; reconcile historical debits explicitly.
begin;

alter table public.sales drop constraint if exists sales_fulfillment_status_check;
alter table public.sales add constraint sales_fulfillment_status_check
  check (fulfillment_status in ('pending', 'committed', 'dispatched'));

create function private.wholesale_order_quantities(p_items jsonb)
returns jsonb language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(jsonb_object_agg(product_id, quantity), '{}'::jsonb)
  from (
    select item ->> 'productId' product_id, sum((item ->> 'quantity')::numeric) quantity
    from jsonb_array_elements(coalesce(nullif(p_items, 'null'::jsonb), '[]'::jsonb)) item
    group by item ->> 'productId'
  ) quantities;
$$;
revoke all on function private.wholesale_order_quantities(jsonb) from public, anon, authenticated;

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
  v_wholesale boolean := false;
  v_fulfillment text;
  v_paid numeric := 0;
  v_previous_paid numeric := 0;
  v_history jsonb := '[]'::jsonb;
  v_old_history jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_added numeric := 0;
  v_entry_count integer := 0;
  v_cancelled_at timestamptz;
  v_saved_sale public.sales%rowtype;
  v_receipts jsonb;
  v_receipt_total numeric;
  v_remaining numeric;
  v_split_sum numeric;
  v_split record;
  v_refund record;
  v_historical_debit boolean := coalesce(p_payload -> 'historicalStockAlreadyDebited' = 'true'::jsonb, false);
  v_legacy_pending boolean := false;
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

  if not private.current_user_can_any(array['SALES','ATACADO']) then
    raise exception 'Sem acesso a vendas' using errcode = '42501';
  end if;
  if p_payload ? 'historicalStockAlreadyDebited'
    and jsonb_typeof(p_payload -> 'historicalStockAlreadyDebited') not in ('boolean', 'null') then
    raise exception 'Declaração de estoque histórico inválida.' using errcode = '22023';
  end if;
  if v_historical_debit and v_user.role <> 'ADMIN' then
    raise exception 'Somente administradores podem declarar uma baixa histórica de estoque.' using errcode = '42501';
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

  v_wholesale := coalesce(v_old_sale.source, p_payload ->> 'source', '') = 'ATACADO';
  v_legacy_pending := v_has_old_sale and v_old_sale.source = 'ATACADO'
    and (
      ((v_old_sale.fulfillment_status is null or v_old_sale.fulfillment_status = 'pending')
        and v_old_sale.status = 'Pending')
      or (v_old_sale.fulfillment_status = 'pending' and v_old_sale.status = 'Completed'
        and coalesce(v_old_sale.amount_paid, 0) > 0)
    );
  if v_historical_debit and (p_action <> 'update' or not v_legacy_pending) then
    raise exception 'A declaração de baixa histórica é exclusiva de pedidos de atacado antigos sem baixa reconhecida.' using errcode = '22023';
  end if;
  if v_legacy_pending and p_action = 'cancel' then
    raise exception 'Concilie a baixa histórica deste pedido antigo antes de cancelar e devolver o estoque.' using errcode = '22023';
  end if;
  if v_wholesale and v_user.role = 'WHOLESALE_REPRESENTATIVE' and (
    (v_has_old_sale and v_old_sale.seller_id is distinct from v_user.id)
    or (p_action in ('create', 'update') and (p_payload ->> 'sellerId') is distinct from v_user.id)
  ) then
    raise exception 'Representante sem acesso a este pedido.' using errcode = '42501';
  end if;
  if v_has_old_sale and p_action = 'update'
    and (p_payload ->> 'source') is distinct from v_old_sale.source then
    raise exception 'A origem da venda não pode ser alterada.' using errcode = '22023';
  end if;
  if v_wholesale and p_action in ('update', 'cancel') then
    if (p_payload ->> 'revision')::integer is distinct from v_old_sale.revision then
      raise exception 'Pedido atualizado por outro operador. Reabra o pedido antes de continuar.' using errcode = '40001';
    end if;
    if v_old_sale.status = 'Cancelled' then
      raise exception 'Pedido já cancelado.' using errcode = '22023';
    end if;
  end if;

  if v_has_old_sale then
    v_old_final := v_old_sale.status <> 'Cancelled' and case when v_wholesale then
      coalesce(v_old_sale.fulfillment_status in ('committed', 'dispatched'), v_old_sale.status in ('Completed', 'Finalizado pela Fábrica'))
      else v_old_sale.status in ('Completed', 'Finalizado pela Fábrica') end;

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

    if v_wholesale then
      if v_branch is distinct from 'Matriz (Fábrica)'
        or coalesce(v_matriz_deposit, '') not in ('Ibotirama', 'Barreiras') then
        raise exception 'Selecione o depósito de origem: Ibotirama ou Barreiras.' using errcode = '22023';
      end if;
      v_fulfillment := coalesce(p_payload ->> 'fulfillmentStatus', v_old_sale.fulfillment_status,
        case when v_old_final then 'dispatched' else 'pending' end);
      if v_fulfillment not in ('pending', 'committed', 'dispatched')
        or (v_old_final and v_old_sale.fulfillment_status is not null
          and v_fulfillment is distinct from v_old_sale.fulfillment_status)
        or (v_old_final and v_old_sale.fulfillment_status is null and v_fulfillment <> 'dispatched') then
        raise exception 'Situação de expedição inválida.' using errcode = '22023';
      end if;
      if v_old_final and v_matriz_deposit is distinct from v_old_sale.matriz_deposit then
        raise exception 'O depósito de origem não pode ser alterado após o comprometimento do estoque.' using errcode = '22023';
      end if;
      if v_historical_debit and (
        v_items is distinct from v_old_sale.items or v_total is distinct from v_old_sale.total
        or v_branch is distinct from v_old_sale.branch
        or (p_payload ->> 'date') is distinct from v_old_sale.date
        or (p_payload ->> 'customerName') is distinct from v_old_sale.customer_name
        or (case when p_payload ? 'customerId' then nullif(p_payload ->> 'customerId', '') else v_old_sale.customer_id end) is distinct from v_old_sale.customer_id
        or nullif(p_payload -> 'customerDetails', 'null'::jsonb) is distinct from nullif(v_old_sale.customer_details, 'null'::jsonb)
        or coalesce(nullif(p_payload -> 'fiscalContext', 'null'::jsonb), v_old_sale.fiscal_context) is distinct from v_old_sale.fiscal_context
        or coalesce((p_payload ->> 'deliveryFee')::numeric, 0) is distinct from coalesce(v_old_sale.delivery_fee, 0)
        or coalesce((p_payload ->> 'discount')::numeric, 0) is distinct from coalesce(v_old_sale.discount, 0)
        or (p_payload ->> 'sellerId') is distinct from v_old_sale.seller_id
        or (p_payload ->> 'paymentMethod') is distinct from v_old_sale.payment_method
        or nullif(p_payload -> 'paymentSplits', 'null'::jsonb) is distinct from nullif(v_old_sale.payment_splits, 'null'::jsonb)
        or (v_old_sale.matriz_deposit is not null and v_matriz_deposit is distinct from v_old_sale.matriz_deposit)
      ) then
        raise exception 'Preserve os itens, valores, cliente e origem comercial ao reconhecer uma baixa histórica.' using errcode = '22023';
      end if;
      v_history := coalesce(nullif(p_payload -> 'paymentHistory', 'null'::jsonb), '[]'::jsonb);
      v_old_history := coalesce(v_old_sale.payment_history, '[]'::jsonb);
      v_paid := coalesce((p_payload ->> 'amountPaid')::numeric, 0);
      v_previous_paid := coalesce(v_old_sale.amount_paid, 0);
      if coalesce((p_payload ->> 'deliveryFee')::numeric, 0) < 0
        or coalesce((p_payload ->> 'discount')::numeric, 0) < 0 then
        raise exception 'Frete e desconto não podem ser negativos.' using errcode = '22023';
      end if;
      -- Keep the historical convention for finalized orders without receipt details.
      if v_old_sale.fulfillment_status is null and v_old_sale.status in ('Completed', 'Finalizado pela Fábrica') then
        v_previous_paid := v_old_sale.total;
        if v_paid = coalesce(v_old_sale.amount_paid, 0) then v_paid := v_previous_paid; end if;
      end if;
      if p_action = 'update' and v_previous_paid > 0 and (
        (p_payload ->> 'paymentMethod') is distinct from v_old_sale.payment_method
        or nullif(p_payload -> 'paymentSplits', 'null'::jsonb) is distinct from nullif(v_old_sale.payment_splits, 'null'::jsonb)
      ) then
        raise exception 'A forma original não pode ser alterada após um recebimento. Informe a forma em cada nova parcela.' using errcode = '22023';
      end if;
      if jsonb_typeof(v_history) is distinct from 'array' or jsonb_typeof(v_old_history) is distinct from 'array'
        or v_total < 0 or v_total >= 'Infinity'::numeric
        or v_paid < 0 or v_paid > v_total or v_paid >= 'Infinity'::numeric
        or round(v_paid, 2) <> v_paid
        or jsonb_array_length(v_history) < jsonb_array_length(v_old_history) then
        raise exception 'Dados de recebimento inválidos.' using errcode = '22023';
      end if;
      if p_action = 'create' and (v_paid <> 0 or jsonb_array_length(v_history) <> 0) then
        raise exception 'Crie o pedido antes de registrar recebimentos.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(v_old_history) with ordinality old_entry(value, pos)
        where v_history -> (old_entry.pos::integer - 1) is distinct from old_entry.value) then
        raise exception 'Recebimentos anteriores não podem ser removidos ou alterados.' using errcode = '40001';
      end if;
      if (select count(distinct entry ->> 'id') from jsonb_array_elements(v_history) entry)
        <> jsonb_array_length(v_history) then
        raise exception 'Identificador de recebimento inválido ou repetido.' using errcode = '22023';
      end if;
      for v_entry in select value from jsonb_array_elements(v_history) with ordinality entries(value, pos)
        where pos > jsonb_array_length(v_old_history)
      loop
        if nullif(v_entry ->> 'id', '') is null
          or coalesce(v_entry ->> 'method', '') not in ('Pix', 'Credit', 'Debit', 'Cash')
          or coalesce(v_entry ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
          or to_char((v_entry ->> 'date')::date, 'YYYY-MM-DD') <> (v_entry ->> 'date')
          or coalesce((v_entry ->> 'amount')::numeric, 0) <= 0
          or (v_entry ->> 'amount')::numeric >= 'Infinity'::numeric
          or round((v_entry ->> 'amount')::numeric, 2) <> (v_entry ->> 'amount')::numeric then
          raise exception 'Parcela inválida: confira valor, data e forma de pagamento.' using errcode = '22023';
        end if;
        v_added := v_added + (v_entry ->> 'amount')::numeric;
        v_entry_count := v_entry_count + 1;
      end loop;
      if v_entry_count > 1 or v_paid <> v_previous_paid + v_added then
        raise exception 'Registre uma parcela por operação, sem alterar recebimentos anteriores.' using errcode = '22023';
      end if;
      if v_status is distinct from (case when v_paid = v_total then 'Completed' else 'Pending' end) then
        raise exception 'O status deve corresponder aos recebimentos registrados.' using errcode = '22023';
      end if;
      if p_action = 'create' then
        -- New orders consume availability immediately, even from older clients sending pending.
        v_fulfillment := 'committed';
      elsif v_legacy_pending then
        if v_historical_debit then
          if v_paid <= 0 then
            raise exception 'Registre um recebimento ou utilize um pagamento já registrado para reconhecer a baixa histórica.' using errcode = '22023';
          end if;
          v_fulfillment := 'dispatched';
        else
          if v_added > 0 or v_status is distinct from v_old_sale.status or v_fulfillment in ('committed', 'dispatched') then
            raise exception 'Confirme com um administrador se o estoque deste pedido antigo já foi descontado antes de receber.' using errcode = '22023';
          end if;
          v_fulfillment := v_old_sale.fulfillment_status;
        end if;
      elsif not v_old_final then
        raise exception 'Pedido sem comprometimento de estoque. Atualize o pedido antes de receber.' using errcode = '22023';
      end if;
      v_new_final := coalesce(v_fulfillment in ('committed', 'dispatched'), false);
      v_new_revenue := v_paid;
    else
      v_new_final := v_status in ('Completed', 'Finalizado pela Fábrica');
    end if;

    if v_new_final then
      if v_historical_debit and coalesce(v_old_sale.stock_effects, '{}'::jsonb) <> '{}'::jsonb then
        v_new_effects := v_old_sale.stock_effects;
      elsif v_wholesale and v_old_final
        and private.wholesale_order_quantities(v_items) = private.wholesale_order_quantities(v_old_sale.items)
        and v_branch is not distinct from v_old_sale.branch
        and v_matriz_deposit is not distinct from v_old_sale.matriz_deposit then
        -- Later receipts must not reinterpret a composition that changed after the first stock debit.
        v_new_effects := v_old_effects;
      else
        v_new_effects := public.resolve_sale_stock_effects(v_user.tenant_id, v_items);
      end if;
      if not v_wholesale then v_new_revenue := v_total; end if;
      if v_historical_debit and exists(select 1 from jsonb_each_text(v_new_effects) effect
        where effect.value::numeric <= 0 or effect.value::numeric >= 'Infinity'::numeric) then
        raise exception 'Efeitos históricos de estoque inválidos; concilie o pedido antes de continuar.' using errcode = '22023';
      end if;

      if v_branch = 'Matriz (Fábrica)'
         and coalesce(v_matriz_deposit, '') not in ('Ibotirama', 'Barreiras')
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
  if v_historical_debit then
    -- The administrator attests the physical debit already happened; persist its effects without repeating it.
    v_deltas := '{}'::jsonb;
  end if;

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
      stock_effects, customer_id, fiscal_context
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
      v_new_effects,
      nullif(p_payload ->> 'customerId', ''),
      coalesce(p_payload -> 'fiscalContext', '{}'::jsonb)
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
        payment_splits = case when nullif(p_payload -> 'paymentSplits', 'null'::jsonb) is not distinct from nullif(payment_splits, 'null'::jsonb)
          then payment_splits else nullif(p_payload -> 'paymentSplits', 'null'::jsonb) end,
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
        customer_details = case when nullif(p_payload -> 'customerDetails', 'null'::jsonb) is not distinct from nullif(customer_details, 'null'::jsonb)
          then customer_details else nullif(p_payload -> 'customerDetails', 'null'::jsonb) end,
        invoice_key = p_payload ->> 'invoiceKey',
        invoice_url = p_payload ->> 'invoiceUrl',
        stock_effects = v_new_effects,
        customer_id = case when p_payload ? 'customerId' then nullif(p_payload ->> 'customerId', '') else customer_id end,
        fiscal_context = coalesce(nullif(p_payload -> 'fiscalContext', 'null'::jsonb), fiscal_context)
    where id = p_sale_id
      and tenant_id = v_user.tenant_id;
  else
    update public.sales
    set status = 'Cancelled',
        stock_effects = '{}'::jsonb
    where id = p_sale_id
      and tenant_id = v_user.tenant_id;
  end if;

  if p_action = 'create' or (p_action = 'update' and v_items is distinct from v_old_sale.items) then
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

  if v_wholesale then
    v_cancelled_at := case when p_action = 'cancel' then now() end;
    update public.sales set
      fulfillment_status = case when p_action = 'cancel' then coalesce(v_old_sale.fulfillment_status,
        case when v_old_final then 'dispatched' else 'pending' end) else v_fulfillment end,
      revision = case when v_has_old_sale then v_old_sale.revision + 1 else 0 end,
      dispatched_at = case when v_old_final or v_historical_debit then v_old_sale.dispatched_at
        when v_fulfillment = 'dispatched' then now() else v_old_sale.dispatched_at end,
      cancelled_at = v_cancelled_at,
      amount_paid = case when p_action = 'cancel' then
        case when v_old_sale.fulfillment_status is null and v_old_sale.status in ('Completed', 'Finalizado pela Fábrica')
          then v_old_sale.total else v_old_sale.amount_paid end
        else v_paid end
    where id = p_sale_id and tenant_id = v_user.tenant_id;

    if v_legacy_pending and not v_historical_debit and p_action = 'update' then
      -- A metadata edit must not infer a historical debit or rebuild old financial entries.
      v_new_revenue := 0;
      v_old_revenue := 0;
    else
    select * into v_saved_sale from public.sales where id = p_sale_id and tenant_id = v_user.tenant_id;
    v_receipt_total := coalesce(v_saved_sale.amount_paid, 0);
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', 'payment-' || (entry ->> 'id'), 'date', entry ->> 'date',
      'amount', (entry ->> 'amount')::numeric, 'method', entry ->> 'method')), '[]'::jsonb),
      v_receipt_total - coalesce(sum((entry ->> 'amount')::numeric), 0)
      into v_receipts, v_remaining
      from jsonb_array_elements(coalesce(v_saved_sale.payment_history, '[]'::jsonb)) entry;
    if v_remaining < 0 then
      raise exception 'Histórico de recebimentos inconsistente; concilie o pedido antes de continuar.' using errcode = '22023';
    end if;
    if v_remaining > 0 then
      v_split_sum := null;
      if jsonb_array_length(v_receipts) = 0 and v_saved_sale.payment_method = 'Split'
        and jsonb_typeof(v_saved_sale.payment_splits) = 'array' then
        select sum((split ->> 'amount')::numeric) into v_split_sum
          from jsonb_array_elements(v_saved_sale.payment_splits) split;
        if exists(select 1 from jsonb_array_elements(v_saved_sale.payment_splits) split
          where coalesce(split ->> 'method', '') not in ('Pix', 'Cash', 'Credit', 'Debit')
            or coalesce((split ->> 'amount')::numeric, 0) <= 0) then
          v_split_sum := null;
        end if;
      end if;
      if v_split_sum = v_remaining then
        for v_split in select value, ordinality from jsonb_array_elements(v_saved_sale.payment_splits) with ordinality
        loop
          v_receipts := v_receipts || jsonb_build_array(jsonb_build_object(
            'id', 'legacy-split-' || v_split.ordinality, 'date', v_saved_sale.date,
            'amount', (v_split.value ->> 'amount')::numeric, 'method', v_split.value ->> 'method'));
        end loop;
      else
        v_receipts := v_receipts || jsonb_build_array(jsonb_build_object(
          'id', 'legacy-balance', 'date', v_saved_sale.date, 'amount', v_remaining,
          'method', case when v_saved_sale.payment_method in ('Pix', 'Cash', 'Credit', 'Debit') then v_saved_sale.payment_method end));
      end if;
    end if;
    for v_entry in select value from jsonb_array_elements(v_receipts)
    loop
      insert into public.financials (
        id, date, description, amount, type, category, branch,
        payment_method, tenant_id, sale_id, operation_id, event_type
      ) values (
        p_operation_id::text || ':receipt:' || (v_entry ->> 'id'),
        v_entry ->> 'date', 'Recebimento do pedido #' || p_sale_id,
        (v_entry ->> 'amount')::numeric, 'Income', 'Vendas', v_branch,
        v_entry ->> 'method', v_user.tenant_id, p_sale_id, p_operation_id,
        'sale_receipt:' || (v_entry ->> 'id')
      ) on conflict (tenant_id, sale_id, event_type) where event_type like 'sale_receipt:%' do nothing;
    end loop;

    -- Reclassify only this touched order; retain historical entries and known receipt methods.
    select coalesce(sum(amount), 0)
      into v_old_revenue from public.financials
      where tenant_id = v_user.tenant_id and sale_id = p_sale_id and category = 'Vendas' and type = 'Income';
    if v_receipt_total <> v_old_revenue then
      insert into public.financials (
        id, date, description, amount, type, category, branch,
        payment_method, tenant_id, sale_id, operation_id, event_type
      ) values (
        p_operation_id::text || ':receipt-reconciliation', v_saved_sale.date,
        'Conciliação de recebimentos legados do pedido #' || p_sale_id,
        v_receipt_total - v_old_revenue, 'Income', 'Vendas', v_branch,
        v_saved_sale.payment_method, v_user.tenant_id, p_sale_id, p_operation_id, 'sale_receipt_reconciliation'
      );
    end if;
    if p_action = 'cancel' then
      for v_refund in select entry ->> 'method' as method, sum((entry ->> 'amount')::numeric) as amount
        from jsonb_array_elements(v_receipts) entry group by entry ->> 'method'
      loop
        insert into public.financials (
          id, date, description, amount, type, category, branch,
          payment_method, tenant_id, sale_id, operation_id, event_type
        ) values (
          p_operation_id::text || ':refund:' || coalesce(v_refund.method, 'unknown'),
          to_char(v_cancelled_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
          'Estorno do pedido #' || p_sale_id, -v_refund.amount, 'Income', 'Vendas', v_branch,
          v_refund.method, v_user.tenant_id, p_sale_id, p_operation_id,
          'sale_reversal:' || coalesce(v_refund.method, 'unknown')
        );
      end loop;
    end if;
    select coalesce(sum(amount), 0) into v_old_revenue from public.financials
      where tenant_id = v_user.tenant_id and sale_id = p_sale_id and category = 'Vendas' and type = 'Income';
    end if;
  end if;
  v_financial_delta := v_new_revenue - v_old_revenue;

  if v_financial_delta <> 0 then
    insert into public.financials (
      id, date, description, amount, type, category, branch,
      payment_method, tenant_id, sale_id, operation_id, event_type
    ) values (
      p_operation_id::text || ':financial',
      case when v_wholesale and p_action = 'cancel'
        then to_char(v_cancelled_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
        else coalesce(p_payload ->> 'date', v_old_sale.date) end,
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
    'historicalStockAlreadyDebited', v_historical_debit,
    'historicalStockDeclaration', case when v_historical_debit then jsonb_build_object(
      'declaredBy', v_user.id, 'declaredAt', now(), 'deposit', v_matriz_deposit,
      'stockEffects', v_new_effects, 'stockAction', 'already_debited'
    ) end,
    'revision', case when v_wholesale and v_has_old_sale then v_old_sale.revision + 1 else 0 end,
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
commit;
