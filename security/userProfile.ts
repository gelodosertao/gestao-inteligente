import type { Role, User } from '../types';

const VALID_ROLES = new Set<Role>([
  'ADMIN',
  'OPERATOR',
  'FACTORY',
  'WHOLESALE_REPRESENTATIVE',
]);

interface DatabaseUserProfile {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  role?: unknown;
  avatar_initials?: unknown;
  tenant_id?: unknown;
  allowed_modules?: unknown;
  is_active?: unknown;
  must_change_password?: unknown;
  temporary_password_expires_at?: unknown;
  tenants?: unknown;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Perfil sem ${field} válido`);
  }
  return value;
}

function tenantName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() !== '' ? name : undefined;
}

export function mapUserProfile(row: DatabaseUserProfile): User {
  const role = requiredString(row.role, 'papel') as Role;
  if (!VALID_ROLES.has(role)) throw new Error('Perfil com papel inválido');

  const allowedModules = Array.isArray(row.allowed_modules)
    ? row.allowed_modules.filter((module): module is string => typeof module === 'string')
    : [];

  return {
    id: requiredString(row.id, 'identificador'),
    name: requiredString(row.name, 'nome'),
    email: requiredString(row.email, 'e-mail'),
    role,
    avatarInitials: typeof row.avatar_initials === 'string' ? row.avatar_initials : '',
    tenantId: requiredString(row.tenant_id, 'tenant'),
    tenantName: tenantName(row.tenants),
    allowedModules,
    isActive: row.is_active !== false,
    mustChangePassword: row.must_change_password === true,
    temporaryPasswordExpiresAt: typeof row.temporary_password_expires_at === 'string'
      ? row.temporary_password_expires_at
      : undefined,
  };
}

export function isTemporaryPasswordExpired(
  user: Pick<User, 'mustChangePassword' | 'temporaryPasswordExpiresAt'>,
  now = new Date(),
): boolean {
  if (!user.mustChangePassword) return false;
  if (!user.temporaryPasswordExpiresAt) return true;

  const expiresAt = Date.parse(user.temporaryPasswordExpiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 12
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}
