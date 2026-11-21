-- Match date expressions to the installed column types without changing existing data.
-- Supports timestamptz columns and older installations that still use text.
begin;

create or replace function public.register_production_batch(
  p_operation_id uuid, p_record jsonb, p_ingredients jsonb
)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_user public.app_users%rowtype;
  v_product public.products%rowtype;
  v_recipe jsonb;
  v_product_id text := p_record ->> 'productId';
  v_produced numeric := (p_record ->> 'quantity')::numeric;
  v_shift text := p_record ->> 'shift';
  v_hash text := md5(jsonb_build_array(p_record, p_ingredients)::text);
  v_id text := p_operation_id::text;
  v_date public.production_logs.date%type := now();
  v_ingredient record;
begin
  select * into v_user from public.app_users where id::text = auth.uid()::text;
  if not found or v_user.tenant_id is null or v_user.is_active is not true
    or v_user.must_change_password is true
    or not (coalesce(v_user.role in ('ADMIN', 'FACTORY'), false)
      or coalesce('PRODUCTION' = any(v_user.allowed_modules), false)) then
    raise exception using errcode = '42501', message = 'Usuário sem acesso ao registro de produção.';
  end if;
  if p_operation_id is null or nullif(btrim(v_product_id), '') is null
    or jsonb_typeof(p_record) is distinct from 'object'
    or v_produced is null or v_produced <= 0
    or v_produced in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or v_shift is null or v_shift not in ('Manhã', 'Tarde', 'Noite', 'Madrugada')
    or jsonb_typeof(p_ingredients) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Dados do lote inválidos.';
  end if;
  if exists (select from jsonb_to_recordset(p_ingredients) as item("ingredientId" text, quantity numeric)
    where nullif(btrim(item."ingredientId"), '') is null or item."ingredientId" = v_product_id
      or item.quantity is null or item.quantity <= 0
      or item.quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)) then
    raise exception using errcode = '22023', message = 'Informe um consumo positivo e finito para cada insumo.';
  end if;

  -- The operation log reserves the identity before any stock effect, including retries.
  insert into public.production_logs(id, date, product_id, product_name, quantity,
    shift, responsible, notes, tenant_id, operation_hash)
  select v_id, v_date, product.id, product.name, v_produced,
    v_shift, v_user.name, p_record ->> 'notes', v_user.tenant_id, v_hash
  from public.products product
  where product.id = v_product_id and product.tenant_id = v_user.tenant_id and product.category like '%Gelo%'
  on conflict (id) do nothing;
  if not found then
    if exists (select from public.production_logs where id = v_id
      and tenant_id = v_user.tenant_id and operation_hash = v_hash) then return; end if;
    raise exception using errcode = '22023', message = 'Produto indisponível ou identificador de produção já utilizado.';
  end if;

  select coalesce(recipe, '[]'::jsonb) into v_recipe from public.products
    where id = v_product_id and tenant_id = v_user.tenant_id;
  if jsonb_typeof(v_recipe) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Receita inválida. Corrija antes de produzir.';
  end if;
  perform id from public.products where tenant_id = v_user.tenant_id and
    (id = v_product_id or id in (select item ->> 'ingredientId' from jsonb_array_elements(v_recipe) as recipe(item))
      or id in (select item ->> 'ingredientId' from jsonb_array_elements(p_ingredients) as consumed(item)))
    order by id for update;
  select * into v_product from public.products where id = v_product_id and tenant_id = v_user.tenant_id;
  if not found or v_product.category not like '%Gelo%' or coalesce(v_product.recipe, '[]'::jsonb) is distinct from v_recipe then
    raise exception using errcode = '40001', message = 'A receita mudou durante o lançamento. Atualize e revise a produção.';
  end if;
  if coalesce(v_product.recipe_batch_size, 1) <= 0
    or coalesce(v_product.recipe_batch_size, 1) in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or exists (select from jsonb_to_recordset(v_recipe) as item("ingredientId" text, quantity numeric)
      where nullif(btrim(item."ingredientId"), '') is null or item."ingredientId" = v_product_id
        or item.quantity is null or item.quantity <= 0
        or item.quantity in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)) then
    raise exception using errcode = '22023', message = 'Receita ou tamanho do lote inválidos.';
  end if;
  -- Actual consumption may differ from the recipe, but cannot omit or invent ingredients.
  if exists (
    select 1 from (select distinct item ->> 'ingredientId' as id from jsonb_array_elements(v_recipe) as recipe(item)) required
    full join (select distinct item ->> 'ingredientId' as id from jsonb_array_elements(p_ingredients) as consumed(item)) actual using (id)
    where required.id is null or actual.id is null
  ) then
    raise exception using errcode = '22023', message = 'Informe o consumo de todos e somente os insumos da receita atual.';
  end if;

  perform public.inventory_stock_delta(v_user, p_operation_id, v_product_id, 'Ibotirama',
    v_produced, 'ENTRY', 'Produção - Turno ' || v_shift, 'production');
  for v_ingredient in
    select item."ingredientId" as id, sum(item.quantity) as quantity
    from jsonb_to_recordset(p_ingredients) as item("ingredientId" text, quantity numeric)
    group by item."ingredientId" order by item."ingredientId"
  loop
    perform public.inventory_stock_delta(v_user, p_operation_id, v_ingredient.id, 'Ibotirama',
      -v_ingredient.quantity, 'TRANSFER_OUT',
      format('Insumo para Produção de %s (Lote: %s)', v_product.name, v_produced), 'consumption');
  end loop;
end $$;
revoke all on function public.register_production_batch(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.register_production_batch(uuid, jsonb, jsonb) to authenticated;

create or replace function public.inventory_stock_delta(
  p_user public.app_users, p_operation_id uuid, p_product_id text, p_deposit text,
  p_delta numeric, p_type text, p_reason text, p_event text, p_expected numeric default null
)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_product public.products%rowtype; v_before numeric; v_after numeric;
  v_date public.stock_movements.date%type := now();
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
    v_date,
    p_product_id, v_product.name, case when p_type = 'ADJUSTMENT' then p_delta else abs(p_delta) end,
    p_type, p_reason, case when p_deposit = 'Filial' then 'Filial (Adega)' else 'Matriz (Fábrica)' end,
    case when p_deposit <> 'Filial' then p_deposit end,
    p_user.tenant_id, p_operation_id, p_event, p_user.name, p_user.id::text, v_before, v_after
  );
end $$;
revoke all on function public.inventory_stock_delta(public.app_users, uuid, text, text, numeric, text, text, text, numeric) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
