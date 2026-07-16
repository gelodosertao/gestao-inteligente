import { Sale } from '../types';

export interface InvoiceResponse {
    success: boolean;
    message: string;
    invoiceKey?: string;
    invoiceUrl?: string;
    xmlUrl?: string;
    nfeXml?: string;
    nfeNumber?: string;
}

const NFE_SERVICE_URL = import.meta.env.VITE_NFE_SERVICE_URL || 'http://localhost:3001';

export interface DanfeResponse {
    success: boolean;
    base64?: string;
    message: string;
}

export const invoiceService = {
    async emitNFCe(sale: Sale, customerCpf?: string): Promise<InvoiceResponse> {
        console.log("Iniciando emissão de NF-e para venda:", sale.id);

        try {
            const response = await fetch(`${NFE_SERVICE_URL}/api/nfe/emitir/${sale.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerDoc: customerCpf || '' }),
            });

            const data = await response.json();

            if (response.ok && data.sucesso) {
                return {
                    success: true,
                    message: data.dados?.message || 'NF-e autorizada com sucesso',
                    invoiceKey: data.dados?.invoiceKey,
                    invoiceUrl: data.dados?.invoiceUrl,
                    nfeXml: data.dados?.nfeXml,
                    nfeNumber: data.dados?.nfeNumber,
                };
            }

            return {
                success: false,
                message: data.erro || 'Erro ao comunicar com o serviço NF-e',
            };
        } catch (error) {
            console.error("Erro na comunicação com nfe_service:", error);
            return { success: false, message: 'Erro ao conectar ao serviço de NF-e.' };
        }
    },

    async getDanfe(saleId: string): Promise<DanfeResponse> {
        console.log("Buscando DANFE para venda:", saleId);

        try {
            const response = await fetch(`${NFE_SERVICE_URL}/api/nfe/danfe/${saleId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    async cancelInvoice(invoiceKey: string, justification: string): Promise<boolean> {
        console.log(`Cancelando nota ${invoiceKey}: ${justification}`);
        return true;
    }
};
