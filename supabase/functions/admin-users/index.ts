import { createClient } from 'npm:@supabase/supabase-js@2.86.1';
import { assertPost, bearerToken, handlePreflight, HttpError, json, requiredEnv } from '../_shared/http.ts';
import {
  parseCreateUserInput,
  parseTemporaryPassword,
  parseUpdateUserInput,
  parseUserId,
  ValidationError,
} from '../_shared/userValidation.ts';

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_initials: string | null;
  tenant_id: string;
  allowed_modules: string[] | null;
  is_active: boolean;
  must_change_password: boolean;
  temporary_password_expires_at: string | null;
}

const PROFILE_COLUMNS = 'id,name,email,role,avatar_initials,tenant_id,allowed_modules,is_active,must_change_password,temporary_password_expires_at';

function serviceClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function authenticateAdmin(req: Request, client: ReturnType<typeof serviceClient>): Promise<ProfileRow> {
  const token = bearerToken(req);
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) throw new HttpError(401, 'Sessão inválida.');

  const { data, error } = await client
    .from('app_users')
    .select(PROFILE_COLUMNS)
    .eq('id', authData.user.id)
    .single();

  if (error || !data) throw new HttpError(403, 'Perfil administrativo não encontrado.');
  const profile = data as ProfileRow;
  if (!profile.is_active || profile.must_change_password || profile.role !== 'ADMIN') {
    throw new HttpError(403, 'Acesso restrito a administradores ativos.');
  }
  return profile;
}

async function targetInTenant(client: ReturnType<typeof serviceClient>, userId: string, tenantId: string): Promise<ProfileRow> {
  const { data, error } = await client
    .from('app_users')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();
  if (error || !data) throw new HttpError(404, 'Usuário não encontrado neste tenant.');
  return data as ProfileRow;
}

async function protectLastAdmin(
  client: ReturnType<typeof serviceClient>,
  target: ProfileRow,
  willRemainActiveAdmin: boolean,
): Promise<void> {
  if (target.role !== 'ADMIN' || !target.is_active || willRemainActiveAdmin) return;
  const { count, error } = await client
    .from('app_users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', target.tenant_id)
    .eq('role', 'ADMIN')
    .eq('is_active', true)
    .neq('id', target.id);
  if (error) throw new Error(error.message);
  if ((count ?? 0) === 0) throw new HttpError(409, 'O último administrador ativo não pode ser removido ou rebaixado.');
}

async function audit(
  client: ReturnType<typeof serviceClient>,
  actor: ProfileRow,
  action: string,
  targetId: string,
): Promise<void> {
  const { error } = await client.from('security_audit_log').insert({
    tenant_id: actor.tenant_id,
    actor_user_id: actor.id,
    action,
    entity_type: 'app_users',
    entity_id: targetId,
  });
  if (error) throw new Error(error.message);
}

async function createUser(client: ReturnType<typeof serviceClient>, actor: ProfileRow, body: unknown): Promise<ProfileRow> {
  const input = parseCreateUserInput(body);
  const { data: authData, error: authError } = await client.auth.admin.createUser({
    email: input.email,
    password: input.temporaryPassword,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    if (authError?.message.toLowerCase().includes('already')) throw new HttpError(409, 'Este e-mail já está cadastrado.');
    throw new Error(authError?.message ?? 'Falha ao criar usuário no Auth.');
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from('app_users').insert({
    id: authData.user.id,
    name: input.name,
    email: input.email,
    role: input.role,
    avatar_initials: input.name.slice(0, 2).toUpperCase(),
    tenant_id: actor.tenant_id,
    allowed_modules: input.allowedModules,
    is_active: true,
    must_change_password: true,
    temporary_password_expires_at: expiresAt,
  }).select(PROFILE_COLUMNS).single();

  if (error || !data) {
    await client.auth.admin.deleteUser(authData.user.id);
    throw new Error(error?.message ?? 'Falha ao criar perfil do usuário.');
  }

  await audit(client, actor, 'user.created', authData.user.id);
  return data as ProfileRow;
}

async function updateUser(client: ReturnType<typeof serviceClient>, actor: ProfileRow, body: unknown): Promise<ProfileRow> {
  const input = parseUpdateUserInput(body);
  const target = await targetInTenant(client, input.userId, actor.tenant_id);
  await protectLastAdmin(client, target, input.role === 'ADMIN' && input.isActive);

  const { data, error } = await client.from('app_users').update({
    name: input.name,
    avatar_initials: input.name.slice(0, 2).toUpperCase(),
    role: input.role,
    allowed_modules: input.allowedModules,
    is_active: input.isActive,
  }).eq('id', target.id).eq('tenant_id', actor.tenant_id).select(PROFILE_COLUMNS).single();
  if (error || !data) throw new Error(error?.message ?? 'Falha ao atualizar usuário.');

  await audit(client, actor, 'user.updated', target.id);
  return data as ProfileRow;
}

async function resetPassword(client: ReturnType<typeof serviceClient>, actor: ProfileRow, body: unknown): Promise<ProfileRow> {
  const input = parseTemporaryPassword(body);
  const target = await targetInTenant(client, input.userId, actor.tenant_id);
  const { error: authError } = await client.auth.admin.updateUserById(target.id, { password: input.temporaryPassword });
  if (authError) throw new Error(authError.message);

  const { data, error } = await client.from('app_users').update({
    must_change_password: true,
    temporary_password_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }).eq('id', target.id).eq('tenant_id', actor.tenant_id).select(PROFILE_COLUMNS).single();
  if (error || !data) throw new Error(error?.message ?? 'Falha ao atualizar perfil.');

  await audit(client, actor, 'user.password_reset', target.id);
  return data as ProfileRow;
}

async function deleteUser(client: ReturnType<typeof serviceClient>, actor: ProfileRow, body: unknown): Promise<void> {
  const userId = parseUserId(body);
  const target = await targetInTenant(client, userId, actor.tenant_id);
  await protectLastAdmin(client, target, false);
  await audit(client, actor, 'user.deleted', target.id);

  const { error: authError } = await client.auth.admin.deleteUser(target.id);
  if (authError) throw new Error(authError.message);
  const { error } = await client.from('app_users').delete().eq('id', target.id).eq('tenant_id', actor.tenant_id);
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    assertPost(req);
    const body = await req.json();
    const action = typeof body?.action === 'string' ? body.action : '';
    const client = serviceClient();
    const actor = await authenticateAdmin(req, client);

    if (action === 'create') return json(req, 201, { success: true, user: await createUser(client, actor, body) });
    if (action === 'update') return json(req, 200, { success: true, user: await updateUser(client, actor, body) });
    if (action === 'reset-password') return json(req, 200, { success: true, user: await resetPassword(client, actor, body) });
    if (action === 'delete') {
      await deleteUser(client, actor, body);
      return json(req, 200, { success: true });
    }
    throw new HttpError(400, 'Ação administrativa inválida.');
  } catch (error) {
    if (error instanceof HttpError) return json(req, error.status, { success: false, error: error.message });
    if (error instanceof ValidationError) return json(req, 400, { success: false, error: error.message });
    if (error instanceof SyntaxError) return json(req, 400, { success: false, error: 'JSON inválido.' });
    console.error('[admin-users]', error instanceof Error ? error.message : 'Erro desconhecido');
    return json(req, 500, { success: false, error: 'Falha interna ao processar a solicitação.' });
  }
});
