import { Sale } from '../types';

// Interface para resposta da API de Notas (padrão genérico)
export interface InvoiceResponse {
    success: boolean;
    message: string;
    invoiceKey?: string;
    invoiceUrl?: string; // Link para o PDF/DANFE
    xmlUrl?: string;
}

// Configuração da API (será preenchida com variáveis de ambiente)
const API_CONFIG = {
    baseUrl: import.meta.env.VITE_INVOICE_API_URL || 'https://api.nuvemfiscal.com.br/v2', // Exemplo
    token: import.meta.env.VITE_INVOICE_API_TOKEN || '',
};

export const invoiceService = {
    /**
     * Envia uma venda para emissão de NFC-e (Nota Fiscal de Consumidor Eletrônica)
     */
    async emitNFCe(sale: Sale, customerCpf?: string): Promise<InvoiceResponse> {
        console.log("🚀 Iniciando emissão de NFC-e para venda:", sale.id);

        // 1. Preparar o Payload (JSON) no padrão da API
        // Este é um exemplo de estrutura comum para APIs como Nuvem Fiscal ou FocusNFe
        const payload = {
            natureza_operacao: 'Venda de Mercadoria',
            data_emissao: new Date().toISOString(),
            tipo_documento: 'NFCe',
            finalidade: 'Normal',
            cliente: {
                cpf: customerCpf || null,
                nome: sale.customerName !== 'Consumidor Final' ? sale.customerName : null,
            },
            itens: sale.items.map((item, index) => ({
                numero_item: index + 1,
                codigo_produto: item.productId,
                descricao: item.productName,
                quantidade: item.quantity,
                valor_unitario: item.priceAtSale,
                valor_total: item.quantity * item.priceAtSale,
                // NCM e impostos seriam configurados no cadastro do produto
                ncm: '22011000', // Exemplo genérico (Água/Gelo)
                cfop: '5102',
            })),
            pagamento: {
                forma_pagamento: mapPaymentMethod(sale.paymentMethod),
                valor: sale.total,
            },
            valor_total: sale.total,
        };

        console.log("📦 Payload preparado para envio:", payload);

        // 2. Simulação de Envio para API (MOCK)
        // Quando contratar a API, descomentar o código abaixo e ajustar a URL
        /*
        try {
          const response = await fetch(`${API_CONFIG.baseUrl}/nfce`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${API_CONFIG.token}`
            },
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message);
          return {
            success: true,
            message: 'Nota emitida com sucesso!',
            invoiceKey: data.chave,
            invoiceUrl: data.url_danfe
          };
        } catch (error) {
          console.error("Erro na API:", error);
          return { success: false, message: 'Erro ao comunicar com a SEFAZ.' };
        }
        */

        // SIMULAÇÃO DE SUCESSO (Para testes sem API contratada)
        return new Promise((resolve) => {
            setTimeout(() => {
                const mockKey = `35${new Date().getFullYear()}000000000000000000000000000000000000`;
                console.log("✅ Nota Autorizada (Simulação)");

                resolve({
                    success: true,
                    message: 'NFC-e Autorizada com Sucesso (Ambiente de Teste)',
                    invoiceKey: mockKey,
                    invoiceUrl: `https://www.sefaz.rs.gov.br/ASP/AAE_ROOT/NFE/SAT-WEB-NFE-COM_2.asp?chave=${mockKey}`, // URL fake
                });
            }, 2000);
        });
    },

    /**
     * Cancela uma nota fiscal
     */
    async cancelInvoice(invoiceKey: string, justification: string): Promise<boolean> {
        console.log(`Cancelando nota ${invoiceKey}: ${justification}`);
        return true; // Mock
    }
};

// Helper para mapear métodos de pagamento do nosso sistema para o padrão SEFAZ
function mapPaymentMethod(method: string): string {
    switch (method) {
        case 'Cash': return '01'; // Dinheiro
        case 'Credit': return '03'; // Cartão de Crédito
        case 'Debit': return '04'; // Cartão de Débito
        case 'Pix': return '17'; // PIX
        default: return '99'; // Outros
    }
}
