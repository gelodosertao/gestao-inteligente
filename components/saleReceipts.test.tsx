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
    it('mantém somente Receber no histórico do atacado', () => {
        const html = renderToStaticMarkup(<WholesalePOS {...common} sales={[{ ...pending, branch: Branch.MATRIZ, date: new Date().toISOString().slice(0, 10) }]} />);
        expect(html).toContain('Cliente teste');
        expect(html).toMatch(/<button[^>]*>[\s\S]*?Receber\s*<\/button>/);
        expect(html).not.toContain('Confirmar Recebimento');
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
