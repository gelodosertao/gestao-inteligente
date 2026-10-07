import { z } from 'zod';
import { resolveCityIbge } from '../utils/ibge-utils';
import type { CustomerData } from './SupabaseService';

export const FiscalContextSchema = z.object({
  operation: z.enum(['internal_b2b_own_production', 'interstate_b2b_own_production']).optional(),
  operationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  buyerPresence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(9)]).optional(),
  intermediary: z.union([z.literal(0), z.literal(1)]).optional(),
  freightMode: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(9)]).optional(),
  finalConsumer: z.boolean().optional(),
  paymentTiming: z.enum(['cash', 'term']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();
export type FiscalContext = z.infer<typeof FiscalContextSchema>;
export interface FiscalIssue { field: string; message: string }

const tax = (groups: [string, string]) => z.object({ group: z.enum(groups), cst: z.string().regex(/^\d{2}$/), rate: z.number().min(0).max(100) });
export const FiscalRuleSchema = z.object({
  cfop: z.string().regex(/^\d{4}$/), csosn: z.string().regex(/^\d{3}$/), nature: z.string().min(1).max(60),
  additionalInfo: z.string().min(1).max(5000),
  idDest: z.number(), indFinal: z.number(), pis: tax(['PISNT', 'PISOutr']), cofins: tax(['COFINSNT', 'COFINSOutr']),
  creditApproved: z.boolean().default(false),
  ibsCbs: z.object({
    mode: z.enum(['none', 'simples', 'regular']), cst: z.string().regex(/^\d{3}$/).optional(),
    cClassTrib: z.string().regex(/^\d{6}$/).optional(),
    ibsStateRate: z.number().min(0).max(100).optional(), ibsCityRate: z.number().min(0).max(100).optional(),
    cbsRate: z.number().min(0).max(100).optional(),
  }),
});
export type FiscalRuleConfig = z.infer<typeof FiscalRuleSchema>;
export const IssuerSchema = z.object({
  crt: z.number(), name: z.string().min(2).max(60), tradeName: z.string().max(60).optional(), ie: z.string().min(1),
  xmlAuthorizedTaxId: z.string().regex(/^(?:\d{11}|\d{14})$/)
    .refine(value => value.length === 14 ? validCnpj(value) : validCpf(value)).optional(),
  technicalResponsible: z.object({
    cnpj: z.string().regex(/^\d{14}$/).refine(validCnpj),
    contact: z.string().min(2).max(60),
    email: z.email().max(60),
    phone: z.string().regex(/^\d{6,14}$/),
  }).optional(),
  address: z.object({ street: z.string().min(1).max(60), number: z.string().min(1).max(60), district: z.string().min(1).max(60),
    city: z.string().min(1).max(60), cityCode: z.number().int().positive(), state: z.string().length(2),
    zipCode: z.string().regex(/^\d{8}$/), phone: z.string().optional() }),
});
export interface FiscalSource {
  sale: { id: string; source: string; status: string; total: number; discount?: number; delivery_fee?: number;
    payment_method: string; payment_splits?: { method: string; amount: number }[]; amount_paid?: number;
    customer_id?: string; fiscal_context?: FiscalContext; [key: string]: unknown };
  customer: CustomerData | null;
  items: { product_id: string; product_name: string; quantity: number; price_at_sale: number; [key: string]: unknown }[];
}
export interface FiscalConfiguration {
  issuer: { issuer_cnpj: string; series: number; series_confirmed: boolean; config: unknown } | null;
  rules: { id: string; operation: string; valid_from: string; valid_until: string | null; approved: boolean; config: unknown }[];
  products: { product_id: string; ncm: string; cest?: string | null; origin: number; unit: string; approved: boolean }[];
  payments: { method: string; code: string; active: boolean }[];
}
export interface FiscalDecision {
  issuer: z.infer<typeof IssuerSchema>; rule: FiscalRuleConfig; context: FiscalContext; customer: CustomerData;
  environment: number; cnpj: string;
  items: { productId: string; productName: string; quantity: number; unitPrice: number; ncm: string;
    cest?: string; origin: number; unit: string; subtotal: number; discount: number; freight: number }[];
  payments: { code: string; amount: number }[];
  totals: { products: number; discount: number; freight: number; total: number };
}

export function operationToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const cents = (value: unknown) => Math.round(Number(value) * 100);
const validDate = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function validCnpj(value: string): boolean {
  const doc = value.replace(/\D/g, '');
  if (!/^\d{14}$/.test(doc) || /^(\d)\1+$/.test(doc)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, n, i) => s + Number(doc[i]) * n, 0);
    const mod = sum % 11;
    return Number(doc[length]) === (mod < 2 ? 0 : 11 - mod);
  };
  return check(12) && check(13);
}
export function validCpf(value: string): boolean {
  const doc = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(doc) || /^(\d)\1+$/.test(doc)) return false;
  const digit = (length: number) => {
    const sum = Array.from({ length }, (_, index) => Number(doc[index]) * (length + 1 - index))
      .reduce((total, current) => total + current, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return Number(doc[9]) === digit(9) && Number(doc[10]) === digit(10);
}

/** Largest remainder distribution keeps line totals equal to the invoice to the cent. */
export function allocateCents(amount: number, weights: number[]): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(amount) || amount < 0 || !total || weights.some(n => n < 0 || !Number.isSafeInteger(n))) throw new Error('Valores inválidos para rateio.');
  const fractions = weights.map((weight, index) => ({ index, exact: amount * weight / total }));
  const parts = fractions.map(n => Math.floor(n.exact));
  const remainder = amount - parts.reduce((sum, n) => sum + n, 0);
  fractions.sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.index - b.index);
  for (let i = 0; i < remainder; i++) parts[fractions[i].index]++;
  return parts;
}

