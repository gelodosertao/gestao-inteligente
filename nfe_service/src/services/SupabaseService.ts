import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

export interface CustomerData {
  id: string;
  razao_social?: string;
  establishment_name?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  inscricao_estadual?: string;
  cpf_cnpj?: string;
}

interface SaleRow {
  id: string;
  date: string;
  customer_name: string;
  total: number;
  branch: string;
  status: string;
  payment_method: string;
  nfe_status: string;
  nfe_number: string;
  nfe_series: string;
  tenant_id: string;
  invoice_key?: string;
  invoice_url?: string;
  nfe_xml?: string;
  nfe_issued_at?: string;
  payment_splits?: { method: string; amount: number }[];
  discount?: number;
  delivery_fee?: number;
  amount_paid?: number;
}

interface SaleItemRow {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_at_sale: number;
  ncm: string;
  cfop: string;
  cst: string;
  selected_options: any;
  notes: string;
}

export interface SaleWithItems {
  sale: SaleRow;
  items: SaleItemRow[];
}

const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey);

export async function getSaleWithItems(saleId: string, tenantId: string): Promise<SaleWithItems> {
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .eq('tenant_id', tenantId)
    .single();

  if (saleError || !sale) {
    throw new Error(`Venda não encontrada: ${saleError?.message || saleId}`);
  }

  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('*')
    .eq('sale_id', saleId)
    .eq('tenant_id', tenantId);

  if (itemsError) {
    throw new Error(`Erro ao buscar itens da venda: ${itemsError.message}`);
  }

  return { sale, items: items || [] };
}

export async function findCustomerByDoc(doc: string, tenantId: string): Promise<CustomerData | null> {
  const cleanDoc = doc.replace(/\D/g, '');
  if (!cleanDoc) return null;

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`cpf_cnpj.eq.${cleanDoc},cpf_cnpj.eq.${cleanDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')},cpf_cnpj.eq.${cleanDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`)
    .maybeSingle();

  if (error) {
    console.error(`[SupabaseService] Erro ao buscar cliente por documento: ${error.message}`);
    return null;
  }

  return data || null;
}

export interface NfeXmlEntry {
  id: string;
  customer_name: string;
  date: string;
  total: number;
  nfe_xml?: string;
  invoice_key?: string;
  nfe_number?: string;
  nfe_issued_at?: string;
}

export async function* getPaginatedNfeXmlsByMonth(ano: number, mes: number, tenantId: string, batchSize = 100): AsyncGenerator<NfeXmlEntry[], void, unknown> {
  const start = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const end = mes === 12
    ? `${ano + 1}-01-01`
    : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('nfe_documents')
      .select('id, sale_id, authorized_xml, access_key, number, authorized_at')
      .eq('status', 'authorized')
      .eq('tenant_id', tenantId)
      .eq('environment', env.sefazAmbiente)
      .not('authorized_xml', 'is', null)
      .gte('authorized_at', start)
      .lt('authorized_at', end)
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(`Erro ao buscar XMLs do período: ${error.message}`);
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    yield data.map(row => ({ id: row.id, customer_name: '', date: row.authorized_at || '', total: 0,
      nfe_xml: row.authorized_xml, invoice_key: row.access_key, nfe_number: String(row.number), nfe_issued_at: row.authorized_at || '' }));

    if (data.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }
}

export interface VendaRelatorio {
  id: string;
  data: string;
  cliente: string;
  total: number;
  forma_pagamento: string;
  parcelas: { metodo: string; valor: number }[];
  desconto: number;
  taxa_entrega: number;
  valor_pago: number;
  nfe_chave: string;
  nfe_numero: string;
}

export interface RelatorioMensal {
  periodo: { ano: number; mes: number };
  resumo: {
    total_vendas: number;
    valor_total: number;
    valor_medio: number;
  };
  formas_pagamento: {
    metodo: string;
    quantidade: number;
    valor_total: number;
  }[];
  vendas: VendaRelatorio[];
}

