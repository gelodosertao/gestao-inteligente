-- SECURITY P0: verificação somente leitura após contenção emergencial.

select jsonb_build_object(
  'anon_table_privileges', (
    select count(*)
    from information_schema.table_privileges
    where table_schema = 'public' and grantee = 'anon'
  ),
  'open_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'command', cmd,
      'roles', roles,
      'using', qual,
      'check', with_check
    ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(trim(qual), '') in ('true', '(true)')
        or coalesce(trim(with_check), '') in ('true', '(true)')
        or coalesce(qual, '') like '%auth.role() = ''authenticated''%'
      )
  ),
  'function_access', (
    select jsonb_object_agg(
      p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      jsonb_build_object(
        'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  ),
  'remaining_authenticated_policies', (
    select count(*)
    from pg_policies
    where schemaname = 'public' and 'authenticated' = any(roles)
  ),
  'identity_counts', jsonb_build_object(
    'auth_users', (select count(*) from auth.users),
    'app_users', (select count(*) from public.app_users)
  )
) as verification;
