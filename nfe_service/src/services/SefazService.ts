import { NFe } from '@treeunfe/nfe';
import { env } from '../config/env';
import { buildFiscalPayload, type FiscalEmission } from './FiscalPayload';
import { formatNfeDateTime } from '../utils/nfe-utils';
import { extractXmlElement, parseProtocol, recoverAuthorizedXml, signedNfeIdentity, verifiedRejection, xmlText } from './XmlProtocol';

export interface NfeEmitirResult {
  success: boolean; message: string; invoiceKey?: string; invoiceUrl?: string;
  nfeNumber?: string; nfeProtocol?: string; nfeXml?: string;
}
type InternalNfe = { loadEnvironmentPromise: Promise<void>; axios: {
  interceptors: { request: { use(fn: (config: { data?: unknown }) => Promise<unknown>): number; eject(id: number): void };
    response: { use(fn: (result: { data?: unknown }) => unknown): number; eject(id: number): void } } } };

class FiscalResponseError extends Error {
  constructor(readonly responseXml: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

export class SefazService {
  private readonly nfe: NFe;
  private pending: Promise<void> = Promise.resolve();
  constructor() {
    // @treeunfe/nfe computes the access-key AAMM with Date#getMonth from dhEmi.
    process.env.TZ = 'America/Bahia';
    const cert = Buffer.from(env.certificadoA1Base64, 'base64');
    if (!cert.length) throw new Error('Certificado digital inválido.');
    this.nfe = new NFe({ ambiente: env.sefazAmbiente, versaoDF: '4.00', UF: env.sefazUf,
      certificadoPfx: cert, senhaCertificado: env.certificadoPassword, useOpenSSL: false,
      useForSchemaValidation: 'validateSchemaJsBased', connection: { timeout: env.sefazTimeoutMs } });
    cert.fill(0);
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.pending;
    let release!: () => void;
    this.pending = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  async checkStatus() { return this.exclusive(async () => {
    const result = await this.nfe.ConsultaStatusServico();
    return { status: String(result.cStat || ''), motivo: String(result.xMotivo || ''),
      ambiente: env.sefazAmbiente === 1 ? 'Produção' : 'Homologação', uf: env.sefazUf,
      dataHora: result.dhRecbto || new Date().toISOString() };
  }); }

  private async capture<T>(matches: (xml: string) => boolean, beforeSend: (xml: string) => Promise<void>,
    call: () => Promise<T>): Promise<{ result: T; responseXml?: string }> {
    return this.exclusive(async () => {
    const internal = this.nfe as unknown as InternalNfe;
    await internal.loadEnvironmentPromise;
    if (!internal.axios?.interceptors?.request || !internal.axios.interceptors.response) {
      throw new Error('Versão da biblioteca fiscal incompatível com a persistência prévia do XML.');
    }
    let responseXml: string | undefined;
    let persisted = false;
    const requestId = internal.axios.interceptors.request.use(async config => {
      const xml = typeof config.data === 'string' ? config.data : '';
      if (matches(xml)) { await beforeSend(xml); persisted = true; }
      return config;
    });
    const responseId = internal.axios.interceptors.response.use(response => {
      if (typeof response.data === 'string') responseXml = response.data;
      return response;
    });
    try {
      let result: T;
      try { result = await call(); }
      catch (error) {
        if (responseXml) throw new FiscalResponseError(responseXml, error);
        throw error;
      }
      if (!persisted) throw new Error('XML assinado não persistido antes da transmissão. Consulte a SEFAZ.');
      return { result, responseXml };
    } finally {
      internal.axios.interceptors.request.eject(requestId);
      internal.axios.interceptors.response.eject(responseId);
    }
    });
  }

  async emitirNFe(params: FiscalEmission, beforeTransmit: (signedXml: string, accessKey: string) => Promise<void>): Promise<NfeEmitirResult> {
    let signedXml: string | undefined;
    let accessKey: string | undefined;
    let captured;
    try { captured = await this.capture(xml => /<(?:\w+:)?enviNFe[\s>]/.test(xml), async envelope => {
      signedXml = extractXmlElement(envelope, 'NFe');
      if (!signedXml) throw new Error('XML NF-e assinado ausente do lote.');
      const identity = signedNfeIdentity(signedXml);
      if (identity.environment !== env.sefazAmbiente) throw new Error('Ambiente fiscal divergente.');
      accessKey = identity.accessKey;
      await beforeTransmit(signedXml, accessKey);
    }, () => this.nfe.Autorizacao(buildFiscalPayload(params))); }
    catch (error) {
      if (error instanceof FiscalResponseError && accessKey) {
        try {
          const message = verifiedRejection(error.responseXml, accessKey, env.sefazAmbiente);
          if (message) return { success: false, message };
        } catch { /* Without a matching protocol, the outcome remains uncertain. */ }
      }
      throw error;
    }
    if (!signedXml || !accessKey || !captured.responseXml) {
      return { success: false, message: 'Resposta fiscal sem protocolo completo. Consulte a SEFAZ.' };
    }
    let protocol;
    try { protocol = parseProtocol(captured.responseXml); }
    catch { return { success: false, message: 'Resposta fiscal não pôde ser conciliada. Consulte a SEFAZ.' }; }
    if (['100', '150'].includes(protocol.cStat)) {
      const xml = recoverAuthorizedXml(signedXml, captured.responseXml, env.sefazAmbiente);
      return { success: true, message: `NF-e autorizada: ${protocol.motivo}`, invoiceKey: accessKey,
        nfeNumber: params.nNF, nfeProtocol: protocol.protocolo, nfeXml: xml };
    }
    if (!protocol.protocolXml || protocol.accessKey !== accessKey || !/^\d{3}$/.test(protocol.cStat) ||
        ['539', '204'].includes(protocol.cStat) || Number(protocol.cStat) < 200) {
      return { success: false, message: `Resultado fiscal incerto (${protocol.cStat || 'sem código'}). Consulte a SEFAZ.` };
    }
    return { success: false, message: `Rejeição ${protocol.cStat}: ${protocol.motivo}` };
  }

  async consultarNFe(accessKey: string) { return this.exclusive(async () => {
    const internal = this.nfe as unknown as InternalNfe;
    await internal.loadEnvironmentPromise;
    let raw: string | undefined;
    const id = internal.axios.interceptors.response.use(response => {
      if (typeof response.data === 'string') raw = response.data;
      return response;
    });
    try {
      const result = await this.nfe.ConsultaProtocolo(accessKey);
      const parsed = raw ? parseProtocol(raw) : null;
      const prot = result?.protNFe?.infProt ?? result?.retConsSitNFe?.protNFe?.infProt;
      const retEvento = raw ? extractXmlElement(raw, 'retEvento') : undefined;
      const cancellation = retEvento && xmlText(retEvento, 'chNFe') === accessKey &&
        ['101', '135', '155'].includes(xmlText(retEvento, 'cStat'))
        ? { cStat: xmlText(retEvento, 'cStat'), xml: raw } : undefined;
      return { cStat: parsed?.cStat || String(prot?.cStat ?? result?.cStat ?? ''),
        motivo: parsed?.motivo || String(prot?.xMotivo ?? result?.xMotivo ?? ''),
        protocolo: parsed?.protocolo || (prot?.nProt ? String(prot.nProt) : undefined),
        protocolXml: parsed?.protocolXml, cancellation };
    } finally { internal.axios.interceptors.response.eject(id); }
  }); }

  async cancelarNFe(chNFe: string, nProt: string, justificativa: string, beforeTransmit: (signedEvent: string) => Promise<void>) {
    const event = { idLote: Number(Date.now() % 1000000), modelo: '55' as const, evento: [{
      tpAmb: env.sefazAmbiente, cOrgao: 29, CNPJ: env.cnpjEmitente, chNFe,
      dhEvento: formatNfeDateTime(), tpEvento: '110111' as const, nSeqEvento: 1, verEvento: '1.00',
      detEvento: { descEvento: 'Cancelamento', nProt, xJust: justificativa },
    }] };
    const captured = await this.capture(xml => /<(?:\w+:)?envEvento[\s>]/.test(xml), async envelope => {
      const signed = extractXmlElement(envelope, 'evento');
      if (!signed || !extractXmlElement(signed, 'Signature')) throw new Error('Evento de cancelamento sem assinatura.');
      await beforeTransmit(signed);
    }, () => this.nfe.Cancelamento(event));
    const codes = captured.result?.xMotivos || [];
    const first = Array.isArray(codes) ? codes[0] : codes;
    const retEvento = captured.responseXml ? extractXmlElement(captured.responseXml, 'retEvento') : undefined;
    const eventStatus = retEvento ? xmlText(retEvento, 'cStat') : '';
    const eventKey = retEvento ? xmlText(retEvento, 'chNFe') : '';
    const success = ['101', '135', '155'].includes(String(first?.cStat || '')) &&
      ['101', '135', '155'].includes(eventStatus) && eventKey === chNFe;
    return { success, message: String(first?.xMotivo || (success ? 'Cancelamento autorizado.' : 'Cancelamento requer consulta.')),
      receipt: success && captured.responseXml ? { xml: captured.responseXml, cStat: String(first?.cStat) } : undefined };
  }
}
