import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '../config/env';
import type { FiscalActor } from './AuthService';
import { FiscalRuleSchema, IssuerSchema } from './FiscalRules';

const admin = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const date = z.iso.date();
const approval = z.object({ approved: z.boolean(), approvalReference: z.string().max(250).optional() });

const product = approval.extend({
  kind: z.literal('product'), productId: z.string().min(1).max(100), validFrom: date,
  ncm: z.string().regex(/^\d{8}$/), cest: z.union([z.string().regex(/^\d{7}$/), z.literal('')]).optional(),
  origin: z.number().int().min(0).max(8), unit: z.string().min(1).max(6),
}).strict();
const rule = approval.extend({
  kind: z.literal('rule'), operation: z.literal('internal_b2b_own_production'),
  validFrom: date, validUntil: date, config: FiscalRuleSchema,
}).strict();
const issuer = z.object({
  kind: z.literal('issuer'), environment: z.union([z.literal(1), z.literal(2)]),
  issuerCnpj: z.string().regex(/^\d{14}$/), series: z.number().int().min(2).max(889),
  seriesConfirmed: z.boolean(), seriesConfirmationReference: z.string().max(250).optional(),
  config: IssuerSchema,
}).strict();
export const FiscalConfigurationInput = z.discriminatedUnion('kind', [product, rule, issuer]).superRefine((value, ctx) => {
  if ('approved' in value && value.approved && !value.approvalReference?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Informe a referência da aprovação fiscal.' });
  }
  if (value.kind === 'issuer' && value.seriesConfirmed && !value.seriesConfirmationReference?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Informe quem confirmou a disponibilidade da série.' });
  }
  if (value.kind === 'rule' && value.validUntil < value.validFrom) {
    ctx.addIssue({ code: 'custom', message: 'A data final deve ser posterior à data inicial.' });
  }
});

export async function getFiscalConsole(actor: FiscalActor) {
  const [products, profiles, issuers, rules, documents] = await Promise.all([
    admin.from('products').select('id,name,category').eq('tenant_id', actor.tenantId)
      .in('category', ['Gelo Cubo', 'Gelo Sabor']).order('name'),
    admin.from('nfe_product_profiles').select('*').eq('tenant_id', actor.tenantId).order('valid_from', { ascending: false }),
    admin.from('nfe_issuer_settings').select('*').eq('tenant_id', actor.tenantId).order('environment'),
    admin.from('nfe_fiscal_rules').select('*').eq('tenant_id', actor.tenantId).order('valid_from', { ascending: false }),
    admin.from('nfe_documents').select('sale_id,environment,series,number,status,access_key,protocol,authorized_at,cancelled_at')
      .eq('tenant_id', actor.tenantId).eq('environment', env.sefazAmbiente)
      .in('status', ['authorized', 'cancel_unknown', 'cancelled']).order('created_at', { ascending: false }).limit(100),
  ]);
  for (const result of [products, profiles, issuers, rules, documents]) {
    if (result.error) throw new Error(`Configuração fiscal indisponível: ${result.error.message}`);
  }
  const saleIds = (documents.data || []).map(row => row.sale_id);
  const sales = saleIds.length ? await admin.from('sales').select('id,customer_name,total,date')
    .eq('tenant_id', actor.tenantId).in('id', saleIds) : { data: [], error: null };
  if (sales.error) throw new Error(`Vendas fiscais indisponíveis: ${sales.error.message}`);
  const saleMap = new Map((sales.data || []).map(row => [row.id, row]));
  return { products: products.data, profiles: profiles.data, issuers: issuers.data, rules: rules.data,
    documents: (documents.data || []).map(row => ({ ...row, sale: saleMap.get(row.sale_id) || null })),
    serviceEnvironment: env.sefazAmbiente };
}

export async function saveFiscalConfiguration(actor: FiscalActor, raw: unknown) {
  const input = FiscalConfigurationInput.parse(raw);
  if (input.kind === 'issuer' && input.issuerCnpj !== env.cnpjEmitente) {
    throw new Error('O CNPJ informado não corresponde ao certificado deste serviço.');
  }
  const { kind, ...payload } = input;
  const { error } = await admin.rpc('save_nfe_configuration', {
    p_tenant_id: actor.tenantId, p_actor_id: actor.userId, p_kind: kind, p_payload: payload,
  });
  if (error) throw new Error(`Não foi possível salvar a configuração fiscal: ${error.message}`);
  return getFiscalConsole(actor);
}

export async function searchFiscalDocuments(actor: FiscalActor, raw: string) {
  const term = raw.trim();
  if (!/^\d{1,9}$|^\d{44}$/.test(term)) throw new Error('Informe o número da NF-e ou a chave de 44 dígitos.');
  let query = admin.from('nfe_documents')
    .select('sale_id,environment,series,number,status,access_key,protocol,authorized_at,cancelled_at')
    .eq('tenant_id', actor.tenantId).eq('environment', env.sefazAmbiente)
    .in('status', ['authorized', 'cancel_unknown', 'cancelled']);
  query = term.length === 44 ? query.eq('access_key', term) : query.eq('number', Number(term));
  const documents = await query.order('created_at', { ascending: false }).limit(20);
  if (documents.error) throw new Error(`Consulta de notas indisponível: ${documents.error.message}`);
  const saleIds = (documents.data || []).map(row => row.sale_id);
  const sales = saleIds.length ? await admin.from('sales').select('id,customer_name,total,date')
    .eq('tenant_id', actor.tenantId).in('id', saleIds) : { data: [], error: null };
  if (sales.error) throw new Error(`Consulta de vendas indisponível: ${sales.error.message}`);
  const saleMap = new Map((sales.data || []).map(row => [row.id, row]));
  return (documents.data || []).map(row => ({ ...row, sale: saleMap.get(row.sale_id) || null }));
}
