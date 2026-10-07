import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface FiscalActor { tenantId: string; userId: string; role: string; token: string }

export async function authenticateFiscalUser(authorization?: string): Promise<FiscalActor> {
  if (!authorization?.startsWith('Bearer ')) {
    throw new AuthError(401, 'Autenticação obrigatória.');
  }

  const token = authorization.slice(7).trim();
  if (!token) throw new AuthError(401, 'Autenticação obrigatória.');

  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) throw new AuthError(401, 'Sessão inválida.');

  const { data: profile, error: profileError } = await supabase
    .from('app_users')
    .select('tenant_id, role, is_active, must_change_password')
    .eq('id', auth.user.id)
    .single();

  if (profileError || !profile || !profile.is_active || profile.must_change_password) {
    throw new AuthError(403, 'Acesso restrito a usuários ativos com cadastro regular.');
  }
  if (!env.nfeTenantId || profile.tenant_id !== env.nfeTenantId) {
    throw new AuthError(403, 'Emissão fiscal indisponível para esta empresa.');
  }

  return { tenantId: profile.tenant_id, userId: auth.user.id, role: profile.role, token };
}

export async function authenticateFiscalAdmin(authorization?: string): Promise<string> {
  const actor = await authenticateFiscalUser(authorization);
  if (actor.role !== 'ADMIN') throw new AuthError(403, 'Acesso restrito a administradores ativos.');
  return actor.tenantId;
}
