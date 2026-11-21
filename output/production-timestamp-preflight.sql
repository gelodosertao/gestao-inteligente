select jsonb_build_object(
  'columns', (select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type)) from information_schema.columns where table_schema='public' and table_name in ('production_logs','stock_movements') and column_name='date'),
  'functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('register_production_batch','inventory_stock_delta')),
  'history', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)
) as preflight;
