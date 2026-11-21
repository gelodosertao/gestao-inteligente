begin;

-- Retire Filial only from new inventory commands. Existing balances, movements,
-- sales and financial records remain intact, without redistribution or deletion.
alter function public.mutate_inventory_stock(jsonb) rename to mutate_inventory_stock_v1_private;
revoke all on function public.mutate_inventory_stock_v1_private(jsonb) from public, anon, authenticated;

create function public.mutate_inventory_stock(p_operation jsonb)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_action text := p_operation ->> 'action';
begin
  if v_action = 'transfer' then
    if p_operation ->> 'fromDeposit' is null
      or p_operation ->> 'fromDeposit' not in ('Ibotirama', 'Barreiras')
      or p_operation ->> 'toDeposit' is null
      or p_operation ->> 'toDeposit' not in ('Ibotirama', 'Barreiras') then
      raise exception using errcode = '22023', message = 'Selecione origem e destino entre Ibotirama e Barreiras.';
    end if;
  elsif v_action in ('loss', 'adjust') then
    if p_operation ->> 'deposit' is null
      or p_operation ->> 'deposit' not in ('Ibotirama', 'Barreiras') then
      raise exception using errcode = '22023', message = 'Selecione o depósito Ibotirama ou Barreiras.';
    end if;
  end if;
  perform public.mutate_inventory_stock_v1_private(p_operation);
end $$;
revoke all on function public.mutate_inventory_stock(jsonb) from public, anon;
grant execute on function public.mutate_inventory_stock(jsonb) to authenticated;

alter function public.receive_inventory_xml(uuid, text, text, jsonb) rename to receive_inventory_xml_v1_private;
revoke all on function public.receive_inventory_xml_v1_private(uuid, text, text, jsonb) from public, anon, authenticated;

create function public.receive_inventory_xml(p_operation_id uuid, p_invoice_key text, p_deposit text, p_items jsonb)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if p_deposit is null or p_deposit not in ('Ibotirama', 'Barreiras') then
    raise exception using errcode = '22023', message = 'Receba a nota no depósito Ibotirama ou Barreiras.';
  end if;
  perform public.receive_inventory_xml_v1_private(p_operation_id, p_invoice_key, p_deposit, p_items);
end $$;
revoke all on function public.receive_inventory_xml(uuid, text, text, jsonb) from public, anon;
grant execute on function public.receive_inventory_xml(uuid, text, text, jsonb) to authenticated;

alter function public.create_inventory_product(uuid, jsonb, uuid) rename to create_inventory_product_v1_private;
revoke all on function public.create_inventory_product_v1_private(uuid, jsonb, uuid) from public, anon, authenticated;

create function public.create_inventory_product(p_operation_id uuid, p_product jsonb, p_tenant_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if coalesce((p_product ->> 'stockFilial')::numeric, 0) <> 0 then
    raise exception using errcode = '22023', message = 'Novos produtos podem ter saldo inicial somente em Ibotirama e Barreiras.';
  end if;
  perform public.create_inventory_product_v1_private(p_operation_id, p_product, p_tenant_id);
end $$;
revoke all on function public.create_inventory_product(uuid, jsonb, uuid) from public, anon;
grant execute on function public.create_inventory_product(uuid, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
