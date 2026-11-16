import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { getProductionAvailability } from './productionAvailability';

const ice = { id: 'ice', recipeBatchSize: 100, recipe: [{ ingredientId: 'bag', quantity: 100 }] } as Product;
const bag = { id: 'bag', name: 'Saco', unit: 'un', stockMatrizIbotirama: 10 } as Product;
describe('disponibilidade de insumos para produção', () => {
  it('consolida insumo repetido e informa falta', () => {
    const [item] = getProductionAvailability({ ...ice, recipe: [...ice.recipe!, ...ice.recipe!] }, [bag], 8, {});
    expect(item).toMatchObject({ ingredientId: 'bag', quantity: 16, available: 10, shortage: 6 });
  });
  it('permite consumo real positivo e saldo exatamente suficiente', () => {
    expect(getProductionAvailability(ice, [bag], 100, { bag: 10 })[0].shortage).toBe(0);
  });
  it('não omite insumo removido do cadastro', () => {
    expect(() => getProductionAvailability(ice, [], 1, {})).toThrow(/indisponível/);
  });
  it.each([0, -1, NaN, Infinity])('rejeita consumo inválido %s', quantity => {
    expect(() => getProductionAvailability(ice, [bag], 1, { bag: quantity })).toThrow();
  });
  it('não arredonda consumo pequeno para zero', () => {
    expect(getProductionAvailability(ice, [bag], 0.00001, {})[0].quantity).toBeGreaterThan(0);
  });
  it('rejeita receita com lote inválido ou saldo próprio desativado', () => {
    expect(() => getProductionAvailability({ ...ice, recipeBatchSize: 0 }, [bag], 1, {})).toThrow();
    expect(() => getProductionAvailability(ice, [{ ...bag, isStockControlled: false }], 1, {})).toThrow();
  });
});
