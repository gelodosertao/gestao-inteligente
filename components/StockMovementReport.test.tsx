import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Branch, type StockMovement, type User } from '../types';
import StockMovementReport from './StockMovementReport';

vi.mock('../services/db', () => ({ dbStockMovements: {}, dbCategories: {} }));
vi.mock('../services/supabase', () => ({ supabase: {} }));
import Inventory from './Inventory';

const movement: StockMovement = {
  id: 'legacy-1', date: '2026-11-01', productId: 'ice', productName: 'Gelo 5 kg', quantity: -3,
  type: 'ADJUSTMENT', reason: 'Venda concluída #sale', branch: Branch.MATRIZ, matrizDeposit: 'Barreiras', saleId: 'sale'
};

describe('apresentação do extrato de estoque', () => {
  it('oferece acesso visível ao relatório a partir do estoque', () => {
    const html = renderToStaticMarkup(<Inventory products={[]} sales={[]} financials={[]} currentUser={{ id: 'admin', role: 'ADMIN', tenantId: 'tenant' } as User}
      onUpdateProduct={vi.fn()} onAddProduct={vi.fn()} onStockChanged={vi.fn()} onDeleteProduct={vi.fn()} onOpenPricing={vi.fn()} onAddFinancialRecord={vi.fn()} onBack={vi.fn()} />);
    expect(html).toContain('Movimentações e relatório');
  });

  it('exibe saída negativa, depósito e identidade do legado sem inventar saldo', () => {
    const html = renderToStaticMarkup(<StockMovementReport movements={[movement]} loading={false} month="11" year="2026" />);
    expect(html).toContain('01/11/2026');
    expect(html).toContain('Barreiras');
    expect(html).toContain('-3');
    expect(html).toContain('Tipo original: ADJUSTMENT');
    expect(html).toContain('legacy-1');
    expect(html).toContain('Não registrado');
    expect(html).not.toContain('undefined');
  });

  it('distingue falha de consulta de ausência de movimentações', () => {
    const html = renderToStaticMarkup(<StockMovementReport movements={[]} loading={false} error="Não foi possível carregar as movimentações." />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Não foi possível carregar');
    expect(html).not.toContain('Nenhuma movimentação no período');
  });

  it('identifica a antiga filial apenas como depósito histórico', () => {
    const html = renderToStaticMarkup(<StockMovementReport movements={[{ ...movement, branch: Branch.FILIAL, matrizDeposit: undefined }]} loading={false} />);
    expect(html).toContain('Filial (histórico)');
  });
});
