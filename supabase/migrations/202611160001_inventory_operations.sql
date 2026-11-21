begin;

-- Insumos podem ser medidos em kg/litros; não arredondar quantidades na filial.
alter table public.products alter column stock_filial type numeric using stock_filial::numeric;

-- Keep inventory commands separate from catalogue updates. Every command and its
-- stock/ledger/financial effects commit together, with one identity per retry.
create table public.inventory_operations (
  tenant_id uuid not null references public.tenants(id),
  operation_id uuid not null,
  action text not null,
  payload_hash text not null,
  actor_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, operation_id)
);
alter table public.inventory_operations enable row level security;
revoke all on public.inventory_operations from public, anon, authenticated;

create table public.inventory_receipts (
  tenant_id uuid not null references public.tenants(id),
  invoice_key text not null check (invoice_key ~ '^[0-9]{44}$'),
  operation_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, invoice_key),
  foreign key (tenant_id, operation_id) references public.inventory_operations(tenant_id, operation_id)
);
alter table public.inventory_receipts enable row level security;
revoke all on public.inventory_receipts from public, anon, authenticated;

alter table public.stock_movements
  add column if not exists responsible text,
  add column if not exists actor_id text,
  add column if not exists stock_before numeric,
  add column if not exists stock_after numeric;

create function public.inventory_actor()
returns public.app_users language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_user public.app_users%rowtype;
begin
  select * into v_user from public.app_users where id::text = auth.uid()::text;
  if not found or v_user.tenant_id is null or v_user.is_active is not true
    or v_user.must_change_password is true
    or not (coalesce(v_user.role in ('ADMIN', 'OPERATOR', 'FACTORY'), false)
      or coalesce('INVENTORY' = any(v_user.allowed_modules), false)
      or coalesce('PRODUCTION' = any(v_user.allowed_modules), false)) then
    raise exception using errcode = '42501', message = 'Usuário sem acesso às operações de estoque.';
  end if;
  return v_user;
end $$;
revoke all on function public.inventory_actor() from public, anon, authenticated;

create function public.claim_inventory_operation(p_user public.app_users, p_id uuid, p_action text, p_payload jsonb)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_hash text := md5(p_payload::text);
begin
  if p_id is null then
    raise exception using errcode = '22023', message = 'Identificador da operação obrigatório.';
  end if;
  insert into public.inventory_operations(tenant_id, operation_id, action, payload_hash, actor_id)
  values (p_user.tenant_id, p_id, p_action, v_hash, p_user.id::text)
  on conflict (tenant_id, operation_id) do nothing;
  if found then return true; end if;
  if not exists (select from public.inventory_operations where tenant_id = p_user.tenant_id
    and operation_id = p_id and action = p_action and payload_hash = v_hash) then
    raise exception using errcode = '23505', message = 'Identificador já utilizado com dados diferentes.';
  end if;
  return false;
end $$;
revoke all on function public.claim_inventory_operation(public.app_users, uuid, text, jsonb) from public, anon, authenticated;

