import { createClient } from '@supabase/supabase-js';
import { isDeepStrictEqual } from 'node:util';
import { env } from '../config/env';
import { AuthError, type FiscalActor } from './AuthService';
import { FiscalContextSchema, operationToday, resolveFiscalDecision, type FiscalConfiguration, type FiscalContext, type FiscalSource } from './FiscalRules';

const admin = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
function userClient(actor: FiscalActor) {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${actor.token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
}
export interface NfeDraft {
  revision: number; customer_id: string; context: FiscalContext; source_snapshot: FiscalSource; status?: string;
}

export async function loadFiscalSource(saleId: string, tenantId: string): Promise<FiscalSource> {
  const { data, error } = await admin.rpc('get_nfe_source_snapshot', { p_tenant_id: tenantId, p_sale_id: saleId });
  if (error || !data) throw new Error(error?.message || 'Venda não encontrada.');
  return data as FiscalSource;
}

export async function loadFiscalConfiguration(tenantId: string, source: FiscalSource): Promise<FiscalConfiguration> {
  const productIds = [...new Set(source.items.map(item => item.product_id))].filter(Boolean);
  const results = await Promise.all([
    admin.from('nfe_issuer_settings').select('*').eq('tenant_id', tenantId).eq('environment', env.sefazAmbiente).maybeSingle(),
    admin.from('nfe_fiscal_rules').select('*').eq('tenant_id', tenantId),
    productIds.length ? admin.from('nfe_product_profiles').select('*').eq('tenant_id', tenantId).in('product_id', productIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from('nfe_payment_methods').select('*').eq('tenant_id', tenantId),
  ]);
  for (const result of results) if (result.error) throw new Error(`Configuração fiscal indisponível: ${result.error.message}`);
  return { issuer: results[0].data as FiscalConfiguration['issuer'], rules: results[1].data || [], products: results[2].data || [], payments: results[3].data || [] };
}

export async function getDraftReview(saleId: string, actor: FiscalActor) {
  const user = userClient(actor);
  // Checking through the user's JWT retains the same sale visibility as the PDV.
  const { data: visibleSale, error: accessError } = await user.from('sales').select('id').eq('id', saleId).eq('tenant_id', actor.tenantId).maybeSingle();
  if (accessError || !visibleSale) throw new AuthError(403, 'Venda indisponível para este usuário.');
  const { data: draft, error } = await user.from('nfe_drafts').select('*').eq('sale_id', saleId).eq('tenant_id', actor.tenantId).maybeSingle();
  if (error) throw new Error(`Rascunho indisponível: ${error.message}`);
  const source = await loadFiscalSource(saleId, actor.tenantId);
  const config = await loadFiscalConfiguration(actor.tenantId, source);
  const context = {
    operation: 'internal_b2b_own_production' as const, operationDate: operationToday(),
    ...FiscalContextSchema.parse(draft?.context || source.sale.fiscal_context || {}),
  };
  const review = resolveFiscalDecision(source, context, config, env.sefazAmbiente, env.cnpjEmitente);
  const { data: document, error: documentError } = await admin.from('nfe_documents').select('status, number, access_key, signed_xml')
    .eq('sale_id', saleId).eq('tenant_id', actor.tenantId).eq('environment', env.sefazAmbiente).maybeSingle();
  if (documentError) throw new Error(`Estado fiscal indisponível: ${documentError.message}`);
  if (!draft) review.issues.push({ field: 'draft', message: 'Salve a nota para revisar os dados antes da emissão.' });
  else if (!isDeepStrictEqual(draft.source_snapshot, source)) review.issues.push({ field: 'draft', message: 'A venda ou o cadastro mudou. Revise e salve a nota novamente.' });
  const resumable = document?.status === 'reserved' && !document.signed_xml && !!draft && isDeepStrictEqual(draft.source_snapshot, source);
  if (document && !resumable) review.issues.push({ field: 'document', message: `NF-e ${document.number}: ${document.status}. Consulte a tentativa existente antes de qualquer nova emissão.` });
  return {
    draft: draft ? { revision: draft.revision, status: document?.status || 'draft' } : null,
    customerId: draft?.customer_id || source.sale.customer_id || null,
    context, issues: review.issues, canEmit: actor.role === 'ADMIN' && review.issues.length === 0,
    environment: env.sefazAmbiente,
  };
}

export async function saveDraft(saleId: string, actor: FiscalActor, input: { customerId: string; context: FiscalContext; revision?: number }) {
  const { error } = await userClient(actor).rpc('save_nfe_draft', {
    p_sale_id: saleId, p_customer_id: input.customerId, p_context: input.context, p_expected_revision: input.revision ?? null,
  });
  if (error) throw new AuthError(error.code === '42501' ? 403 : 409, error.message);
  return getDraftReview(saleId, actor);
}

export async function loadEmissionDraft(saleId: string, tenantId: string, revision: number) {
  const { data: draft, error } = await admin.from('nfe_drafts').select('*').eq('sale_id', saleId).eq('tenant_id', tenantId).single();
  if (error || !draft || draft.revision !== revision) throw new AuthError(409, 'Rascunho alterado ou não salvo. Abra a nota e revise os dados.');
  const source = await loadFiscalSource(saleId, tenantId);
  if (!isDeepStrictEqual(source, draft.source_snapshot)) throw new AuthError(409, 'Venda ou cliente alterado. Revise e salve a nota novamente.');
  const configuration = await loadFiscalConfiguration(tenantId, source);
  const context = FiscalContextSchema.parse(draft.context);
  const review = resolveFiscalDecision(source, context, configuration, env.sefazAmbiente, env.cnpjEmitente);
  if (!review.decision || review.issues.length) throw new AuthError(422, review.issues.map(i => i.message).join(' '));
  return { source, configuration, fiscal: review.decision, ruleId: review.ruleId };
}
