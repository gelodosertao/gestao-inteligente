-- SECURITY P0: contagens agregadas, sem dados pessoais.

select jsonb_build_object(
  'tenant_health', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tenant_id', t.id,
      'profiles', (select count(*) from public.app_users au where au.tenant_id = t.id),
      'admins', (select count(*) from public.app_users au where au.tenant_id = t.id and au.role = 'ADMIN')
    ) order by t.id), '[]'::jsonb)
    from public.tenants t
  ),
  'null_tenant_rows', (
    select jsonb_object_agg(table_name, null_count)
    from (
      select 'app_users' as table_name, count(*) as null_count from public.app_users where tenant_id is null
      union all select 'cash_closings', count(*) from public.cash_closings where tenant_id is null
      union all select 'categories', count(*) from public.categories where tenant_id is null
      union all select 'crm_interactions', count(*) from public.crm_interactions where tenant_id is null
      union all select 'crm_leads', count(*) from public.crm_leads where tenant_id is null
      union all select 'crm_tasks', count(*) from public.crm_tasks where tenant_id is null
      union all select 'customers', count(*) from public.customers where tenant_id is null
      union all select 'delivery_routes', count(*) from public.delivery_routes where tenant_id is null
      union all select 'delivery_stops', count(*) from public.delivery_stops where tenant_id is null
      union all select 'financials', count(*) from public.financials where tenant_id is null
      union all select 'orders', count(*) from public.orders where tenant_id is null
      union all select 'payment_transactions', count(*) from public.payment_transactions where tenant_id is null
      union all select 'production_logs', count(*) from public.production_logs where tenant_id is null
      union all select 'products', count(*) from public.products where tenant_id is null
      union all select 'sale_items', count(*) from public.sale_items where tenant_id is null
      union all select 'sales', count(*) from public.sales where tenant_id is null
      union all select 'stock_movements', count(*) from public.stock_movements where tenant_id is null
      union all select 'store_settings', count(*) from public.store_settings where tenant_id is null
    ) counts
  )
) as anomaly_summary;
