-- SECURITY P0: inventário remoto somente leitura do schema real.

select jsonb_build_object(
  'app_user_columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users'
  ),
  'public_tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'rls', c.relrowsecurity
    ) order by c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  'security_definer_functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'definition', pg_get_functiondef(p.oid),
      'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  ),
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', event_object_table,
      'name', trigger_name,
      'event', event_manipulation,
      'timing', action_timing,
      'statement', action_statement
    ) order by event_object_table, trigger_name, event_manipulation), '[]'::jsonb)
    from information_schema.triggers
    where trigger_schema = 'public'
  ),
  'identity_anomalies', jsonb_build_object(
    'profile_without_auth', (
      select count(*) from public.app_users au
      left join auth.users u on u.id::text = au.id::text
      where u.id is null
    ),
    'auth_without_profile', (
      select count(*) from auth.users u
      left join public.app_users au on au.id::text = u.id::text
      where au.id is null
    ),
    'profile_without_tenant', (
      select count(*) from public.app_users where tenant_id is null
    ),
    'invalid_role', (
      select count(*) from public.app_users
      where role is null or role not in ('ADMIN', 'OPERATOR', 'FACTORY', 'WHOLESALE_REPRESENTATIVE')
    ),
    'duplicate_email', (
      select count(*) from (
        select lower(email) from public.app_users group by lower(email) having count(*) > 1
      ) duplicate
    ),
    'tenant_without_admin', (
      select count(*) from public.tenants t
      where not exists (
        select 1 from public.app_users au where au.tenant_id = t.id and au.role = 'ADMIN'
      )
    )
  )
) as inventory;
