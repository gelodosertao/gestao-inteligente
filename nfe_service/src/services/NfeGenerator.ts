import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { getSaleWithItems, findCustomerByDoc, updateSaleNfeStatus } from './SupabaseService';
import { SefazService, type NfeEmitirResult } from './SefazService';
import { getNextNnf, cancelNnf } from './NfeCounterService';
import { buildXmlFromJson, montarChaveAcesso, gerarCNF } from '../utils/nfe-utils';

const IS_MOCK_LOCAL = process.env.MOCK_LOCAL_ONLY === 'true';

function ensureTempDir(): string {
  const tempDir = path.resolve(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`[NfeGenerator] Pasta temp criada: ${tempDir}`);
  }
  return tempDir;
}

async function sandboxEmit(saleId: string, customerDoc: string): Promise<NfeEmitirResult> {
  console.log(`[NfeGenerator] MODO SANDBOX - Gerando XML para venda ${saleId}`);

  let { sale, items } = await getSaleWithItems(saleId);

  if (!items || items.length === 0) {
    items = [{
      id: 'fallback-item',
      sale_id: saleId,
      product_id: saleId,
      product_name: 'Gelo',
      quantity: 1,
      price_at_sale: Number(sale.total) || 3.50,
      ncm: '22019000',
      cfop: '5101',
      cst: '',
      selected_options: {},
      notes: ''
    }];
  }

  const isConsumidorFinal = !customerDoc || sale.customer_name.toUpperCase() === 'CONSUMIDOR NÃO IDENTIFICADO';
  const hasValidDoc = customerDoc && (customerDoc.length === 11 || customerDoc.length === 14);
  const indFinal = customerDoc && customerDoc.length === 14 ? '0' : '1';

  const customerData = customerDoc ? await findCustomerByDoc(customerDoc) : null;

  const ie = customerData?.inscricao_estadual || '';
  const indIEDest = isConsumidorFinal
    ? '9'
    : ie.toUpperCase() === 'ISENTO' || !ie
      ? '9'
      : '1';

  const buildEnderDest = () => {
    if (!customerData) {
      return {
        xLgr: 'BA 160',
        nro: 'S/N',
        xBairro: 'CENTRO',
        cMun: '2927408',
        xMun: 'IBOTIRAMA',
        UF: 'BA',
        CEP: '47520000',
        cPais: '1058',
        xPais: 'BRASIL',
        fone: '',
      };
    }
    return {
      xLgr: customerData.logradouro || 'RUA NAO INFORMADA',
      nro: customerData.numero || 'S/N',
      xBairro: customerData.bairro || 'CENTRO',
      cMun: '2927408',
      xMun: customerData.city || 'IBOTIRAMA',
      UF: customerData.state || env.sefazUf || 'BA',
      CEP: (customerData.zip_code || '47520000').replace(/\D/g, ''),
      cPais: '1058',
      xPais: 'BRASIL',
      fone: (customerData.phone || '').replace(/\D/g, ''),
    };
  };

  const xNome = isConsumidorFinal
    ? 'CONSUMIDOR NÃO IDENTIFICADO'
    : customerData?.razao_social || customerData?.establishment_name || sale.customer_name;

  const destData = {
    CPF: hasValidDoc && customerDoc.length === 11 ? customerDoc : undefined,
    CNPJ: hasValidDoc && customerDoc.length === 14 ? customerDoc : undefined,
    xNome: xNome,
    enderDest: buildEnderDest(),
    indIEDest: indIEDest,
    ...(indIEDest === '1' && ie ? { IE: ie } : {}),
  };

  const nNF = String(await getNextNnf());
  const cNF = gerarCNF();
  const chave44 = montarChaveAcesso({
    cUF: '29',
    aaMm: new Date().toISOString().slice(2, 7).replace('-', ''),
    cnpj: env.cnpjEmitente,
    mod: '55',
    serie: '1',
    nNF,
    tpEmis: '1',
    cNF,
  });

  const total = Number(sale.total) || 0;

  const nfeData = {
    nfeProc: {
      '@versao': '4.00',
      '@xmlns': 'http://www.portalfiscal.inf.br/nfe',
      NFe: {
        infNFe: {
          '@versao': '4.00',
          '@Id': `NFe${chave44}`,
          ide: {
            cUF: '29',
            cNF,
            natOp: 'Venda de mercadoria',
            mod: '55',
            serie: '1',
            nNF,
            dhEmi: new Date().toISOString(),
            dhSaiEnt: new Date().toISOString(),
            tpNF: '1',
            idDest: '1',
            cMunFG: '2927408',
            tpImp: '1',
            tpEmis: '1',
            cDV: chave44[43],
            tpAmb: '2',
            finNFe: '1',
            indFinal,
            indPres: '1',
            procEmi: '0',
            verProc: 'Geleiro PRO NF-e 1.0 (Sandbox)',
          },
          emit: {
            CNPJ: env.cnpjEmitente,
            xNome: 'GDS PRODUTOS ALIMENTICIOS LTDA',
            xFant: 'Gelo do Sertao',
            enderEmit: {
              xLgr: 'RODOVIA BA 160',
              nro: '2040',
              xBairro: 'SAO JOAO',
              cMun: '2927408',
              xMun: 'IBOTIRAMA',
              UF: env.sefazUf,
              CEP: '47520000',
              cPais: '1058',
              xPais: 'BRASIL',
              fone: '77999820028',
            },
            IE: '117178795',
            CRT: '1',
          },
          dest: destData,
          det: items.map((item, index) => ({
            '@nItem': String(index + 1),
            prod: {
              cProd: item.product_id || String(index + 1),
              cEAN: 'SEM GTIN',
              xProd: item.product_name || 'Gelo',
              NCM: item.ncm || '22019000',
              CFOP: item.cfop || '5101',
              uCom: 'UN',
              qCom: String(item.quantity || 1),
              vUnCom: Number(item.price_at_sale || 0).toFixed(2),
              vProd: Number((item.quantity || 1) * (item.price_at_sale || 0)).toFixed(2),
              cEANTrib: 'SEM GTIN',
              uTrib: 'UN',
              qTrib: String(item.quantity || 1),
              vUnTrib: Number(item.price_at_sale || 0).toFixed(2),
              indTot: '1',
            },
            imposto: {
              ICMS: {
                ICMSSN102: {
                  orig: '0',
                  CSOSN: '102',
                },
              },
              PIS: { PISNT: { CST: '07' } },
              COFINS: { COFINSNT: { CST: '07' } },
            },
          })),
          total: {
            ICMSTot: {
              vBC: '0.00', vICMS: '0.00', vICMSDeson: '0.00', vFCP: '0.00',
              vBCST: '0.00', vST: '0.00', vFCPST: '0.00', vFCPSTRet: '0.00',
              vProd: total.toFixed(2), vFrete: '0.00', vSeg: '0.00', vDesc: '0.00',
              vII: '0.00', vIPI: '0.00', vIPIDevol: '0.00',
              vPIS: '0.00', vCOFINS: '0.00', vOutro: '0.00',
              vNF: total.toFixed(2),
            },
          },
          transp: { modFrete: '9' },
          pag: { detPag: [{ tPag: '01', vPag: total.toFixed(2) }] },
        },
      },
      protNFe: {
        '@versao': '4.00',
        infProt: {
          chNFe: chave44,
          dhRecbto: new Date().toISOString(),
          nProt: 'SBX000000000000',
          digVal: 'SANDBOX_MOCK_DIGEST',
          cStat: '100',
          xMotivo: 'SANDBOX - Nota gerada em modo de teste local',
        },
      },
    },
  };

  const xmlContent = buildXmlFromJson(nfeData);
  const tempDir = ensureTempDir();
  const filePath = path.join(tempDir, `nota_sandbox_${saleId.replace(/[^a-zA-Z0-9]/g, '_')}.xml`);

  fs.writeFileSync(filePath, xmlContent, 'utf-8');
  console.log(`[NfeGenerator] XML salvo em: ${filePath}`);

  await updateSaleNfeStatus(saleId, 'sandbox', chave44, `file://${filePath}`, 'SBX000000000000', xmlContent);

  return {
    success: true,
    message: 'XML gerado em modo Sandbox',
    invoiceKey: chave44,
    invoiceUrl: `file://${filePath}`,
    nfeNumber: 'SBX000000000000',
    nfeXml: xmlContent,
  };
}

