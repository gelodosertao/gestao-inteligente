import { Sale } from '../types';
import { invoiceService } from './invoiceService';

export async function generateDanfe(sale: Sale): Promise<void> {
  try {
    const result = await invoiceService.getDanfe(sale.id);
    if (!result.success || !result.base64) {
      throw new Error(result.message || 'DANFE indisponível no servidor.');
    }
    const binary = atob(result.base64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `danfe-${sale.id.substring(0, 8)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[danfeService] Erro ao buscar DANFE do servidor:', error);
    alert(error instanceof Error ? error.message : 'DANFE indisponível no servidor.');
  }
}