export function resolveFiscalDecision(source: FiscalSource, context: FiscalContext, config: FiscalConfiguration,
  environment: number, cnpj: string, today = operationToday()): { issues: FiscalIssue[]; decision?: FiscalDecision; ruleId?: string } {
  const issues: FiscalIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  const { sale, customer, items } = source;
  if (sale.source !== 'ATACADO' || !['Pending', 'Completed'].includes(sale.status)) add('sale', 'Venda indisponível para emissão pelo PDV Atacado.');
  if (!validDate(context.operationDate)) add('operationDate', 'Informe uma data válida para a operação.');
  else if (context.operationDate !== today) add('operationDate', 'Revise a data da operação para emitir hoje.');
  if (context.operation !== 'internal_b2b_own_production') add('operation', 'Venda fora da Bahia: CFOP 6101 é referência para produção própria, mas a emissão aguarda regra interestadual aprovada e suporte aos municípios de destino.');
  if (context.finalConsumer !== false) add('finalConsumer', 'Esta regra atende apenas venda empresarial para não consumidor final.');
  if (![1, 2, 3, 5, 9].includes(context.buyerPresence as number)) add('buyerPresence', 'Informe como a venda ocorreu.');
  if ([1, 2, 3, 9].includes(context.buyerPresence as number) && context.intermediary === undefined) add('intermediary', 'Informe se a venda foi feita diretamente pela GDS ou por marketplace/intermediador.');
  if (context.intermediary === 1) add('intermediary', 'Venda com marketplace/intermediador exige CNPJ e identificador do intermediador; emissão ainda não suportada.');
  if (context.buyerPresence === 5 && context.intermediary !== undefined) add('intermediary', 'Venda presencial fora do estabelecimento não deve informar intermediador.');
  if (![0, 1, 2, 3, 4, 9].includes(context.freightMode as number)) add('freightMode', 'Informe a responsabilidade pelo frete.');
  if (!['cash', 'term'].includes(context.paymentTiming || '')) add('paymentTiming', 'Informe se o pagamento é à vista ou a prazo.');
  if (!customer || customer.id !== sale.customer_id) add('customerId', 'Vincule o cliente cadastrado à venda.');
  if (customer) {
    if (!validCnpj(customer.cpf_cnpj || '')) add('customer.cpfCnpj', 'A operação B2B exige CNPJ válido no cadastro do cliente.');
    if (!customer.razao_social || customer.razao_social.length > 60) add('customer.razaoSocial', 'Informe a razão social do cliente com até 60 caracteres.');
    for (const field of ['logradouro', 'numero', 'bairro', 'city', 'state'] as const) {
      if (!customer[field]?.trim() || customer[field]!.length > 60) add(`customer.${field}`, 'Complete o endereço fiscal do cliente com até 60 caracteres por campo.');
    }
    if (!/^\d{8}$/.test((customer.zip_code || '').replace(/\D/g, ''))) add('customer.zipCode', 'Informe o CEP com oito dígitos.');
    if (context.operation === 'internal_b2b_own_production' && customer.state?.toUpperCase() !== 'BA') add('customer.state', 'Cliente fora da Bahia: selecione venda interestadual.');
    if (context.operation === 'interstate_b2b_own_production' && customer.state?.toUpperCase() === 'BA') add('customer.state', 'Cliente da Bahia: selecione venda dentro do estado.');
    const ieText = (customer.inscricao_estadual || '').trim();
    const ieDigits = ieText.replace(/ME$/i, '').replace(/[.\-/\s]/g, '');
    if (!/^[\d.\-/\s]+(?:ME)?$/i.test(ieText) || !/^\d{9}$/.test(ieDigits)) {
      add('customer.inscricaoEstadual', 'Revise a inscrição estadual; cliente isento/não contribuinte precisa de regra específica.');
    }
    try { resolveCityIbge(customer.city, customer.state); } catch (e) { add('customer.city', (e as Error).message); }
  }
  const issuer = IssuerSchema.safeParse(config.issuer?.config);
  if (!issuer.success || config.issuer?.issuer_cnpj !== cnpj || !validCnpj(cnpj)) add('issuer', 'Complete e revise a configuração fiscal do emitente neste ambiente.');
  if (!config.issuer?.series_confirmed || config.issuer.series === 1 || !Number.isInteger(config.issuer?.series) || config.issuer.series < 1 || config.issuer.series > 889) add('series', 'Confirme uma série própria disponível para este emissor e ambiente.');
  if (issuer.success) {
    if (issuer.data.crt !== 1 || issuer.data.address.state !== 'BA' || !/^\d{8,14}$/.test(issuer.data.ie.replace(/\D/g, ''))) {
      add('issuer', 'Regra disponível apenas para emitente CRT 1 da Bahia com IE conferida.');
    }
    try {
      if (resolveCityIbge(issuer.data.address.city, issuer.data.address.state).cMun !== issuer.data.address.cityCode) {
        add('issuer.address', 'Código IBGE do emitente difere do município informado.');
      }
    } catch (error) { add('issuer.address', (error as Error).message); }
    if (issuer.data.address.state === 'BA' && !issuer.data.xmlAuthorizedTaxId) {
      add('issuer.xmlAuthorizedTaxId', 'Informe o CPF/CNPJ do contabilista ou o CNPJ da SEFAZ Bahia autorizado a acessar o XML.');
    }
    if (!issuer.data.technicalResponsible) {
      add('issuer.technicalResponsible', 'Informe os dados de suporte técnico da GDS para identificar o emissor no XML.');
    }
  }
  const matches = config.rules.filter(r => r.approved && r.operation === context.operation && !!context.operationDate && r.valid_from <= context.operationDate && (!r.valid_until || r.valid_until >= context.operationDate));
  if (matches.length !== 1) add('rule', matches.length ? 'Há regras fiscais sobrepostas. Revise a configuração.' : 'Nenhuma regra fiscal aprovada para a operação e data.');
  const rule = FiscalRuleSchema.safeParse(matches[0]?.config);
  if (matches.length === 1 && !rule.success) add('rule.config', 'Complete a configuração aprovada de PIS, COFINS, IBS/CBS e informações complementares.');
  if (rule.success) {
    const r = rule.data;
    if (r.cfop !== '5101' || r.csosn !== '102' || r.idDest !== 1 || r.indFinal !== 0) add('rule', 'Tratamento fiscal ainda não suportado para esta operação.');
    for (const [name, t] of [['pis', r.pis], ['cofins', r.cofins]] as const) {
      if (!(t.group.endsWith('NT') ? ['04', '05', '06', '07', '08', '09'].includes(t.cst) : t.cst === '49') || t.rate !== 0) add(`rule.${name}`, 'Grupo, CST ou alíquota ainda não homologados neste emissor.');
    }
    // A rule dated 2026 must never silently carry the tax exemption into 2027.
    if (r.ibsCbs.mode === 'none' && (!matches[0]?.valid_until || matches[0].valid_until > '2026-12-31')) add('rule.ibsCbs', 'A dispensa de IBS/CBS precisa ter vigência encerrada em 2026.');
    if (r.ibsCbs.mode !== 'none') add('rule.ibsCbs', 'IBS/CBS exige homologação do leiaute e regra específica antes da ativação.');
    if (context.paymentTiming === 'term' && !r.creditApproved) add('paymentTiming', 'Tratamento fiscal das vendas a prazo aguarda aprovação do contador.');
  }
  const total = cents(sale.total), discount = cents(sale.discount ?? 0), freight = cents(sale.delivery_fee ?? 0);
  const weights = items.map(i => cents(Number(i.quantity) * Number(i.price_at_sale)));
  const productsTotal = weights.reduce((a, b) => a + b, 0);
  if (!items.length || items.some((i, n) => !i.product_id || i.product_id.length > 60 ||
      !i.product_name || i.product_name.length > 120 || !Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0 ||
      !Number.isFinite(Number(i.price_at_sale)) || Number(i.price_at_sale) < 0 || weights[n] <= 0)) add('items', 'Revise códigos, descrições, quantidades e preços da venda.');
  if (![total, discount, freight, productsTotal].every(n => Number.isSafeInteger(n) && n >= 0) || total <= 0 || discount > productsTotal || productsTotal - discount + freight !== total) add('totals', 'Total divergente: produtos menos desconto mais frete devem fechar ao centavo.');
  if (context.freightMode === 9 && freight > 0) add('freightMode', 'Venda com frete cobrado não pode indicar ausência de transporte.');
  items.forEach(item => {
    const p = config.products.filter(p => p.product_id === item.product_id && p.approved &&
      (!('valid_from' in p) || (p.valid_from as string) <= context.operationDate!) &&
      (!('valid_until' in p) || !p.valid_until || (p.valid_until as string) >= context.operationDate!));
    if (p.length !== 1 || !/^\d{8}$/.test(p[0]?.ncm || '') || (p[0]?.cest && !/^\d{7}$/.test(p[0].cest)) || !p[0]?.unit || !Number.isInteger(p[0]?.origin) || p[0].origin !== 0) add(`product.${item.product_id}`, `Revise a classificação fiscal aprovada de ${item.product_name}.`);
  });
  const amountPaid = cents(sale.amount_paid ?? 0);
  if (context.paymentTiming === 'cash' && (!Number.isFinite(amountPaid) || amountPaid < total)) add('paymentTiming', 'Venda não quitada: informe pagamento a prazo ou registre o recebimento.');
  if (context.paymentTiming === 'term' && amountPaid > 0) add('paymentTiming',
    'Venda com recebimento parcial ou já quitada exige revisão da composição do pagamento antes da emissão.');
  if (context.paymentTiming === 'term' && (!validDate(context.dueDate) || !context.operationDate || context.dueDate! < context.operationDate)) add('dueDate', 'Informe o vencimento acordado, na data da operação ou depois.');
  const splits = sale.payment_method === 'Split' ? sale.payment_splits || [] : [{ method: sale.payment_method, amount: Number(sale.total) }];
  const payments: FiscalDecision['payments'] = [];
  if (!splits.length || splits.reduce((sum, p) => sum + cents(p.amount), 0) !== total) add('payments', 'Os meios de pagamento devem fechar o total da nota.');
  splits.forEach(p => {
    const mapping = config.payments.filter(m => m.active && m.method === p.method &&
      (!('valid_from' in m) || (m.valid_from as string) <= context.operationDate!) &&
      (!('valid_until' in m) || !m.valid_until || (m.valid_until as string) >= context.operationDate!));
    // Card fields (acquirer/integration) have their own layout and cannot be invented.
    if (mapping.length !== 1 || !['01', '03', '04', '15', '17', '18'].includes(mapping[0].code)) add('payments', `Meio de pagamento sem código fiscal aprovado: ${p.method}.`);
    else if (['03', '04'].includes(mapping[0].code)) add('payments', 'Cartão exige dados da transação e homologação antes da emissão.');
    else payments.push({ code: mapping[0].code, amount: cents(p.amount) / 100 });
    if (!Number.isSafeInteger(cents(p.amount)) || cents(p.amount) <= 0) add('payments', 'Valor de pagamento inválido.');
  });
  if (issues.length || !issuer.success || !rule.success || !customer) return { issues };
  const discounts = allocateCents(discount, weights), freights = allocateCents(freight, weights);
  return { issues, ruleId: matches[0].id, decision: {
    issuer: issuer.data, rule: rule.data, context, customer, environment, cnpj, payments,
    totals: { products: productsTotal / 100, discount: discount / 100, freight: freight / 100, total: total / 100 },
    items: items.map((i, n) => {
      const p = config.products.find(p => p.product_id === i.product_id && p.approved &&
        (!('valid_from' in p) || (p.valid_from as string) <= context.operationDate!) &&
        (!('valid_until' in p) || !p.valid_until || (p.valid_until as string) >= context.operationDate!))!;
      return { productId: i.product_id, productName: i.product_name, quantity: Number(i.quantity), unitPrice: Number(i.price_at_sale), ncm: p.ncm,
        cest: p.cest || undefined, origin: p.origin, unit: p.unit, subtotal: weights[n] / 100, discount: discounts[n] / 100, freight: freights[n] / 100 };
    }),
  } };
}
