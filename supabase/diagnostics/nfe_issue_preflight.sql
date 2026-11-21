select jsonb_build_object(
  'counter', (select coalesce(jsonb_agg(jsonb_build_object('series', series, 'last_nnf', last_nnf)), '[]'::jsonb)
    from public.nfe_counters),
  'numeric_sale_numbers', (select coalesce(max(nfe_number::integer), 0)
    from public.sales where nfe_number ~ '^[0-9]{1,9}$' and coalesce(nfe_series, '1') = '1'),
  'sale_statuses', (select coalesce(jsonb_object_agg(nfe_status, total), '{}'::jsonb)
    from (select coalesce(nfe_status, '<null>') as nfe_status, count(*) as total
      from public.sales group by 1) counts),
  'authorized_without_xml', (select count(*) from public.sales
    where nfe_status = 'autorizada' and nullif(nfe_xml, '') is null),
  'increment_rpc', to_regprocedure('public.increment_nfe_counter(integer)') is not null,
  'cancel_rpc', to_regprocedure('public.cancel_nfe_counter(integer)') is not null,
  'existing_documents', to_regclass('public.nfe_documents') is not null
) as nfe_preflight;
