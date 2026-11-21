-- NF-e: drafts, effective fiscal configuration and environment-isolated issuance.
-- This migration does not approve a tax classification or enable production.
begin;

-- Keep the fiscal migration self-contained when the broader P0 security template
-- has not yet been installed in the linked database.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_tenant_id()
returns uuid language sql stable security definer
set search_path = pg_catalog, public as $$
  select tenant_id from public.app_users
  where id::text = auth.uid()::text and is_active and not must_change_password
  limit 1
$$;

create or replace function private.current_user_can_any(required_modules text[])
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce((
    select case
      when role = 'ADMIN' then true
      when coalesce(allowed_modules, '{}') && required_modules then true
      when role = 'OPERATOR' then required_modules &&
        array['CUSTOMERS','INVENTORY','FINANCIAL','LOGISTICS','SALES','FESTAS_RADAR']::text[]
      when role = 'FACTORY' then 'PRODUCTION' = any(required_modules)
      when role = 'WHOLESALE_REPRESENTATIVE' then 'ATACADO' = any(required_modules)
      else false
    end from public.app_users
    where id::text = auth.uid()::text and is_active and not must_change_password
    limit 1
  ), false)
$$;

revoke all on function private.current_tenant_id() from public, anon;
revoke all on function private.current_user_can_any(text[]) from public, anon;
grant execute on function private.current_tenant_id() to authenticated, service_role;
grant execute on function private.current_user_can_any(text[]) to authenticated, service_role;

alter table public.sales
  add column if not exists customer_id text,
  add column if not exists fiscal_context jsonb not null default '{}'::jsonb,
  add column if not exists nfe_environment smallint;
create unique index if not exists customers_tenant_id_id_uidx on public.customers(tenant_id, id);
alter table public.sales add constraint sales_customer_tenant_fk
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) not valid;
alter table public.sales add constraint sales_fiscal_context_object check (jsonb_typeof(fiscal_context) = 'object');
create index if not exists sales_customer_id_idx on public.sales(tenant_id, customer_id) where customer_id is not null;

create table public.nfe_issuer_settings (
  tenant_id uuid not null references public.tenants(id),
  environment smallint not null check (environment in (1, 2)),
  issuer_cnpj text not null check (issuer_cnpj ~ '^[0-9]{14}$'),
  series integer not null check (series between 1 and 889),
  series_confirmed boolean not null default false,
  series_confirmed_at timestamptz,
  series_confirmation_reference text,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, environment),
  unique (issuer_cnpj, environment, series),
  check (not series_confirmed or (series_confirmed_at is not null and nullif(series_confirmation_reference, '') is not null))
);
create table public.nfe_fiscal_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  operation text not null,
  valid_from date not null,
  valid_until date not null,
  approved boolean not null default false,
  approved_at timestamptz,
  approval_reference text,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  check (valid_until >= valid_from),
  check (not approved or (approved_at is not null and nullif(approval_reference, '') is not null)),
  unique (tenant_id, operation, valid_from)
);
create index nfe_fiscal_rules_effective_idx on public.nfe_fiscal_rules(tenant_id, operation, valid_from, valid_until);
create table public.nfe_product_profiles (
  tenant_id uuid not null,
  product_id text not null,
  ncm text not null check (ncm ~ '^[0-9]{8}$'),
  cest text check (cest is null or cest ~ '^[0-9]{7}$'),
  origin smallint not null check (origin between 0 and 8),
  unit text not null default 'UN' check (length(unit) between 1 and 6),
  approved boolean not null default false,
  approved_at timestamptz,
  approval_reference text,
  valid_from date not null,
  valid_until date,
  primary key (tenant_id, product_id, valid_from),
  foreign key (tenant_id, product_id) references public.products(tenant_id, id),
  check (valid_until is null or valid_until >= valid_from),
  check (not approved or (approved_at is not null and nullif(approval_reference, '') is not null))
);
create table public.nfe_payment_methods (
  tenant_id uuid not null references public.tenants(id),
  method text not null,
  code text not null check (code ~ '^[0-9]{2}$'),
  active boolean not null default true,
  valid_from date not null,
  valid_until date,
  description text,
  primary key (tenant_id, method, valid_from),
  check (valid_until is null or valid_until >= valid_from)
);
create table public.nfe_drafts (
  tenant_id uuid not null,
  sale_id text not null,
  customer_id text not null,
  context jsonb not null check (jsonb_typeof(context) = 'object'),
  revision integer not null check (revision > 0),
  source_snapshot jsonb not null,
  updated_by text not null references public.app_users(id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, sale_id),
  foreign key (tenant_id, sale_id) references public.sales(tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id)
);
create table public.nfe_sequences (
  issuer_cnpj text not null check (issuer_cnpj ~ '^[0-9]{14}$'),
  environment smallint not null check (environment in (1, 2)),
  series integer not null check (series between 1 and 889),
  last_number integer not null check (last_number between 0 and 999999999),
  primary key (issuer_cnpj, environment, series)
);
alter table public.nfe_documents
  add column environment smallint not null default 1 check (environment in (1, 2)),
  add column draft_revision integer,
  add column source_snapshot jsonb,
  add column fiscal_snapshot jsonb,
  add column signed_xml text,
  add column transmission_started_at timestamptz,
  add column cancellation_signed_xml text,
  add column cancellation_xml text;
