import { create } from 'xmlbuilder2';

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';

function assertXml(xml: string): void {
  if (!xml || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML ausente ou contém declaração não permitida.');
  create(xml);
}

/** Extracts the original bytes; signed documents must never be serialized again. */
export function extractXmlElement(xml: string, name: string): string | undefined {
  assertXml(xml);
  const expression = new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?${name})(?=[\\s>])[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'g');
  const matches = [...xml.matchAll(expression)];
  if (matches.length > 1) throw new Error(`Resposta contém múltiplos elementos ${name}.`);
  return matches[0]?.[0];
}

export function xmlText(xml: string, name: string): string {
  const element = extractXmlElement(xml, name);
  return element ? create(element).root().node.textContent?.trim() ?? '' : '';
}

export function signedNfeIdentity(xml: string): { accessKey: string; environment: number; digest: string } {
  const nfe = extractXmlElement(xml, 'NFe');
  if (!nfe || !extractXmlElement(nfe, 'Signature')) throw new Error('NF-e assinada não encontrada.');
  const id = nfe.match(/\bId=["']NFe(\d{44})["']/)?.[1];
  const reference = nfe.match(/\bURI=["']#NFe(\d{44})["']/)?.[1];
  const digest = xmlText(nfe, 'DigestValue');
  const environment = Number(xmlText(nfe, 'tpAmb'));
  if (!id || reference !== id || !digest || ![1, 2].includes(environment)) {
    throw new Error('Identidade ou assinatura da NF-e inválida.');
  }
  return { accessKey: id, environment, digest };
}

export function parseProtocol(xml: string) {
  const protocolXml = extractXmlElement(xml, 'protNFe');
  const info = protocolXml ? extractXmlElement(protocolXml, 'infProt') ?? protocolXml : xml;
  return {
    cStat: xmlText(info, 'cStat'),
    motivo: xmlText(info, 'xMotivo'),
    protocolo: xmlText(info, 'nProt') || undefined,
    accessKey: xmlText(info, 'chNFe') || undefined,
    environment: Number(xmlText(info, 'tpAmb')),
    digest: xmlText(info, 'digVal') || undefined,
    protocolXml,
  };
}

export function verifiedRejection(xml: string, accessKey: string, environment: number): string | undefined {
  const response = parseProtocol(xml);
  if (!response.protocolXml || response.accessKey !== accessKey || response.environment !== environment ||
      !/^\d{3}$/.test(response.cStat) || Number(response.cStat) < 200 ||
      ['204', '539'].includes(response.cStat)) return undefined;
  return `Rejeição ${response.cStat}: ${response.motivo}`;
}

export function recoverAuthorizedXml(signedXml: string, protocolXml: string, environment: number): string {
  const identity = signedNfeIdentity(signedXml);
  const protocol = parseProtocol(protocolXml);
  if (!['100', '150'].includes(protocol.cStat) || !protocol.protocolo || !protocol.protocolXml) {
    throw new Error('Protocolo não comprova autorização da NF-e.');
  }
  if (protocol.accessKey !== identity.accessKey || protocol.digest !== identity.digest ||
      protocol.environment !== environment || identity.environment !== environment) {
    throw new Error('Protocolo não corresponde à chave, assinatura e ambiente da NF-e persistida.');
  }
  const nfe = extractXmlElement(signedXml, 'NFe')!;
  const proc = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NFE_NS}" versao="4.00">${nfe}${protocol.protocolXml}</nfeProc>`;
  assertXml(proc);
  return proc;
}
