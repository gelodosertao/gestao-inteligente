-- SECURITY P0: uso agregado por tenant, sem retornar conteúdo operacional.

with usage as (
  select tenant_id, count(*) as rows_count from public.app_users group by tenant_id
  union all select tenant_id, count(*) from public.cash_closings group by tenant_id
  union all select tenant_id, count(*) from public.categories group by tenant_id
  union all select tenant_id, count(*) from public.crm_interactions group by tenant_id
  union all select tenant_id, count(*) from public.crm_leads group by tenant_id
  union all select tenant_id, count(*) from public.crm_tasks group by tenant_id
  union all select tenant_id, count(*) from public.customers group by tenant_id
  union all select tenant_id, count(*) from public.delivery_routes group by tenant_id
  union all select tenant_id, count(*) from public.delivery_stops group by tenant_id
  union all select tenant_id, count(*) from public.financials group by tenant_id
  union all select tenant_id, count(*) from public.orders group by tenant_id
  union all select tenant_id, count(*) from public.payment_transactions group by tenant_id
  union all select tenant_id, count(*) from public.production_logs group by tenant_id
  union all select tenant_id, count(*) from public.products group by tenant_id
  union all select tenant_id, count(*) from public.sale_items group by tenant_id
  union all select tenant_id, count(*) from public.sales group by tenant_id
  union all select tenant_id, count(*) from public.stock_movements group by tenant_id
  union all select tenant_id, count(*) from public.store_settings group by tenant_id
)
select coalesce(jsonb_agg(jsonb_build_object(
  'tenant_id', t.id,
  'operational_rows', coalesce((select sum(rows_count) from usage where usage.tenant_id = t.id), 0)
) order by t.id), '[]'::jsonb) as tenant_usage
from public.tenants t;
