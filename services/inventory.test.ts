import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { DEPOSITS, getDepositStock, getTotalStock, getStockCost, getSalePotential, shouldRestock, getInventoryGroup, getInventoryGroupProducts } from './inventory';

const product = (changes: Partial<Product> = {}): Product => ({
  id: 'ice', name: 'Gelo 5kg', category: 'Gelo Cubo', unit: 'un',
  stockMatrizIbotirama: 10, stockMatrizBarreiras: 20, stockFilial: 5,
  cost: 3, priceMatriz: 6, priceFilial: 8, minStock: 8, ...changes,
});

describe('estoque físico por depósito', () => {
  it('mantém Barreiras nos saldos e totais monetários', () => {
    const ice = product({ stockMatrizIbotirama: 0, stockFilial: 0 });
    expect(DEPOSITS.map(deposit => getDepositStock(ice, deposit))).toEqual([0, 20]);
    expect(getTotalStock(ice)).toBe(20);
    expect(getStockCost(ice)).toBe(60);
    expect(getSalePotential(ice)).toBe(120);
    expect(getStockCost(ice, 'Barreiras')).toBe(60);
    expect(getSalePotential(ice, 'Barreiras')).toBe(120);
  });

  it('soma somente os depósitos da fábrica e preserva consulta explícita ao legado', () => {
    expect(getStockCost(product())).toBe(90);
    expect(getSalePotential(product())).toBe(180);
    expect(getSalePotential(product(), 'Filial')).toBe(40);
  });

  it('não mistura saldo legado da filial com os totais ou os alertas atuais', () => {
    const ice = product({ stockFilial: 664 });
    expect(getTotalStock(ice)).toBe(30);
    expect(getStockCost(ice)).toBe(90);
    expect(getSalePotential(ice)).toBe(180);
    expect(getDepositStock(ice, 'Filial')).toBe(664);
    expect(shouldRestock(product({ stockFilial: 0 }))).toBe(false);
  });

  it('identifica insuficiência em Barreiras e preserva mínimo zero', () => {
    const ice = product({ stockMatrizIbotirama: 10, stockMatrizBarreiras: 2, stockFilial: 10 });
    expect(shouldRestock(ice)).toBe(true);
    expect(shouldRestock(ice, 'Barreiras')).toBe(true);
    expect(shouldRestock(ice, 'Ibotirama')).toBe(false);
    expect(shouldRestock(product({ minStock: 0, stockMatrizBarreiras: 0 }))).toBe(false);
  });

  it.each([
    { isStockControlled: false },
    { comboItems: [{ productId: 'ice', quantity: 2 }] },
  ])('não conta produto sem saldo físico em avaliação ou reposição: %j', changes => {
    const ice = product(changes);
    expect(getStockCost(ice)).toBe(0);
    expect(getSalePotential(ice)).toBe(0);
    expect(shouldRestock(ice)).toBe(false);
  });
});

describe('separação entre gelo, insumos e outros produtos', () => {
  it.each(['Gelo', ' GELO CUBO ', 'gelo escama', 'Gelo-Barra', 'Gelo Sabor'])('classifica %s como gelo', category => {
    expect(getInventoryGroup(product({ category }))).toBe('ice');
  });

  it.each(['Insumo (Matéria-prima)', 'INSUMOS', ' matéria prima ', 'Matérias-Primas', 'Embalagens', 'embalagem', 'Embalagens para gelo'])('classifica %s como insumo', category => {
    expect(getInventoryGroup(product({ category }))).toBe('inputs');
  });

  it.each(['Cerveja', 'Água', 'Bebida com gelo', 'Outros', 'Congelados', 'Geloide'])('preserva %s como outros', category => {
    expect(getInventoryGroup(product({ category }))).toBe('other');
  });

  it('filtra sem descartar os demais grupos nem alterar a lista original', () => {
    const items = [product(), product({ id: 'bag', category: 'Embalagens' }), product({ id: 'beer', category: 'Cerveja' })];
    expect(getInventoryGroupProducts(items, 'ice').map(item => item.id)).toEqual(['ice']);
    expect(getInventoryGroupProducts(items, 'inputs').map(item => item.id)).toEqual(['bag']);
    expect(getInventoryGroupProducts(items, 'other').map(item => item.id)).toEqual(['beer']);
    expect(items).toHaveLength(3);
  });
});
