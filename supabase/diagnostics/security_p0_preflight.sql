-- SECURITY P0: diagnóstico somente leitura.
-- Execute no projeto de homologação antes de transformar o template em migration.

-- 1. Tabelas públicas sem RLS.
select n.nspname as schema_name, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by c.relname;

-- 2. Políticas potencialmente permissivas.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and (
    coalesce(trim(qual), '') in ('true', '(true)')
    or coalesce(trim(with_check), '') in ('true', '(true)')
  )
order by tablename, policyname;

-- 3. Anomalias de identidade/perfil. Qualquer linha retornada bloqueia a migration.
select 'perfil_sem_auth_user' as anomaly, au.id::text as record_id, au.email as detail
from public.app_users au
left join auth.users u on u.id::text = au.id::text
where u.id is null
union all
select 'auth_user_sem_perfil', u.id::text, coalesce(u.email, '')
from auth.users u
left join public.app_users au on au.id::text = u.id::text
where au.id is null
union all
select 'perfil_sem_tenant', au.id::text, au.email
from public.app_users au
where au.tenant_id is null
union all
select 'role_invalida', au.id::text, coalesce(au.role, '<null>')
from public.app_users au
where au.role is null
   or au.role not in ('ADMIN', 'OPERATOR', 'FACTORY', 'WHOLESALE_REPRESENTATIVE')
union all
select 'email_duplicado', min(au.id::text), lower(au.email)
from public.app_users au
group by lower(au.email)
having count(*) > 1
order by anomaly, record_id;

-- 4. Tenants sem administrador ativo. Compatível com o schema anterior a is_active.
do $$
declare
  tenant_record record;
  query_text text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'is_active'
  ) then
    query_text := 'select t.id, t.name from public.tenants t where not exists '
      || '(select 1 from public.app_users au where au.tenant_id = t.id '
      || 'and au.role = ''ADMIN'' and au.is_active)';
  else
    query_text := 'select t.id, t.name from public.tenants t where not exists '
      || '(select 1 from public.app_users au where au.tenant_id = t.id '
      || 'and au.role = ''ADMIN'')';
  end if;

  for tenant_record in execute query_text loop
    raise warning 'SECURITY_P0_ANOMALY tenant_without_active_admin=% name=%', tenant_record.id, tenant_record.name;
  end loop;
end $$;

-- 5. Colunas tenant_id nulas nas tabelas operacionais conhecidas.
do $$
declare
  table_name text;
  null_count bigint;
begin
  foreach table_name in array array[
    'products', 'sales', 'sale_items', 'financials', 'customers', 'stock_movements',
    'production_logs', 'cash_closings', 'orders', 'categories', 'store_settings',
    'crm_leads', 'crm_interactions', 'crm_tasks', 'delivery_routes', 'delivery_stops'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('select count(*) from public.%I where tenant_id is null', table_name)
        into null_count;
      if null_count > 0 then
        raise warning 'SECURITY_P0_ANOMALY table=% null_tenant_rows=%', table_name, null_count;
      end if;
    end if;
  end loop;
end $$;

-- 6. Inventário completo das policies para anexar ao relatório de homologação.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 7. Funções SECURITY DEFINER expostas. Revisão obrigatória antes da migration.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname, arguments;
