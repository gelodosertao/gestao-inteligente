begin;
set local lock_timeout = '5s';
set local statement_timeout = '25s';
do $verify$
declare
  v_user public.app_users%rowtype;
  v_before public.products%rowtype;
  v_after public.products%rowtype;
  v_owner text := current_user;
  v_movements bigint;
  v_sales bigint;
begin
  select u.* into strict v_user from public.app_users u
    where u.role = 'ADMIN' and u.is_active is true and u.must_change_password is not true
      and u.tenant_id is not null
      and exists(select from public.products p where p.tenant_id = u.tenant_id and p.archived_at is null
        and not exists(select from public.products dependency
          where dependency.tenant_id = p.tenant_id and dependency.id <> p.id and dependency.archived_at is null
            and (dependency.combo_items @> jsonb_build_array(jsonb_build_object('productId', p.id))
              or dependency.recipe @> jsonb_build_array(jsonb_build_object('ingredientId', p.id)))))
    order by u.id limit 1;
  select p.* into strict v_before from public.products p
    where p.tenant_id = v_user.tenant_id and p.archived_at is null
      and not exists(select from public.products dependency
        where dependency.tenant_id = p.tenant_id and dependency.id <> p.id and dependency.archived_at is null
          and (dependency.combo_items @> jsonb_build_array(jsonb_build_object('productId', p.id))
            or dependency.recipe @> jsonb_build_array(jsonb_build_object('ingredientId', p.id))))
    order by p.id limit 1;
  select count(*) into v_movements from public.stock_movements where tenant_id = v_user.tenant_id and product_id = v_before.id;
  select count(*) into v_sales from public.sale_items where tenant_id = v_user.tenant_id and product_id = v_before.id;
  perform set_config('request.jwt.claim.sub', v_user.id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user.id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.archive_inventory_product(v_before.id, v_user.tenant_id);
  perform public.archive_inventory_product(v_before.id, v_user.tenant_id);
  perform set_config('role', v_owner, true);
  select * into strict v_after from public.products where id = v_before.id and tenant_id = v_user.tenant_id;
  if v_after.archived_at is null then raise exception 'Product was not archived'; end if;
  if (to_jsonb(v_after) - 'archived_at') is distinct from (to_jsonb(v_before) - 'archived_at') then
    raise exception 'Archival changed product data or balances';
  end if;
  if (select count(*) from public.stock_movements where tenant_id = v_user.tenant_id and product_id = v_before.id) <> v_movements
    or (select count(*) from public.sale_items where tenant_id = v_user.tenant_id and product_id = v_before.id) <> v_sales then
    raise exception 'Archival changed history';
  end if;
end $verify$;
rollback;
select 'archive_runtime_passed_and_rolled_back' as verification;
