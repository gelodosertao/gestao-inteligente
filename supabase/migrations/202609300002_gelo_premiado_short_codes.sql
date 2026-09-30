-- Somente novos códigos usam GS-0000..GS-9999; códigos GP já emitidos continuam válidos.
create or replace function public.gelo_premiado_create(p_prize text, p_quantity integer)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant text;
  v_codes jsonb;
  v_created integer;
begin
  v_tenant := public.gelo_premiado_admin_tenant();
  if char_length(btrim(coalesce(p_prize, ''))) not between 3 and 120 then
    raise exception 'Informe um prêmio entre 3 e 120 caracteres' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 1 and 100 then
    raise exception 'A quantidade deve ser de 1 a 100' using errcode = '22023';
  end if;

  -- Serializa lotes concorrentes: o espaço GS comporta no máximo 10 mil códigos.
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
    insert into public.gelo_premiado_codes (tenant_id, code, prize, created_by)
    select v_tenant, available.code, btrim(p_prize), auth.uid()
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

revoke all on function public.gelo_premiado_create(text, integer) from public;
grant execute on function public.gelo_premiado_create(text, integer) to authenticated;
