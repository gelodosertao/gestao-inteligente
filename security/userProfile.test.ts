import { describe, expect, it } from 'vitest';
import { isStrongPassword, isTemporaryPasswordExpired, mapUserProfile } from './userProfile';

describe('mapUserProfile', () => {
  it('mapeia somente o perfil retornado pelo banco', () => {
    const profile = mapUserProfile({
      id: '19aa8e5e-daca-42e2-9c97-bf8b1cb52a29',
      name: 'Maria',
      email: 'maria@example.com',
      role: 'OPERATOR',
      avatar_initials: 'MA',
      tenant_id: 'd165165d-decf-44c7-9c2b-2e4625291397',
      allowed_modules: ['REPORTS'],
      is_active: true,
      must_change_password: true,
      temporary_password_expires_at: '2026-09-18T12:00:00.000Z',
      tenants: { name: 'Gelo do Sertão' },
    });

    expect(profile).toMatchObject({
      role: 'OPERATOR',
      tenantId: 'd165165d-decf-44c7-9c2b-2e4625291397',
      tenantName: 'Gelo do Sertão',
      isActive: true,
      mustChangePassword: true,
    });
  });

  it('não inventa tenant padrão quando o perfil está incompleto', () => {
    expect(() => mapUserProfile({
      id: '19aa8e5e-daca-42e2-9c97-bf8b1cb52a29',
      name: 'Maria',
      email: 'maria@example.com',
      role: 'OPERATOR',
      tenant_id: null,
    })).toThrow('Perfil sem tenant válido');
  });
});

describe('isTemporaryPasswordExpired', () => {
  it('considera expirada uma senha obrigatória fora da janela de 24 horas', () => {
    expect(isTemporaryPasswordExpired({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: '2026-09-17T10:00:00.000Z',
    }, new Date('2026-09-17T10:00:00.001Z'))).toBe(true);
  });

  it('não bloqueia quem não precisa trocar a senha', () => {
    expect(isTemporaryPasswordExpired({
      mustChangePassword: false,
      temporaryPasswordExpiresAt: '2020-01-01T00:00:00.000Z',
    }, new Date('2026-09-17T10:00:00.000Z'))).toBe(false);
  });
});

describe('isStrongPassword', () => {
  it('exige pelo menos 12 caracteres e quatro classes de caracteres', () => {
    expect(isStrongPassword('Senha-Forte-2026!')).toBe(true);
    expect(isStrongPassword('Curta1!')).toBe(false);
    expect(isStrongPassword('somente-minusculas-2026')).toBe(false);
    expect(isStrongPassword('SEM-SIMBOLO-2026')).toBe(false);
  });
});
