begin;

alter table public.products add column if not exists archived_at timestamptz;

create or replace function public.archive_inventory_product(p_product_id text, p_tenant_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_user public.app_users%rowtype; v_product public.products%rowtype; v_dependency text;
begin
  select * into v_user from public.app_users where id::text = auth.uid()::text;
  if not found or v_user.tenant_id is null or v_user.is_active is not true
    or v_user.must_change_password is true or v_user.role is distinct from 'ADMIN' then
    raise exception using errcode = '42501', message = 'Apenas administradores podem retirar produtos do cadastro.';
  end if;
  if p_tenant_id is distinct from v_user.tenant_id then
    raise exception using errcode = '42501', message = 'Fábrica inválida.';
  end if;
  select * into v_product from public.products
    where id = p_product_id and tenant_id = v_user.tenant_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Produto não encontrado nesta fábrica. Atualize o estoque.';
  end if;
  if v_product.archived_at is not null then return; end if;

  select name into v_dependency from public.products
    where tenant_id = v_user.tenant_id and id <> p_product_id and archived_at is null
      and (combo_items @> jsonb_build_array(jsonb_build_object('productId', p_product_id))
        or recipe @> jsonb_build_array(jsonb_build_object('ingredientId', p_product_id)))
    order by id limit 1;
  if found then
    raise exception using errcode = '23514',
      message = format('Este produto faz parte do combo ou receita de "%s". Remova esse vínculo antes de retirá-lo do cadastro.', v_dependency);
  end if;

  update public.products set archived_at = now()
    where id = p_product_id and tenant_id = v_user.tenant_id;
end $$;

revoke all on function public.archive_inventory_product(text, uuid) from public, anon;
grant execute on function public.archive_inventory_product(text, uuid) to authenticated;

commit;
