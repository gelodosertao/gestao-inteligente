import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Role, User } from '../types';

vi.mock('../services/db', () => ({
  dbProduction: { getAll: vi.fn(async () => []) },
  dbStockMovements: { create: vi.fn(async () => undefined) },
}));
import Production from './Production';

function user(role: Role): User {
  return {
    id: crypto.randomUUID(),
    name: 'Usuário de teste',
    email: 'teste@example.com',
    role,
    avatarInitials: 'UT',
    tenantId: crypto.randomUUID(),
    allowedModules: [],
    isActive: true,
    mustChangePassword: false,
  };
}

function render(role: Role) {
  return renderToStaticMarkup(
    <Production
      products={[]}
      currentUser={user(role)}
      onUpdateProduct={vi.fn(async () => undefined)}
      onStockChanged={vi.fn(async () => undefined)}
      onBack={() => {}}
    />,
  );
}

describe('abas do controle de produção', () => {
  it('mostra ao perfil Fábrica apenas Produção e Perdas', () => {
    const html = render('FACTORY');

    expect(html).toContain('Produção e Perdas');
    expect(html).not.toContain('Histórico');
    expect(html).not.toContain('Estoque de Insumos');
    expect(html).not.toContain('Custo de Produção');
  });

  it('mantém as abas administrativas para o administrador', () => {
    const html = render('ADMIN');

    expect(html).toContain('Produção e Perdas');
    expect(html).toContain('Histórico');
    expect(html).toContain('Estoque de Insumos');
    expect(html).toContain('Custo de Produção');
  });
});
