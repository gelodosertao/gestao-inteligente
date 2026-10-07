import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { SchemaLoader } from '@treeunfe/shared';
import { formatNfeAaMm, formatNfeDateTime, montarChaveAcesso, retryWithBackoff } from '../src/utils/nfe-utils';
import { resolveCityIbge } from '../src/utils/ibge-utils';
import { allocateCents, FiscalContextSchema, resolveFiscalDecision, type FiscalConfiguration, type FiscalSource } from '../src/services/FiscalRules';
import { buildFiscalPayload } from '../src/services/FiscalPayload';
import { recoverAuthorizedXml, verifiedRejection } from '../src/services/XmlProtocol';
import { readCompletePdf } from '../src/utils/pdf-utils';

const issueParams = {
  cUF: '29',
  aaMm: '2609',
  cnpj: '47026674000129',
  mod: '55',
  serie: '1',
  nNF: '42',
  tpEmis: '1',
  cNF: '12345678',
};

test('schema de autorização está disponível no caminho usado pela biblioteca fiscal', () => {
  const { schemaPath } = SchemaLoader('NFEAutorizacao');
  assert.equal(existsSync(schemaPath), true);
  assert.match(readFileSync(schemaPath, 'utf8'), /schema/);
});

test('aguarda a gravação completa do PDF antes de ler o DANFE', async () => {
  const file = path.join(tmpdir(), `nfe-danfe-test-${randomUUID()}.pdf`);
  const pendingWrite = new Promise<void>(resolve => setTimeout(resolve, 60))
    .then(() => writeFile(file, '%PDF-1.4\ncorpo\n%%EOF\n'));
  try {
    const pdf = await readCompletePdf(file, 1000);
    assert.match(pdf.toString('latin1'), /%%EOF/);
    await pendingWrite;
  } finally {
    await pendingWrite;
    await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
});

test('rascunho aceita indicativo de venda direta no contexto fiscal', () => {
  const parsed = FiscalContextSchema.parse({ operation: 'internal_b2b_own_production',
    operationDate: '2026-10-07', buyerPresence: 9, intermediary: 0 });
  assert.equal(parsed.intermediary, 0);
});

test('a chave fiscal preserva o CNPJ do emitente e tem 44 dígitos', () => {
  const key = montarChaveAcesso(issueParams);

  assert.match(key, /^\d{44}$/);
  assert.equal(key.slice(6, 20), issueParams.cnpj);
  assert.notEqual(key, montarChaveAcesso({ ...issueParams, cnpj: '12345678000190' }));
});

test('o período fiscal é formatado como AAMM', () => {
  assert.equal(formatNfeAaMm(new Date(2026, 8, 22)), '2609');
  assert.equal(formatNfeAaMm(new Date('2026-11-01T02:30:00Z')), '2610');
  assert.equal(formatNfeDateTime(new Date('2026-11-01T02:30:00Z')), '2026-10-31T23:30:00-03:00');
  assert.equal(formatNfeDateTime(new Date('2026-10-07T16:38:32.804Z')), '2026-10-07T13:38:32-03:00');
});

test('municípios da Bahia preservam seus códigos oficiais sem fallback fiscal', () => {
  assert.deepEqual(resolveCityIbge('Ibotirama', 'BA'), { cMun: 2913200, xMun: 'IBOTIRAMA', UF: 'BA' });
  assert.deepEqual(resolveCityIbge('Salvador', 'BA'), { cMun: 2927408, xMun: 'SALVADOR', UF: 'BA' });
  assert.deepEqual(resolveCityIbge('Guanambi', 'BA'), { cMun: 2911709, xMun: 'GUANAMBI', UF: 'BA' });
  assert.throws(() => resolveCityIbge('Cidade desconhecida', 'BA'), /lista oficial do IBGE/);
  assert.deepEqual(resolveCityIbge('Abaíra', 'BA'), { cMun: 2900108, xMun: 'ABAÍRA', UF: 'BA' });
  assert.throws(() => resolveCityIbge('Ibotirama', 'SP'), /Bahia/);
});

test('uma falha transitória pode ser repetida sem alterar o resultado', async () => {
  let attempts = 0;
  const result = await retryWithBackoff(async () => {
    attempts++;
    if (attempts === 1) throw new Error('network timeout');
    return 'ok';
  }, { maxRetries: 1, baseDelayMs: 0 });

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('uma falha permanente não é repetida', async () => {
  let attempts = 0;

  await assert.rejects(retryWithBackoff(async () => {
    attempts++;
    throw new Error('invalid document');
  }, { maxRetries: 2, baseDelayMs: 0 }), /invalid document/);
  assert.equal(attempts, 1);
});

const source: FiscalSource = {
  sale: { id: 'sale', source: 'ATACADO', status: 'Pending', total: 36, discount: 1, delivery_fee: 1,
    payment_method: 'Pix', amount_paid: 0, customer_id: 'customer' },
  customer: { id: 'customer', cpf_cnpj: '11222333000181', razao_social: 'Cliente Teste Ltda',
    inscricao_estadual: '123456789', logradouro: 'Rua Teste', numero: '1', bairro: 'Centro',
    city: 'Ibotirama', state: 'BA', zip_code: '47520000' },
  items: [{ product_id: 'product', product_name: 'Produto de teste', quantity: 2, price_at_sale: 18 }],
};
const context = { operation: 'internal_b2b_own_production' as const, operationDate: '2026-10-06', buyerPresence: 2 as const,
  intermediary: 0 as const, freightMode: 0 as const, finalConsumer: false, paymentTiming: 'term' as const, dueDate: '2026-10-20' };
const config: FiscalConfiguration = {
  issuer: { issuer_cnpj: '47026674000129', series: 2, series_confirmed: true,
    config: { crt: 1, name: 'Emitente Teste Ltda', ie: '117178795', xmlAuthorizedTaxId: '13937073000156',
      technicalResponsible: { cnpj: '47026674000129', contact: 'Suporte GDS',
        email: 'gelodosertaobahia@gmail.com', phone: '7798129383' }, address: {
      street: 'Rodovia Teste', number: '1', district: 'Centro', city: 'Ibotirama', cityCode: 2913200,
      state: 'BA', zipCode: '47520000' } } },
  rules: [{ id: 'rule', operation: context.operation, valid_from: '2026-01-01', valid_until: '2026-12-31', approved: true,
    config: { cfop: '5101', csosn: '102', nature: 'Venda de producao do estabelecimento', idDest: 1, indFinal: 0,
      additionalInfo: 'DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE ICMS, ISS E IPI.',
      pis: { group: 'PISOutr', cst: '49', rate: 0 }, cofins: { group: 'COFINSOutr', cst: '49', rate: 0 },
      ibsCbs: { mode: 'none' }, creditApproved: true } }],
  products: [{ product_id: 'product', ncm: '22019000', cest: '2806200', origin: 0, unit: 'UN', approved: true }],
  payments: [{ method: 'Pix', code: '17', active: true }],
};
const fixtureCdV = Number(montarChaveAcesso({ cUF: '29', aaMm: '2610', cnpj: '47026674000129',
  mod: '55', serie: '2', nNF: '1', tpEmis: '1', cNF: '12345678' }).at(-1));

test('venda a prazo usa regra aprovada e fecha desconto, frete e PIX sem marcar como paga', () => {
  const result = resolveFiscalDecision(source, context, config, 2, '47026674000129', '2026-10-06');
  assert.deepEqual(result.issues, []);
  assert.ok(result.decision);
  const payload = buildFiscalPayload({ nNF: '1', serie: '2', cNF: '12345678', cDV: fixtureCdV, dhEmi: '2026-10-06T12:00:00-03:00', fiscal: result.decision });
  const info = (Array.isArray(payload.NFe) ? payload.NFe[0] : payload.NFe).infNFe as any;
  assert.equal(info.ide.cDV, fixtureCdV);
  assert.deepEqual(Object.keys(info.ide).slice(Object.keys(info.ide).indexOf('tpEmis'), Object.keys(info.ide).indexOf('tpAmb') + 1), ['tpEmis', 'cDV', 'tpAmb']);
  assert.equal(info.ide.indPres, 2);
  assert.equal(info.ide.indIntermed, 0);
  assert.deepEqual(Object.keys(info.ide).slice(Object.keys(info.ide).indexOf('indPres'), Object.keys(info.ide).indexOf('procEmi') + 1), ['indPres', 'indIntermed', 'procEmi']);
  assert.deepEqual(info.autXML, { CNPJ: '13937073000156' });
  assert.deepEqual(info.infRespTec, { CNPJ: '47026674000129', xContato: 'Suporte GDS',
    email: 'gelodosertaobahia@gmail.com', fone: '7798129383' });
  assert.match(info.infAdic.infCpl, /SIMPLES NACIONAL/);
  assert.equal(info.transp.modFrete, 0);
  assert.equal(info.det[0].prod.CEST, '2806200');
  assert.equal(info.det[0].imposto.PIS.PISOutr.CST, '49');
  assert.equal(info.pag.detPag[0].tPag, '17');
  assert.equal(info.pag.detPag[0].indPag, 1);
  assert.equal(info.cobr.dup[0].dVenc, '2026-10-20');
  assert.equal(info.total.ICMSTot.vNF, '36.00');
  assert.equal(source.sale.status, 'Pending');
});

test('intermediador é exigido para venda remota e marketplace segue bloqueado', () => {
  const missing = resolveFiscalDecision(source, { ...context, intermediary: undefined }, config, 2, '47026674000129', '2026-10-06');
  assert.ok(missing.issues.some(issue => issue.field === 'intermediary'));
  const marketplace = resolveFiscalDecision(source, { ...context, intermediary: 1 }, config, 2, '47026674000129', '2026-10-06');
  assert.ok(marketplace.issues.some(issue => issue.field === 'intermediary'));
  const outside = resolveFiscalDecision(source, { ...context, buyerPresence: 5, intermediary: undefined }, config, 2, '47026674000129', '2026-10-06');
  assert.ok(outside.decision);
  const payload = buildFiscalPayload({ nNF: '1', serie: '2', cNF: '12345678', cDV: fixtureCdV, dhEmi: '2026-10-06T12:00:00-03:00', fiscal: outside.decision });
  const info = (Array.isArray(payload.NFe) ? payload.NFe[0] : payload.NFe).infNFe as any;
  assert.equal('indIntermed' in info.ide, false);
});

test('venda interestadual é selecionável mas bloqueada sem regra e município aprovados', () => {
  const review = resolveFiscalDecision({ ...source, customer: { ...source.customer!, state: 'SP' } },
    { ...context, operation: 'interstate_b2b_own_production' }, config, 2, '47026674000129', '2026-10-06');
  assert.equal(review.decision, undefined);
  assert.ok(review.issues.some(issue => issue.field === 'operation'));
  assert.ok(review.issues.some(issue => issue.field === 'rule'));
});

test('IE baiana com sufixo cadastral ME usa apenas os nove dígitos no XML', () => {
  const formattedSource = structuredClone(source);
  formattedSource.customer!.inscricao_estadual = '123.456.789 ME';
  const review = resolveFiscalDecision(formattedSource, context, config, 2, '47026674000129', '2026-10-06');
  assert.equal(review.issues.some(issue => issue.field === 'customer.inscricaoEstadual'), false);
  assert.ok(review.decision);
  const payload = buildFiscalPayload({ nNF: '1', serie: '2', cNF: '12345678', cDV: fixtureCdV, dhEmi: '2026-10-06T12:00:00-03:00', fiscal: review.decision });
  const info = (Array.isArray(payload.NFe) ? payload.NFe[0] : payload.NFe).infNFe as any;
  assert.equal(info.dest.IE, '123456789');

  formattedSource.customer!.inscricao_estadual = 'ISENTO 123456789';
  const invalid = resolveFiscalDecision(formattedSource, context, config, 2, '47026674000129', '2026-10-06');
  assert.equal(invalid.issues.some(issue => issue.field === 'customer.inscricaoEstadual'), true);
});

test('emissão falha fechada quando série, regra, data, classificação ou presença não estão válidas', () => {
  const invalid = structuredClone(config);
  invalid.issuer!.series_confirmed = false;
  invalid.rules[0].approved = false;
  invalid.products = [];
  delete (invalid.rules[0].config as any).additionalInfo;
  assert.ok(resolveFiscalDecision(source, context, { ...config, rules: invalid.rules.map(rule => ({ ...rule, approved: true })) }, 1,
    '47026674000129', '2026-10-06').issues.some(i => i.field === 'rule.config'));
  delete (invalid.issuer!.config as any).xmlAuthorizedTaxId;
  assert.ok(resolveFiscalDecision(source, context, invalid, 1, '47026674000129', '2026-10-06')
    .issues.some(i => i.field === 'issuer.xmlAuthorizedTaxId'));
  assert.ok(resolveFiscalDecision(source, { ...context, buyerPresence: undefined }, invalid, 1,
    '47026674000129', '2026-10-06').issues.some(i => i.field === 'buyerPresence'));
  assert.ok(resolveFiscalDecision(source, context, invalid, 1, '47026674000129', '2026-10-06').issues.some(i => i.field === 'series'));
  assert.ok(resolveFiscalDecision(source, { ...context, operationDate: '2027-01-01' }, config, 1,
    '47026674000129', '2027-01-01').issues.some(i => i.field === 'rule'));
  assert.ok(resolveFiscalDecision({ ...source, customer: { ...source.customer!, state: 'SP' } }, context, config,
    1, '47026674000129', '2026-10-06').issues.some(i => i.field === 'customer.state'));
  assert.ok(resolveFiscalDecision({ ...source, sale: { ...source.sale, total: 37 } }, context, config,
    1, '47026674000129', '2026-10-06').issues.some(i => i.field === 'totals'));
});

test('rateio em centavos preserva soma sem perder um centavo', () => {
  assert.deepEqual(allocateCents(2, [1, 1, 1]), [1, 1, 0]);
});

test('conciliação preserva bytes da NF-e assinada e exige protocolo compatível', () => {
  const key = montarChaveAcesso(issueParams);
  const signed = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${key}"><ide><tpAmb>2</tpAmb></ide></infNFe><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI="#NFe${key}"><DigestValue>abc123=</DigestValue></Reference></SignedInfo></Signature></NFe>`;
  const protocol = `<protNFe xmlns="http://www.portalfiscal.inf.br/nfe"><infProt><tpAmb>2</tpAmb><chNFe>${key}</chNFe><digVal>abc123=</digVal><nProt>123456789</nProt><cStat>100</cStat><xMotivo>Autorizado</xMotivo></infProt></protNFe>`;
  assert.ok(recoverAuthorizedXml(signed, protocol, 2).includes(signed));
  assert.throws(() => recoverAuthorizedXml(signed, protocol.replace('abc123=', 'alterado'), 2), /não corresponde/);
});

test('rejeição recebida só é definitiva quando protocolo, chave e ambiente conferem', () => {
  const key = montarChaveAcesso(issueParams);
  const response = `<retEnviNFe><cStat>104</cStat><protNFe><infProt><tpAmb>2</tpAmb><chNFe>${key}</chNFe><cStat>486</cStat><xMotivo>Grupo de Autorizacao ausente</xMotivo></infProt></protNFe></retEnviNFe>`;
  assert.equal(verifiedRejection(response, key, 2), 'Rejeição 486: Grupo de Autorizacao ausente');
  assert.equal(verifiedRejection(response, key.replace(/.$/, '0'), 2), undefined);
  assert.equal(verifiedRejection(response, key, 1), undefined);
  assert.equal(verifiedRejection(response.replace('<cStat>486</cStat>', '<cStat>539</cStat>'), key, 2), undefined);
});
