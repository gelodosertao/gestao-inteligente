import type { NFe } from '@treeunfe/types';
import type { FiscalDecision } from './FiscalRules';
import { resolveCityIbge } from '../utils/ibge-utils';

export interface FiscalEmission {
  nNF: string;
  serie: string;
  cNF: string;
  cDV: number;
  dhEmi: string;
  fiscal: FiscalDecision;
}

const money = (value: number) => value.toFixed(2);
const digits = (value: string | undefined) => (value ?? '').replace(/\D/g, '');

export function buildFiscalPayload(params: FiscalEmission): NFe {
  if (!Number.isInteger(params.cDV) || params.cDV < 0 || params.cDV > 9) {
    throw new Error('Dígito verificador da chave fiscal inválido.');
  }
  const { issuer, customer, context, rule, items, payments, totals, environment, cnpj } = params.fiscal;
  if (rule.ibsCbs.mode !== 'none') throw new Error('Regra IBS/CBS ainda não homologada para transmissão.');
  if (context.buyerPresence == null || context.freightMode == null || !context.paymentTiming) {
    throw new Error('Presença, frete e condição de pagamento são obrigatórios.');
  }
  if ([1, 2, 3, 9].includes(context.buyerPresence) && context.intermediary !== 0) {
    throw new Error('Confirme venda direta pela GDS antes de gerar o XML.');
  }
  const city = resolveCityIbge(customer.city, customer.state);
  const { address } = issuer;
  const taxGroup = (kind: 'PIS' | 'COFINS') => {
    const config = kind === 'PIS' ? rule.pis : rule.cofins;
    if (config.rate !== 0) throw new Error(`${kind}: cálculo com alíquota não homologado.`);
    if (config.group === `${kind}NT` && ['04', '05', '06', '07', '08', '09'].includes(config.cst)) {
      return { [config.group]: { CST: config.cst } };
    }
    if (config.group === `${kind}Outr` && config.cst === '49') {
      return { [config.group]: { CST: config.cst, vBC: '0.00', [`p${kind}`]: '0.0000', [`v${kind}`]: '0.00' } };
    }
    throw new Error(`${kind}: grupo/CST sem suporte aprovado.`);
  };
  const payload = {
    idLote: Number(params.nNF), indSinc: 1,
    NFe: { infNFe: {
      ide: {
        cUF: Number(String(address.cityCode).slice(0, 2)), cNF: params.cNF, natOp: rule.nature, mod: 55,
        serie: params.serie, nNF: Number(params.nNF), dhEmi: params.dhEmi, tpNF: 1, idDest: rule.idDest,
        cMunFG: address.cityCode, tpImp: 1, tpEmis: 1, cDV: params.cDV, tpAmb: environment, finNFe: 1,
        indFinal: rule.indFinal, indPres: context.buyerPresence,
        ...([1, 2, 3, 9].includes(context.buyerPresence) ? { indIntermed: context.intermediary } : {}),
        procEmi: 0, verProc: 'GDS NFe 2.0',
      },
      emit: {
        CNPJCPF: cnpj, xNome: issuer.name, ...(issuer.tradeName ? { xFant: issuer.tradeName } : {}),
        enderEmit: { xLgr: address.street, nro: address.number, xBairro: address.district,
          cMun: address.cityCode, xMun: address.city, UF: address.state, CEP: address.zipCode,
          cPais: 1058, xPais: 'BRASIL', ...(address.phone ? { fone: digits(address.phone) } : {}) },
        IE: digits(issuer.ie), CRT: issuer.crt,
      },
      dest: {
        CNPJCPF: digits(customer.cpf_cnpj),
        xNome: environment === 2 ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : customer.razao_social,
        enderDest: { xLgr: customer.logradouro, nro: customer.numero, xBairro: customer.bairro,
          cMun: city.cMun, xMun: city.xMun, UF: city.UF, CEP: digits(customer.zip_code),
          cPais: 1058, xPais: 'BRASIL', ...(customer.phone ? { fone: digits(customer.phone) } : {}) },
        indIEDest: '1', IE: digits(customer.inscricao_estadual),
      },
      ...(issuer.xmlAuthorizedTaxId ? { autXML: {
        [issuer.xmlAuthorizedTaxId.length === 11 ? 'CPF' : 'CNPJ']: issuer.xmlAuthorizedTaxId,
      } } : {}),
      det: items.map(item => ({
        prod: { cProd: item.productId, cEAN: 'SEM GTIN', xProd: item.productName, NCM: item.ncm,
          ...(item.cest ? { CEST: item.cest } : {}), CFOP: rule.cfop, uCom: item.unit,
          qCom: item.quantity, vUnCom: item.unitPrice, vProd: money(item.subtotal), cEANTrib: 'SEM GTIN',
          uTrib: item.unit, qTrib: item.quantity, vUnTrib: item.unitPrice,
          ...(item.freight ? { vFrete: money(item.freight) } : {}),
          ...(item.discount ? { vDesc: money(item.discount) } : {}), indTot: 1 },
        imposto: { ICMS: { ICMSSN102: { orig: item.origin, CSOSN: rule.csosn } },
          PIS: taxGroup('PIS'), COFINS: taxGroup('COFINS') },
      })),
      total: { ICMSTot: {
        vBC: '0.00', vICMS: '0.00', vICMSDeson: '0.00', vFCP: '0.00', vBCST: '0.00', vST: '0.00',
        vFCPST: '0.00', vFCPSTRet: '0.00', vProd: money(totals.products), vFrete: money(totals.freight),
        vSeg: '0.00', vDesc: money(totals.discount), vII: '0.00', vIPI: '0.00', vIPIDevol: '0.00',
        vPIS: '0.00', vCOFINS: '0.00', vOutro: '0.00', vNF: money(totals.total),
      } },
      transp: { modFrete: context.freightMode },
      ...(context.paymentTiming === 'term' ? { cobr: {
        fat: { nFat: params.nNF, vOrig: money(totals.total), vDesc: '0.00', vLiq: money(totals.total) },
        dup: [{ nDup: '001', dVenc: context.dueDate, vDup: money(totals.total) }],
      } } : {}),
      pag: { detPag: payments.map(payment => ({ indPag: context.paymentTiming === 'term' ? 1 : 0,
        tPag: payment.code, vPag: money(payment.amount) })) },
      infAdic: { infCpl: rule.additionalInfo },
      ...(issuer.technicalResponsible ? { infRespTec: {
        CNPJ: issuer.technicalResponsible.cnpj, xContato: issuer.technicalResponsible.contact,
        email: issuer.technicalResponsible.email, fone: issuer.technicalResponsible.phone,
      } } : {}),
    } },
  };
  return payload as unknown as NFe;
}
