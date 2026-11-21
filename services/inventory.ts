import type { Product } from '../types';
import type { InventoryDeposit } from './db';

export const DEPOSITS = ['Ibotirama', 'Barreiras'] as const satisfies readonly InventoryDeposit[];

export type InventoryGroup = 'ice' | 'inputs' | 'other';
export const INVENTORY_GROUPS = ['ice', 'inputs', 'other'] as const;
export const INVENTORY_GROUP_LABELS: Record<InventoryGroup, string> = { ice: 'Gelo', inputs: 'Insumos', other: 'Outros' };

export function getInventoryGroup(product: Product): InventoryGroup {
  const category = product.category.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/\b(insumos?|materias? primas?|embalage(?:m|ns))\b/.test(category)) return 'inputs';
  if (/^gelo(?:\s|$)/.test(category)) return 'ice';
  return 'other';
}

export function getInventoryGroupProducts(products: Product[], group: InventoryGroup): Product[] {
  return products.filter(product => getInventoryGroup(product) === group);
}

export function getDepositStock(product: Product, deposit: InventoryDeposit): number {
  if (deposit === 'Ibotirama') return product.stockMatrizIbotirama ?? 0;
  if (deposit === 'Barreiras') return product.stockMatrizBarreiras ?? 0;
  return product.stockFilial ?? 0;
}

export function getTotalStock(product: Product): number {
  return DEPOSITS.reduce((total, deposit) => total + getDepositStock(product, deposit), 0);
}

function hasPhysicalStock(product: Product): boolean {
  return product.isStockControlled !== false && !product.comboItems?.length;
}

export function getStockCost(product: Product, deposit?: InventoryDeposit): number {
  if (!hasPhysicalStock(product)) return 0;
  return product.cost * (deposit ? getDepositStock(product, deposit) : getTotalStock(product));
}

export function getSalePotential(product: Product, deposit?: InventoryDeposit): number {
  if (!hasPhysicalStock(product)) return 0;
  const deposits: readonly InventoryDeposit[] = deposit ? [deposit] : DEPOSITS;
  return deposits.reduce((total, location) => {
    const price = location === 'Filial' ? product.priceFilial : product.priceMatriz;
    return total + getDepositStock(product, location) * price;
  }, 0);
}

export function shouldRestock(product: Product, deposit?: InventoryDeposit): boolean {
  return hasPhysicalStock(product)
    && (deposit ? [deposit] : DEPOSITS).some(location => getDepositStock(product, location) < product.minStock);
}
