begin;
set local lock_timeout = '5s';

create table public.nfe_configuration_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  actor_id text not null references public.app_users(id),
  kind text not null check (kind in ('product', 'rule', 'issuer')),
  record_key text not null,
  previous_value jsonb,
  new_value jsonb not null,
  created_at timestamptz not null default now()
);
create index nfe_configuration_audit_tenant_created_idx on public.nfe_configuration_audit(tenant_id, created_at desc);
alter table public.nfe_configuration_audit enable row level security;
revoke all on public.nfe_configuration_audit from public, anon, authenticated;
grant select, insert on public.nfe_configuration_audit to service_role;
grant usage, select on sequence public.nfe_configuration_audit_id_seq to service_role;

create or replace function public.save_nfe_configuration(
  p_tenant_id uuid, p_actor_id text, p_kind text, p_payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_date date;
  v_end date;
  v_id text;
  v_cnpj text;
  v_environment smallint;
  v_series integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Acesso fiscal restrito'; end if;
  if not exists (select 1 from public.app_users where id = p_actor_id and tenant_id = p_tenant_id
      and role = 'ADMIN' and is_active and not must_change_password) then
    raise exception 'Administrador ativo não encontrado';
  end if;
  if p_kind = 'product' then
    v_id := p_payload->>'productId';
    v_date := (p_payload->>'validFrom')::date;
    if v_date < current_date then raise exception 'Vigência retroativa não permitida'; end if;
    if not exists (select 1 from public.products where tenant_id = p_tenant_id and id = v_id
        and category in ('Gelo Cubo', 'Gelo Sabor')) then raise exception 'Produto fora do PDV Atacado'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':product:' || v_id, 0));
    if exists (select 1 from public.nfe_product_profiles where tenant_id = p_tenant_id and product_id = v_id
        and valid_from >= v_date) then raise exception 'Já existe perfil nesta data ou em data futura'; end if;
    select to_jsonb(p) into v_old from public.nfe_product_profiles p where tenant_id = p_tenant_id
      and product_id = v_id and valid_from < v_date and (valid_until is null or valid_until >= v_date)
      order by valid_from desc limit 1 for update;
    if v_old is not null then
      update public.nfe_product_profiles set valid_until = v_date - 1 where tenant_id = p_tenant_id
        and product_id = v_id and valid_from = (v_old->>'valid_from')::date;
    end if;
    insert into public.nfe_product_profiles(tenant_id,product_id,ncm,cest,origin,unit,approved,approved_at,approval_reference,valid_from)
    values (p_tenant_id,v_id,p_payload->>'ncm',nullif(p_payload->>'cest',''),(p_payload->>'origin')::smallint,
      p_payload->>'unit',(p_payload->>'approved')::boolean,
      case when (p_payload->>'approved')::boolean then now() end,
      case when (p_payload->>'approved')::boolean then p_payload->>'approvalReference' end,v_date);
    insert into public.nfe_configuration_audit(tenant_id,actor_id,kind,record_key,previous_value,new_value)
      values(p_tenant_id,p_actor_id,p_kind,v_id,v_old,p_payload);
  elsif p_kind = 'rule' then
    v_id := p_payload->>'operation';
    v_date := (p_payload->>'validFrom')::date;
    v_end := (p_payload->>'validUntil')::date;
    if v_date < current_date or v_end < v_date then raise exception 'Vigência inválida ou retroativa'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':rule:' || v_id, 0));
    if exists (select 1 from public.nfe_fiscal_rules where tenant_id = p_tenant_id and operation = v_id
      and valid_from >= v_date and valid_from <= v_end) then raise exception 'Há regra nesta vigência'; end if;
    select to_jsonb(r) into v_old from public.nfe_fiscal_rules r where tenant_id = p_tenant_id
      and operation = v_id and valid_from < v_date and valid_until >= v_date
      order by valid_from desc limit 1 for update;
    if v_old is not null then
      update public.nfe_fiscal_rules set valid_until = v_date - 1 where id = (v_old->>'id')::uuid;
    end if;
    insert into public.nfe_fiscal_rules(tenant_id,operation,valid_from,valid_until,approved,approved_at,approval_reference,config)
    values(p_tenant_id,v_id,v_date,v_end,(p_payload->>'approved')::boolean,
      case when (p_payload->>'approved')::boolean then now() end,
      case when (p_payload->>'approved')::boolean then p_payload->>'approvalReference' end,p_payload->'config');
    insert into public.nfe_configuration_audit(tenant_id,actor_id,kind,record_key,previous_value,new_value)
      values(p_tenant_id,p_actor_id,p_kind,v_id,v_old,p_payload);
  elsif p_kind = 'issuer' then
    v_environment := (p_payload->>'environment')::smallint;
    v_series := (p_payload->>'series')::integer;
    v_cnpj := p_payload->>'issuerCnpj';
    if v_series = 1 then raise exception 'Série 1 reservada para emissor externo'; end if;
    if exists (select 1 from public.nfe_documents where issuer_cnpj = v_cnpj and environment = v_environment and series = v_series)
       or exists (select 1 from public.nfe_sequences where issuer_cnpj = v_cnpj and environment = v_environment and series = v_series)
       then
      if not exists (select 1 from public.nfe_issuer_settings where tenant_id = p_tenant_id and environment = v_environment
          and issuer_cnpj = v_cnpj and series = v_series) then
        raise exception 'Série já utilizada neste ambiente';
      end if;
    end if;
    select to_jsonb(i) into v_old from public.nfe_issuer_settings i where tenant_id = p_tenant_id
      and environment = v_environment for update;
    if v_old is null or v_old->>'issuer_cnpj' <> v_cnpj then raise exception 'Emitente fiscal não corresponde ao ambiente'; end if;
    update public.nfe_issuer_settings set series = v_series,
      series_confirmed = (p_payload->>'seriesConfirmed')::boolean,
      series_confirmed_at = case when (p_payload->>'seriesConfirmed')::boolean then now() end,
      series_confirmation_reference = case when (p_payload->>'seriesConfirmed')::boolean then p_payload->>'seriesConfirmationReference' end,
      config = p_payload->'config', updated_at = now()
      where tenant_id = p_tenant_id and environment = v_environment;
    insert into public.nfe_configuration_audit(tenant_id,actor_id,kind,record_key,previous_value,new_value)
      values(p_tenant_id,p_actor_id,p_kind,v_environment::text,v_old,p_payload);
  else
    raise exception 'Tipo de configuração desconhecido';
  end if;
end $$;
revoke all on function public.save_nfe_configuration(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_nfe_configuration(uuid,text,text,jsonb) to service_role;
commit;
