import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { NFe } from '@treeunfe/nfe';
import type { NFe as NFePayload } from '@treeunfe/types';
import { NFeEnvelopeSchema } from '../types/nfe-schemas';
import { retryWithBackoff, buildXmlFromJson } from '../utils/nfe-utils';
import { resolveCityIbge, truncateString } from '../utils/ibge-utils';

interface StatusServicoResponse {
  status: string;
  motivo: string;
  ambiente: string;
  uf: string;
  dataHora: string;
  tempoMedio?: string;
}

export interface NfeEmitirParams {
  saleId: string;
  nNF: string;
  serie: string;
  customerName: string;
  customerDoc: string;
  total: number;
  customerData?: {
    logradouro: string;
    numero: string;
    bairro: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string;
    ie: string;
    indIEDest: string;
  };
  items: {
    productName: string;
    quantity: number;
    priceAtSale: number;
    ncm: string;
    cfop: string;
  }[];
}

export interface NfeEmitirResult {
  success: boolean;
  invoiceKey?: string;
  invoiceUrl?: string;
  nfeNumber?: string;
  nfeXml?: string;
  message: string;
}

function ensureResourcesDir(): void {
  const nodeModules = path.resolve(__dirname, '../../node_modules');
  const brokenDir = path.join(nodeModules, 'resources');
  const actualDir = path.join(nodeModules, '@treeunfe/shared/resources');

  if (fs.existsSync(brokenDir)) return;

  if (!fs.existsSync(actualDir)) {
    console.warn('[SefazService] Diretório @treeunfe/shared/resources não encontrado.');
    return;
  }

  try {
    fs.symlinkSync(actualDir, brokenDir, 'junction');
    console.log('[SefazService] Symlink criado: node_modules/resources -> @treeunfe/shared/resources');
  } catch {
    try {
      fs.cpSync(actualDir, brokenDir, { recursive: true, force: false });
      console.log('[SefazService] Diretório copiado: node_modules/resources <- @treeunfe/shared/resources');
    } catch (copyErr) {
      console.warn('[SefazService] Não foi possível fixar resources path:', copyErr);
    }
  }
}

export class SefazService {
  private certificadoPassword: string;
  private ambiente: number;
  private uf: string;
  private cnpj: string;
  private nfeInstance: NFe | null = null;

  constructor() {
    this.ambiente = env.sefazAmbiente;
    this.uf = env.sefazUf;
    this.cnpj = env.cnpjEmitente;
    this.certificadoPassword = env.certificadoPassword;

    ensureResourcesDir();

    const certBuffer = Buffer.from(env.certificadoA1Base64, 'base64');
    if (certBuffer.length === 0) {
      throw new Error('[SefazService] O buffer do certificado está vazio após decodificação Base64.');
    }

    console.log(`[SefazService] Certificado A1 decodificado (${certBuffer.length} bytes)`);

    this.createNfeInstance(certBuffer);

    certBuffer.fill(0);
  }

  private createNfeInstance(certificadoPfx: Buffer): void {
    this.nfeInstance = new NFe({
      ambiente: this.ambiente,
      versaoDF: '4.00',
      UF: this.uf,
      certificadoPfx,
      senhaCertificado: this.certificadoPassword,
      useOpenSSL: false,
      useForSchemaValidation: 'validateSchemaJsBased',
      connection: { timeout: env.sefazTimeoutMs },
    });
  }

  private getOrCreateNFe(): NFe {
    if (!this.nfeInstance) {
      throw new Error('[SefazService] Instância NFe não foi inicializada corretamente no construtor.');
    }
    return this.nfeInstance;
  }

