import { describe, expect, it } from 'vitest';
import { Branch, Sale } from '../types';
import { registerSalePayment, saleReceiptRecords } from './salePayments';

const sale = (changes: Partial<Sale> = {}): Sale => ({
    id: 'sale-1', date: '2026-10-01', customerName: 'Cliente', total: 100,
    items: [], branch: Branch.MATRIZ, status: 'Pending', paymentMethod: 'Cash',
    hasInvoice: false, ...changes,
});
const input = { amount: '40,00', date: '2026-11-10', method: 'Pix' as const, notes: 'Parcela' };

describe('recebimento de vendas', () => {
    it('mantém parcial pendente, preserva a venda e registra valor, data e forma', () => {
        const original = sale({ nfeStatus: 'rascunho', matrizDeposit: 'Barreiras' });
        const result = registerSalePayment(original, input);
        expect(result).toMatchObject({ amountPaid: 40, status: 'Pending', date: original.date, nfeStatus: 'rascunho', matrizDeposit: 'Barreiras' });
        expect(result.paymentHistory).toEqual([expect.objectContaining({ ...input, amount: 40 })]);
        expect(original.paymentHistory).toBeUndefined();
    });
    it('quita apenas o saldo exato e não duplica a receita na quitação', () => {
        const partial = registerSalePayment(sale(), input);
        const completed = registerSalePayment(partial, { ...input, amount: '60', date: '2026-11-11', method: 'Cash' });
        expect(completed).toMatchObject({ status: 'Completed', amountPaid: 100 });
        expect(saleReceiptRecords([completed]).map(r => [r.amount, r.date, r.paymentMethod])).toEqual([
            [40, '2026-11-10', 'Pix'], [60, '2026-11-11', 'Cash'],
        ]);
    });
    it('não perdoa centavos nem aceita pagamento acima do saldo', () => {
        expect(registerSalePayment(sale(), { ...input, amount: '99.99' }).status).toBe('Pending');
        expect(() => registerSalePayment(sale(), { ...input, amount: '100.01' })).toThrow('restante');
        const partial = registerSalePayment(sale({ total: 0.3 }), { ...input, amount: '0.1' });
        expect(registerSalePayment(partial, { ...input, amount: '0.2' })).toMatchObject({ amountPaid: 0.3, status: 'Completed' });
    });
    it('bloqueia repetição se a venda foi atualizada enquanto o formulário estava aberto', () => {
        const opened = sale();
        const refreshed = registerSalePayment(opened, input);
        expect(() => registerSalePayment(refreshed, input, opened)).toThrow('foi atualizado');
    });
    it.each(['', '0', '-1', 'Infinity', '10reais', '1.001'])('rejeita valor inválido: %s', amount => {
        expect(() => registerSalePayment(sale(), { ...input, amount })).toThrow('valor válido');
    });
    it.each(['', '2026-02-30', '2026-13-01'])('rejeita data inválida: %s', date => {
        expect(() => registerSalePayment(sale(), { ...input, date })).toThrow('data válida');
    });
    it.each(['Completed', 'Cancelled', 'Finalizado pela Fábrica'] as const)('recusa recebimento em venda %s', status => {
        expect(() => registerSalePayment(sale({ status }), input)).toThrow('pendente');
    });
});

describe('entradas do financeiro e fechamento', () => {
    it('inclui recebimentos parciais pela data do pagamento e exclui canceladas', () => {
        const partial = registerSalePayment(sale(), input);
        expect(saleReceiptRecords([partial])).toEqual([expect.objectContaining({ amount: 40, date: input.date, paymentMethod: 'Pix', branch: Branch.MATRIZ })]);
        expect(saleReceiptRecords([{ ...partial, status: 'Cancelled' }])).toEqual([]);
        expect(saleReceiptRecords([sale()])).toEqual([]);
    });
    it('preserva vendas antigas e finalizadas pela fábrica sem histórico', () => {
        for (const status of ['Completed', 'Finalizado pela Fábrica'] as const) {
            expect(saleReceiptRecords([sale({ status })])).toEqual([expect.objectContaining({ amount: 100, date: '2026-10-01', paymentMethod: 'Cash' })]);
        }
    });
    it('preserva entrada antiga e acrescenta somente a parcela nova', () => {
        const result = registerSalePayment(sale({ amountPaid: 20 }), input);
        const receipts = saleReceiptRecords([result]);
        expect(receipts.map(r => r.amount).sort()).toEqual([20, 40]);
        expect(receipts.reduce((sum, r) => sum + r.amount, 0)).toBe(60);
    });
    it('mantém pagamentos divididos à vista', () => {
        const result = saleReceiptRecords([sale({ status: 'Completed', paymentMethod: 'Split', paymentSplits: [{ method: 'Pix', amount: 30 }, { method: 'Cash', amount: 70 }] })]);
        expect(result.map(r => [r.amount, r.paymentMethod])).toEqual([[30, 'Pix'], [70, 'Cash']]);
    });
});
