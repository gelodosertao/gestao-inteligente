import type { Product } from '../types';

export function getProductionAvailability(product: Product, products: Product[], produced: number, overrides: Record<string, number>) {
  if (!Number.isFinite(produced) || produced <= 0) throw new Error('Informe uma quantidade produzida maior que zero.');
  const batchSize = product.recipeBatchSize ?? 1;
  if (!Number.isFinite(batchSize) || batchSize <= 0) throw new Error('Corrija o tamanho do lote na receita.');
  const demands = new Map<string, number>();
  for (const item of product.recipe ?? []) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.ingredientId === product.id) {
      throw new Error('A receita contém insumo ou quantidade inválidos. Corrija antes de produzir.');
    }
    demands.set(item.ingredientId, (demands.get(item.ingredientId) ?? 0) + (produced / batchSize) * item.quantity);
  }
  return [...demands].map(([ingredientId, calculated]) => {
    const ingredient = products.find(item => item.id === ingredientId);
    if (!ingredient) throw new Error(`Insumo ${ingredientId} da receita indisponível. Corrija a receita antes de produzir.`);
    if (ingredient.isStockControlled === false || ingredient.comboItems?.length) throw new Error(`O insumo ${ingredient.name} não possui saldo próprio.`);
    const quantity = overrides[ingredientId] ?? calculated;
    const available = ingredient.stockMatrizIbotirama;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(available) || available < 0) {
      throw new Error(`Corrija a quantidade ou o saldo do insumo ${ingredient.name}.`);
    }
    return { key: ingredientId, ingredientId, name: ingredient.name, quantity, unit: ingredient.unit,
      available, shortage: Math.max(0, quantity - available) };
  });
}
