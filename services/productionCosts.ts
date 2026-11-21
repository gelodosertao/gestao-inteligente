interface ProductionCostInput {
  products: { id: string; cost: number }[];
  recipe: { ingredientId: string; quantity: number }[];
  batchSize: number;
  operationalCost: number;
  productId: string;
}

export function calculateProductionCosts(input: ProductionCostInput) {
  if (!Number.isFinite(input.batchSize) || input.batchSize <= 0) {
    throw new Error('Informe uma quantidade do lote maior que zero.');
  }
  if (!Number.isFinite(input.operationalCost) || input.operationalCost < 0) {
    throw new Error('Informe um custo operacional do lote válido e não negativo.');
  }

  const seen = new Set<string>();
  let ingredientCost = 0;
  for (const item of input.recipe) {
    const ingredient = input.products.find(product => product.id === item.ingredientId);
    if (!ingredient || item.ingredientId === input.productId || seen.has(item.ingredientId)) {
      throw new Error('Selecione insumos válidos, sem repetir o mesmo insumo na receita.');
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error('Informe uma quantidade maior que zero para cada insumo.');
    }
    if (!Number.isFinite(ingredient.cost) || ingredient.cost < 0) {
      throw new Error('Corrija o custo inválido de um dos insumos antes de salvar a receita.');
    }
    seen.add(item.ingredientId);
    ingredientCost += ingredient.cost * item.quantity;
  }

  const batchCost = ingredientCost + input.operationalCost;
  const unitCost = batchCost / input.batchSize;
  if (!Number.isFinite(batchCost) || !Number.isFinite(unitCost)) {
    throw new Error('O custo calculado excede o limite permitido. Revise os valores do lote.');
  }
  return { batchCost, unitCost };
}
