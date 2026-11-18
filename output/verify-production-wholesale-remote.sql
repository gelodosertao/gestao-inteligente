begin;
set local lock_timeout = '5s';
set local statement_timeout = '25s';
do $verify$
declare
  v_user public.app_users%rowtype;
  v_product public.products%rowtype;
  v_ingredients jsonb;
  v_batch uuid := gen_random_uuid();
  v_sale_op uuid := gen_random_uuid();
  v_sale_id text := 'migration-check-' || gen_random_uuid()::text;
  v_payload jsonb;
  v_stock numeric;
  v_owner text := current_user;
begin
  select u.* into strict v_user from public.app_users u
    where u.role='ADMIN' and u.is_active is true and u.must_change_password is not true
      and u.tenant_id is not null
      and exists(select from public.products p where p.tenant_id=u.tenant_id and p.category like '%Gelo%' and p.stock_matriz_ibotirama >= 1)
    order by u.id limit 1;
  select p.* into strict v_product from public.products p
    where p.tenant_id=v_user.tenant_id and p.category like '%Gelo%'
      and p.is_stock_controlled is distinct from false and coalesce(jsonb_array_length(p.combo_items),0)=0
      and p.stock_matriz_ibotirama >= 1 and coalesce(p.recipe_batch_size,1)>0
      and jsonb_typeof(coalesce(p.recipe,'[]'::jsonb))='array'
      and not exists (
        select from jsonb_array_elements(coalesce(p.recipe,'[]'::jsonb)) r
        left join public.products ingredient on ingredient.id=r->>'ingredientId' and ingredient.tenant_id=p.tenant_id
        where ingredient.id is null or (r->>'quantity')::numeric <= 0
          or ingredient.stock_matriz_ibotirama < (r->>'quantity')::numeric / coalesce(p.recipe_batch_size,1)
          or ingredient.is_stock_controlled is false
      )
    order by jsonb_array_length(coalesce(p.recipe,'[]'::jsonb)),p.id limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('ingredientId',r->>'ingredientId','quantity',(r->>'quantity')::numeric/coalesce(v_product.recipe_batch_size,1))),'[]'::jsonb)
    into v_ingredients from jsonb_array_elements(coalesce(v_product.recipe,'[]'::jsonb)) r;
  perform set_config('request.jwt.claim.sub',v_user.id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user.id,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  perform public.register_production_batch(v_batch,jsonb_build_object('productId',v_product.id,'quantity',1,'shift','Manhã','notes','Validação transacional da migration; rollback obrigatório'),v_ingredients);
  perform public.register_production_batch(v_batch,jsonb_build_object('productId',v_product.id,'quantity',1,'shift','Manhã','notes','Validação transacional da migration; rollback obrigatório'),v_ingredients);
  perform set_config('role',v_owner,true);
  if (select count(*) from public.production_logs where id=v_batch::text) <> 1 then raise exception 'Production retry duplicated log'; end if;
  select stock_matriz_ibotirama into v_stock from public.products where id=v_product.id;
  if v_stock <> v_product.stock_matriz_ibotirama+1 then raise exception 'Production did not increment stock exactly once'; end if;
  if not exists(select from public.production_logs where id=v_batch::text and date >= transaction_timestamp()-interval '1 minute') then raise exception 'Production timestamp invalid'; end if;
  v_payload := jsonb_build_object('id',v_sale_id,'date',current_date::text,'customerName','Validação técnica com rollback','total',1,
    'items',jsonb_build_array(jsonb_build_object('productId',v_product.id,'productName',v_product.name,'quantity',1,'priceAtSale',1)),
    'branch','Matriz (Fábrica)','matrizDeposit','Ibotirama','status','Pending','paymentMethod','Pix','source','ATACADO',
    'amountPaid',0,'paymentHistory','[]'::jsonb,'fulfillmentStatus','pending','revision',0,'deliveryFee',0,'discount',0);
  perform set_config('role','authenticated',true);
  perform public.apply_sale_operation(v_sale_op,v_sale_id,'create',v_payload);
  perform public.apply_sale_operation(v_sale_op,v_sale_id,'create',v_payload);
  perform set_config('role',v_owner,true);
  if (select stock_matriz_ibotirama from public.products where id=v_product.id) <> v_stock-1 then raise exception 'Wholesale did not commit stock exactly once'; end if;
  if not exists(select from public.sales where id=v_sale_id and fulfillment_status='committed' and dispatched_at is null and amount_paid=0) then raise exception 'Wholesale commitment state invalid'; end if;
  if exists(select from public.financials where sale_id=v_sale_id) then raise exception 'Unpaid wholesale generated financial entry'; end if;
  if (select count(*) from public.stock_movements where sale_id=v_sale_id) <> 1 then raise exception 'Wholesale retry duplicated movement'; end if;
  raise notice 'Remote transactional verification passed: authenticated production timestamp, production retry, wholesale commitment on creation, wholesale retry, no payment or delivery invented. All effects will be rolled back.';
end $verify$;
rollback;
select 'production_and_wholesale_runtime_passed_and_rolled_back' as verification;
