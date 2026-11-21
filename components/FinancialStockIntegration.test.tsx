import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Branch, type Sale, type User } from '../types';

vi.mock('../services/db', () => ({ dbCategories: {} }));
import Financial from './Financial';

const order: Sale = {
  id: 'wholesale-dre', date: '2026-11-16', customerName: 'Cliente teste',
  items: [], total: 80, branch: Branch.MATRIZ, source: 'ATACADO', matrizDeposit: 'Barreiras',
  status: 'Pending', amountPaid: 40, fulfillmentStatus: 'dispatched',
  dispatchedAt: '2026-11-16T12:00:00Z', paymentMethod: 'Cash', hasInvoice: false,
  paymentHistory: [{ id: 'receipt', date: '2026-11-16', method: 'Cash', amount: 40 }],
};

function render(sale: Sale) {
  return renderToStaticMarkup(<Financial sales={[sale]} products={[]} records={[]} cashClosings={[]}
    currentUser={{ id: 'admin', name: 'Admin', role: 'ADMIN' } as User} onBack={() => {}}
    onAddRecord={vi.fn()} onUpdateRecord={vi.fn()} onDeleteRecord={vi.fn()}
    onAddCashClosing={vi.fn()} onDeleteCashClosing={vi.fn()} />);
}

function grossRevenue(html: string) {
  return html.match(/Receita Bruta \(Vendas\)<\/span><span[^>]*>([^<]*)/)?.[1].replace(/\s/g, ' ');
}

describe('expedição e recebimento na DRE da fábrica', () => {
  it('reconhece pedido expedido mesmo com pagamento parcial', () => {
    expect(grossRevenue(render(order))).toBe('R$ 80,00');
  });
  it('não reconhece pagamento adiantado como gelo já expedido', () => {
    expect(grossRevenue(render({ ...order, status: 'Completed', amountPaid: 80, fulfillmentStatus: 'pending', dispatchedAt: undefined }))).toBe('R$ 0,00');
  });
  it('retira do resultado líquido o pedido cancelado', () => {
    const html = render({ ...order, status: 'Cancelled', cancelledAt: '2026-11-16T15:00:00Z' });
    expect(html).toMatch(/Receita Líquida<\/span><span[^>]*>R\$\s*0,00/);
  });
});
