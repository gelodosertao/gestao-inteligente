import { describe, expect, it } from 'vitest';
import { Branch, type Sale } from '../types';
import { getDispatchedProductRanking, getSaleDispatchDate } from './dispatchedSalesReport';

const sale = (changes: Partial<Sale> = {}): Sale => ({
  id: 'sale', date: '2026-10-20', customerName: 'Cliente', branch: Branch.MATRIZ, source: 'ATACADO',
  status: 'Pending', fulfillmentStatus: 'pending', total: 30, amountPaid: 0, paymentMethod: 'Cash', hasInvoice: false,
  items: [{ productId: 'ice', productName: 'Gelo 5 kg', quantity: 3, priceAtSale: 10 }], ...changes
});

describe('ranking de produtos expedidos', () => {
  it('inclui pedido expedido sem pagamento e exclui pago ainda não expedido, pendente e cancelado', () => {
    const sales = [sale(), sale({ status: 'Completed', amountPaid: 30 }), sale({ fulfillmentStatus: 'dispatched' }), sale({ status: 'Cancelled', fulfillmentStatus: 'dispatched' })];
    expect(getDispatchedProductRanking(sales, 'ALL', 'ALL')).toEqual([{ productId: 'ice', name: 'Gelo 5 kg', qty: 3, value: 30 }]);
  });

  it('inclui legado somente quando concluído e mantém o valor comercial independente de caixa', () => {
    const sales = [sale({ fulfillmentStatus: undefined, status: 'Completed', amountPaid: 5 }), sale({ fulfillmentStatus: undefined, status: 'Finalizado pela Fábrica' }), sale({ fulfillmentStatus: undefined }), sale({ fulfillmentStatus: undefined, status: 'Cancelled' })];
    expect(getDispatchedProductRanking(sales, '10', '2026')[0]).toMatchObject({ qty: 6, value: 60 });
  });

  it('usa a expedição no fuso de São Paulo na virada do mês em lugar da criação', () => {
    const dispatched = sale({ fulfillmentStatus: 'dispatched', dispatchedAt: '2026-11-01T02:30:00Z' });
    expect(getSaleDispatchDate(dispatched)).toBe('2026-10-31');
    expect(getDispatchedProductRanking([dispatched], '11', '2026')).toEqual([]);
    expect(getDispatchedProductRanking([dispatched], '10', '2026')[0].qty).toBe(3);
  });

  it('usa a data original quando a expedição não tem data válida', () => {
    expect(getSaleDispatchDate(sale({ fulfillmentStatus: 'dispatched' }))).toBe('2026-10-20');
    expect(getSaleDispatchDate(sale({ fulfillmentStatus: 'dispatched', dispatchedAt: 'inválida' }))).toBe('2026-10-20');
    expect(getDispatchedProductRanking([sale({ fulfillmentStatus: 'dispatched', date: 'inválida' })], 'ALL', 'ALL')).toEqual([]);
  });
});
