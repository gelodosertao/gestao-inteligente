export const USER_ROLES = [
  'ADMIN',
  'OPERATOR',
  'FACTORY',
  'WHOLESALE_REPRESENTATIVE',
] as const;

export type UserRole = typeof USER_ROLES[number];

export class ValidationError extends Error {}

export const USER_MODULES = [
  'DASHBOARD', 'INVENTORY', 'SALES', 'FINANCIAL', 'AI_INSIGHTS',
  'SETTINGS', 'CUSTOMERS', 'PRICING', 'MENU_CONFIG', 'PRODUCTION',
  'ORDER_CENTER', 'REPORTS', 'ATACADO', 'CRM', 'FESTAS_RADAR',
  'LOGISTICS', 'CONCILIACAO',
] as const;

const ROLE_SET = new Set<string>(USER_ROLES);
const MODULE_SET = new Set<string>(USER_MODULES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateUserInput {
  name: string;
  email: string;
  temporaryPassword: string;
  role: UserRole;
  allowedModules: string[];
}

export interface UpdateUserInput {
  userId: string;
  name: string;
  role: UserRole;
  allowedModules: string[];
  isActive: boolean;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Corpo da requisição inválido.');
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${label} inválido.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new ValidationError(`${label} inválido.`);
  return normalized;
}

function roleField(value: unknown): UserRole {
  if (typeof value !== 'string' || !ROLE_SET.has(value)) throw new ValidationError('Perfil de acesso inválido.');
  return value as UserRole;
}

function modulesField(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((module) => typeof module !== 'string' || !MODULE_SET.has(module))) {
    throw new ValidationError('Lista de módulos inválida.');
  }
  return [...new Set(value as string[])];
}

export function validateTemporaryPassword(password: unknown): password is string {
  return typeof password === 'string'
    && password.length >= 12
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export function parseCreateUserInput(value: unknown): CreateUserInput {
  const input = record(value);
  const email = stringField(input.email, 'E-mail', 5, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new ValidationError('E-mail inválido.');
  if (!validateTemporaryPassword(input.temporaryPassword)) {
    throw new ValidationError('A senha temporária deve ter 12 caracteres e incluir maiúscula, minúscula, número e símbolo.');
  }

  return {
    name: stringField(input.name, 'Nome', 2, 120),
    email,
    temporaryPassword: input.temporaryPassword,
    role: roleField(input.role),
    allowedModules: modulesField(input.allowedModules),
  };
}

export function parseUpdateUserInput(value: unknown): UpdateUserInput {
  const input = record(value);
  if (typeof input.userId !== 'string' || !UUID_PATTERN.test(input.userId)) {
    throw new ValidationError('Identificador de usuário inválido.');
  }
  if (typeof input.isActive !== 'boolean') throw new ValidationError('Estado do usuário inválido.');

  return {
    userId: input.userId,
    name: stringField(input.name, 'Nome', 2, 120),
    role: roleField(input.role),
    allowedModules: modulesField(input.allowedModules),
    isActive: input.isActive,
  };
}

export function parseUserId(value: unknown): string {
  const input = record(value);
  if (typeof input.userId !== 'string' || !UUID_PATTERN.test(input.userId)) {
    throw new ValidationError('Identificador de usuário inválido.');
  }
  return input.userId;
}

export function parseTemporaryPassword(value: unknown): { userId: string; temporaryPassword: string } {
  const input = record(value);
  const userId = parseUserId(input);
  if (!validateTemporaryPassword(input.temporaryPassword)) {
    throw new ValidationError('A senha temporária deve ter 12 caracteres e incluir maiúscula, minúscula, número e símbolo.');
  }
  return { userId, temporaryPassword: input.temporaryPassword };
}

export function parseNewPassword(value: unknown): string {
  const input = record(value);
  if (!validateTemporaryPassword(input.newPassword)) {
    throw new ValidationError('A nova senha deve ter 12 caracteres e incluir maiúscula, minúscula, número e símbolo.');
  }
  return input.newPassword;
}
