-- TEMPLATE NÃO APLICÁVEL DIRETAMENTE.
-- Após `supabase link` + `supabase db pull` em homologação, crie uma migration
-- oficial com `supabase migration new security_p0_foundation` e copie este conteúdo.
-- O bloco de anomalias aborta a transação: dados legados nunca recebem tenant/role presumidos.

begin;

alter table public.app_users add column if not exists allowed_modules text[] not null default '{}';
alter table public.app_users add column if not exists is_active boolean not null default true;
alter table public.app_users add column if not exists must_change_password boolean not null default false;
alter table public.app_users add column if not exists temporary_password_expires_at timestamptz;

do $$
declare
  anomaly_count bigint;
  table_name text;
begin
  select count(*) into anomaly_count
  from public.app_users au
  left join auth.users u on u.id::text = au.id::text
  where u.id is null
     or au.tenant_id is null
     or nullif(trim(au.name), '') is null
     or nullif(trim(au.email), '') is null
     or au.role is null
     or au.role not in ('ADMIN', 'OPERATOR', 'FACTORY', 'WHOLESALE_REPRESENTATIVE');
  if anomaly_count > 0 then
    raise exception 'SECURITY_P0_BLOCKED: % perfis órfãos, sem tenant ou com role inválida', anomaly_count;
  end if;

  select count(*) into anomaly_count
  from auth.users u
  left join public.app_users au on au.id::text = u.id::text
  where au.id is null;
  if anomaly_count > 0 then
    raise exception 'SECURITY_P0_BLOCKED: % usuários do Auth não possuem perfil', anomaly_count;
  end if;

  select count(*) into anomaly_count
  from (select lower(email) from public.app_users group by lower(email) having count(*) > 1) duplicated;
  if anomaly_count > 0 then
    raise exception 'SECURITY_P0_BLOCKED: % e-mails duplicados', anomaly_count;
  end if;

  select count(*) into anomaly_count
  from public.tenants t
  where exists (select 1 from public.app_users au where au.tenant_id = t.id)
    and not exists (
      select 1 from public.app_users au
      where au.tenant_id = t.id and au.role = 'ADMIN' and au.is_active
    );
  if anomaly_count > 0 then
    raise exception 'SECURITY_P0_BLOCKED: % tenants sem administrador ativo', anomaly_count;
  end if;

  foreach table_name in array array[
    'products', 'sales', 'sale_items', 'financials', 'customers', 'stock_movements',
    'production_logs', 'cash_closings', 'orders', 'categories', 'store_settings',
    'crm_leads', 'crm_interactions', 'crm_tasks', 'delivery_routes', 'delivery_stops',
    'payment_transactions'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('select count(*) from public.%I where tenant_id is null', table_name)
        into anomaly_count;
      if anomaly_count > 0 then
        raise exception 'SECURITY_P0_BLOCKED: tabela % contém % registros sem tenant', table_name, anomaly_count;
      end if;
    end if;
  end loop;
end $$;

drop trigger if exists tr_sync_password on public.app_users;
drop trigger if exists tr_cascade_delete_auth_user on public.app_users;
drop function if exists public.fn_sync_password();
alter table public.app_users drop column if exists password;

update public.app_users set allowed_modules = '{}'::text[] where allowed_modules is null;
alter table public.app_users alter column allowed_modules set default '{}'::text[];
alter table public.app_users alter column allowed_modules set not null;
alter table public.app_users alter column tenant_id drop default;
alter table public.app_users alter column tenant_id set not null;
alter table public.app_users alter column name set not null;
alter table public.app_users alter column email set not null;

alter table public.app_users
  drop constraint if exists app_users_role_security_p0_check;
alter table public.app_users
  add constraint app_users_role_security_p0_check
  check (role in ('ADMIN', 'OPERATOR', 'FACTORY', 'WHOLESALE_REPRESENTATIVE'));

create table if not exists public.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_audit_log_tenant_created_idx
  on public.security_audit_log (tenant_id, created_at desc);

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select tenant_id
  from public.app_users
  where id::text = auth.uid()::text
    and is_active
    and not must_change_password
  limit 1
$$;

create or replace function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select role = 'ADMIN'
    from public.app_users
    where id::text = auth.uid()::text
      and is_active
      and not must_change_password
    limit 1
  ), false)
$$;

