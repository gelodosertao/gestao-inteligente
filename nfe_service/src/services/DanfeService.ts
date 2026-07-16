import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { getSaleWithItems } from './SupabaseService';

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

async function getNfeXmlFromSale(saleId: string): Promise<{ xml: string; invoiceKey?: string }> {
  const { data, error } = await supabase
    .from('sales')
    .select('nfe_xml, invoice_key')
    .eq('id', saleId)
    .single();

  if (error || !data) {
    throw new Error(`Venda não encontrada: ${error?.message || saleId}`);
  }

  const xml = data.nfe_xml as string;
  if (!xml) {
    throw new Error(`Nenhum XML de NF-e encontrado para a venda ${saleId}. Emita a NF-e primeiro.`);
  }

  return { xml, invoiceKey: data.invoice_key as string | undefined };
}

export async function generateDanfePdf(saleId: string): Promise<DanfeResult> {
  console.log(`[DanfeService] Gerando DANFE para sale_id: ${saleId}`);

  const tempDir = ensureTempDir();
  const outputPath = path.join(tempDir, `danfe_${saleId.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);

  try {
    const { xml, invoiceKey } = await getNfeXmlFromSale(saleId);

    const { NFE_GerarDanfe } = await import('@nfewizard/danfe');

    const chave = invoiceKey || '';

    const result = await NFE_GerarDanfe({
      data: {
        NFe: xml as any,
        protNFe: undefined,
        forceTransmitida: true,
      },
      chave,
      outputPath,
    });

    if (!result.success) {
      return { success: false, message: result.message || 'Falha ao gerar DANFE' };
    }

    const pdfBuffer = fs.readFileSync(outputPath);
    const base64 = pdfBuffer.toString('base64');

    return { success: true, base64, message: 'DANFE gerado com sucesso' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[GerarDanfe] Erro: ${message}`);
    return { success: false, message };
  } finally {
    try { fs.unlinkSync(outputPath); } catch (e) { console.warn(`[DanfeService] Não foi possível remover ${outputPath}:`, e); }
  }
}