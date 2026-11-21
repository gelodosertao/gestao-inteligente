select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('apply_sale_operation','register_production_batch','inventory_stock_delta')) or (n.nspname='private' and p.proname='wholesale_order_quantities')),
 'constraint',(select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.sales'::regclass and conname='sales_fulfillment_status_check'),
 'invalid_fulfillment_count',(select count(*) from public.sales where fulfillment_status is not null and fulfillment_status not in ('pending','committed','dispatched')),
 'columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type)) from information_schema.columns where table_schema='public' and table_name in ('production_logs','stock_movements') and column_name='date'),
 'history',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)
) as preflight;