create or replace function private.current_user_can_any(required_modules text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select case
      when role = 'ADMIN' then true
      when coalesce(allowed_modules, '{}') && required_modules then true
      when role = 'OPERATOR' then required_modules && array['CUSTOMERS', 'INVENTORY', 'FINANCIAL', 'LOGISTICS', 'SALES', 'FESTAS_RADAR']::text[]
      when role = 'FACTORY' then 'PRODUCTION' = any(required_modules)
      when role = 'WHOLESALE_REPRESENTATIVE' then 'ATACADO' = any(required_modules)
      else false
    end
    from public.app_users
    where id::text = auth.uid()::text
      and is_active
      and not must_change_password
    limit 1
  ), false)
$$;

revoke all on function private.current_tenant_id() from public, anon;
revoke all on function private.current_user_is_admin() from public, anon;
revoke all on function private.current_user_can_any(text[]) from public, anon;
grant execute on function private.current_tenant_id() to authenticated, service_role;
grant execute on function private.current_user_is_admin() to authenticated, service_role;
grant execute on function private.current_user_can_any(text[]) to authenticated, service_role;

alter table public.app_users enable row level security;
do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_users'
  loop execute format('drop policy if exists %I on public.app_users', policy_row.policyname); end loop;
end $$;
create policy p0_app_users_select on public.app_users
for select to authenticated
using (
  id::text = auth.uid()::text
  or (
    private.current_user_is_admin()
    and tenant_id = private.current_tenant_id()
  )
);

alter table public.tenants enable row level security;
do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'tenants'
  loop execute format('drop policy if exists %I on public.tenants', policy_row.policyname); end loop;
end $$;
create policy p0_tenants_select on public.tenants
for select to authenticated using (id = private.current_tenant_id());

do $$
declare
  item record;
  policy_row record;
begin
  for item in
    select * from (values
      ('products', array['DASHBOARD','INVENTORY','SALES','ATACADO','PRODUCTION','REPORTS','PRICING','LOGISTICS']::text[]),
      ('sales', array['DASHBOARD','SALES','ATACADO','REPORTS','FINANCIAL','CONCILIACAO','LOGISTICS']::text[]),
      ('sale_items', array['SALES','ATACADO','REPORTS']::text[]),
      ('financials', array['DASHBOARD','FINANCIAL','REPORTS','CONCILIACAO']::text[]),
      ('customers', array['DASHBOARD','CUSTOMERS','SALES','ATACADO','REPORTS']::text[]),
      ('stock_movements', array['INVENTORY','PRODUCTION']::text[]),
      ('production_logs', array['PRODUCTION']::text[]),
      ('cash_closings', array['FINANCIAL','CONCILIACAO']::text[]),
      ('orders', array['ORDER_CENTER','SALES','PRODUCTION']::text[]),
      ('categories', array['INVENTORY','FINANCIAL']::text[]),
      ('store_settings', array['MENU_CONFIG']::text[]),
      ('crm_leads', array['CRM']::text[]),
      ('crm_interactions', array['CRM']::text[]),
      ('crm_tasks', array['CRM']::text[]),
      ('delivery_routes', array['LOGISTICS']::text[]),
      ('delivery_stops', array['LOGISTICS']::text[]),
      ('payment_transactions', array['FINANCIAL','CONCILIACAO']::text[])
    ) as mapping(table_name, modules)
  loop
    if to_regclass(format('public.%I', item.table_name)) is null then continue; end if;

    execute format('alter table public.%I enable row level security', item.table_name);
    for policy_row in
      select policyname from pg_policies where schemaname = 'public' and tablename = item.table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, item.table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (tenant_id = private.current_tenant_id() and private.current_user_can_any(%L::text[]))',
      'p0_' || item.table_name || '_select', item.table_name, item.modules
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (tenant_id = private.current_tenant_id() and private.current_user_can_any(%L::text[]))',
      'p0_' || item.table_name || '_insert', item.table_name, item.modules
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (tenant_id = private.current_tenant_id() and private.current_user_can_any(%L::text[])) with check (tenant_id = private.current_tenant_id() and private.current_user_can_any(%L::text[]))',
      'p0_' || item.table_name || '_update', item.table_name, item.modules, item.modules
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (tenant_id = private.current_tenant_id() and private.current_user_is_admin())',
      'p0_' || item.table_name || '_delete', item.table_name
    );
  end loop;
