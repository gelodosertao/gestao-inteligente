import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Branch, Sale, User } from '../types';

vi.mock('../services/db', () => ({ dbCategories: {} }));
vi.mock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react');
    return { ...actual, useState: (initial: unknown) => actual.useState(
        initial === 'POS' ? 'History' : initial === 'CATALOG' ? 'HISTORY' : initial === 'DRE' ? 'MOVEMENTS' : initial,
    ) };
});

import Sales from './Sales';
import WholesalePOS from './WholesalePOS';
import Financial from './Financial';

const admin = { id: 'admin', name: 'Admin', role: 'ADMIN' } as User;
const pending: Sale = {
    id: 'receipt-sale', date: '2026-10-01', customerName: 'Cliente teste', items: [],
    total: 100, amountPaid: 40, branch: Branch.FILIAL, source: 'ATACADO',
    status: 'Pending', paymentMethod: 'Cash', hasInvoice: false,
    paymentHistory: [{ id: 'payment-1', date: '2026-11-10', amount: 40, method: 'Pix' }],
};
const common = {
    sales: [pending], products: [], customers: [], currentUser: admin,
    onAddSale: vi.fn(), onAddCustomer: vi.fn(), onUpdateSale: vi.fn(), onDeleteSale: vi.fn(), onLogout: vi.fn(),
};

describe('telas de recebimento', () => {
    it('mantém somente Receber no histórico da adega', () => {
        const html = renderToStaticMarkup(<Sales {...common} />);
        expect(html).toContain('Cliente teste');
        expect(html).toMatch(/<button[^>]*>[\s\S]*?Receber\s*<\/button>/);
        expect(html).not.toContain('Confirmar Recebimento');
    });
    it('oferece Confirmar pagamento verde no atacado sem etapa separada de saída', () => {
        const html = renderToStaticMarkup(<WholesalePOS {...common} sales={[{ ...pending, branch: Branch.MATRIZ, date: new Date().toISOString().slice(0, 10) }]} />);
        expect(html).toContain('Cliente teste');
        expect(html).toMatch(/<button[^>]*bg-emerald-600[^>]*>[\s\S]*?Confirmar pagamento\s*<\/button>/);
        expect(html).not.toContain('Confirmar saída');
        expect(html).not.toContain('Confirmar Recebimento');
    });
    it('oferece confirmação para pedido pendente e pagamento já registrado sem baixa', () => {
        const today = new Date().toISOString().slice(0, 10);
        const wholesale: Sale = { ...pending, branch: Branch.MATRIZ, date: today, fulfillmentStatus: 'pending', matrizDeposit: 'Barreiras', revision: 0 };
        const html = renderToStaticMarkup(<WholesalePOS {...common} sales={[
            wholesale,
            { ...wholesale, id: 'paid-order', status: 'Completed', amountPaid: 100 },
        ]} />);
        expect(html.match(/Confirmar pagamento<\/button>/g)).toHaveLength(2);
        expect(html.match(/Conferir baixa anterior/g)).toHaveLength(2);
        expect(html).toContain('Quitado');
        expect(html).toContain('Barreiras');
    });
    it('não oferece nova saída quando a expedição já foi confirmada', () => {
        const html = renderToStaticMarkup(<WholesalePOS {...common} sales={[
            { ...pending, branch: Branch.MATRIZ, date: new Date().toISOString().slice(0, 10), fulfillmentStatus: 'dispatched' },
        ]} />);
        expect(html).toContain('Estoque comprometido');
        expect(html).not.toMatch(/>Confirmar saída<\/button>/);
        expect(html).toContain('Confirmar pagamento');
    });
    it('mostra o parcial em movimentos sem duplicar a receita persistida da venda', () => {
        const html = renderToStaticMarkup(<Financial
            sales={[pending]} products={[]} cashClosings={[]} currentUser={admin}
            records={[{ id: 'persisted', date: pending.date, amount: 100, category: 'Vendas', type: 'Income', branch: pending.branch, description: 'Receita persistida' }]}
            onAddRecord={vi.fn()} onUpdateRecord={vi.fn()} onDeleteRecord={vi.fn()}
            onAddCashClosing={vi.fn()} onDeleteCashClosing={vi.fn()} onBack={vi.fn()}
        />);
        expect(html).toContain('Cliente teste');
        expect(html).toContain('40,00');
        expect(html).not.toContain('Receita persistida');
        expect(html).not.toContain('100,00');
    });
});
