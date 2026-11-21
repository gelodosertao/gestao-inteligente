import { describe, expect, it } from 'vitest';
import { Branch, type StockMovement } from '../types';
import { formatStockMovementDate, getMovementLocalDate, getStockMovementDeposit, getStockMovementDetails, matchesStockLedgerFilters } from './stockLedger';

const movement = (changes: Partial<StockMovement> = {}): StockMovement => ({
  id: 'movement-1', date: '2026-11-01', productId: 'ice', productName: 'Gelo 5 kg', quantity: 10,
  type: 'ENTRY', reason: 'Cadastro Inicial', branch: Branch.MATRIZ, matrizDeposit: 'Ibotirama', ...changes
});

describe('extrato de estoque', () => {
  it('inclui produção e consumo com a direção de seus movimentos novos e legados', () => {
    expect(getStockMovementDetails(movement({ eventType: 'production', reason: 'Produção' }))).toMatchObject({ nature: 'production', delta: 10 });
    expect(getStockMovementDetails(movement({ type: 'TRANSFER_IN', reason: 'Produção - Turno Manhã' })).nature).toBe('production');
    expect(getStockMovementDetails(movement({ type: 'TRANSFER_OUT', reason: 'Insumo para Produção de Gelo (Lote: 10)' }))).toMatchObject({ nature: 'consumption', delta: -10 });
    expect(getStockMovementDetails(movement({ type: 'TRANSFER_OUT', reason: 'Transferência' })).nature).toBe('transfer');
  });

  it('preserva ajustes assinados de venda e distingue estornos', () => {
    expect(getStockMovementDetails(movement({ type: 'ADJUSTMENT', quantity: -4, reason: 'Venda concluída #sale', saleId: 'sale' }))).toMatchObject({ nature: 'sale', delta: -4 });
    expect(getStockMovementDetails(movement({ type: 'ADJUSTMENT', quantity: 4, reason: 'Estorno da venda #sale', saleId: 'sale' }))).toMatchObject({ nature: 'return', delta: 4 });
    expect(getStockMovementDetails(movement({ type: 'ADJUSTMENT', quantity: -2, eventType: 'adjust' }))).toMatchObject({ nature: 'adjustment', delta: -2 });
  });

  it('usa os saldos registrados para provar a direção, sem calcular saldo histórico', () => {
    expect(getStockMovementDetails(movement({ quantity: 2, stockBefore: 9, stockAfter: 7 })).delta).toBe(-2);
    expect(getStockMovementDetails(movement({ type: 'LOSS', stockBefore: undefined, stockAfter: undefined })).delta).toBe(-10);
  });

  it('distingue recebimento, saldo inicial e entrada sem natureza comprovada', () => {
    expect(getStockMovementDetails(movement({ eventType: 'receipt' })).nature).toBe('receipt');
    expect(getStockMovementDetails(movement()).nature).toBe('initial');
    expect(getStockMovementDetails(movement({ eventType: 'initial_Ibotirama', reason: 'Cadastro inicial' })).nature).toBe('initial');
    expect(getStockMovementDetails(movement({ eventType: 'initial_Barreiras', reason: 'Cadastro inicial' })).nature).toBe('initial');
    expect(getStockMovementDetails(movement({ reason: 'Registro antigo' })).nature).toBe('entry');
    expect(getStockMovementDeposit(movement({ matrizDeposit: undefined }))).toBe('Matriz (depósito não informado)');
  });

  it('filtra produto, depósito, natureza e limites inclusivos do período', () => {
    const receipt = movement({ eventType: 'receipt' });
    expect(matchesStockLedgerFilters(receipt, { productId: 'ice', deposit: 'Ibotirama', nature: 'receipt', month: '11', year: '2026', startDate: '2026-11-01', endDate: '2026-11-01' })).toBe(true);
    expect(matchesStockLedgerFilters(receipt, { deposit: 'Barreiras' })).toBe(false);
    expect(matchesStockLedgerFilters(receipt, { productId: 'bags' })).toBe(false);
    expect(matchesStockLedgerFilters(receipt, { nature: 'loss' })).toBe(false);
    expect(matchesStockLedgerFilters(receipt, { month: '10' })).toBe(false);
  });

  it('preserva datas sem hora no primeiro dia do mês e exclui datas inválidas de períodos', () => {
    expect(getMovementLocalDate('2026-11-01')).toBe('2026-11-01');
    expect(formatStockMovementDate('2026-11-01')).toBe('01/11/2026');
    expect(getMovementLocalDate('2026-02-30')).toBeNull();
    expect(matchesStockLedgerFilters(movement({ date: 'inválida' }), { month: '11' })).toBe(false);
    expect(matchesStockLedgerFilters(movement({ date: 'inválida' }), { month: 'ALL', year: 'ALL' })).toBe(true);
  });

  it('usa o dia local para timestamps com fuso em vez de cortar a string UTC', () => {
    const value = '2026-11-01T00:30:00+03:00';
    const date = new Date(value);
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    expect(getMovementLocalDate(value)).toBe(local);
    expect(matchesStockLedgerFilters(movement({ date: value }), { startDate: local, endDate: local })).toBe(true);
  });
});
