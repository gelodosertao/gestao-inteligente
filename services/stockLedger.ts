import { Branch, type StockMovement } from '../types';

export type StockNature = 'production' | 'consumption' | 'transfer' | 'adjustment' | 'sale' | 'return' | 'loss' | 'initial' | 'receipt' | 'entry' | 'legacy';

export const STOCK_NATURE_LABELS: Record<StockNature, string> = {
  production: 'Produção', consumption: 'Consumo de insumos', transfer: 'Transferência',
  adjustment: 'Ajuste de inventário', sale: 'Venda / ajuste de venda', return: 'Estorno de venda',
  loss: 'Perda', initial: 'Saldo inicial', receipt: 'Recebimento XML', entry: 'Entrada', legacy: 'Registro legado'
};

export function getStockMovementDeposit(movement: StockMovement): string {
  if (movement.branch === Branch.FILIAL) return 'Filial';
  return movement.matrizDeposit || 'Matriz (depósito não informado)';
}

export function getStockMovementDetails(movement: StockMovement): { nature: StockNature; label: string; delta: number } {
  let nature: StockNature = 'legacy';
  const event = movement.eventType;
  const reason = movement.reason || '';
  if (event === 'production' || (!event && movement.type === 'TRANSFER_IN' && /^Produção - Turno /.test(reason))) nature = 'production';
  else if (event === 'consumption' || (!event && movement.type === 'TRANSFER_OUT' && /^Insumo para Produção de /.test(reason))) nature = 'consumption';
  else if (movement.saleId || /^Venda concluída #|^Ajuste da venda #|^Estorno da venda #/.test(reason)) nature = /^Estorno da venda #/.test(reason) ? 'return' : 'sale';
  else if (event === 'transfer_in' || event === 'transfer_out' || movement.type === 'TRANSFER_IN' || movement.type === 'TRANSFER_OUT') nature = 'transfer';
  else if (event === 'loss' || movement.type === 'LOSS') nature = 'loss';
  else if (event?.startsWith('initial_') || (!event && /^(Cadastro inicial|Saldo inicial)$/i.test(reason))) nature = 'initial';
  else if (event === 'receipt' || (!event && reason === 'Importação XML NFe')) nature = 'receipt';
  else if (event === 'adjust' || movement.type === 'ADJUSTMENT') nature = 'adjustment';
  else if (movement.type === 'ENTRY') nature = 'entry';

  let delta = movement.quantity;
  if (movement.type === 'LOSS' || movement.type === 'TRANSFER_OUT') delta = -Math.abs(delta);
  else if (movement.type === 'ENTRY' || movement.type === 'TRANSFER_IN') delta = Math.abs(delta);
  if (typeof movement.stockBefore === 'number' && Number.isFinite(movement.stockBefore)
    && typeof movement.stockAfter === 'number' && Number.isFinite(movement.stockAfter)) {
    delta = movement.stockAfter - movement.stockBefore;
  }
  return { nature, label: STOCK_NATURE_LABELS[nature], delta };
}

export function getMovementLocalDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isFinite(parsed.getTime()) && parsed.getFullYear() === Number(value.slice(0, 4))
      && parsed.getMonth() + 1 === Number(value.slice(5, 7)) && parsed.getDate() === Number(value.slice(8, 10)) ? value : null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export interface StockLedgerFilters {
  productId?: string;
  deposit?: string;
  nature?: StockNature | '';
  month?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
}

export function matchesStockLedgerFilters(movement: StockMovement, filters: StockLedgerFilters): boolean {
  if (filters.productId && movement.productId !== filters.productId) return false;
  if (filters.deposit && getStockMovementDeposit(movement) !== filters.deposit) return false;
  if (filters.nature && getStockMovementDetails(movement).nature !== filters.nature) return false;
  const date = getMovementLocalDate(movement.date);
  const hasDateFilter = (filters.month && filters.month !== 'ALL') || (filters.year && filters.year !== 'ALL') || filters.startDate || filters.endDate;
  if (!date) return !hasDateFilter;
  if (filters.month && filters.month !== 'ALL' && date.slice(5, 7) !== filters.month) return false;
  if (filters.year && filters.year !== 'ALL' && date.slice(0, 4) !== filters.year) return false;
  if (filters.startDate && date < filters.startDate) return false;
  return !filters.endDate || date <= filters.endDate;
}

export function formatStockMovementDate(value: string): string {
  if (!getMovementLocalDate(value)) return 'Data não informada';
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
    .toLocaleString('pt-BR', /^\d{4}-\d{2}-\d{2}$/.test(value) ? { dateStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' });
}
