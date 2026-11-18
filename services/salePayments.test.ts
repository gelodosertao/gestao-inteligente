import { describe, expect, it } from 'vitest';
import { Branch, Product, Sale } from '../types';
import { confirmWholesalePayment, hasSaleStockCommitted, isSaleRevenueRecognized, isSaleDispatched, prepareWholesaleDispatch, registerSalePayment, saleReceiptRecords, wholesaleEditTotal, wholesaleStock } from './salePayments';

const sale = (changes: Partial<Sale> = {}): Sale => ({
    id: 'sale-1', date: '2026-10-01', customerName: 'Cliente', total: 100,
    items: [], branch: Branch.MATRIZ, status: 'Pending', paymentMethod: 'Cash',
    hasInvoice: false, ...changes,
});

describe('confirmação integrada e recebimentos no atacado', () => {
    const product = { id: 'ice', name: 'Gelo 5kg', stockMatrizIbotirama: 100, stockMatrizBarreiras: 3, unit: 'un' } as Product;
    const order = (changes: Partial<Sale> = {}) => sale({ source: 'ATACADO', fulfillmentStatus: 'committed', revision: 0, matrizDeposit: 'Ibotirama', amountPaid: 0,
        items: [{ productId: 'ice', productName: 'Gelo 5kg', quantity: 10, priceAtSale: 10 }], ...changes });

    it('pagamentos apenas abatem a dívida do estoque comprometido na criação', () => {
        const partial = confirmWholesalePayment(order(), input, [product], 'Ibotirama');
        expect(partial).toMatchObject({ status: 'Pending', fulfillmentStatus: 'committed', amountPaid: 40 });
        expect(hasSaleStockCommitted(partial)).toBe(true);
        expect(isSaleDispatched(partial)).toBe(false);
        const paid = confirmWholesalePayment(partial, { ...input, amount: '60' }, [{ ...product, stockMatrizIbotirama: 0 }], 'Ibotirama');
        expect(paid).toMatchObject({ status: 'Completed', fulfillmentStatus: 'committed', amountPaid: 100 });
        expect(paid.paymentHistory).toHaveLength(2);
    });

    it('não reconhece automaticamente entrega nem baixa novamente pedido antigo', () => {
        const original = order({ fulfillmentStatus: undefined });
        expect(() => confirmWholesalePayment(original, { ...input, amount: '100' }, [product], 'Ibotirama')).toThrow('baixa anterior');
        expect(original).toMatchObject({ status: 'Pending', amountPaid: 0 });
    });

    it('reconhece entrega antiga declarada sem exigir estoque atual nem criar outra baixa', () => {
        const original = order({ fulfillmentStatus: undefined });
        const partial = confirmWholesalePayment(original, input, [], 'Ibotirama', original, 'historical-payment', true);
        expect(partial).toMatchObject({ status: 'Pending', fulfillmentStatus: 'dispatched', amountPaid: 40, historicalStockAlreadyDebited: true });
        const reloaded = { ...partial, historicalStockAlreadyDebited: undefined };
        const paid = confirmWholesalePayment(reloaded, { ...input, amount: '60' }, [], 'Ibotirama');
        expect(paid).toMatchObject({ status: 'Completed', amountPaid: 100 });
        expect(paid.paymentHistory).toHaveLength(2);
        expect(() => confirmWholesalePayment(order(), input, [], 'Ibotirama', order(), 'new-payment', true)).toThrow('exclusiva');
    });

    it('reconhece entrega antiga com recebimento existente sem inventar nova parcela', () => {
        const original = order({ fulfillmentStatus: undefined, amountPaid: 40, paymentHistory: [{ id: 'old', amount: 40, date: input.date, method: 'Cash' }] });
        const result = confirmWholesalePayment(original, { ...input, amount: '' }, [], 'Ibotirama', original, 'unused', true);
        expect(result.paymentHistory).toEqual(original.paymentHistory);
        expect(result).toMatchObject({ amountPaid: 40, fulfillmentStatus: 'dispatched', historicalStockAlreadyDebited: true });
    });

    it('compromete estoque sem pagamento ao criar pedido e respeita o saldo do depósito', () => {
        const pending = order({ amountPaid: 0, fulfillmentStatus: 'pending' });
        const dispatched = prepareWholesaleDispatch(pending, [product], 'Ibotirama');
        expect(dispatched).toMatchObject({ status: 'Pending', amountPaid: 0, fulfillmentStatus: 'committed', matrizDeposit: 'Ibotirama' });
        expect(pending.fulfillmentStatus).toBe('pending');
        expect(() => prepareWholesaleDispatch(pending, [product], 'Barreiras')).toThrow('Saldo insuficiente');
        expect(() => prepareWholesaleDispatch(pending, [product], undefined)).toThrow('depósito');
        expect(wholesaleStock(product, 'Barreiras')).toBe(3);
    });

    it('soma componentes compartilhados antes de validar disponibilidade', () => {
        const combo = { ...product, id: 'combo', comboItems: [{ productId: 'ice', quantity: 2 }] };
        const pending = order({ fulfillmentStatus: 'pending', amountPaid: 0, items: [{ productId: 'combo', productName: 'Fardo', quantity: 30, priceAtSale: 1 }, { productId: 'ice', productName: 'Gelo', quantity: 50, priceAtSale: 1 }] });
        expect(() => prepareWholesaleDispatch(pending, [product, combo], 'Ibotirama')).toThrow('Saldo insuficiente');
    });

    it('não permite expedir novamente, pedido cancelado ou insumo ausente', () => {
        expect(() => prepareWholesaleDispatch(order({ fulfillmentStatus: 'dispatched' }), [product], 'Ibotirama')).toThrow('disponível');
        expect(() => prepareWholesaleDispatch(order({ status: 'Cancelled' }), [product], 'Ibotirama')).toThrow('disponível');
        expect(() => prepareWholesaleDispatch(order({ fulfillmentStatus: 'pending', amountPaid: 0 }), [], 'Ibotirama')).toThrow('produtos');
    });

    it('confirma pagamento já registrado sem criar parcela zero', () => {
        const paid = order({ fulfillmentStatus: undefined, status: 'Pending', amountPaid: 100, paymentHistory: [{ id: 'old-payment', date: input.date, method: 'Cash', amount: 100 }] });
        const confirmed = confirmWholesalePayment(paid, { ...input, amount: '' }, [product], 'Ibotirama', paid, 'unused', true);
        expect(confirmed).toMatchObject({ amountPaid: 100, fulfillmentStatus: 'dispatched' });
        expect(confirmed.status).toBe('Completed');
        expect(confirmed.paymentHistory).toEqual(paid.paymentHistory);
        expect(() => confirmWholesalePayment(order(), { ...input, amount: '0' }, [product], 'Ibotirama')).toThrow('valor válido');
    });

    it('reconhece baixa anterior com pagamento completo já registrado no pedido pendente de estoque', () => {
        const paid = order({ fulfillmentStatus: 'pending', status: 'Completed', amountPaid: 100, paymentHistory: [{ id: 'paid', date: input.date, method: 'Cash', amount: 100 }] });
        const result = confirmWholesalePayment(paid, { ...input, amount: '' }, [], 'Ibotirama', paid, 'unused', true);
        expect(result).toMatchObject({ status: 'Completed', fulfillmentStatus: 'dispatched', amountPaid: 100 });
        expect(result.paymentHistory).toEqual(paid.paymentHistory);
    });

    it('exige origem no pedido antigo e preserva a baixa anterior nas próximas parcelas', () => {
        const original = order({ matrizDeposit: undefined, fulfillmentStatus: undefined });
        expect(() => confirmWholesalePayment(original, input, [product], undefined)).toThrow('depósito');
        const confirmed = confirmWholesalePayment(original, input, [product], 'Ibotirama', original, 'same-payment', true);
        expect(confirmed.paymentHistory?.[0].id).toBe('same-payment');
        expect(confirmed.matrizDeposit).toBe('Ibotirama');
        expect(() => confirmWholesalePayment(confirmed, input, [product], 'Barreiras')).toThrow('origem');
        expect(confirmWholesalePayment(original, input, [product], 'Ibotirama', original, 'same-payment', true)).toEqual(confirmed);
    });

    it('bloqueia recebimento com versão ou expedição alterada e preserva identificador de retry', () => {
        const original = order();
        expect(() => registerSalePayment({ ...original, revision: 1 }, input, original)).toThrow('atualizado');
        expect(() => registerSalePayment({ ...original, fulfillmentStatus: 'pending' }, input, original)).toThrow('atualizado');
        expect(registerSalePayment(original, input, original, 'stable-receipt').paymentHistory?.[0].id).toBe('stable-receipt');
    });

    it('mantém frete e desconto ao recalcular o pedido', () => {
        expect(wholesaleEditTotal(order({ deliveryFee: 20, discount: 5 }))).toBe(115);
        expect(() => wholesaleEditTotal(order({ discount: 101 }))).toThrow('Confira');
        expect(() => wholesaleEditTotal(order({ deliveryFee: -1 }))).toThrow('Confira');
    });

    it('não projeta receita fictícia por status manual em pedido gerenciado', () => {
        expect(saleReceiptRecords([order({ status: 'Completed' })])).toEqual([]);
    });

    it('estoque comprometido sem pagamento não gera receita nem comprova entrega', () => {
        const unpaid = order();
        expect(hasSaleStockCommitted(unpaid)).toBe(true);
        expect(isSaleDispatched(unpaid)).toBe(false);
        expect(saleReceiptRecords([unpaid])).toEqual([]);
        expect(isSaleRevenueRecognized(unpaid)).toBe(false);
        expect(isSaleRevenueRecognized(order({ amountPaid: 40 }))).toBe(false);
        expect(isSaleRevenueRecognized(order({ status: 'Completed', amountPaid: 100 }))).toBe(true);
        expect(isSaleRevenueRecognized(order({ fulfillmentStatus: 'dispatched', amountPaid: 40 }))).toBe(true);
    });

    it('preserva parcelas na data original e estorna na data do cancelamento', () => {
        const paid = registerSalePayment(order(), input);
        const cancelled = { ...paid, status: 'Cancelled' as const, cancelledAt: '2026-11-16T02:00:00.000Z' };
        const records = saleReceiptRecords([cancelled]);
        expect(records.map(record => [record.amount, record.date])).toEqual([[40, input.date], [-40, '2026-11-15']]);
        expect(records.reduce((sum, record) => sum + record.amount, 0)).toBe(0);
    });
    it('estorna dinheiro em dinheiro e não atribui o estorno ao Pix do pedido', () => {
        const paid = registerSalePayment(order({ paymentMethod: 'Pix' }), { ...input, amount: '40', method: 'Cash' });
        const records = saleReceiptRecords([{ ...paid, status: 'Cancelled', cancelledAt: '2026-11-16T12:00:00Z' }]);
        expect(records.map(record => [record.amount, record.paymentMethod])).toEqual([[40, 'Cash'], [-40, 'Cash']]);
    });
    it('desagrega estorno misto e mantém IDs estáveis por forma', () => {
        const partial = registerSalePayment(order(), { ...input, amount: '40', method: 'Cash' });
        const paid = registerSalePayment(partial, { ...input, amount: '60', method: 'Pix' });
        const cancelled: Sale = { ...paid, status: 'Cancelled', cancelledAt: '2026-11-16T12:00:00Z' };
        const records = saleReceiptRecords([cancelled]);
        expect(records.filter(record => record.amount < 0).map(record => [record.amount, record.paymentMethod])).toEqual([[-40, 'Cash'], [-60, 'Pix']]);
        expect(saleReceiptRecords([cancelled]).map(record => record.id)).toEqual(records.map(record => record.id));
    });
    it('preserva splits legados já gerenciados e acrescenta ambos os estornos', () => {
        const cancelled = order({ status: 'Cancelled', amountPaid: 100, paymentMethod: 'Split', paymentSplits: [{ method: 'Cash', amount: 70 }, { method: 'Pix', amount: 30 }], cancelledAt: '2026-11-16T12:00:00Z' });
        const records = saleReceiptRecords([cancelled]);
        expect(records.map(record => [record.amount, record.paymentMethod])).toEqual([[70, 'Cash'], [30, 'Pix'], [-70, 'Cash'], [-30, 'Pix']]);
        expect(records.filter(record => record.amount < 0).every(record => record.date === '2026-11-16')).toBe(true);
    });
    it('mantém forma desconhecida quando o legado não informa divisão confiável', () => {
        const cancelled = order({ status: 'Cancelled', amountPaid: 40, paymentMethod: 'Split', paymentSplits: [{ method: 'Cash', amount: 70 }, { method: 'Pix', amount: 30 }], cancelledAt: '2026-11-16T12:00:00Z' });
        expect(saleReceiptRecords([cancelled]).map(record => [record.amount, record.paymentMethod])).toEqual([[40, undefined], [-40, undefined]]);
    });
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