  async checkStatus(): Promise<StatusServicoResponse> {
    console.log(`[SefazService] Consultando status do serviço SEFAZ-${this.uf} (ambiente: ${this.ambiente === 1 ? 'Produção' : 'Homologação'})`);

    try {
      const nfe = this.getOrCreateNFe();
      const resultado = await nfe.ConsultaStatusServico();

      console.log('[SefazService] Resposta da SEFAZ recebida com sucesso');

      return {
        status: resultado.cStat ?? 'Desconhecido',
        motivo: resultado.xMotivo ?? 'Sem motivo informado',
        ambiente: this.ambiente === 1 ? 'Produção' : 'Homologação',
        uf: this.uf,
        dataHora: resultado.dhRecbto ?? new Date().toISOString(),
        tempoMedio: resultado.tMed ?? undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[SefazService] Erro na consulta de status: ${message}`);

      if (error instanceof Error && error.message.includes('certificate')) {
        throw new Error(`Falha na carga do certificado digital: ${message}`);
      }

      if (error instanceof Error && (error.message.includes('ETIMEOUT') || error.message.includes('timeout'))) {
        throw new Error(`Timeout na comunicação com a SEFAZ-${this.uf}: ${message}`);
      }

      throw new Error(`Erro ao consultar status SEFAZ-${this.uf}: ${message}`);
    }
  }

  async emitirNFe(params: NfeEmitirParams): Promise<NfeEmitirResult> {
    console.log(`[SefazService] Emitindo NF-e para venda ${params.saleId}`);

    try {
      const nfe = this.getOrCreateNFe();
      const isConsumidorFinal = !params.customerDoc || params.customerName.toUpperCase() === 'CONSUMIDOR NÃO IDENTIFICADO';
      const indFinal = params.customerDoc && params.customerDoc.length === 14 ? 0 : 1;

      const total = Number(params.total) || 0;

      const isHomologacao = this.ambiente === 2;
      const hasValidDoc = !isConsumidorFinal && params.customerDoc && (params.customerDoc.length === 11 || params.customerDoc.length === 14);
      
      const destNome = truncateString(
        isHomologacao ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : params.customerName,
        60,
        'CONSUMIDOR NAO IDENTIFICADO'
      );
      const destDoc = isHomologacao ? '99999999000191' : (hasValidDoc ? params.customerDoc : undefined);

      const ie = params.customerData?.ie || '';
      const indIEDest = isConsumidorFinal
        ? '9'
        : ie.toUpperCase() === 'ISENTO' || !ie
          ? '9'
          : '1';

      const cityInfo = resolveCityIbge(params.customerData?.city, params.customerData?.state);

      const enderDest = params.customerData ? {
        xLgr: truncateString(params.customerData.logradouro, 60, 'RUA NAO INFORMADA'),
        nro: truncateString(params.customerData.numero, 60, 'S/N'),
        xBairro: truncateString(params.customerData.bairro, 60, 'CENTRO'),
        cMun: cityInfo.cMun,
        xMun: cityInfo.xMun,
        UF: cityInfo.UF,
        CEP: (params.customerData.zipCode || '47520000').replace(/\D/g, ''),
        cPais: 1058,
        xPais: 'BRASIL',
        fone: truncateString((params.customerData.phone || '').replace(/\D/g, ''), 14),
      } : undefined;

      const nfePayload = {
        idLote: Number(params.nNF),
        indSinc: 1,
        NFe: {
          infNFe: {
            ide: {
              cUF: 29,
              natOp: 'Venda de mercadoria',
              mod: 55,
              serie: truncateString(params.serie, 3, '1'),
              nNF: Number(params.nNF),
              dhEmi: new Date().toISOString(),
              tpNF: 1,
              idDest: 1,
              cMunFG: cityInfo.cMun,
              tpImp: 1,
              tpEmis: 1,
              tpAmb: this.ambiente,
              finNFe: 1,
              indFinal,
              indPres: 1,
              procEmi: 0,
              verProc: truncateString('Geleiro PRO NF-e 1.0', 20),
              cMunFGIBS: cityInfo.cMun,
            },
            emit: {
              CNPJCPF: this.cnpj,
              xNome: truncateString('GDS PRODUTOS ALIMENTICIOS LTDA', 60),
              xFant: truncateString('Gelo do Sertao', 60),
              enderEmit: {
                xLgr: truncateString('RODOVIA BA 160', 60),
                nro: truncateString('2040', 60),
                xBairro: truncateString('SAO JOAO', 60),
                cMun: 2927408,
                xMun: 'IBOTIRAMA',
                UF: this.uf,
                CEP: '47520000',
                cPais: 1058,
                xPais: 'BRASIL',
                fone: '77999820028',
              },
              IE: '117178795',
              CRT: 1,
            },
            dest: {
              CNPJCPF: destDoc,
              xNome: destNome,
              ...(enderDest ? { enderDest } : {}),
              indIEDest,
              ...(indIEDest === '1' && ie ? { IE: ie } : {}),
            },
            det: params.items.map(item => ({
              prod: {
                cProd: truncateString(item.productName.replace(/[^a-zA-Z0-9]/g, '_'), 20, '1'),
                cEAN: 'SEM GTIN',
                xProd: truncateString(item.productName, 120, 'PRODUTO'),
                NCM: item.ncm || '22019000',
                CFOP: item.cfop || '5101',
                uCom: 'UN',
                qCom: item.quantity,
                vUnCom: item.priceAtSale,
                vProd: item.quantity * item.priceAtSale,
                cEANTrib: 'SEM GTIN',
                uTrib: 'UN',
                qTrib: item.quantity,
                vUnTrib: item.priceAtSale,
                indTot: 1,
              },
              imposto: {
                ICMS: {
                  ICMSSN102: {
                    orig: 0,
                    CSOSN: '102',
                  },
                },
                PIS: { PISNT: { CST: '07' } },
                COFINS: { COFINSNT: { CST: '07' } },
              },
            })),
            total: {
              ICMSTot: {
                vBC: '0.00',
                vICMS: '0.00',
                vICMSDeson: '0.00',
                vFCP: '0.00',
                vBCST: '0.00',
                vST: '0.00',
                vFCPST: '0.00',
                vFCPSTRet: '0.00',
                vProd: total.toFixed(2),
                vFrete: '0.00',
                vSeg: '0.00',
                vDesc: '0.00',
                vII: '0.00',
                vIPI: '0.00',
                vIPIDevol: '0.00',
                vPIS: '0.00',
                vCOFINS: '0.00',
                vOutro: '0.00',
                vNF: total.toFixed(2),
              },
            },
            transp: {
              modFrete: 9,
            },
            pag: {
              detPag: {
                tPag: '01',
                vPag: total.toFixed(2),
              },
            },
          },
        },
      };

      const validatedPayload: NFePayload = NFeEnvelopeSchema.parse(nfePayload) as unknown as NFePayload;

      console.log('[SefazService] Enviando NF-e para autorização SEFAZ...');
      const resultado = await retryWithBackoff(
        () => nfe.Autorizacao(validatedPayload),
        { maxRetries: 2, baseDelayMs: 2000 }
      );

      const xmls = Array.isArray(resultado) ? resultado : (resultado?.xmls ?? resultado);
      const primeiroXml = Array.isArray(xmls) ? xmls[0] : xmls;
      const prot = primeiroXml?.protNFe;
      const cStat = prot?.infProt?.cStat;
      const xMotivo = prot?.infProt?.xMotivo || '';

      if (cStat === '100' || cStat === '101' || cStat === '150' || cStat === '151') {
        const chave = prot.infProt.chNFe || '';
        const nProt = prot.infProt.nProt || '';

        let nfeXml: string | undefined = undefined;
        if (primeiroXml?.NFe && prot) {
          try {
            nfeXml = buildXmlFromJson({
              nfeProc: {
                '@versao': '4.00',
                '@xmlns': 'http://www.portalfiscal.inf.br/nfe',
                NFe: primeiroXml.NFe,
                protNFe: prot,
              },
            });
          } catch (xmlErr) {
            console.warn('[SefazService] Não foi possível montar o nfeProc XML:', xmlErr);
          }
        }

        console.log(`[SefazService] NF-e autorizada: ${chave} (nProt: ${nProt}, cStat: ${cStat})`);

        return {
          success: true,
          invoiceKey: chave,
          invoiceUrl: `https://www.sefaz.fazenda.gov.br/nfe/${chave}`,
          nfeNumber: nProt,
          nfeXml,
          message: `NF-e autorizada: ${xMotivo}`,
        };
      }

      if (cStat === '539') {
        const chave = prot.infProt.chNFe || '';
        const nProt = prot.infProt.nProt || '';
        console.log(`[SefazService] NF-e duplicata (cStat=539). Recuperando autorização existente: ${chave}`);

        return {
          success: true,
          invoiceKey: chave,
          invoiceUrl: `https://www.sefaz.fazenda.gov.br/nfe/${chave}`,
          nfeNumber: nProt,
          message: `NF-e já autorizada anteriormente (duplicata): ${xMotivo}`,
        };
      }

      console.error(`[SefazService] NF-e rejeitada (cStat=${cStat}): ${xMotivo}`);

      return {
        success: false,
        message: `NF-e rejeitada pela SEFAZ: ${xMotivo}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[SefazService] Erro na emissão NF-e: ${message}`);

      if (error instanceof Error && error.message.includes('certificate')) {
        throw new Error(`Falha na carga do certificado digital: ${message}`);
      }

      throw new Error(`Erro na emissão NF-e: ${message}`);
    }
  }

  dispose(): void {
    this.nfeInstance = null;
    console.log('[SefazService] Instância NFe liberada');
  }

  async cancelarNFe(chNFe: string, nProt: string, justificativa: string): Promise<{ success: boolean; message: string }> {
    console.log(`[SefazService] Cancelando NF-e: ${chNFe}`);

    try {
      const nfe = this.getOrCreateNFe();

      const resultado = await nfe.Cancelamento({
        idLote: Number(new Date().getTime() % 1000000),
        modelo: '55',
        evento: [{
          tpAmb: this.ambiente,
          cOrgao: 29,
          CNPJ: this.cnpj,
          chNFe,
          dhEvento: new Date().toISOString(),
          tpEvento: '110111',
          nSeqEvento: 1,
          verEvento: '1.00',
          detEvento: {
            descEvento: 'Cancelamento',
            nProt,
            xJust: justificativa,
          },
        }],
      });

      const xMotivos = resultado?.xMotivos || [];
      const primeiro = Array.isArray(xMotivos) ? xMotivos[0] : xMotivos;
      const cStat = primeiro?.cStat || '';
      const xMotivo = primeiro?.xMotivo || '';

      if (cStat === '101' || cStat === '135' || cStat === '155') {
        console.log(`[SefazService] NF-e cancelada: ${chNFe} (cStat=${cStat})`);
        return { success: true, message: `NF-e cancelada: ${xMotivo}` };
      }

      console.error(`[SefazService] Falha no cancelamento (cStat=${cStat}): ${xMotivo}`);
      return { success: false, message: `Falha no cancelamento: ${xMotivo}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[SefazService] Erro no cancelamento NF-e: ${message}`);

      if (error instanceof Error && error.message.includes('certificate')) {
        throw new Error(`Falha na carga do certificado digital: ${message}`);
      }

      throw new Error(`Erro no cancelamento NF-e: ${message}`);
    }
  }
}
