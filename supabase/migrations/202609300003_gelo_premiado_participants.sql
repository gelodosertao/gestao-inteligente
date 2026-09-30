-- Identifica a distribuidora ou adega de cada placa sem alterar os códigos já emitidos.
alter table public.gelo_premiado_codes
  add column if not exists participant_name text;

alter table public.gelo_premiado_codes
  drop constraint if exists gelo_premiado_participant_name_check;
alter table public.gelo_premiado_codes
  add constraint gelo_premiado_participant_name_check
  check (participant_name is null or char_length(btrim(participant_name)) between 2 and 100);

create or replace function public.gelo_premiado_create(
  p_prize text,
  p_quantity integer,
  p_participant_name text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant text;
  v_participant text;
  v_codes jsonb;
  v_created integer;
begin
  v_tenant := public.gelo_premiado_admin_tenant();
  v_participant := btrim(coalesce(p_participant_name, ''));
  if char_length(v_participant) not between 2 and 100 then
    raise exception 'Informe o nome da distribuidora ou adega, entre 2 e 100 caracteres' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_prize, ''))) not between 3 and 120 then
    raise exception 'Informe um prêmio entre 3 e 120 caracteres' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 1 and 100 then
    raise exception 'A quantidade deve ser de 1 a 100' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(40219, 15092);
  with available as (
    select 'GS-' || lpad(n::text, 4, '0') as code
    from generate_series(0, 9999) as digits(n)
    where not exists (
      select 1 from public.gelo_premiado_codes existing
      where existing.code = 'GS-' || lpad(n::text, 4, '0')
    )
    order by random()
    limit p_quantity
  ), created as (
    insert into public.gelo_premiado_codes
      (tenant_id, code, prize, participant_name, created_by)
    select v_tenant, available.code, btrim(p_prize), v_participant, auth.uid()
    from available
    returning code
  )
  select coalesce(jsonb_agg(code order by code), '[]'::jsonb), count(*)::integer
    into v_codes, v_created
    from created;

  if v_created <> p_quantity then
    raise exception 'Não há códigos GS disponíveis para este lote' using errcode = '22023';
  end if;
  return v_codes;
end;
$$;

-- A assinatura antiga permitiria gerar placas sem participante.
drop function public.gelo_premiado_create(text, integer);
revoke all on function public.gelo_premiado_create(text, integer, text) from public;
grant execute on function public.gelo_premiado_create(text, integer, text) to authenticated;

create or replace function public.gelo_premiado_list()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_tenant text; v_rows jsonb;
begin
  v_tenant := public.gelo_premiado_admin_tenant();
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
    into v_rows
  from (select id, code, prize, participant_name, created_at, delivered_at, delivery_note
        from public.gelo_premiado_codes
        where tenant_id = v_tenant
        order by created_at desc limit 500) c;
  return v_rows;
end;
$$;

revoke all on function public.gelo_premiado_list() from public;
grant execute on function public.gelo_premiado_list() to authenticated;
