-- Inventario somente leitura para comparar o banco real com os SQLs legados.
-- Execute com: supabase db query --linked --file supabase/diagnostics/sale_nfe_schema_contract.sql
with targets(table_name) as (
  values
    ('app_users'), ('sales'), ('sale_items'), ('products'),
    ('financials'), ('stock_movements'), ('nfe_counters')
)
select
  targets.table_name,
  classes.relrowsecurity as rls_enabled,
  array(
    select columns.column_name
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = targets.table_name
      and columns.column_name in (
        'id', 'tenant_id', 'sale_id', 'product_id', 'status', 'items',
        'stock_filial', 'stock_matriz_ibotirama', 'stock_matriz_barreiras',
        'series', 'last_nnf'
      )
    order by columns.column_name
  ) as key_columns,
  array(
    select constraints.conname
    from pg_constraint constraints
    where constraints.conrelid = classes.oid
      and constraints.contype in ('f', 'u', 'p')
    order by constraints.conname
  ) as key_constraints
from targets
left join pg_namespace namespace on namespace.nspname = 'public'
left join pg_class classes on classes.relnamespace = namespace.oid
  and classes.relname = targets.table_name
  and classes.relkind in ('r', 'p')
order by targets.table_name;