create function public.inventory_stock_delta(
  p_user public.app_users, p_operation_id uuid, p_product_id text, p_deposit text,
  p_delta numeric, p_type text, p_reason text, p_event text, p_expected numeric default null
)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_product public.products%rowtype; v_before numeric; v_after numeric;
begin
  if p_deposit is null or p_deposit not in ('Ibotirama', 'Barreiras', 'Filial')
    or p_delta is null or p_delta in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception using errcode = '22023', message = 'Depósito ou quantidade inválidos.';
  end if;
  select * into v_product from public.products
  where id = p_product_id and tenant_id = p_user.tenant_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Produto indisponível para esta fábrica.';
  end if;
  if v_product.is_stock_controlled is false or coalesce(jsonb_array_length(v_product.combo_items), 0) > 0 then
    raise exception using errcode = '22023', message = 'Produto sem saldo próprio para movimentação.';
  end if;
  v_before := case p_deposit when 'Ibotirama' then coalesce(v_product.stock_matriz_ibotirama, 0)
    when 'Barreiras' then coalesce(v_product.stock_matriz_barreiras, 0)
    else coalesce(v_product.stock_filial, 0) end;
  if v_before in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or v_before < 0 then
    raise exception using errcode = '22023', message = 'Saldo inválido. Reconcilie o cadastro antes de movimentar.';
  end if;
  if p_expected is not null and v_before is distinct from p_expected then
    raise exception using errcode = '40001', message = 'O saldo mudou durante a conferência. Atualize e revise o ajuste.';
  end if;
  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception using errcode = '23514', message = 'Saldo insuficiente no depósito selecionado.';
  end if;
  if p_delta = 0 then return; end if;
  update public.products set
    stock_matriz_ibotirama = case when p_deposit = 'Ibotirama' then v_after else stock_matriz_ibotirama end,
    stock_matriz_barreiras = case when p_deposit = 'Barreiras' then v_after else stock_matriz_barreiras end,
    stock_filial = case when p_deposit = 'Filial' then v_after else stock_filial end
  where id = p_product_id and tenant_id = p_user.tenant_id;
  insert into public.stock_movements (
    id, date, product_id, product_name, quantity, type, reason, branch, matriz_deposit,
    tenant_id, operation_id, event_type, responsible, actor_id, stock_before, stock_after
  ) values (
    p_operation_id::text || ':' || p_event || ':' || p_product_id,
    to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    p_product_id, v_product.name, case when p_type = 'ADJUSTMENT' then p_delta else abs(p_delta) end,
    p_type, p_reason, case when p_deposit = 'Filial' then 'Filial (Adega)' else 'Matriz (Fábrica)' end,
    case when p_deposit <> 'Filial' then p_deposit end,
    p_user.tenant_id, p_operation_id, p_event, p_user.name, p_user.id::text, v_before, v_after
  );
end $$;
revoke all on function public.inventory_stock_delta(public.app_users, uuid, text, text, numeric, text, text, text, numeric) from public, anon, authenticated;

create function public.insert_inventory_product(p_user public.app_users, p_product jsonb)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_field text; v_number numeric;
begin
  if jsonb_typeof(p_product) is distinct from 'object' or nullif(btrim(p_product ->> 'id'), '') is null
    or nullif(btrim(p_product ->> 'name'), '') is null or nullif(btrim(p_product ->> 'unit'), '') is null then
    raise exception using errcode = '22023', message = 'Nome, unidade e identificador do produto são obrigatórios.';
  end if;
  foreach v_field in array array['priceMatriz','priceFilial','cost','minStock','packSize','pricePack','recipeBatchSize','operationalCost'] loop
    v_number := (p_product ->> v_field)::numeric;
    if v_number is not null and (v_number < 0 or v_number in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)) then
      raise exception using errcode = '22023', message = 'Valores do produto devem ser finitos e não negativos.';
    end if;
  end loop;
  insert into public.products (
    id, name, category, price_matriz, price_filial, cost, stock_matriz_ibotirama, stock_matriz_barreiras,
    stock_filial, unit, min_stock, pack_size, price_pack, is_stock_controlled, combo_items, image,
    recipe, recipe_batch_size, operational_cost, options, barcode, expiration_date, tenant_id
  ) values (
    p_product ->> 'id', btrim(p_product ->> 'name'), coalesce(p_product ->> 'category', 'Outros'),
    coalesce((p_product ->> 'priceMatriz')::numeric, 0), coalesce((p_product ->> 'priceFilial')::numeric, 0),
    coalesce((p_product ->> 'cost')::numeric, 0), 0, 0, 0, p_product ->> 'unit',
    coalesce((p_product ->> 'minStock')::numeric, 0), (p_product ->> 'packSize')::numeric,
    (p_product ->> 'pricePack')::numeric, coalesce((p_product ->> 'isStockControlled')::boolean, true),
    nullif(p_product -> 'comboItems', 'null'::jsonb), p_product ->> 'image', nullif(p_product -> 'recipe', 'null'::jsonb),
    (p_product ->> 'recipeBatchSize')::numeric, (p_product ->> 'operationalCost')::numeric,
    nullif(p_product -> 'options', 'null'::jsonb), p_product ->> 'barcode', nullif(p_product ->> 'expirationDate', '')::date, p_user.tenant_id
  );
end $$;
revoke all on function public.insert_inventory_product(public.app_users, jsonb) from public, anon, authenticated;

