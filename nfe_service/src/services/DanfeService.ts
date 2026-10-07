import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { readCompletePdf } from '../utils/pdf-utils';

const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey);

function ensureTempDir(): string {
  const tempDir = path.resolve(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

export interface DanfeResult {
  success: boolean;
  base64?: string;
  message: string;
}

async function getNfeXmlFromSale(saleId: string, tenantId: string): Promise<{ xml: string; invoiceKey?: string }> {
  const { data, error } = await supabase
    .from('nfe_documents')
    .select('authorized_xml, access_key, status')
    .eq('sale_id', saleId)
    .eq('tenant_id', tenantId)
    .eq('environment', env.sefazAmbiente)
    .single();

  if (error || !data) {
    throw new Error(`Venda não encontrada: ${error?.message || saleId}`);
  }

  const xml = data.authorized_xml as string;
  if (data.status === 'cancel_unknown') {
    throw new Error('Cancelamento pendente de conciliação na SEFAZ. Consulte a situação da NF-e antes de gerar o DANFE.');
  }
  if (data.status === 'cancelled') {
    throw new Error('NF-e cancelada. O DANFE da nota autorizada não está disponível para impressão.');
  }
  if (!xml || data.status !== 'authorized') {
    throw new Error(`Nenhum XML de NF-e encontrado para a venda ${saleId}. Emita a NF-e primeiro.`);
  }

  return { xml, invoiceKey: data.access_key as string | undefined };
}

export async function generateDanfePdf(saleId: string, tenantId: string): Promise<DanfeResult> {
  console.log(`[DanfeService] Gerando DANFE para sale_id: ${saleId}`);

  const tempDir = ensureTempDir();
  const outputPath = path.join(tempDir, `danfe_${saleId.replace(/[^a-zA-Z0-9]/g, '_')}_${randomUUID()}.pdf`);

  try {
    const { xml, invoiceKey } = await getNfeXmlFromSale(saleId, tenantId);

    const { NFE_GerarDanfe } = await import('@nfewizard/danfe');

    const chave = invoiceKey || '';

    const result = await NFE_GerarDanfe({ data: xml, chave, outputPath });

    if (!result.success) {
      return { success: false, message: result.message || 'Falha ao gerar DANFE' };
    }

    const pdfBuffer = await readCompletePdf(outputPath);
    const base64 = pdfBuffer.toString('base64');

    return { success: true, base64, message: 'DANFE gerado com sucesso' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[GerarDanfe] Erro: ${message}`);
    return { success: false, message };
  } finally {
    try { await fs.promises.unlink(outputPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[DanfeService] Falha ao remover PDF temporário:', error); }
  }
}
