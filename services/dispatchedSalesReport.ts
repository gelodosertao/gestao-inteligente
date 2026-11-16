import type { Sale } from '../types';
import { getMovementLocalDate } from './stockLedger';

export function getSaleDispatchDate(sale: Sale): string | null {
  if (sale.source === 'ATACADO' && sale.fulfillmentStatus !== undefined && sale.dispatchedAt) {
    const dispatched = new Date(sale.dispatchedAt);
    if (Number.isFinite(dispatched.getTime())) {
      return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dispatched);
    }
  }
  return getMovementLocalDate(sale.date);
}

export function getDispatchedProductRanking(sales: Sale[], month: string, year: string) {
  const totals = new Map<string, { productId: string; name: string; qty: number; value: number }>();
  for (const sale of sales) {
    if (sale.status === 'Cancelled') continue;
    const managed = sale.source === 'ATACADO' && sale.fulfillmentStatus !== undefined;
    if (managed ? sale.fulfillmentStatus !== 'dispatched' : sale.status !== 'Completed' && sale.status !== 'Finalizado pela Fábrica') continue;
    const date = getSaleDispatchDate(sale);
    if (!date || (month !== 'ALL' && date.slice(5, 7) !== month) || (year !== 'ALL' && date.slice(0, 4) !== year)) continue;
    for (const item of sale.items) {
      const total = totals.get(item.productId) || { productId: item.productId, name: item.productName, qty: 0, value: 0 };
      total.qty += item.quantity;
      total.value += item.quantity * item.priceAtSale;
      totals.set(item.productId, total);
    }
  }
  return [...totals.values()].sort((left, right) => right.qty - left.qty).slice(0, 10);
}