create function public.create_inventory_product(p_operation_id uuid, p_product jsonb, p_tenant_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_user public.app_users := public.inventory_actor(); v_deposit text; v_qty numeric; v_field text;
begin
  if p_tenant_id is distinct from v_user.tenant_id then
    raise exception using errcode = '42501', message = 'Fábrica inválida.';
  end if;
  if not public.claim_inventory_operation(v_user, p_operation_id, 'create', p_product) then return; end if;
  perform public.insert_inventory_product(v_user, p_product);
  foreach v_deposit in array array['Ibotirama','Barreiras','Filial'] loop
    v_field := case v_deposit when 'Ibotirama' then 'stockMatrizIbotirama'
      when 'Barreiras' then 'stockMatrizBarreiras' else 'stockFilial' end;
    v_qty := coalesce((p_product ->> v_field)::numeric, 0);
    if v_qty < 0 or v_qty in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
      raise exception using errcode = '22023', message = 'Saldo inicial inválido.';
    end if;
    if v_qty > 0 then
      perform public.inventory_stock_delta(v_user, p_operation_id, p_product ->> 'id', v_deposit,
        v_qty, 'ENTRY', 'Cadastro inicial', 'initial_' || v_deposit);
    end if;
  end loop;
end $$;
revoke all on function public.create_inventory_product(uuid, jsonb, uuid) from public, anon;
grant execute on function public.create_inventory_product(uuid, jsonb, uuid) to authenticated;

create function public.mutate_inventory_stock(p_operation jsonb)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_user public.app_users := public.inventory_actor();
  v_id uuid := (p_operation ->> 'operationId')::uuid;
  v_action text := p_operation ->> 'action';
  v_product text := p_operation ->> 'productId';
  v_quantity numeric := (p_operation ->> 'quantity')::numeric;
  v_deposit text := p_operation ->> 'deposit';
  v_from text := p_operation ->> 'fromDeposit';
  v_to text := p_operation ->> 'toDeposit';
  v_expected numeric := (p_operation ->> 'expectedStock')::numeric;
  v_reason text := btrim(p_operation ->> 'reason');
  v_cost numeric; v_name text;
begin
  if v_action is null or v_action not in ('transfer','loss','adjust') or nullif(v_product, '') is null
    or nullif(v_reason, '') is null or v_quantity is null or v_quantity < 0
    or v_quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or (v_action <> 'adjust' and v_quantity = 0) then
    raise exception using errcode = '22023', message = 'Informe produto, motivo e quantidade válida.';
  end if;
  if v_action = 'adjust' and (v_expected is null or v_expected < 0
    or v_expected in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)) then
    raise exception using errcode = '22023', message = 'Ajuste exige o saldo conferido anteriormente.';
  end if;
  if not public.claim_inventory_operation(v_user, v_id, v_action, p_operation) then return; end if;
  if v_action = 'transfer' then
    if v_from is null or v_to is null or v_from = v_to then
      raise exception using errcode = '22023', message = 'Escolha depósitos de origem e destino diferentes.';
    end if;
    perform public.inventory_stock_delta(v_user, v_id, v_product, v_from, -v_quantity,
      'TRANSFER_OUT', v_reason, 'transfer_out');
    perform public.inventory_stock_delta(v_user, v_id, v_product, v_to, v_quantity,
      'TRANSFER_IN', v_reason, 'transfer_in');
  elsif v_action = 'adjust' then
    perform public.inventory_stock_delta(v_user, v_id, v_product, v_deposit,
      v_quantity - v_expected, 'ADJUSTMENT', v_reason, 'adjust', v_expected);
  else
    perform public.inventory_stock_delta(v_user, v_id, v_product, v_deposit, -v_quantity,
      'LOSS', v_reason, 'loss');
    select cost, name into v_cost, v_name from public.products where id = v_product and tenant_id = v_user.tenant_id;
    if v_cost is null or v_cost < 0 or v_cost in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
      raise exception using errcode = '22023', message = 'Custo do produto inválido para registrar a perda.';
    end if;
    if v_cost > 0 then
      insert into public.financials (id, date, description, amount, type, category, branch,
        tenant_id, operation_id, event_type)
      values (v_id::text || ':loss-financial', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
        'Perda de Estoque: ' || v_name || ' (' || v_reason || ')', v_cost * v_quantity,
        'Expense', 'Perdas e Quebras', case when v_deposit = 'Filial' then 'Filial (Adega)' else 'Matriz (Fábrica)' end,
        v_user.tenant_id, v_id, 'inventory_loss');
    end if;
  end if;