async function productionEmit(saleId: string, customerDoc: string, sefazService: SefazService): Promise<NfeEmitirResult> {
  console.log(`[NfeGenerator] MODO PRODUÇÃO - Emitindo NF-e para venda ${saleId}`);

  const { sale, items } = await getSaleWithItems(saleId);

  const isConsumidorFinal = !customerDoc || sale.customer_name.toUpperCase() === 'CONSUMIDOR NÃO IDENTIFICADO';
  const customerData = customerDoc ? await findCustomerByDoc(customerDoc) : null;

  const ie = customerData?.inscricao_estadual || '';
  const indIEDest = isConsumidorFinal
    ? '9'
    : ie.toUpperCase() === 'ISENTO' || !ie
      ? '9'
      : '1';

  const xNome = isConsumidorFinal
    ? 'CONSUMIDOR NÃO IDENTIFICADO'
    : customerData?.razao_social || customerData?.establishment_name || sale.customer_name;

  let isNewNnf = false;
  let nNF = sale.nfe_number;

  if (!nNF) {
    nNF = String(await getNextNnf());
    isNewNnf = true;
  } else {
    console.log(`[NfeGenerator] Reutilizando nNF existente ${nNF} para a venda ${saleId}`);
  }

  await updateSaleNfeStatus(saleId, 'pendente_emissao', undefined, undefined, nNF);

  try {
    const resultado = await sefazService.emitirNFe({
      nNF,
      serie: sale.nfe_series || '1',
      saleId: sale.id,
      customerName: xNome,
      customerDoc: isConsumidorFinal ? '' : customerDoc,
      total: sale.total ?? 0,
      customerData: {
        logradouro: customerData?.logradouro || '',
        numero: customerData?.numero || '',
        bairro: customerData?.bairro || '',
        city: customerData?.city || '',
        state: customerData?.state || '',
        zipCode: (customerData?.zip_code || '').replace(/\D/g, ''),
        phone: (customerData?.phone || '').replace(/\D/g, ''),
        ie: ie,
        indIEDest: indIEDest,
      },
      items: items.map(item => ({
        productName: item.product_name,
        quantity: item.quantity,
        priceAtSale: item.price_at_sale,
        ncm: item.ncm || '22019000',
        cfop: item.cfop || '5101',
      })),
    });

    if (resultado.success) {
      await updateSaleNfeStatus(
        saleId,
        'autorizada',
        resultado.invoiceKey,
        resultado.invoiceUrl,
        resultado.nfeNumber,
        resultado.nfeXml,
      );
    } else {
      await updateSaleNfeStatus(saleId, 'erro', undefined, undefined, nNF);
      if (isNewNnf) {
        await cancelNnf();
      }
    }

    return resultado;
  } catch (error) {
    console.error(`[NfeGenerator] Exceção durante emissão de NF-e para venda ${saleId}:`, error);
    await updateSaleNfeStatus(saleId, 'erro', undefined, undefined, nNF);
    if (isNewNnf) {
      await cancelNnf();
    }
    throw error;
  }
}

export async function generateNfeXml(
  saleId: string,
  customerDoc: string | undefined,
  sefazService: SefazService
): Promise<NfeEmitirResult> {
  const doc = customerDoc?.replace(/\D/g, '') || '';

  const { sale } = await getSaleWithItems(saleId);

  if (sale.nfe_status === 'autorizada') {
    return {
      success: true,
      message: 'NF-e já foi emitida anteriormente para esta venda',
      invoiceKey: sale.invoice_key || undefined,
      invoiceUrl: sale.invoice_url || undefined,
      nfeNumber: sale.nfe_number || undefined,
    };
  }

  if (sale.nfe_status === 'pendente_emissao') {
    console.log(`[NfeGenerator] Venda ${saleId} encontra-se em status 'pendente_emissao'. Retentando emissão com nNF=${sale.nfe_number}...`);
  }

  if (IS_MOCK_LOCAL) {
    return sandboxEmit(saleId, doc);
  }

  return productionEmit(saleId, doc, sefazService);
}
