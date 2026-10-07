import { env } from '../config/env';
import { gerarCNF, formatNfeDateTime, formatNfeAaMm, montarChaveAcesso } from '../utils/nfe-utils';
import { loadEmissionDraft } from './NfeDraftService';
import { completeNfeIssue, prepareNfeIssue, reserveNfeIssue } from './NfeCounterService';
import { SefazService, type NfeEmitirResult } from './SefazService';

export async function generateNfeXml(saleId: string, revision: number, sefaz: SefazService, tenantId: string): Promise<NfeEmitirResult> {
  const { source, fiscal, ruleId, configuration } = await loadEmissionDraft(saleId, tenantId, revision);
  const fiscalSnapshot = { ruleId, issuer: configuration.issuer, decision: fiscal };
  const reservation = await reserveNfeIssue(saleId, tenantId, revision, source, fiscalSnapshot);
  if (!reservation.created) {
    return { success: false, message: `NF-e ${reservation.number} em estado ${reservation.status}. Consulte a SEFAZ antes de nova emissão.` };
  }
  const now = new Date();
  const nNF = String(reservation.number);
  const serie = String(reservation.series);
  const cNF = gerarCNF();
  const dhEmi = formatNfeDateTime(now);
  const expectedKey = montarChaveAcesso({ cUF: '29', aaMm: formatNfeAaMm(now), cnpj: env.cnpjEmitente,
    mod: '55', serie, nNF, tpEmis: '1', cNF });
  let prepared = false;
  try {
    const result = await sefaz.emitirNFe({ nNF, serie, cNF, cDV: Number(expectedKey.at(-1)), dhEmi, fiscal }, async (signedXml, accessKey) => {
      if (accessKey !== expectedKey) throw new Error('Chave gerada diverge da numeração reservada. Emissão interrompida.');
      await prepareNfeIssue(saleId, tenantId, accessKey, signedXml);
      prepared = true;
    });
    if (result.success) {
      if (result.invoiceKey !== expectedKey || !result.nfeProtocol || !result.nfeXml) {
        await completeNfeIssue(saleId, tenantId, 'unknown', undefined, undefined, 'Autorização sem XML/protocolo/chave esperada.');
        return { success: false, message: 'Resposta requer conciliação fiscal.' };
      }
      await completeNfeIssue(saleId, tenantId, 'authorized', result.nfeProtocol, result.nfeXml);
    } else {
      const status = /Rejeição \d+:/.test(result.message) ? 'rejected' : 'unknown';
      await completeNfeIssue(saleId, tenantId, status, undefined, undefined, result.message);
    }
    return result;
  } catch (error) {
    if (prepared) {
      await completeNfeIssue(saleId, tenantId, 'unknown', undefined, undefined,
        error instanceof Error ? error.message : String(error));
      return { success: false, message: 'Resultado incerto. Consulte a SEFAZ antes de qualquer nova ação.' };
    }
    // No signed XML was sent: the number remains reserved and requires an explicit reconciliation/void procedure.
    throw error;
  }
}
