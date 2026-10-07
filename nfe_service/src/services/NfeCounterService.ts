import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const db = createClient(env.supabaseUrl, env.supabaseServiceKey);
export interface NfeReservation { number: number; series: number; status: string; accessKey?: string; created: boolean }

export async function reserveNfeIssue(saleId: string, tenantId: string, revision: number,
  snapshot: unknown, fiscalSnapshot: unknown): Promise<NfeReservation> {
  const { data, error } = await db.rpc('reserve_nfe_issue_v2', {
    p_tenant_id: tenantId, p_sale_id: saleId, p_environment: env.sefazAmbiente,
    p_revision: revision, p_snapshot: snapshot, p_fiscal_snapshot: fiscalSnapshot,
  });
  if (error || !data) throw new Error(`Falha ao reservar NF-e: ${error?.message || 'sem retorno'}`);
  return data as NfeReservation;
}

export async function prepareNfeIssue(saleId: string, tenantId: string, accessKey: string, signedXml: string): Promise<void> {
  const { error } = await db.rpc('prepare_nfe_issue_v2', {
    p_tenant_id: tenantId, p_sale_id: saleId, p_environment: env.sefazAmbiente,
    p_access_key: accessKey, p_signed_xml: signedXml,
  });
  if (error) throw new Error(`Falha ao persistir XML assinado: ${error.message}`);
}

export async function completeNfeIssue(saleId: string, tenantId: string, status: 'authorized' | 'unknown' | 'rejected',
  protocol?: string, xml?: string, errorMessage?: string): Promise<void> {
  const { error } = await db.rpc('complete_nfe_issue_v2', {
    p_tenant_id: tenantId, p_sale_id: saleId, p_environment: env.sefazAmbiente, p_status: status,
    p_protocol: protocol || null, p_xml: xml || null, p_error: errorMessage || null,
  });
  if (error) throw new Error(`Falha ao persistir resultado fiscal: ${error.message}`);
}
