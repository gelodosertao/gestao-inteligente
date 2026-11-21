create table if not exists public.nfe_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  sale_id text not null,
  issuer_cnpj text not null check (issuer_cnpj ~ '^[0-9]{14}$'),
  model smallint not null default 55 check (model = 55),
  series integer not null check (series > 0),
  number integer not null check (number > 0),
  status text not null check (status in ('reserved', 'transmitting', 'unknown', 'authorized', 'rejected', 'cancel_unknown', 'cancelled')),
  access_key text check (access_key is null or access_key ~ '^[0-9]{44}$'),
  protocol text,
  authorized_xml text,
  cancellation_receipt jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  cancelled_at timestamptz,
  unique (tenant_id, sale_id),
  unique (issuer_cnpj, model, series, number),
  foreign key (tenant_id, sale_id) references public.sales(tenant_id, id)
);

create unique index if not exists nfe_documents_access_key_uidx
  on public.nfe_documents (access_key) where access_key is not null;

alter table public.nfe_documents enable row level security;
revoke all on public.nfe_documents from public, anon, authenticated;
grant select, insert, update on public.nfe_documents to service_role;

alter table public.sales add column if not exists nfe_protocol text;

create or replace function public.reserve_nfe_issue(p_tenant_id uuid, p_sale_id text, p_issuer_cnpj text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_document public.nfe_documents%rowtype;
  v_number integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Fiscal service only' using errcode = '42501';
  end if;

  select * into v_sale from public.sales
  where id = p_sale_id and tenant_id = p_tenant_id for update;
  if not found or v_sale.source is distinct from 'ATACADO'
      or v_sale.status is distinct from 'Completed' then
    raise exception 'Completed wholesale sale not found' using errcode = 'P0002';
  end if;
  if nullif(v_sale.nfe_number, '') is not null
      or coalesce(v_sale.nfe_status, '') <> 'nao_emitir' then
    raise exception 'Sale already has fiscal data' using errcode = '23514';
  end if;

  select * into v_document from public.nfe_documents
  where tenant_id = p_tenant_id and sale_id = p_sale_id;
  if found then
    return jsonb_build_object('number', v_document.number, 'status', v_document.status,
      'accessKey', v_document.access_key, 'created', false);
  end if;

  insert into public.nfe_counters (series, last_nnf) values (1, 1)
  on conflict (series) do update set last_nnf = public.nfe_counters.last_nnf + 1
  returning last_nnf into v_number;

  insert into public.nfe_documents (tenant_id, sale_id, issuer_cnpj, series, number, status)
  values (p_tenant_id, p_sale_id, p_issuer_cnpj, 1, v_number, 'reserved');

  update public.sales set nfe_number = v_number::text, nfe_series = '1',
    nfe_status = 'pendente_emissao'
  where id = p_sale_id and tenant_id = p_tenant_id;

  return jsonb_build_object('number', v_number, 'status', 'reserved', 'created', true);
end;
$$;

revoke all on function public.reserve_nfe_issue(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_nfe_issue(uuid, text, text) to service_role;
do $$
begin
  if to_regprocedure('public.cancel_nfe_counter(integer)') is not null then
    revoke all on function public.cancel_nfe_counter(integer)
      from public, anon, authenticated, service_role;
  end if;
end;
$$;

create or replace function public.prepare_nfe_issue(p_tenant_id uuid, p_sale_id text, p_access_key text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' or p_access_key !~ '^[0-9]{44}$' then
    raise exception 'Invalid fiscal preparation' using errcode = '42501';
  end if;
  update public.nfe_documents set access_key = p_access_key, status = 'transmitting'
  where tenant_id = p_tenant_id and sale_id = p_sale_id and status = 'reserved';
  if not found then raise exception 'Fiscal issue is not reserved' using errcode = '23514'; end if;
  update public.sales set invoice_key = p_access_key
  where tenant_id = p_tenant_id and id = p_sale_id;
end;
$$;

revoke all on function public.prepare_nfe_issue(uuid, text, text) from public, anon, authenticated;
grant execute on function public.prepare_nfe_issue(uuid, text, text) to service_role;

create or replace function public.complete_nfe_issue(
  p_tenant_id uuid, p_sale_id text, p_status text, p_protocol text default null,
  p_xml text default null, p_error text default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.nfe_documents%rowtype;
begin
  if auth.role() <> 'service_role' or p_status not in ('authorized', 'unknown', 'rejected') then
    raise exception 'Invalid fiscal completion' using errcode = '42501';
  end if;
  select * into v_document from public.nfe_documents
  where tenant_id = p_tenant_id and sale_id = p_sale_id for update;
  if not found or v_document.status <> 'transmitting' then
    raise exception 'Fiscal issue is not transmitting' using errcode = '23514';
  end if;
  if p_status = 'authorized' and (
    v_document.access_key is null or nullif(p_protocol, '') is null or nullif(p_xml, '') is null
  ) then
    raise exception 'Authorized XML and protocol are required' using errcode = '23514';
  end if;

  update public.nfe_documents set status = p_status, protocol = p_protocol,
    authorized_xml = p_xml, last_error = left(p_error, 1000),
    authorized_at = case when p_status = 'authorized' then now() else null end
  where id = v_document.id;

  update public.sales set
    nfe_status = case p_status when 'authorized' then 'autorizada'
      when 'unknown' then 'pendente_consulta' else 'rejeitada' end,
    has_invoice = p_status = 'authorized',
    nfe_protocol = case when p_status = 'authorized' then p_protocol else nfe_protocol end,
    nfe_xml = case when p_status = 'authorized' then p_xml else nfe_xml end,
    nfe_issued_at = case when p_status = 'authorized' then now() else nfe_issued_at end
  where tenant_id = p_tenant_id and id = p_sale_id;
end;
$$;

revoke all on function public.complete_nfe_issue(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_nfe_issue(uuid, text, text, text, text, text) to service_role;

create or replace function public.complete_nfe_cancellation(
  p_tenant_id uuid, p_sale_id text, p_status text, p_receipt jsonb default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' or p_status not in ('cancelled', 'cancel_unknown') then
    raise exception 'Invalid cancellation result' using errcode = '42501';
  end if;
  if p_status = 'cancelled' and p_receipt is null then
    raise exception 'Cancellation receipt is required' using errcode = '23514';
  end if;
  update public.nfe_documents set status = p_status,
    cancellation_receipt = coalesce(p_receipt, cancellation_receipt),
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where tenant_id = p_tenant_id and sale_id = p_sale_id and status = 'authorized';
  if not found then raise exception 'Authorized NF-e not found' using errcode = '23514'; end if;
  update public.sales set nfe_status = case p_status when 'cancelled' then 'cancelada'
    else 'pendente_cancelamento' end
  where tenant_id = p_tenant_id and id = p_sale_id;
end;
$$;

revoke all on function public.complete_nfe_cancellation(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_nfe_cancellation(uuid, text, text, jsonb) to service_role;

create or replace function public.protect_nfe_sale_fields()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.role() <> 'service_role' and new.source = 'ATACADO' then
      new.has_invoice := false;
      new.invoice_key := null;
      new.invoice_url := null;
      new.nfe_number := null;
      new.nfe_series := null;
      new.nfe_status := 'nao_emitir';
      new.nfe_xml := null;
      new.nfe_protocol := null;
      new.nfe_issued_at := null;
    end if;
    return new;
  end if;
  if nullif(old.nfe_number, '') is not null and (
    new.items is distinct from old.items or new.total is distinct from old.total or
    new.discount is distinct from old.discount or new.delivery_fee is distinct from old.delivery_fee or
    new.customer_name is distinct from old.customer_name or
    new.customer_details is distinct from old.customer_details
  ) then
    raise exception 'Fiscal sale values are immutable' using errcode = '23514';
  end if;
  if auth.role() <> 'service_role' then
    new.has_invoice := old.has_invoice;
    new.invoice_key := old.invoice_key;
    new.invoice_url := old.invoice_url;
    new.nfe_number := old.nfe_number;
    new.nfe_series := old.nfe_series;
    new.nfe_status := old.nfe_status;
    new.nfe_xml := old.nfe_xml;
    new.nfe_protocol := old.nfe_protocol;
    new.nfe_issued_at := old.nfe_issued_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_nfe_sale_fields on public.sales;
create trigger protect_nfe_sale_fields before insert or update on public.sales
for each row execute function public.protect_nfe_sale_fields();

create or replace function public.protect_nfe_sale_delete()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.nfe_documents where tenant_id = old.tenant_id and sale_id = old.id) then
    raise exception 'Fiscal sale cannot be deleted' using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_nfe_sale_delete on public.sales;
create trigger protect_nfe_sale_delete before delete on public.sales
for each row execute function public.protect_nfe_sale_delete();

create or replace function public.protect_authorized_nfe_items()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_sale_id text;
  v_tenant_id uuid;
begin
  if tg_op = 'DELETE' then
    v_sale_id := old.sale_id;
    v_tenant_id := old.tenant_id;
  else
    v_sale_id := new.sale_id;
    v_tenant_id := new.tenant_id;
  end if;
  if exists (
    select 1 from public.sales where id = v_sale_id and tenant_id = v_tenant_id
      and nullif(nfe_number, '') is not null
  ) then
    raise exception 'Items of a fiscal sale are immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_authorized_nfe_items on public.sale_items;
create trigger protect_authorized_nfe_items before insert or update or delete on public.sale_items
for each row execute function public.protect_authorized_nfe_items();
