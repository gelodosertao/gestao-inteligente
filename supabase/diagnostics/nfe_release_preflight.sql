-- Read-only checks after applying both NF-e migrations. No customer or XML data is returned.
select environment, issuer_cnpj, series, series_confirmed, series_confirmation_reference,
       (config->>'crt')::integer as crt,
       nullif(config->>'name', '') is not null as has_name,
       nullif(config->>'ie', '') is not null as has_ie
from public.nfe_issuer_settings
where issuer_cnpj = '47026674000129'
order by environment;

select tenant_id, operation, valid_from, valid_until, approved, approval_reference,
       config->>'cfop' as cfop, config->>'csosn' as csosn,
       config->'pis'->>'cst' as pis_cst, config->'cofins'->>'cst' as cofins_cst,
       config->'ibsCbs'->>'mode' as ibs_cbs_mode
from public.nfe_fiscal_rules
where operation = 'internal_b2b_own_production'
order by tenant_id, valid_from;

select tenant_id, count(*) as product_profiles,
       count(*) filter (where approved) as approved_product_profiles
from public.nfe_product_profiles group by tenant_id;

select issuer_cnpj, environment, series, last_number
from public.nfe_sequences
where issuer_cnpj = '47026674000129'
order by environment, series;

select environment, status, count(*) as documents
from public.nfe_documents
where issuer_cnpj = '47026674000129'
group by environment, status order by environment, status;