end $$;

do $$
begin
  if to_regclass('public.sale_items') is not null then
    create policy p0_sale_items_parent_tenant on public.sale_items
      as restrictive for all to authenticated
      using (
        tenant_id = private.current_tenant_id()
        and exists (
          select 1 from public.sales parent
          where parent.id = sale_items.sale_id
            and parent.tenant_id = sale_items.tenant_id
        )
      )
      with check (
        tenant_id = private.current_tenant_id()
        and exists (
          select 1 from public.sales parent
          where parent.id = sale_items.sale_id
            and parent.tenant_id = sale_items.tenant_id
        )
      );
  end if;

  if to_regclass('public.delivery_stops') is not null then
    create policy p0_delivery_stops_parent_tenant on public.delivery_stops
      as restrictive for all to authenticated
      using (
        tenant_id = private.current_tenant_id()
        and exists (
          select 1 from public.delivery_routes parent
          where parent.id = delivery_stops.route_id
            and parent.tenant_id = delivery_stops.tenant_id
        )
      )
      with check (
        tenant_id = private.current_tenant_id()
        and exists (
          select 1 from public.delivery_routes parent
          where parent.id = delivery_stops.route_id
            and parent.tenant_id = delivery_stops.tenant_id
        )
      );
  end if;
end $$;

-- Remove RPCs legadas que alteravam diretamente auth.users pelo navegador.
drop function if exists public.delete_auth_user(uuid);
drop function if exists public.update_user_password(uuid, text);
drop function if exists public.has_allowed_module(text);
drop function if exists public.same_tenant(uuid);
drop function if exists public.is_admin();
drop function if exists public.get_user_tenant_id();
drop function if exists public.get_user_role();
drop function if exists public.cascade_delete_auth_user();
drop function if exists public.sync_password_to_auth();
drop function if exists public.exec_sql(text);

-- Contadores fiscais ficam acessíveis somente ao backend com service_role.
do $$
begin
  if to_regclass('public.nfe_counters') is not null then
    alter table public.nfe_counters enable row level security;
    revoke all on public.nfe_counters from anon, authenticated;
  end if;

  if to_regprocedure('public.increment_nfe_counter(integer)') is not null then
    revoke all on function public.increment_nfe_counter(integer) from public, anon, authenticated;
    grant execute on function public.increment_nfe_counter(integer) to service_role;
  end if;

  if to_regprocedure('public.cancel_nfe_counter(integer)') is not null then
    revoke all on function public.cancel_nfe_counter(integer) from public, anon, authenticated;
    grant execute on function public.cancel_nfe_counter(integer) to service_role;
  end if;
end $$;

alter table public.security_audit_log enable row level security;
drop policy if exists p0_audit_select on public.security_audit_log;
create policy p0_audit_select on public.security_audit_log
for select to authenticated
using (tenant_id = private.current_tenant_id() and private.current_user_is_admin());

create or replace function private.audit_tenant_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.security_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id
  ) values (
    old.tenant_id, auth.uid(), 'record.deleted', tg_table_name, old.id::text
  );
  return old;
end
$$;
revoke all on function private.audit_tenant_delete() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'products', 'sales', 'sale_items', 'financials', 'customers', 'stock_movements',
    'production_logs', 'cash_closings', 'orders', 'categories', 'store_settings',
    'crm_leads', 'crm_interactions', 'crm_tasks', 'delivery_routes', 'delivery_stops',
    'payment_transactions'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists p0_audit_delete on public.%I', table_name);
      execute format('create trigger p0_audit_delete after delete on public.%I for each row execute function private.audit_tenant_delete()', table_name);
    end if;
  end loop;
end $$;

create or replace function private.protect_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.role = 'ADMIN' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'ADMIN' or not new.is_active) then
    if not exists (
      select 1 from public.app_users
      where tenant_id = old.tenant_id
        and role = 'ADMIN'
        and is_active
        and id <> old.id
    ) then
      raise exception 'O último administrador ativo do tenant não pode ser removido ou rebaixado';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
revoke all on function private.protect_last_active_admin() from public, anon, authenticated;
drop trigger if exists p0_protect_last_admin on public.app_users;
create trigger p0_protect_last_admin
before update of role, is_active or delete on public.app_users
for each row execute function private.protect_last_active_admin();

commit;
