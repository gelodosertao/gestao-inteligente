import { describe, expect, it } from 'vitest';
import type { Role, User, ViewState } from '../types';
import {
  canLoadDataset,
  getInitialView,
  hasModuleAccess,
} from './accessControl';

function user(role: Role, allowedModules: ViewState[] = []): User {
  return {
    id: crypto.randomUUID(),
    name: 'Usuário de teste',
    email: 'teste@example.com',
    role,
    avatarInitials: 'UT',
    tenantId: crypto.randomUUID(),
    allowedModules,
    isActive: true,
    mustChangePassword: false,
  };
}

describe('hasModuleAccess', () => {
  it('permite qualquer módulo para ADMIN', () => {
    expect(hasModuleAccess(user('ADMIN'), 'SETTINGS')).toBe(true);
  });

  it('mantém os módulos padrão do OPERATOR', () => {
    const operator = user('OPERATOR');

    expect(hasModuleAccess(operator, 'SALES')).toBe(true);
    expect(hasModuleAccess(operator, 'SETTINGS')).toBe(false);
  });

  it('trata allowedModules apenas como extensão das permissões padrão', () => {
    const factory = user('FACTORY', ['REPORTS']);

    expect(hasModuleAccess(factory, 'PRODUCTION')).toBe(true);
    expect(hasModuleAccess(factory, 'REPORTS')).toBe(true);
    expect(hasModuleAccess(factory, 'FINANCIAL')).toBe(false);
  });
});

describe('getInitialView', () => {
  it.each([
    ['ADMIN', 'DASHBOARD'],
    ['OPERATOR', 'SALES'],
    ['FACTORY', 'PRODUCTION'],
    ['WHOLESALE_REPRESENTATIVE', 'ATACADO'],
  ] as const)('direciona %s para %s', (role, expected) => {
    expect(getInitialView(user(role))).toBe(expected);
  });
});

describe('canLoadDataset', () => {
  it('não carrega financeiro para usuário sem módulo financeiro', () => {
    expect(canLoadDataset(user('FACTORY'), 'financials')).toBe(false);
  });

  it('carrega somente os dados necessários ao representante', () => {
    const representative = user('WHOLESALE_REPRESENTATIVE');

    expect(canLoadDataset(representative, 'products')).toBe(true);
    expect(canLoadDataset(representative, 'sales')).toBe(true);
    expect(canLoadDataset(representative, 'customers')).toBe(true);
    expect(canLoadDataset(representative, 'financials')).toBe(false);
    expect(canLoadDataset(representative, 'cashClosings')).toBe(false);
  });
});
