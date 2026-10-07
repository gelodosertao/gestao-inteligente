-- Configuracao fiscal informada pelo responsavel em 2026-10-06.
-- Aplica-se apenas aos oito produtos exibidos no PDV Atacado da GDS.
-- Nao aprova venda a prazo nem regras de 2027.
begin;
set local lock_timeout = '5s';

do $setup$
declare
  v_tenant constant uuid := '00000000-0000-0000-0000-000000000000';
  v_cnpj constant text := '47026674000129';
  v_reference constant text := 'Dados fiscais aprovados pelo responsavel em 2026-10-06';
  v_count integer;
begin
  if exists (select 1 from public.nfe_sequences where issuer_cnpj = v_cnpj and series = 2)
     or exists (select 1 from public.nfe_documents where issuer_cnpj = v_cnpj and series = 2)
     or exists (select 1 from public.sales where tenant_id = v_tenant and nfe_series = '2') then
    raise exception 'Serie 2 ja possui uso registrado';
  end if;

  select count(*) into v_count from public.products
  where tenant_id = v_tenant and category in ('Gelo Cubo', 'Gelo Sabor');
  if v_count <> 8 then raise exception 'Esperados oito produtos do PDV Atacado, encontrados %', v_count; end if;

  if exists (select 1 from public.nfe_product_profiles where tenant_id = v_tenant) then
    raise exception 'Perfis fiscais existentes exigem revisao antes da carga';
  end if;

  update public.nfe_issuer_settings
     set config = jsonb_build_object(
       'crt', 1,
       'name', 'GDS PRODUTOS ALIMENTÍCIOS LTDA',
       'ie', '196074872',
       'address', jsonb_build_object(
         'street', 'ROD BA', 'number', '160', 'district', 'São João',
         'city', 'Ibotirama', 'cityCode', 2913200, 'state', 'BA',
         'zipCode', '47520000', 'phone', '7798129383'
       )
     ),
     series_confirmed = true,
     series_confirmed_at = now(),
     series_confirmation_reference = 'Responsavel confirmou em 2026-10-06 que a serie 2 nunca foi usada; termo formal a alinhar com contador',
     updated_at = now()
   where tenant_id = v_tenant and issuer_cnpj = v_cnpj and series = 2
     and environment in (1, 2) and not series_confirmed;
  get diagnostics v_count = row_count;
  if v_count <> 2 then raise exception 'Esperadas duas configuracoes de emitente, atualizadas %', v_count; end if;

  update public.nfe_fiscal_rules
     set config = jsonb_build_object(
       'cfop', '5101', 'csosn', '102',
       'nature', 'Venda de producao do estabelecimento',
       'idDest', 1, 'indFinal', 0,
       'pis', jsonb_build_object('group', 'PISOutr', 'cst', '49', 'rate', 0),
       'cofins', jsonb_build_object('group', 'COFINSOutr', 'cst', '49', 'rate', 0),
       'ibsCbs', jsonb_build_object('mode', 'none'),
       'creditApproved', false
     ),
     approved = true, approved_at = now(), approval_reference = v_reference
   where tenant_id = v_tenant and operation = 'internal_b2b_own_production'
     and valid_from = '2026-01-01' and valid_until = '2026-12-31'
     and not approved;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'Esperada uma regra fiscal inicial, atualizadas %', v_count; end if;

  insert into public.nfe_product_profiles
    (tenant_id, product_id, ncm, cest, origin, unit, approved, approved_at,
     approval_reference, valid_from)
  select v_tenant, id, '22019000', '2806200', 0, 'UN', true, now(),
    v_reference, '2026-01-01'::date
  from public.products
  where tenant_id = v_tenant and category in ('Gelo Cubo', 'Gelo Sabor');
  get diagnostics v_count = row_count;
  if v_count <> 8 then raise exception 'Esperados oito perfis fiscais, inseridos %', v_count; end if;
end $setup$;

select jsonb_build_object(
  'confirmed_series', (select count(*) from public.nfe_issuer_settings
    where tenant_id = '00000000-0000-0000-0000-000000000000' and series = 2 and series_confirmed),
  'approved_rules', (select count(*) from public.nfe_fiscal_rules
    where tenant_id = '00000000-0000-0000-0000-000000000000' and approved),
  'approved_products', (select count(*) from public.nfe_product_profiles
    where tenant_id = '00000000-0000-0000-0000-000000000000' and approved)
) as result;
commit;
