-- Supabase concede EXECUTE explicitamente a anon em novas funções públicas.
-- A validação pública permanece acessível; operações administrativas exigem login.
revoke execute on function public.gelo_premiado_admin_tenant() from anon;
revoke execute on function public.gelo_premiado_create(text, integer) from anon;
revoke execute on function public.gelo_premiado_create(text, integer, text) from anon;
revoke execute on function public.gelo_premiado_list() from anon;
revoke execute on function public.gelo_premiado_summary() from anon;
revoke execute on function public.gelo_premiado_deliver(uuid, text) from anon;
notify pgrst, 'reload schema';
