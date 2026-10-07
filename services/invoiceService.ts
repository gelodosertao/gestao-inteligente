import { FiscalContext } from '../types';
import { supabase } from './supabase';

export interface InvoiceResponse {
    success: boolean;
    message: string;
    invoiceKey?: string;
    invoiceUrl?: string;
    xmlUrl?: string;
    nfeXml?: string;
    nfeNumber?: string;
    nfeProtocol?: string;
}

const NFE_SERVICE_URL = import.meta.env.VITE_NFE_SERVICE_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

export async function fiscalHeaders(): Promise<Record<string, string>> {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) throw new Error('Sessão expirada. Entre novamente.');
    return { Authorization: `Bearer ${session.access_token}` };
}

export function fiscalApiUrl(path: string): string {
    if (!NFE_SERVICE_URL) throw new Error('Serviço fiscal não configurado neste ambiente.');
    return `${NFE_SERVICE_URL}${path}`;
}

export interface DanfeResponse {
    success: boolean;
    base64?: string;
    message: string;
}

export interface InvoiceDraftState {
    draft: { revision: number; status: string } | null;
    customerId: string | null;
    context: FiscalContext;
    issues: { field: string; message: string }[];
    canEmit: boolean;
    environment: 1 | 2;
}

async function fiscalRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(fiscalApiUrl(path), {
        method,
        headers: { 'Content-Type': 'application/json', ...await fiscalHeaders() },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok || !data.sucesso) throw new Error(data.erro || 'Não foi possível concluir a operação fiscal.');
    return data.dados as T;
}

export const invoiceService = {
    async getDraft(saleId: string): Promise<InvoiceDraftState> {
        return fiscalRequest(`/api/nfe/rascunho/${saleId}`);
    },

    async saveDraft(saleId: string, input: { customerId: string; context: FiscalContext; revision?: number }): Promise<InvoiceDraftState> {
        return fiscalRequest(`/api/nfe/rascunho/${saleId}`, 'PUT', input);
    },

    async emitInvoice(saleId: string, revision: number): Promise<InvoiceResponse> {
        const result = await fiscalRequest<Partial<InvoiceResponse>>(`/api/nfe/emitir/${saleId}`, 'POST', { revision });
        return { ...result, success: true, message: result.message || 'NF-e autorizada com sucesso.' };
    },

    async consultInvoice(saleId: string): Promise<{ message?: string; motivo?: string; cStat?: string; protocol?: string }> {
        return fiscalRequest(`/api/nfe/consultar/${saleId}`);
    },

    async getDanfe(saleId: string): Promise<DanfeResponse> {
        console.log("Buscando DANFE para venda:", saleId);

        try {
            const response = await fetch(fiscalApiUrl(`/api/nfe/danfe/${saleId}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...await fiscalHeaders() },
            });

            const data = await response.json();

            if (response.ok && data.sucesso) {
                return {
                    success: true,
                    base64: data.dados?.base64,
                    message: data.dados?.message || 'DANFE gerado com sucesso',
                };
            }

            return {
                success: false,
                message: data.erro || 'Erro ao gerar DANFE',
            };
        } catch (error) {
            console.error("Erro na comunicação com nfe_service:", error);
            return { success: false, message: 'Erro ao conectar ao serviço de DANFE.' };
        }
    },

    async cancelInvoice(saleId: string, justification: string): Promise<boolean> {
        const response = await fetch(fiscalApiUrl(`/api/nfe/cancelar/${saleId}`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...await fiscalHeaders() },
            body: JSON.stringify({ justificativa: justification }),
        });
        const data = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.erro || 'Falha ao cancelar NF-e.');
        return true;
    }
};
