import { fiscalApiUrl, fiscalHeaders } from './invoiceService';

export interface ProductProfile {
  product_id: string; ncm: string; cest: string | null; origin: number; unit: string;
  valid_from: string; valid_until: string | null; approved: boolean; approval_reference: string | null;
}
export interface IssuerSettings {
  environment: 1 | 2; issuer_cnpj: string; series: number; series_confirmed: boolean;
  series_confirmation_reference: string | null; config: Record<string, any>;
}
export interface FiscalRule {
  operation: string; valid_from: string; valid_until: string; approved: boolean;
  approval_reference: string | null; config: Record<string, any>;
}
export interface FiscalConsoleData {
  products: { id: string; name: string; category: string }[];
  profiles: ProductProfile[]; issuers: IssuerSettings[]; rules: FiscalRule[];
  documents: { sale_id: string; environment: 1 | 2; series: number; number: number;
    status: 'authorized' | 'cancel_unknown' | 'cancelled'; access_key: string | null;
    protocol: string | null; authorized_at: string | null; cancelled_at: string | null;
    sale: { id: string; customer_name: string; total: number; date: string } | null }[];
  serviceEnvironment: 1 | 2;
}

async function request<T>(method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const response = await fetch(fiscalApiUrl('/api/nfe/configuracoes'), {
    method, headers: { 'Content-Type': 'application/json', ...await fiscalHeaders() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok || !result.sucesso) throw new Error(result.erro || 'Configuração fiscal indisponível.');
  return result.dados as T;
}

export const fiscalConfigurationService = {
  load: () => request<FiscalConsoleData>('GET'),
  save: (input: unknown) => request<FiscalConsoleData>('POST', input),
  async searchDocuments(term: string): Promise<FiscalConsoleData['documents']> {
    const response = await fetch(fiscalApiUrl(`/api/nfe/configuracoes/notas?busca=${encodeURIComponent(term)}`), {
      headers: await fiscalHeaders(),
    });
    const result = await response.json();
    if (!response.ok || !result.sucesso) throw new Error(result.erro || 'Consulta de notas indisponível.');
    return result.dados;
  },
  async cancel(saleId: string, justification: string): Promise<{ message?: string; receipt?: unknown }> {
    const response = await fetch(fiscalApiUrl(`/api/nfe/cancelar/${saleId}`), {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...await fiscalHeaders() },
      body: JSON.stringify({ justificativa: justification }),
    });
    const result = await response.json();
    if (!response.ok || !result.sucesso) throw new Error(result.erro || 'Cancelamento não confirmado pela SEFAZ. Consulte a situação da nota antes de tentar novamente.');
    return result.dados;
  },
  async consult(saleId: string): Promise<{ statusLocal?: string; message?: string }> {
    const response = await fetch(fiscalApiUrl(`/api/nfe/consultar/${saleId}`), {
      headers: await fiscalHeaders(),
    });
    const result = await response.json();
    if (!response.ok || !result.sucesso) throw new Error(result.erro || 'Consulta à SEFAZ indisponível.');
    return result.dados;
  },
};
