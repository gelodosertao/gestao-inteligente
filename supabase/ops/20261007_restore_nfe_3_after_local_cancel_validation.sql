-- One-time repair for homologation NF-e 2/3. The cancellation failed XSD validation
-- before signing, persistence, or transmission. Keep the authorized XML/protocol.
begin;

do $$
declare
  v_sale_id constant text := '76f07106-f98a-4124-b512-9fcaba354e30';
  v_doc public.nfe_documents%rowtype;
  v_sale public.sales%rowtype;
begin
  select * into v_doc from public.nfe_documents
    where sale_id = v_sale_id and environment = 2 and series = 2 and number = 3
    for update;
  if not found or v_doc.status <> 'cancel_unknown'
      or v_doc.cancellation_signed_xml is not null or v_doc.cancellation_xml is not null
      or v_doc.cancellation_receipt is not null or v_doc.cancelled_at is not null
      or nullif(v_doc.protocol, '') is null or nullif(v_doc.authorized_xml, '') is null then
    raise exception 'Preflight failed: cancellation may have been transmitted or invoice state changed';
  end if;

  select * into v_sale from public.sales
    where tenant_id = v_doc.tenant_id and id = v_doc.sale_id for update;
  if not found or v_sale.nfe_environment <> 2
      or v_sale.nfe_status <> 'pendente_cancelamento'
      or v_sale.nfe_protocol is distinct from v_doc.protocol then
    raise exception 'Preflight failed: sale and authorized invoice differ';
  end if;

  update public.nfe_documents set status = 'authorized' where id = v_doc.id;
  update public.sales set nfe_status = 'autorizada'
    where tenant_id = v_doc.tenant_id and id = v_doc.sale_id;
  insert into public.nfe_attempts(document_id, action, result)
    values (v_doc.id, 'authorized', jsonb_build_object(
      'repair', 'local_cancellation_xsd_error',
      'reason', 'No signed cancellation event or receipt existed; no event was transmitted'));
end $$;

commit;