alter table public.nfe_documents drop constraint nfe_documents_tenant_id_sale_id_key;
alter table public.nfe_documents drop constraint nfe_documents_issuer_cnpj_model_series_number_key;
alter table public.nfe_documents add unique (tenant_id, sale_id, environment);
alter table public.nfe_documents add unique (issuer_cnpj, model, environment, series, number);
create table public.nfe_attempts (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.nfe_documents(id),
  action text not null check (action in ('reserved', 'transmitting', 'authorized', 'rejected', 'unknown', 'cancelled', 'cancel_unknown')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index nfe_attempts_document_idx on public.nfe_attempts(document_id, id);

do $$
declare table_name text;
begin
  foreach table_name in array array['nfe_issuer_settings','nfe_fiscal_rules','nfe_product_profiles',
    'nfe_payment_methods','nfe_drafts','nfe_sequences','nfe_attempts'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update on public.%I to service_role', table_name);
  end loop;
end $$;
grant usage, select on sequence public.nfe_attempts_id_seq to service_role;
grant select on public.nfe_drafts to authenticated;
create policy nfe_drafts_read on public.nfe_drafts for select to authenticated using (
  tenant_id = private.current_tenant_id()
  and private.current_user_can_any(array['SALES','ATACADO'])
  and exists (select 1 from public.sales s where s.tenant_id = nfe_drafts.tenant_id and s.id = nfe_drafts.sale_id)
  and exists (select 1 from public.customers c where c.tenant_id = nfe_drafts.tenant_id and c.id = nfe_drafts.customer_id)
);

-- Share only fiscal source fields; fiscal results are excluded to keep retries stable.
create function public.get_nfe_source_snapshot(p_tenant_id uuid, p_sale_id text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'sale', to_jsonb(s) - array['nfe_status','nfe_number','nfe_series','nfe_xml','nfe_protocol',
      'nfe_issued_at','nfe_environment','has_invoice','invoice_key','invoice_url'],
    'customer', to_jsonb(c),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.sale_items i
      where i.tenant_id = s.tenant_id and i.sale_id = s.id), '[]'::jsonb)
  ) from public.sales s left join public.customers c on c.tenant_id = s.tenant_id and c.id = s.customer_id
  where s.tenant_id = p_tenant_id and s.id = p_sale_id
$$;
revoke all on function public.get_nfe_source_snapshot(uuid,text) from public, anon, authenticated;
grant execute on function public.get_nfe_source_snapshot(uuid,text) to service_role;

create function public.save_nfe_draft(p_sale_id text, p_customer_id text, p_context jsonb,
  p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_tenant uuid := private.current_tenant_id();
  v_sale public.sales%rowtype;
  v_draft public.nfe_drafts%rowtype;
  v_revision integer;
begin
  if v_tenant is null or not private.current_user_can_any(array['SALES','ATACADO']) then
    raise exception 'Sem acesso ao PDV' using errcode = '42501';
  end if;
  if jsonb_typeof(p_context) is distinct from 'object' then
    raise exception 'Contexto fiscal invalido' using errcode = '22023';
  end if;
  select * into v_sale from public.sales where tenant_id = v_tenant and id = p_sale_id for update;
  if not found or v_sale.source is distinct from 'ATACADO' or v_sale.status = 'Cancelled' then
    raise exception 'Venda atacado indisponivel' using errcode = 'P0002';
  end if;
  perform 1 from public.customers where tenant_id = v_tenant and id = p_customer_id for share;
  if not found then raise exception 'Cliente nao encontrado' using errcode = '42501'; end if;
  if exists (select 1 from public.nfe_documents where tenant_id = v_tenant and sale_id = p_sale_id) then
    raise exception 'Nota ja reservada; rascunho congelado' using errcode = '23514';
  end if;
  select * into v_draft from public.nfe_drafts where tenant_id = v_tenant and sale_id = p_sale_id;
  if (found and p_expected_revision is distinct from v_draft.revision)
      or (not found and p_expected_revision is not null) then
    raise exception 'Rascunho alterado por outro usuario; atualize a tela' using errcode = '40001';
  end if;
  v_revision := coalesce(v_draft.revision, 0) + 1;
  update public.sales set customer_id = p_customer_id, fiscal_context = p_context
    where tenant_id = v_tenant and id = p_sale_id;
  insert into public.nfe_drafts(tenant_id,sale_id,customer_id,context,revision,source_snapshot,updated_by)
    values(v_tenant,p_sale_id,p_customer_id,p_context,v_revision,
      public.get_nfe_source_snapshot(v_tenant,p_sale_id),auth.uid()::text)
    on conflict (tenant_id,sale_id) do update set customer_id=excluded.customer_id,
      context=excluded.context,revision=excluded.revision,source_snapshot=excluded.source_snapshot,
      updated_by=excluded.updated_by,updated_at=now()
    returning * into v_draft;
  return to_jsonb(v_draft);
end $$;
revoke all on function public.save_nfe_draft(text,text,jsonb,integer) from public,anon;
grant execute on function public.save_nfe_draft(text,text,jsonb,integer) to authenticated;

create function public.update_nfe_customer(p_sale_id text,p_customer_id text,p_patch jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_tenant uuid := private.current_tenant_id();
begin
  if v_tenant is null or not private.current_user_can_any(array['SALES','ATACADO']) then
    raise exception 'Sem acesso ao PDV' using errcode='42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb
      or exists(select 1 from jsonb_object_keys(p_patch) as field(key) where field.key not in
        ('cpf_cnpj','razao_social','inscricao_estadual','logradouro','numero','bairro','zip_code','phone','city','state')) then
    raise exception 'Campos fiscais invalidos' using errcode='22023';
  end if;
  perform 1 from public.sales where tenant_id=v_tenant and id=p_sale_id and source='ATACADO' and status<>'Cancelled' for update;
  if not found or exists(select 1 from public.nfe_documents where tenant_id=v_tenant and sale_id=p_sale_id) then
    raise exception 'Venda fiscal indisponivel para correcao' using errcode='23514';
  end if;
  update public.customers set
    cpf_cnpj=coalesce(p_patch->>'cpf_cnpj',cpf_cnpj),
    razao_social=coalesce(p_patch->>'razao_social',razao_social),
    inscricao_estadual=coalesce(p_patch->>'inscricao_estadual',inscricao_estadual),
    logradouro=coalesce(p_patch->>'logradouro',logradouro),
    numero=coalesce(p_patch->>'numero',numero),
    bairro=coalesce(p_patch->>'bairro',bairro),
    zip_code=coalesce(p_patch->>'zip_code',zip_code),
    phone=coalesce(p_patch->>'phone',phone),
    city=coalesce(p_patch->>'city',city),
    state=coalesce(p_patch->>'state',state)
  where tenant_id=v_tenant and id=p_customer_id;
  if not found then raise exception 'Cliente nao encontrado' using errcode='P0002'; end if;
end $$;
revoke all on function public.update_nfe_customer(text,text,jsonb) from public,anon;
grant execute on function public.update_nfe_customer(text,text,jsonb) to authenticated;

create function public.reserve_nfe_issue_v2(p_tenant_id uuid,p_sale_id text,p_environment smallint,
  p_revision integer,p_snapshot jsonb,p_fiscal_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_sale public.sales%rowtype;
  v_draft public.nfe_drafts%rowtype;
  v_issuer public.nfe_issuer_settings%rowtype;
  v_document public.nfe_documents%rowtype;
  v_number integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Fiscal service only' using errcode='42501'; end if;
  select * into v_sale from public.sales where tenant_id=p_tenant_id and id=p_sale_id for update;
  if not found or v_sale.source is distinct from 'ATACADO' or v_sale.status='Cancelled' then
    raise exception 'Venda atacado indisponivel' using errcode='P0002';
  end if;
  select * into v_document from public.nfe_documents
    where tenant_id=p_tenant_id and sale_id=p_sale_id and environment=p_environment;
  if found then
    if v_document.status='reserved' and v_document.signed_xml is null
        and v_document.draft_revision=p_revision
        and v_document.source_snapshot=p_snapshot
        and v_document.fiscal_snapshot=p_fiscal_snapshot
        and p_snapshot=public.get_nfe_source_snapshot(p_tenant_id,p_sale_id) then
      return jsonb_build_object('number',v_document.number,'series',v_document.series,
        'status',v_document.status,'created',true);
    end if;
    return jsonb_build_object('number',v_document.number,'series',v_document.series,
      'status',v_document.status,'accessKey',v_document.access_key,'created',false);
  end if;
  select * into v_draft from public.nfe_drafts where tenant_id=p_tenant_id and sale_id=p_sale_id for update;
  if not found or v_draft.revision is distinct from p_revision then
    raise exception 'Revisao fiscal desatualizada' using errcode='40001';
  end if;
  perform 1 from public.customers where tenant_id=p_tenant_id and id=v_sale.customer_id for share;
  if p_snapshot is distinct from v_draft.source_snapshot or
      p_snapshot is distinct from public.get_nfe_source_snapshot(p_tenant_id,p_sale_id) then
    raise exception 'Venda ou cadastro alterado; revise e salve a nota novamente' using errcode='40001';
  end if;
  select * into v_issuer from public.nfe_issuer_settings
    where tenant_id=p_tenant_id and environment=p_environment for share;
  if not found or not v_issuer.series_confirmed then
    raise exception 'Serie fiscal ainda nao confirmada' using errcode='23514';
  end if;
  if jsonb_typeof(p_fiscal_snapshot) is distinct from 'object' or p_fiscal_snapshot='{}'::jsonb then
    raise exception 'Snapshot fiscal validado obrigatorio' using errcode='23514';
  end if;
  if p_fiscal_snapshot->'issuer'->>'issuer_cnpj' is distinct from v_issuer.issuer_cnpj
      or (p_fiscal_snapshot->'issuer'->>'series')::integer is distinct from v_issuer.series
      or p_fiscal_snapshot->'issuer'->'config' is distinct from v_issuer.config then
    raise exception 'Configuracao do emitente mudou; revise a nota' using errcode='40001';
  end if;
  -- Existing legacy numbers are never silently placed into a new sequence.
  if nullif(v_sale.nfe_number,'') is not null and not exists (
      select 1 from public.nfe_documents where tenant_id=p_tenant_id and sale_id=p_sale_id) then
    raise exception 'Venda possui numeracao legada; conciliacao necessaria' using errcode='23514';
  end if;
  insert into public.nfe_sequences(issuer_cnpj,environment,series,last_number)
    values(v_issuer.issuer_cnpj,p_environment,v_issuer.series,1)
    on conflict(issuer_cnpj,environment,series) do update set last_number=public.nfe_sequences.last_number+1
    returning last_number into v_number;
  insert into public.nfe_documents(tenant_id,sale_id,issuer_cnpj,environment,series,number,status,
    draft_revision,source_snapshot,fiscal_snapshot)
    values(p_tenant_id,p_sale_id,v_issuer.issuer_cnpj,p_environment,v_issuer.series,v_number,'reserved',
      p_revision,p_snapshot,p_fiscal_snapshot) returning * into v_document;
  insert into public.nfe_attempts(document_id,action) values(v_document.id,'reserved');
  update public.sales set nfe_number=v_number::text,nfe_series=v_issuer.series::text,
    nfe_environment=p_environment,nfe_status='pendente_emissao'
    where tenant_id=p_tenant_id and id=p_sale_id;
  return jsonb_build_object('number',v_number,'series',v_issuer.series,'status','reserved','created',true);
end $$;
revoke all on function public.reserve_nfe_issue_v2(uuid,text,smallint,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_nfe_issue_v2(uuid,text,smallint,integer,jsonb,jsonb) to service_role;

create function public.prepare_nfe_issue_v2(p_tenant_id uuid,p_sale_id text,p_environment smallint,
  p_access_key text,p_signed_xml text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_document public.nfe_documents%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Fiscal service only' using errcode='42501'; end if;
  if p_access_key is null or p_access_key !~ '^[0-9]{44}$' or nullif(p_signed_xml,'') is null
      or position('NFe' || p_access_key in p_signed_xml)=0 or position('Signature' in p_signed_xml)=0 then
    raise exception 'XML assinado e chave correspondentes obrigatorios' using errcode='23514';
  end if;
  select * into v_document from public.nfe_documents
    where tenant_id=p_tenant_id and sale_id=p_sale_id and environment=p_environment for update;
  if not found or v_document.status<>'reserved' then raise exception 'Nota nao reservada' using errcode='23514'; end if;
  if substr(p_access_key,7,14)<>v_document.issuer_cnpj or substr(p_access_key,21,2)<>'55'
      or substr(p_access_key,23,3)::integer<>v_document.series or substr(p_access_key,26,9)::integer<>v_document.number then
    raise exception 'Chave difere da numeracao reservada' using errcode='23514';
  end if;
  update public.nfe_documents set access_key=p_access_key,signed_xml=p_signed_xml,status='transmitting',
    transmission_started_at=now() where id=v_document.id;
  insert into public.nfe_attempts(document_id,action) values(v_document.id,'transmitting');
  update public.sales set invoice_key=p_access_key where tenant_id=p_tenant_id and id=p_sale_id;
end $$;
revoke all on function public.prepare_nfe_issue_v2(uuid,text,smallint,text,text) from public,anon,authenticated;
grant execute on function public.prepare_nfe_issue_v2(uuid,text,smallint,text,text) to service_role;

create function public.complete_nfe_issue_v2(p_tenant_id uuid,p_sale_id text,p_environment smallint,
  p_status text,p_protocol text default null,p_xml text default null,p_error text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_document public.nfe_documents%rowtype;
begin
  if auth.role() is distinct from 'service_role' or p_status is null or p_status not in ('authorized','unknown','rejected') then
    raise exception 'Invalid fiscal completion' using errcode='42501';
  end if;
  select * into v_document from public.nfe_documents
    where tenant_id=p_tenant_id and sale_id=p_sale_id and environment=p_environment for update;
  if found and v_document.status='authorized' and p_status='authorized'
      and v_document.protocol=p_protocol and v_document.authorized_xml=p_xml then return; end if;
  if not found or v_document.status not in ('transmitting','unknown') then
    raise exception 'Nota nao aguarda resultado' using errcode='23514';
  end if;
  if p_status='authorized' and (v_document.signed_xml is null or nullif(p_protocol,'') is null
      or nullif(p_xml,'') is null or position(v_document.access_key in p_xml)=0
      or position(p_protocol in p_xml)=0) then
    raise exception 'XML autorizado, original assinado e protocolo obrigatorios' using errcode='23514';
  end if;
  update public.nfe_documents set status=p_status,protocol=p_protocol,authorized_xml=p_xml,
    last_error=left(p_error,1000),authorized_at=case when p_status='authorized' then now() end
    where id=v_document.id;
  insert into public.nfe_attempts(document_id,action,result) values(v_document.id,p_status,
    jsonb_build_object('protocol',p_protocol,'error',left(p_error,1000)));
  update public.sales set nfe_status=case p_status when 'authorized' then 'autorizada'
    when 'unknown' then 'pendente_consulta' else 'rejeitada' end,
    has_invoice=p_status='authorized' and p_environment=1,nfe_protocol=p_protocol,nfe_xml=p_xml,
    nfe_issued_at=case when p_status='authorized' then now() else nfe_issued_at end
    where tenant_id=p_tenant_id and id=p_sale_id and nfe_environment=p_environment;
end $$;
revoke all on function public.complete_nfe_issue_v2(uuid,text,smallint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_nfe_issue_v2(uuid,text,smallint,text,text,text,text) to service_role;

create function public.prepare_nfe_cancellation_v2(p_tenant_id uuid,p_sale_id text,p_environment smallint,p_signed_event text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_document public.nfe_documents%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Fiscal service only' using errcode='42501'; end if;
  select * into v_document from public.nfe_documents where tenant_id=p_tenant_id and sale_id=p_sale_id
    and environment=p_environment for update;
  if not found or v_document.status<>'authorized' or v_document.cancellation_signed_xml is not null
      or p_signed_event is null or position(v_document.access_key in p_signed_event)=0
      or position('Signature' in p_signed_event)=0 then
    raise exception 'Evento de cancelamento invalido ou ja transmitido' using errcode='23514';
  end if;
  update public.nfe_documents set cancellation_signed_xml=p_signed_event where id=v_document.id;
end $$;
revoke all on function public.prepare_nfe_cancellation_v2(uuid,text,smallint,text) from public,anon,authenticated;
grant execute on function public.prepare_nfe_cancellation_v2(uuid,text,smallint,text) to service_role;

create function public.complete_nfe_cancellation_v2(p_tenant_id uuid,p_sale_id text,p_environment smallint,
  p_status text,p_receipt jsonb default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_document public.nfe_documents%rowtype;
begin
  if auth.role() is distinct from 'service_role' or p_status is null or p_status not in ('cancelled','cancel_unknown') then
    raise exception 'Invalid cancellation result' using errcode='42501';
  end if;
  select * into v_document from public.nfe_documents
    where tenant_id=p_tenant_id and sale_id=p_sale_id and environment=p_environment for update;
  if not found or v_document.status not in ('authorized','cancel_unknown') then
    raise exception 'Nota nao autorizada' using errcode='23514';
  end if;
  if p_status='cancelled' and (nullif(p_receipt->>'xml','') is null or v_document.cancellation_signed_xml is null) then
    raise exception 'XML do evento de cancelamento obrigatorio' using errcode='23514';
  end if;
  update public.nfe_documents set status=p_status,cancellation_receipt=p_receipt,
    cancellation_xml=p_receipt->>'xml',cancelled_at=case when p_status='cancelled' then now() end
    where id=v_document.id;
  insert into public.nfe_attempts(document_id,action,result) values(v_document.id,p_status,coalesce(p_receipt,'{}'::jsonb));
  update public.sales set nfe_status=case p_status when 'cancelled' then 'cancelada' else 'pendente_cancelamento' end
    where tenant_id=p_tenant_id and id=p_sale_id and nfe_environment=p_environment;
end $$;
revoke all on function public.complete_nfe_cancellation_v2(uuid,text,smallint,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_nfe_cancellation_v2(uuid,text,smallint,text,jsonb) to service_role;

-- Retire previous entry points so a stale server cannot bypass draft validation.
revoke all on function public.reserve_nfe_issue(uuid,text,text) from service_role;
revoke all on function public.prepare_nfe_issue(uuid,text,text) from service_role;
revoke all on function public.complete_nfe_issue(uuid,text,text,text,text,text) from service_role;
revoke all on function public.complete_nfe_cancellation(uuid,text,text,jsonb) from service_role;

create or replace function public.protect_nfe_sale_delete()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.nfe_documents where tenant_id=old.tenant_id and sale_id=old.id) then
    raise exception 'Fiscal sale cannot be deleted' using errcode='23514';
  end if;
  return old;
end $$;

create or replace function public.protect_authorized_nfe_items()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op in ('DELETE','UPDATE') then
    perform 1 from public.sales where tenant_id=old.tenant_id and id=old.sale_id for update;
    if exists(select 1 from public.sales where tenant_id=old.tenant_id and id=old.sale_id
      and nullif(nfe_number,'') is not null) then
      raise exception 'Items of a fiscal sale are immutable' using errcode='23514';
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    perform 1 from public.sales where tenant_id=new.tenant_id and id=new.sale_id for update;
    if exists(select 1 from public.sales where tenant_id=new.tenant_id and id=new.sale_id
      and nullif(nfe_number,'') is not null) then
      raise exception 'Items of a fiscal sale are immutable' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create function public.protect_nfe_commercial_context()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and nullif(old.nfe_number,'') is not null and (
    new.customer_id is distinct from old.customer_id or new.fiscal_context is distinct from old.fiscal_context
    or new.payment_method is distinct from old.payment_method or new.payment_splits is distinct from old.payment_splits
    or new.source is distinct from old.source or new.tenant_id is distinct from old.tenant_id
    or new.id is distinct from old.id or new.date is distinct from old.date
  ) then raise exception 'Fiscal commercial context is immutable' using errcode='23514'; end if;
  if auth.role() is distinct from 'service_role' then
    if tg_op='INSERT' then new.nfe_environment:=null; else new.nfe_environment:=old.nfe_environment; end if;
  end if;
  return new;
end $$;
create trigger protect_nfe_commercial_context before insert or update on public.sales
for each row execute function public.protect_nfe_commercial_context();

-- Explicit bootstrap only: no tenant is inferred and no fiscal approval is fabricated.
create function public.seed_nfe_configuration(p_tenant_id uuid,p_issuer_cnpj text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.role() is distinct from 'service_role' or p_issuer_cnpj is distinct from '47026674000129' then
    raise exception 'Bootstrap disponivel somente para o emitente aprovado' using errcode='42501';
  end if;
  insert into public.nfe_issuer_settings(tenant_id,environment,issuer_cnpj,series,config)
    select p_tenant_id,e,p_issuer_cnpj,2,'{"crt":1,"name":null,"ie":null,"address":{}}'::jsonb
    from unnest(array[1,2]::smallint[]) e on conflict do nothing;
  insert into public.nfe_fiscal_rules(tenant_id,operation,valid_from,valid_until,config)
    values(p_tenant_id,'internal_b2b_own_production','2026-01-01','2026-12-31',
      '{"cfop":"5101","csosn":"102","nature":"Venda de producao do estabelecimento","idDest":1,"indFinal":0,"pis":null,"cofins":null,"ibsCbs":{"mode":"none"},"creditApproved":false}'::jsonb)
    on conflict do nothing;
  insert into public.nfe_payment_methods(tenant_id,method,code,valid_from,valid_until,description)
    select p_tenant_id,m.method,m.code,'2026-01-01'::date,'2026-12-31'::date,m.description
    from (values('Cash','01','Dinheiro'),('Credit','03','Cartao de credito'),('Debit','04','Cartao de debito'),
      ('Boleto','15','Boleto bancario'),('Pix','17','PIX'),('Transfer','18','Transferencia ou carteira digital')) m(method,code,description)
    on conflict do nothing;
end $$;
revoke all on function public.seed_nfe_configuration(uuid,text) from public,anon,authenticated;
grant execute on function public.seed_nfe_configuration(uuid,text) to service_role;

-- The atomic sale function is extended below, keeping its stock/financial transaction.
create or replace function public.apply_sale_operation(
  p_operation_id uuid,
  p_sale_id text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.app_users%rowtype;
  v_old_sale public.sales%rowtype;
  v_has_old_sale boolean := false;
  v_inserted boolean := false;
  v_payload_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
  v_items jsonb := coalesce(p_payload -> 'items', '[]'::jsonb);
  v_old_items jsonb := '[]'::jsonb;
  v_status text;
  v_branch text;
  v_matriz_deposit text;
  v_old_final boolean := false;
  v_new_final boolean := false;
  v_old_effects jsonb := '{}'::jsonb;
  v_new_effects jsonb := '{}'::jsonb;
  v_deltas jsonb := '{}'::jsonb;
  v_items_total numeric := 0;
  v_total numeric := 0;
  v_old_revenue numeric := 0;
  v_new_revenue numeric := 0;
  v_financial_delta numeric := 0;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select *
  into v_user
  from public.app_users
  where id = auth.uid()::text;

  if not found or v_user.tenant_id is null then
    raise exception using errcode = '42501', message = 'Active application user not found';
  end if;

  if not v_user.is_active or v_user.must_change_password then
    raise exception using errcode = '42501', message = 'User is not allowed to create sales';
  end if;

  if p_operation_id is null or nullif(btrim(p_sale_id), '') is null then
    raise exception using errcode = '22023', message = 'operation_id and sale_id are required';
  end if;

  if p_action not in ('create', 'update', 'cancel') then
    raise exception using errcode = '22023', message = 'Unsupported sale action';
  end if;

  if p_action = 'cancel' and v_user.role <> 'ADMIN' then
    raise exception using errcode = '42501', message = 'Only administrators can cancel sales';
  end if;

  if not private.current_user_can_any(array['SALES','ATACADO']) then
    raise exception 'Sem acesso a vendas' using errcode = '42501';
  end if;

  v_payload_hash := md5(p_action || ':' || p_sale_id || ':' || coalesce(p_payload, '{}'::jsonb)::text);

  insert into public.sale_operations (
    tenant_id, operation_id, sale_id, action, payload_hash
  ) values (
    v_user.tenant_id, p_operation_id, p_sale_id, p_action, v_payload_hash
  )
  on conflict (tenant_id, operation_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    select payload_hash, result
    into v_existing_hash, v_existing_result
    from public.sale_operations
    where tenant_id = v_user.tenant_id
      and operation_id = p_operation_id;

    if v_existing_hash is distinct from v_payload_hash then
      raise exception using errcode = '23505', message = 'Idempotency key already used with a different payload';
    end if;

    if v_existing_result is null then
      raise exception using errcode = '40001', message = 'Sale operation is still in progress';
    end if;

    return v_existing_result;
  end if;

  select *
  into v_old_sale
  from public.sales
  where id = p_sale_id
  for update;

  v_has_old_sale := found;

  if v_has_old_sale and v_old_sale.tenant_id is distinct from v_user.tenant_id then
    raise exception using errcode = '42501', message = 'Sale belongs to another tenant';
  end if;

  if p_action = 'create' and v_has_old_sale then
    raise exception using errcode = '23505', message = 'Sale already exists';
  end if;

  if p_action in ('update', 'cancel') and not v_has_old_sale then
    raise exception using errcode = 'P0002', message = 'Sale not found';
  end if;

  if v_has_old_sale then
    v_old_final := v_old_sale.status in ('Completed', 'Finalizado pela Fábrica');

    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', item.product_id,
      'productName', item.product_name,
      'quantity', item.quantity,
      'priceAtSale', item.price_at_sale,
      'selectedOptions', item.selected_options,
      'notes', item.notes,
      'ncm', item.ncm,
      'cfop', item.cfop,
      'cst', item.cst
    ) order by item.id), v_old_sale.items, '[]'::jsonb)
    into v_old_items
    from public.sale_items item
    where item.tenant_id = v_user.tenant_id
      and item.sale_id = p_sale_id;

    if v_old_final then
      v_old_effects := coalesce(
        v_old_sale.stock_effects,
        public.resolve_sale_stock_effects(v_user.tenant_id, v_old_items),
        '{}'::jsonb
      );
      v_old_revenue := coalesce(v_old_sale.total, 0);
    end if;
  end if;

  if p_action = 'cancel' then
    v_status := 'Cancelled';
    v_branch := v_old_sale.branch;
    v_matriz_deposit := v_old_sale.matriz_deposit;
    v_items := v_old_items;
  else
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
      raise exception using errcode = '22023', message = 'Sale must contain at least one item';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_items) item
      where nullif(item ->> 'productId', '') is null
         or coalesce((item ->> 'quantity')::numeric, 0) <= 0
         or coalesce((item ->> 'priceAtSale')::numeric, -1) < 0
    ) then
      raise exception using errcode = '22023', message = 'Invalid sale item';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_items) item
      left join public.products product
        on product.id = item ->> 'productId'
       and product.tenant_id = v_user.tenant_id
      where product.id is null
    ) then
      raise exception using errcode = '23503', message = 'Sale contains a product from another tenant or an unknown product';
    end if;

    select coalesce(sum(
      (item ->> 'quantity')::numeric * (item ->> 'priceAtSale')::numeric
    ), 0)
    into v_items_total
    from jsonb_array_elements(v_items) item;

    v_total := coalesce((p_payload ->> 'total')::numeric, 0);

    if abs(v_total - (
      v_items_total
      + coalesce((p_payload ->> 'deliveryFee')::numeric, 0)
      - coalesce((p_payload ->> 'discount')::numeric, 0)
    )) > 0.01 then
      raise exception using errcode = '22023', message = 'Sale total does not match its items';
    end if;

    v_status := p_payload ->> 'status';
    v_branch := p_payload ->> 'branch';
    v_matriz_deposit := p_payload ->> 'matrizDeposit';

    if v_status not in ('Completed', 'Pending', 'Cancelled', 'Finalizado pela Fábrica') then
      raise exception using errcode = '22023', message = 'Invalid sale status';
    end if;

    if v_status = 'Cancelled' then
      raise exception using errcode = '22023', message = 'Use the cancel action to cancel a sale';
    end if;

    if v_branch not in ('Filial (Adega)', 'Matriz (Fábrica)') then
      raise exception using errcode = '22023', message = 'Invalid sale branch';
    end if;

    v_new_final := v_status in ('Completed', 'Finalizado pela Fábrica');

    if v_new_final then
      v_new_effects := public.resolve_sale_stock_effects(v_user.tenant_id, v_items);
      v_new_revenue := v_total;

      if v_branch = 'Matriz (Fábrica)'
         and v_matriz_deposit not in ('Ibotirama', 'Barreiras')
         and v_new_effects <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'A matriz deposit is required for a completed sale';
      end if;
    end if;
  end if;

  if exists (
    select 1
    from (
      select key as product_id from jsonb_each(v_old_effects)
      union
      select key from jsonb_each(v_new_effects)
    ) effect
    left join public.products product
      on product.id = effect.product_id
     and product.tenant_id = v_user.tenant_id
    where product.id is null
  ) then
    raise exception using errcode = '23503', message = 'A combo contains a product from another tenant or an unknown product';
  end if;

  perform 1
  from public.products product
  where product.tenant_id = v_user.tenant_id
    and (v_old_effects ? product.id or v_new_effects ? product.id)
  order by product.id
  for update;

  with changes as (
    select
      effect.key as product_id,
      case when v_old_sale.branch = 'Filial (Adega)' then effect.value::numeric else 0 end as filial,
      case when v_old_sale.branch = 'Matriz (Fábrica)' and v_old_sale.matriz_deposit = 'Ibotirama' then effect.value::numeric else 0 end as ibotirama,
      case when v_old_sale.branch = 'Matriz (Fábrica)' and v_old_sale.matriz_deposit = 'Barreiras' then effect.value::numeric else 0 end as barreiras
    from jsonb_each_text(v_old_effects) effect
    union all
    select
      effect.key,
      case when v_branch = 'Filial (Adega)' then -effect.value::numeric else 0 end,
      case when v_branch = 'Matriz (Fábrica)' and v_matriz_deposit = 'Ibotirama' then -effect.value::numeric else 0 end,
      case when v_branch = 'Matriz (Fábrica)' and v_matriz_deposit = 'Barreiras' then -effect.value::numeric else 0 end
    from jsonb_each_text(v_new_effects) effect
  ),
  totals as (
    select product_id, sum(filial) filial, sum(ibotirama) ibotirama, sum(barreiras) barreiras
    from changes
    group by product_id
  )
  select coalesce(jsonb_object_agg(product_id, jsonb_build_object(
    'filial', filial,
    'ibotirama', ibotirama,
    'barreiras', barreiras
  )), '{}'::jsonb)
  into v_deltas
  from totals;

  if exists (
    select 1
    from jsonb_each(v_deltas) delta
    join public.products product
      on product.id = delta.key
     and product.tenant_id = v_user.tenant_id
    where coalesce(product.stock_filial, 0) + (delta.value ->> 'filial')::numeric < 0
       or coalesce(product.stock_matriz_ibotirama, 0) + (delta.value ->> 'ibotirama')::numeric < 0
       or coalesce(product.stock_matriz_barreiras, 0) + (delta.value ->> 'barreiras')::numeric < 0
  ) then
    raise exception using errcode = '23514', message = 'Insufficient stock';
  end if;

  if p_action = 'create' then
    insert into public.sales (
      id, date, customer_name, total, branch, matriz_deposit, status,
      payment_method, payment_splits, has_invoice, items, cash_received,
      change_amount, amount_paid, payment_history, created_at, delivery_fee,
      discount, source, seller_id, seller_name, seller_role,
      commission_amount, nfe_status, nfe_number, nfe_series, nfe_xml,
      nfe_issued_at, customer_details, invoice_key, invoice_url, tenant_id,
      stock_effects, customer_id, fiscal_context
    ) values (
      p_sale_id,
      p_payload ->> 'date',
      p_payload ->> 'customerName',
      v_total,
      v_branch,
      v_matriz_deposit,
      v_status,
      p_payload ->> 'paymentMethod',
      p_payload -> 'paymentSplits',
      coalesce((p_payload ->> 'hasInvoice')::boolean, false),
      v_items,
      (p_payload ->> 'cashReceived')::numeric,
      (p_payload ->> 'changeAmount')::numeric,
      (p_payload ->> 'amountPaid')::numeric,
      p_payload -> 'paymentHistory',
      coalesce((p_payload ->> 'createdAt')::timestamptz, now()),
      (p_payload ->> 'deliveryFee')::numeric,
      (p_payload ->> 'discount')::numeric,
      p_payload ->> 'source',
      p_payload ->> 'sellerId',
      p_payload ->> 'sellerName',
      p_payload ->> 'sellerRole',
      (p_payload ->> 'commissionAmount')::numeric,
      p_payload ->> 'nfeStatus',
      p_payload ->> 'nfeNumber',
      p_payload ->> 'nfeSeries',
      p_payload ->> 'nfeXml',
      (p_payload ->> 'nfeIssuedAt')::timestamptz,
      p_payload -> 'customerDetails',
      p_payload ->> 'invoiceKey',
      p_payload ->> 'invoiceUrl',
      v_user.tenant_id,
      v_new_effects,
      nullif(p_payload ->> 'customerId', ''),
      coalesce(p_payload -> 'fiscalContext', '{}'::jsonb)
    );
  elsif p_action = 'update' then
    update public.sales
    set date = p_payload ->> 'date',
        customer_name = p_payload ->> 'customerName',
        total = v_total,
        branch = v_branch,
        matriz_deposit = v_matriz_deposit,
        status = v_status,
        payment_method = p_payload ->> 'paymentMethod',
        payment_splits = p_payload -> 'paymentSplits',
        has_invoice = coalesce((p_payload ->> 'hasInvoice')::boolean, false),
        items = v_items,
        cash_received = (p_payload ->> 'cashReceived')::numeric,
        change_amount = (p_payload ->> 'changeAmount')::numeric,
        amount_paid = (p_payload ->> 'amountPaid')::numeric,
        payment_history = p_payload -> 'paymentHistory',
        delivery_fee = (p_payload ->> 'deliveryFee')::numeric,
        discount = (p_payload ->> 'discount')::numeric,
        source = p_payload ->> 'source',
        seller_id = p_payload ->> 'sellerId',
        seller_name = p_payload ->> 'sellerName',
        seller_role = p_payload ->> 'sellerRole',
        commission_amount = (p_payload ->> 'commissionAmount')::numeric,
        nfe_status = p_payload ->> 'nfeStatus',
        nfe_number = p_payload ->> 'nfeNumber',
        nfe_series = p_payload ->> 'nfeSeries',
        nfe_xml = p_payload ->> 'nfeXml',
        nfe_issued_at = (p_payload ->> 'nfeIssuedAt')::timestamptz,
        customer_details = p_payload -> 'customerDetails',
        invoice_key = p_payload ->> 'invoiceKey',
        invoice_url = p_payload ->> 'invoiceUrl',
        stock_effects = v_new_effects,
        customer_id = case when p_payload ? 'customerId' then nullif(p_payload ->> 'customerId', '') else customer_id end,
        fiscal_context = coalesce(p_payload -> 'fiscalContext', fiscal_context)
    where id = p_sale_id
      and tenant_id = v_user.tenant_id;
  else
    update public.sales
    set status = 'Cancelled',
        stock_effects = '{}'::jsonb
    where id = p_sale_id
      and tenant_id = v_user.tenant_id;
  end if;

  if p_action = 'create' or (p_action = 'update' and v_items is distinct from v_old_sale.items) then
    delete from public.sale_items
    where sale_id = p_sale_id
      and tenant_id = v_user.tenant_id;

    insert into public.sale_items (
      sale_id, product_id, product_name, quantity, price_at_sale,
      selected_options, notes, ncm, cfop, cst, tenant_id
    )
    select
      p_sale_id,
      item ->> 'productId',
      item ->> 'productName',
      (item ->> 'quantity')::numeric,
      (item ->> 'priceAtSale')::numeric,
      item -> 'selectedOptions',
      item ->> 'notes',
      item ->> 'ncm',
      item ->> 'cfop',
      item ->> 'cst',
      v_user.tenant_id
    from jsonb_array_elements(v_items) item;
  end if;

  update public.products product
  set stock_filial = coalesce(product.stock_filial, 0) + (delta.value ->> 'filial')::numeric,
      stock_matriz_ibotirama = coalesce(product.stock_matriz_ibotirama, 0) + (delta.value ->> 'ibotirama')::numeric,
      stock_matriz_barreiras = coalesce(product.stock_matriz_barreiras, 0) + (delta.value ->> 'barreiras')::numeric
  from jsonb_each(v_deltas) delta
  where product.id = delta.key
    and product.tenant_id = v_user.tenant_id;

  insert into public.stock_movements (
    id, date, product_id, product_name, quantity, type, reason, branch,
    matriz_deposit, tenant_id, sale_id, operation_id, event_type
  )
  select
    p_operation_id::text || ':stock:' || product.id || ':' || movement.location,
    coalesce(p_payload ->> 'date', v_old_sale.date),
    product.id,
    product.name,
    movement.quantity,
    'ADJUSTMENT',
    case p_action
      when 'create' then 'Venda concluída #' || p_sale_id
      when 'update' then 'Ajuste da venda #' || p_sale_id
      else 'Estorno da venda #' || p_sale_id
    end,
    case when movement.location = 'filial' then 'Filial (Adega)' else 'Matriz (Fábrica)' end,
    case movement.location when 'ibotirama' then 'Ibotirama' when 'barreiras' then 'Barreiras' end,
    v_user.tenant_id,
    p_sale_id,
    p_operation_id,
    'stock_' || movement.location
  from jsonb_each(v_deltas) delta
  join public.products product
    on product.id = delta.key
   and product.tenant_id = v_user.tenant_id
  cross join lateral (values
    ('filial', (delta.value ->> 'filial')::numeric),
    ('ibotirama', (delta.value ->> 'ibotirama')::numeric),
    ('barreiras', (delta.value ->> 'barreiras')::numeric)
  ) movement(location, quantity)
  where movement.quantity <> 0;

  v_financial_delta := v_new_revenue - v_old_revenue;

  if v_financial_delta <> 0 then
    insert into public.financials (
      id, date, description, amount, type, category, branch,
      payment_method, tenant_id, sale_id, operation_id, event_type
    ) values (
      p_operation_id::text || ':financial',
      coalesce(p_payload ->> 'date', v_old_sale.date),
      case p_action
        when 'create' then 'Venda #' || p_sale_id || ' - ' || coalesce(p_payload ->> 'customerName', '')
        when 'update' then 'Ajuste da venda #' || p_sale_id
        else 'Estorno da venda #' || p_sale_id
      end,
      v_financial_delta,
      'Income',
      'Vendas',
      coalesce(v_branch, v_old_sale.branch),
      coalesce(p_payload ->> 'paymentMethod', v_old_sale.payment_method),
      v_user.tenant_id,
      p_sale_id,
      p_operation_id,
      case p_action when 'cancel' then 'sale_reversal' else 'sale_adjustment' end
    );
  end if;

  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'saleId', p_sale_id,
    'action', p_action,
    'status', case when p_action = 'cancel' then 'Cancelled' else v_status end
  );

  update public.sale_operations
  set result = v_result,
      completed_at = now()
  where tenant_id = v_user.tenant_id
    and operation_id = p_operation_id;

  return v_result;
end;
$$;

revoke all on function public.apply_sale_operation(uuid, text, text, jsonb) from public, anon;
grant execute on function public.apply_sale_operation(uuid, text, text, jsonb) to authenticated;

commit;
