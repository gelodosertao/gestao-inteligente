import { createClient } from 'npm:@supabase/supabase-js@2.86.1';
import { assertPost, bearerToken, handlePreflight, HttpError, json, requiredEnv } from '../_shared/http.ts';
import { parseNewPassword, ValidationError } from '../_shared/userValidation.ts';

const PROFILE_COLUMNS = 'id,name,email,role,avatar_initials,tenant_id,allowed_modules,is_active,must_change_password,temporary_password_expires_at';

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    assertPost(req);
    const token = bearerToken(req);
    const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user) throw new HttpError(401, 'Sessão inválida.');

    const { data: profile, error: profileError } = await client
      .from('app_users')
      .select(PROFILE_COLUMNS)
      .eq('id', authData.user.id)
      .single();
    if (profileError || !profile || !profile.is_active) throw new HttpError(403, 'Conta indisponível.');

    if (profile.must_change_password) {
      const expiresAt = Date.parse(profile.temporary_password_expires_at ?? '');
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new HttpError(403, 'A senha temporária expirou. Solicite um novo reset ao administrador.');
      }
    }

    const newPassword = parseNewPassword(await req.json());
    const { error: passwordError } = await client.auth.admin.updateUserById(profile.id, { password: newPassword });
    if (passwordError) throw new Error(passwordError.message);

    const { data: updated, error: updateError } = await client.from('app_users').update({
      must_change_password: false,
      temporary_password_expires_at: null,
    }).eq('id', profile.id).eq('tenant_id', profile.tenant_id).select(PROFILE_COLUMNS).single();
    if (updateError || !updated) throw new Error(updateError?.message ?? 'Falha ao liberar o perfil.');

    const { error: auditError } = await client.from('security_audit_log').insert({
      tenant_id: profile.tenant_id,
      actor_user_id: profile.id,
      action: 'user.password_changed',
      entity_type: 'app_users',
      entity_id: profile.id,
    });
    if (auditError) throw new Error(auditError.message);

    return json(req, 200, { success: true, user: updated });
  } catch (error) {
    if (error instanceof HttpError) return json(req, error.status, { success: false, error: error.message });
    if (error instanceof ValidationError) return json(req, 400, { success: false, error: error.message });
    if (error instanceof SyntaxError) return json(req, 400, { success: false, error: 'JSON inválido.' });
    console.error('[change-password]', error instanceof Error ? error.message : 'Erro desconhecido');
    return json(req, 500, { success: false, error: 'Falha interna ao alterar a senha.' });
  }
});
