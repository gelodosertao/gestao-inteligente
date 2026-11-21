import { describe, expect, it } from 'vitest';
import { calculateProductionCosts } from './productionCosts';

const input = {
  products: [{ id: 'bag', cost: 2 }, { id: 'ice', cost: 3 }],
  recipe: [{ ingredientId: 'bag', quantity: 100 }],
  batchSize: 100,
  operationalCost: 100,
  productId: 'ice'
};

describe('custo de produção por lote', () => {
  it('divide insumos e custo operacional pelo lote', () => {
    expect(calculateProductionCosts(input)).toEqual({ batchCost: 300, unitCost: 3 });
  });

  it('preserva precisão para lotes fracionários e permite custo operacional zero', () => {
    expect(calculateProductionCosts({ ...input, batchSize: 2.5, operationalCost: 0 }))
      .toEqual({ batchCost: 200, unitCost: 80 });
  });

  it.each([0, -1, NaN, Infinity])('rejeita quantidade inválida de lote %s', batchSize => {
    expect(() => calculateProductionCosts({ ...input, batchSize })).toThrow();
  });

  it.each([-1, NaN, Infinity])('rejeita custo operacional inválido %s', operationalCost => {
    expect(() => calculateProductionCosts({ ...input, operationalCost })).toThrow();
  });

  it.each([0, -1, NaN, Infinity])('rejeita quantidade inválida de insumo %s', quantity => {
    expect(() => calculateProductionCosts({ ...input, recipe: [{ ingredientId: 'bag', quantity }] })).toThrow();
  });

  it.each(['', 'unknown', 'ice'])('rejeita referência de insumo inválida %s', ingredientId => {
    expect(() => calculateProductionCosts({ ...input, recipe: [{ ingredientId, quantity: 1 }] })).toThrow();
  });

  it('rejeita insumo repetido', () => {
    expect(() => calculateProductionCosts({ ...input, recipe: [...input.recipe, ...input.recipe] })).toThrow();
  });

  it.each([-1, NaN, Infinity])('rejeita custo inválido no cadastro de insumo %s', cost => {
    expect(() => calculateProductionCosts({ ...input, products: [{ id: 'bag', cost }] })).toThrow();
  });

  it('rejeita estouro numérico do custo', () => {
    expect(() => calculateProductionCosts({ ...input, operationalCost: Number.MAX_VALUE,
      products: [{ id: 'bag', cost: Number.MAX_VALUE }] })).toThrow();
  });
});
