import { describe, expect, it } from 'vitest';
import {
  parseCreateUserInput,
  parseUpdateUserInput,
  validateTemporaryPassword,
} from '../supabase/functions/_shared/userValidation';

describe('validateTemporaryPassword', () => {
  it('exige 12 caracteres com maiúscula, minúscula, número e símbolo', () => {
    expect(validateTemporaryPassword('Curta1!')).toBe(false);
    expect(validateTemporaryPassword('SenhaTemporaria1!')).toBe(true);
  });
});

describe('parseCreateUserInput', () => {
  it('normaliza e valida a criação sem aceitar tenant do cliente', () => {
    const parsed = parseCreateUserInput({
      name: '  Maria Silva  ',
      email: ' MARIA@EXAMPLE.COM ',
      temporaryPassword: 'SenhaTemporaria1!',
      role: 'OPERATOR',
      allowedModules: ['REPORTS', 'REPORTS'],
      tenantId: 'tenant-controlado-pelo-cliente',
    });

    expect(parsed).toEqual({
      name: 'Maria Silva',
      email: 'maria@example.com',
      temporaryPassword: 'SenhaTemporaria1!',
      role: 'OPERATOR',
      allowedModules: ['REPORTS'],
    });
    expect(parsed).not.toHaveProperty('tenantId');
  });

  it('recusa papéis e módulos desconhecidos', () => {
    expect(() => parseCreateUserInput({
      name: 'Maria Silva',
      email: 'maria@example.com',
      temporaryPassword: 'SenhaTemporaria1!',
      role: 'SUPER_ADMIN',
      allowedModules: ['ROOT'],
    })).toThrow();
  });
});

describe('parseUpdateUserInput', () => {
  it('exige UUID e booleano real para ativação', () => {
    expect(() => parseUpdateUserInput({
      userId: 'not-an-id',
      name: 'Maria',
      role: 'OPERATOR',
      allowedModules: [],
      isActive: 'true',
    })).toThrow();
  });
});