end $$;
revoke all on function public.mutate_inventory_stock(jsonb) from public, anon;
grant execute on function public.mutate_inventory_stock(jsonb) to authenticated;

create function public.receive_inventory_xml(p_operation_id uuid, p_invoice_key text, p_deposit text, p_items jsonb)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_user public.app_users := public.inventory_actor(); v_item jsonb; v_qty numeric;
  v_payload jsonb := jsonb_build_object('invoiceKey', p_invoice_key, 'deposit', p_deposit, 'items', p_items);
begin
  if p_invoice_key is null or p_invoice_key !~ '^[0-9]{44}$' or p_deposit is null
    or p_deposit not in ('Ibotirama','Barreiras','Filial') or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'Nota, depósito e itens válidos são obrigatórios.';
  end if;
  if exists (select from jsonb_array_elements(p_items) item
    where nullif(item ->> 'productId', '') is null or (item ->> 'quantity')::numeric is null
      or (item ->> 'quantity')::numeric <= 0
      or (item ->> 'quantity')::numeric in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))
    or exists (select from jsonb_array_elements(p_items) item group by item ->> 'productId' having count(*) > 1) then
    raise exception using errcode = '22023', message = 'Itens inválidos ou repetidos. Agrupe as quantidades por produto.';
  end if;
  if not public.claim_inventory_operation(v_user, p_operation_id, 'receipt', v_payload) then return; end if;
  insert into public.inventory_receipts(tenant_id, invoice_key, operation_id, payload_hash)
  values (v_user.tenant_id, p_invoice_key, p_operation_id, md5(v_payload::text))
  on conflict (tenant_id, invoice_key) do nothing;
  if not found then
    raise exception using errcode = '23505', message = 'Esta nota já foi recebida. Confira o histórico antes de lançar novamente.';
  end if;
  -- Stable order avoids deadlocks when receipts contain the same products.
  for v_item in select item from jsonb_array_elements(p_items) item order by item ->> 'productId' loop
    if v_item -> 'product' is not null and v_item -> 'product' <> 'null'::jsonb then
      if v_item -> 'product' ->> 'id' is distinct from v_item ->> 'productId' then
        raise exception using errcode = '22023', message = 'Cadastro novo não corresponde ao item da nota.';
      end if;
      if coalesce((v_item -> 'product' ->> 'stockMatrizIbotirama')::numeric,0) <> 0
        or coalesce((v_item -> 'product' ->> 'stockMatrizBarreiras')::numeric,0) <> 0
        or coalesce((v_item -> 'product' ->> 'stockFilial')::numeric,0) <> 0 then
        raise exception using errcode = '22023', message = 'Produto novo deve iniciar zerado no recebimento.';
      end if;
      perform public.insert_inventory_product(v_user, v_item -> 'product');
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    perform public.inventory_stock_delta(v_user, p_operation_id, v_item ->> 'productId', p_deposit,
      v_qty, 'ENTRY', 'Recebimento XML ' || p_invoice_key || coalesce(' - Código fornecedor: ' || (v_item ->> 'supplierCode'), ''),
      'receipt');
  end loop;
end $$;
revoke all on function public.receive_inventory_xml(uuid, text, text, jsonb) from public, anon;
grant execute on function public.receive_inventory_xml(uuid, text, text, jsonb) to authenticated;

-- PostgREST catalogue writes cannot replace balances. Validated SECURITY DEFINER
-- commands above (and the sale/production commands) execute as the function owner.
create function public.protect_inventory_balances()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.stock_matriz_ibotirama is distinct from old.stock_matriz_ibotirama
    or new.stock_matriz_barreiras is distinct from old.stock_matriz_barreiras
    or new.stock_filial is distinct from old.stock_filial
  ) then
    raise exception using errcode = '42501', message = 'Use uma operação de estoque para alterar o saldo.';
  end if;
  return new;
end $$;
revoke all on function public.protect_inventory_balances() from public, anon, authenticated;
create trigger protect_inventory_balances before update on public.products
for each row execute function public.protect_inventory_balances();

commit;
