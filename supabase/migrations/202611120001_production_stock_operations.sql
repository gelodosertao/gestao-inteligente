begin;

alter table public.production_logs
  add column operation_hash text;

create function public.register_production_batch(
  p_operation_id uuid,
  p_record jsonb,
  p_ingredients jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user public.app_users%rowtype;
  v_product public.products%rowtype;
  v_product_id text := p_record ->> 'productId';
  v_produced numeric := (p_record ->> 'quantity')::numeric;
  v_shift text := p_record ->> 'shift';
  v_hash text := md5(jsonb_build_array(p_record, p_ingredients)::text);
  v_id text := p_operation_id::text;
  v_date text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_ingredient record;
  v_ingredient_name text;
begin
  select * into v_user
  from public.app_users
  where id::text = auth.uid()::text;

  if not found or v_user.tenant_id is null or v_user.is_active is not true
    or v_user.must_change_password is true
    or not (coalesce(v_user.role in ('ADMIN', 'FACTORY'), false)
      or coalesce('PRODUCTION' = any(v_user.allowed_modules), false)) then
    raise exception using errcode = '42501', message = 'Usuário sem acesso ao registro de produção.';
  end if;

  if p_operation_id is null or v_product_id is null
    or v_produced is null or v_produced <= 0 or v_produced >= 'Infinity'::numeric
    or v_shift is null or v_shift not in ('Manhã', 'Tarde', 'Noite', 'Madrugada')
    or jsonb_typeof(p_ingredients) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Dados do lote inválidos.';
  end if;

  if exists (
    select from jsonb_to_recordset(p_ingredients) as item("ingredientId" text, quantity numeric)
    where item."ingredientId" is null or item."ingredientId" = v_product_id
      or item.quantity is null or item.quantity < 0 or item.quantity >= 'Infinity'::numeric
  ) then
    raise exception using errcode = '22023', message = 'Dados dos insumos inválidos.';
  end if;

  select * into v_product
  from public.products
  where id = v_product_id and tenant_id = v_user.tenant_id and category like '%Gelo%';

  if not found then
    raise exception using errcode = '22023', message = 'Produto fabricado indisponível.';
  end if;

  insert into public.production_logs (
    id, date, product_id, product_name, quantity,
    shift, responsible, notes, tenant_id, operation_hash
  ) values (
    v_id, v_date, v_product.id, v_product.name, v_produced,
    v_shift, v_user.name, p_record ->> 'notes', v_user.tenant_id, v_hash
  )
  on conflict (id) do nothing;

  if not found then
    if exists (
      select from public.production_logs
      where id = v_id and tenant_id = v_user.tenant_id and operation_hash = v_hash
    ) then
      return;
    end if;
    raise exception using errcode = '23505', message = 'Identificador de produção já utilizado.';
  end if;

  -- Lock the finished product and its ingredients in the same order for every batch.
  perform id from public.products
  where tenant_id = v_user.tenant_id and (id = v_product_id or id in (
    select item ->> 'ingredientId' from jsonb_array_elements(p_ingredients) as ingredients(item)
  ))
  order by id
  for update;

  update public.products
  set stock_matriz_ibotirama = coalesce(stock_matriz_ibotirama, 0) + v_produced
  where id = v_product_id and tenant_id = v_user.tenant_id;

  if not found then
    raise exception using errcode = '22023', message = 'Não foi possível atualizar o produto fabricado.';
  end if;

  insert into public.stock_movements (
    id, date, product_id, product_name, quantity, type, reason, branch, matriz_deposit, tenant_id
  ) values (
    v_id || '-mov-in', v_date, v_product.id, v_product.name, v_produced, 'TRANSFER_IN',
    'Produção - Turno ' || v_shift, 'Matriz (Fábrica)', 'Ibotirama', v_user.tenant_id
  );

  for v_ingredient in
    select item."ingredientId" as id, sum(item.quantity) as quantity
    from jsonb_to_recordset(p_ingredients) as item("ingredientId" text, quantity numeric)
    group by item."ingredientId"
    having sum(item.quantity) > 0
    order by item."ingredientId"
  loop
    update public.products
    set stock_matriz_ibotirama = coalesce(stock_matriz_ibotirama, 0) - v_ingredient.quantity
    where id = v_ingredient.id and tenant_id = v_user.tenant_id
    returning name into v_ingredient_name;

    if not found then
      raise exception using errcode = '22023', message = 'Um dos insumos do lote está indisponível.';
    end if;

    insert into public.stock_movements (
      id, date, product_id, product_name, quantity, type, reason, branch, matriz_deposit, tenant_id
    ) values (
      v_id || '-mov-out-' || v_ingredient.id, v_date, v_ingredient.id, v_ingredient_name,
      v_ingredient.quantity, 'TRANSFER_OUT',
      format('Insumo para Produção de %s (Lote: %s)', v_product.name, v_produced),
      'Matriz (Fábrica)', 'Ibotirama', v_user.tenant_id
    );
  end loop;
end;
$$;

revoke all on function public.register_production_batch(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.register_production_batch(uuid, jsonb, jsonb) to authenticated;

create function public.register_production_loss(
  p_operation_id uuid,
  p_product_id text,
  p_quantity numeric,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user public.app_users%rowtype;
  v_product_name text;
  v_id text := p_operation_id::text || '-production-loss';
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Perda de estoque');
  v_date text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into v_user
  from public.app_users
  where id::text = auth.uid()::text;

  if not found or v_user.tenant_id is null or v_user.is_active is not true
    or v_user.must_change_password is true
    or not (coalesce(v_user.role in ('ADMIN', 'FACTORY'), false)
      or coalesce('PRODUCTION' = any(v_user.allowed_modules), false)) then
    raise exception using errcode = '42501', message = 'Usuário sem acesso ao registro de perdas na produção.';
  end if;

  if p_operation_id is null or p_product_id is null
    or p_quantity is null or p_quantity <= 0 or p_quantity >= 'Infinity'::numeric then
    raise exception using errcode = '22023', message = 'Informe um produto e uma quantidade de perda maior que zero.';
  end if;

  select name into v_product_name
  from public.products
  where id = p_product_id and tenant_id = v_user.tenant_id and category like '%Gelo%';

  if not found then
    raise exception using errcode = '22023', message = 'Produto fabricado indisponível.';
  end if;

  insert into public.stock_movements (
    id, date, product_id, product_name, quantity, type, reason, branch, matriz_deposit, tenant_id
  ) values (
    v_id, v_date, p_product_id, v_product_name, p_quantity, 'LOSS', v_reason,
    'Matriz (Fábrica)', 'Ibotirama', v_user.tenant_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (
      select from public.stock_movements
      where id = v_id and tenant_id = v_user.tenant_id and product_id = p_product_id
        and type = 'LOSS' and quantity = p_quantity and reason = v_reason
        and branch = 'Matriz (Fábrica)' and matriz_deposit = 'Ibotirama'
    ) then
      return;
    end if;
    raise exception using errcode = '23505', message = 'Identificador de perda já utilizado.';
  end if;

  update public.products
  set stock_matriz_ibotirama = stock_matriz_ibotirama - p_quantity
  where id = p_product_id and tenant_id = v_user.tenant_id and category like '%Gelo%'
    and stock_matriz_ibotirama >= p_quantity
    and stock_matriz_ibotirama < 'Infinity'::numeric;

  if not found then
    raise exception using errcode = '22023', message = 'Saldo insuficiente na Matriz (Ibotirama).';
  end if;
end;
$$;

revoke all on function public.register_production_loss(uuid, text, numeric, text) from public, anon;
grant execute on function public.register_production_loss(uuid, text, numeric, text) to authenticated;

commit;
