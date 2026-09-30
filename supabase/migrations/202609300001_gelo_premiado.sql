-- Campanha isolada: códigos premiados e operações de consulta/administração.
create table if not exists public.gelo_premiado_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  code text not null unique,
  prize text not null check (char_length(btrim(prize)) between 3 and 120),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  delivered_at timestamptz,
  delivered_by uuid,
  delivery_note text,
  constraint gelo_premiado_delivery_consistent check (
    (delivered_at is null and delivered_by is null) or
    (delivered_at is not null and delivered_by is not null)
  )
);

create index if not exists gelo_premiado_codes_tenant_created_idx
  on public.gelo_premiado_codes (tenant_id, created_at desc);

alter table public.gelo_premiado_codes enable row level security;
revoke all on public.gelo_premiado_codes from anon, authenticated;

create or replace function public.gelo_premiado_validate(p_code text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_code public.gelo_premiado_codes%rowtype;
begin
  if p_code is null or length(btrim(p_code)) > 32 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_code from public.gelo_premiado_codes
  where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if v_code.delivered_at is not null then
    return jsonb_build_object('status', 'delivered');
  end if;
  return jsonb_build_object('status', 'valid', 'prize', v_code.prize);
end;
$$;

create or replace function public.gelo_premiado_admin_tenant()
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_user public.app_users%rowtype;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária' using errcode = '28000'; end if;
  select * into v_user from public.app_users where id = auth.uid()::text;
  if not found or not v_user.is_active or v_user.must_change_password or v_user.role <> 'ADMIN' then
    raise exception 'Acesso restrito a administradores ativos' using errcode = '42501';
  end if;
  return v_user.tenant_id::text;
end;
$$;

create or replace function public.gelo_premiado_create(p_prize text, p_quantity integer)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_tenant text; v_codes jsonb := '[]'::jsonb; v_code text; v_index integer;
begin
  v_tenant := public.gelo_premiado_admin_tenant();
  if char_length(btrim(coalesce(p_prize, ''))) not between 3 and 120 then
    raise exception 'Informe um prêmio entre 3 e 120 caracteres' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 1 and 100 then
    raise exception 'A quantidade deve ser de 1 a 100' using errcode = '22023';
  end if;
  for v_index in 1..p_quantity loop
    v_code := 'GP-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 24));
    insert into public.gelo_premiado_codes (tenant_id, code, prize, created_by)
    values (v_tenant, v_code, btrim(p_prize), auth.uid());
    v_codes := v_codes || to_jsonb(v_code);
  end loop;
  return v_codes;
end;
$$;

create or replace function public.gelo_premiado_summary()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_tenant text; v_total integer; v_pending integer; v_delivered integer;
begin
  v_tenant := public.gelo_premiado_admin_tenant();
  select count(*)::integer,
         count(*) filter (where delivered_at is null)::integer,
         count(*) filter (where delivered_at is not null)::integer
    into v_total, v_pending, v_delivered
    from public.gelo_premiado_codes where tenant_id = v_tenant;
  return jsonb_build_object('total', v_total, 'pending', v_pending, 'delivered', v_delivered);
end;
$$;

create or replace function public.gelo_premiado_list()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_tenant text; v_rows jsonb;
begin
  v_tenant := public.gelo_premiado_admin_tenant();
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
    into v_rows
  from (select id, code, prize, created_at, delivered_at, delivery_note
        from public.gelo_premiado_codes
        where tenant_id = v_tenant
        order by created_at desc limit 500) c;
  return v_rows;
end;
$$;

create or replace function public.gelo_premiado_deliver(p_id uuid, p_note text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_tenant text; v_code public.gelo_premiado_codes%rowtype;
begin
  v_tenant := public.gelo_premiado_admin_tenant();
  if char_length(btrim(coalesce(p_note, ''))) not between 5 and 300 then
    raise exception 'Registre uma observação de 5 a 300 caracteres' using errcode = '22023';
  end if;
  select * into v_code from public.gelo_premiado_codes
    where id = p_id and tenant_id = v_tenant for update;
  if not found then raise exception 'Código não encontrado' using errcode = 'P0002'; end if;
  if v_code.delivered_at is not null then
    return jsonb_build_object('status', 'already_delivered');
  end if;
  update public.gelo_premiado_codes
    set delivered_at = now(), delivered_by = auth.uid(), delivery_note = btrim(p_note)
    where id = p_id;
  return jsonb_build_object('status', 'delivered');
end;
$$;

revoke all on function public.gelo_premiado_validate(text) from public;
revoke all on function public.gelo_premiado_admin_tenant() from public;
revoke all on function public.gelo_premiado_create(text, integer) from public;
revoke all on function public.gelo_premiado_list() from public;
revoke all on function public.gelo_premiado_summary() from public;
revoke all on function public.gelo_premiado_deliver(uuid, text) from public;
grant execute on function public.gelo_premiado_validate(text) to anon, authenticated;
grant execute on function public.gelo_premiado_admin_tenant() to authenticated;
grant execute on function public.gelo_premiado_create(text, integer) to authenticated;
grant execute on function public.gelo_premiado_list() to authenticated;
grant execute on function public.gelo_premiado_summary() to authenticated;
grant execute on function public.gelo_premiado_deliver(uuid, text) to authenticated;