export async function getSalesReportByMonth(ano: number, mes: number, tenantId: string): Promise<RelatorioMensal> {
  const start = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const end = mes === 12
    ? `${ano + 1}-01-01`
    : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('sales')
    .select('id, date, customer_name, total, payment_method, payment_splits, discount, delivery_fee, amount_paid, invoice_key, nfe_number')
    .eq('nfe_status', 'autorizada')
    .eq('tenant_id', tenantId)
    .eq('nfe_environment', env.sefazAmbiente)
    .gte('nfe_issued_at', start)
    .lt('nfe_issued_at', end);

  if (error) {
    throw new Error(`Erro ao buscar vendas do período: ${error.message}`);
  }

  const rows = data || [];

  const vendas: VendaRelatorio[] = rows.map(r => ({
    id: r.id,
    data: r.date || '',
    cliente: r.customer_name || '',
    total: r.total || 0,
    forma_pagamento: r.payment_method || '',
    parcelas: (r.payment_splits as { method: string; amount: number }[] | null)?.map(s => ({ metodo: s.method, valor: s.amount })) || [],
    desconto: r.discount || 0,
    taxa_entrega: r.delivery_fee || 0,
    valor_pago: r.amount_paid || r.total || 0,
    nfe_chave: r.invoice_key || '',
    nfe_numero: r.nfe_number || '',
  }));

  const valorTotal = vendas.reduce((s, v) => s + v.total, 0);

  const pagamentoMap = new Map<string, { quantidade: number; valor_total: number }>();
  for (const v of vendas) {
    const metodos = v.parcelas.length > 0
      ? v.parcelas.map(p => p.metodo)
      : [v.forma_pagamento];

    const valores = v.parcelas.length > 0
      ? v.parcelas.map(p => p.valor)
      : [v.total];

    for (let i = 0; i < metodos.length; i++) {
      const m = metodos[i];
      const existing = pagamentoMap.get(m) || { quantidade: 0, valor_total: 0 };
      existing.quantidade += (i === 0 ? 1 : 0);
      existing.valor_total += valores[i];
      pagamentoMap.set(m, existing);
    }
  }

  const formas_pagamento = Array.from(pagamentoMap.entries()).map(([metodo, dados]) => ({
    metodo,
    quantidade: dados.quantidade,
    valor_total: dados.valor_total,
  }));

  return {
    periodo: { ano, mes },
    resumo: {
      total_vendas: vendas.length,
      valor_total: valorTotal,
      valor_medio: vendas.length > 0 ? valorTotal / vendas.length : 0,
    },
    formas_pagamento,
    vendas,
  };
}

export interface NfeCancelData {
  saleId: string;
  invoiceKey: string;
  nfeProtocol: string;
  customerName: string;
}

export async function getSaleNfeForCancel(saleId: string, tenantId: string): Promise<NfeCancelData> {
  const { data, error } = await supabase.from('nfe_documents')
    .select('access_key, protocol, status, sale_id')
    .eq('sale_id', saleId).eq('tenant_id', tenantId).eq('environment', env.sefazAmbiente).single();

  if (error || !data) {
    throw new Error(`Venda não encontrada: ${error?.message || saleId}`);
  }

  if (!data.access_key || !data.protocol || data.status !== 'authorized') {
    throw new Error(`NF-e não emitida para venda ${saleId}. Emita a NF-e primeiro.`);
  }

  return {
    saleId: data.sale_id,
    invoiceKey: data.access_key,
    nfeProtocol: data.protocol,
    customerName: '',
  };
}

export async function getNfeIssue(saleId: string, tenantId: string): Promise<{ access_key: string | null; status: string; protocol: string | null; signed_xml: string | null; cancellation_signed_xml: string | null; last_error: string | null }> {
  const { data, error } = await supabase.from('nfe_documents')
    .select('access_key, status, protocol, signed_xml, cancellation_signed_xml, last_error')
    .eq('sale_id', saleId).eq('tenant_id', tenantId).eq('environment', env.sefazAmbiente).single();
  if (error || !data) throw new Error('Tentativa fiscal não encontrada para esta venda.');
  return data;
}

export async function completeNfeCancellation(
  saleId: string, tenantId: string, status: 'cancelled' | 'cancel_unknown', receipt?: unknown,
): Promise<void> {
  const { error } = await supabase.rpc('complete_nfe_cancellation_v2', {
    p_tenant_id: tenantId, p_sale_id: saleId, p_environment: env.sefazAmbiente, p_status: status,
    p_receipt: receipt ?? null,
  });
  if (error) throw new Error(`Falha ao registrar cancelamento fiscal: ${error.message}`);
}

export async function prepareNfeCancellation(saleId: string, tenantId: string, signedEvent: string): Promise<void> {
  const { error } = await supabase.rpc('prepare_nfe_cancellation_v2', {
    p_tenant_id: tenantId, p_sale_id: saleId, p_environment: env.sefazAmbiente, p_signed_event: signedEvent,
  });
  if (error) throw new Error(`Falha ao persistir evento assinado: ${error.message}`);
}

export async function updateSaleNfeStatus(
  saleId: string,
  nfeStatus: string,
  tenantId: string,
  invoiceKey?: string,
  invoiceUrl?: string,
  nfeNumber?: string,
  nfeXml?: string
): Promise<void> {
  const updateData: Record<string, any> = { nfe_status: nfeStatus };

  if (invoiceKey) updateData.invoice_key = invoiceKey;
  if (invoiceUrl) updateData.invoice_url = invoiceUrl;
  if (nfeNumber) updateData.nfe_number = nfeNumber;
  if (nfeXml) updateData.nfe_xml = nfeXml;
  if (nfeStatus === 'autorizada') {
    updateData.has_invoice = true;
    updateData.nfe_issued_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('sales')
    .update(updateData)
    .eq('id', saleId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Erro ao atualizar status NF-e: ${error.message}`);
  }
}
