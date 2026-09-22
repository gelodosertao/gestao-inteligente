-- SECURITY P0 EMERGENCY LOCKDOWN
-- Contenção de baixo impacto para o projeto ativo.
-- Mantém as policies autenticadas por tenant e as RPCs administrativas atuais,
-- mas bloqueia acesso anônimo e remove policies permissivas que anulam o RLS.

begin;

-- O cardápio público e o cadastro público estão desativados durante a correção.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- app_users: remove acesso total, criação pública de perfil e bypass cross-tenant.
drop policy if exists "Acesso Total Usuários" on public.app_users;
drop policy if exists "Liberar acesso total" on public.app_users;
drop policy if exists "Admin All Users" on public.app_users;
drop policy if exists "Admins can create any profile and users can create their own" on public.app_users;
drop policy if exists "app_users_self_insert_non_admin" on public.app_users;

-- Policies legadas que concedem acesso a qualquer usuário autenticado.
drop policy if exists "Admin All Cash" on public.cash_closings;
drop policy if exists "Admin All Categories" on public.categories;
drop policy if exists "Admin All Customers" on public.customers;
drop policy if exists "Admin All Financials" on public.financials;
drop policy if exists "Admin All Orders" on public.orders;
drop policy if exists "Admin All Products" on public.products;
drop policy if exists "Admin All Sales" on public.sales;
drop policy if exists "Admin All Stock" on public.stock_movements;
drop policy if exists "Admin All Settings" on public.store_settings;

-- Policies completamente abertas.
drop policy if exists "Acesso Total Financeiro" on public.financials;
drop policy if exists "Acesso Total Produtos" on public.products;
drop policy if exists "Acesso Total Vendas" on public.sales;
drop policy if exists "Enable insert access for all users" on public.production_logs;
drop policy if exists "Enable read access for all users" on public.production_logs;
drop policy if exists "Enable update access for all users" on public.production_logs;

-- Endpoints públicos temporariamente desativados pelo plano P0.
drop policy if exists "Public Insert Customers" on public.customers;
drop policy if exists "Public Insert Orders" on public.orders;
drop policy if exists "Public Read Orders" on public.orders;
drop policy if exists "orders_public_insert" on public.orders;
drop policy if exists "Public Read Categories" on public.categories;
drop policy if exists "Public Read Products" on public.products;
drop policy if exists "products_anon_select_public_menu" on public.products;
drop policy if exists "Public Read Settings" on public.store_settings;
drop policy if exists "store_settings_anon_select_public_menu" on public.store_settings;
drop policy if exists "tenants_public_insert_for_signup" on public.tenants;

-- Nenhuma função SECURITY DEFINER deve ser chamada anonimamente.
revoke execute on function public.cancel_nfe_counter(integer) from public, anon, authenticated;
revoke execute on function public.increment_nfe_counter(integer) from public, anon, authenticated;
grant execute on function public.cancel_nfe_counter(integer) to service_role;
grant execute on function public.increment_nfe_counter(integer) to service_role;

revoke execute on function public.cascade_delete_auth_user() from public, anon, authenticated;
revoke execute on function public.delete_auth_user(uuid) from public, anon;
revoke execute on function public.get_user_role() from public, anon;
revoke execute on function public.get_user_tenant_id() from public, anon;
revoke execute on function public.has_allowed_module(text) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.same_tenant(uuid) from public, anon;
revoke execute on function public.sync_password_to_auth() from public, anon, authenticated;
revoke execute on function public.update_user_password(uuid, text) from public, anon;

-- O aplicativo atual ainda depende destas funções até o deploy das Edge Functions.
grant execute on function public.delete_auth_user(uuid) to authenticated;
grant execute on function public.update_user_password(uuid, text) to authenticated;
grant execute on function public.get_user_role() to authenticated;
grant execute on function public.get_user_tenant_id() to authenticated;
grant execute on function public.has_allowed_module(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.same_tenant(uuid) to authenticated;

commit;
