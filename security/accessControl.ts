import type { Role, User, ViewState } from '../types';

export type AppDataset = 'products' | 'sales' | 'financials' | 'customers' | 'cashClosings';

const ALL_MODULES: readonly ViewState[] = [
  'DASHBOARD',
  'INVENTORY',
  'SALES',
  'FINANCIAL',
  'AI_INSIGHTS',
  'SETTINGS',
  'CUSTOMERS',
  'PRICING',
  'MENU_CONFIG',
  'PRODUCTION',
  'ORDER_CENTER',
  'REPORTS',
  'ATACADO',
  'CRM',
  'FESTAS_RADAR',
  'LOGISTICS',
  'CONCILIACAO',
];

export const DEFAULT_MODULES_BY_ROLE: Readonly<Record<Role, readonly ViewState[]>> = {
  ADMIN: ALL_MODULES,
  OPERATOR: ['CUSTOMERS', 'INVENTORY', 'FINANCIAL', 'LOGISTICS', 'SALES', 'FESTAS_RADAR'],
  FACTORY: ['PRODUCTION'],
  WHOLESALE_REPRESENTATIVE: ['ATACADO'],
};

const DATASET_MODULES: Readonly<Record<AppDataset, readonly ViewState[]>> = {
  products: ['DASHBOARD', 'INVENTORY', 'SALES', 'ATACADO', 'PRODUCTION', 'REPORTS', 'PRICING', 'LOGISTICS'],
  sales: ['DASHBOARD', 'SALES', 'ATACADO', 'REPORTS', 'FINANCIAL', 'CONCILIACAO', 'LOGISTICS'],
  financials: ['DASHBOARD', 'FINANCIAL', 'REPORTS', 'CONCILIACAO'],
  customers: ['DASHBOARD', 'CUSTOMERS', 'SALES', 'ATACADO', 'REPORTS'],
  cashClosings: ['DASHBOARD', 'FINANCIAL', 'CONCILIACAO'],
};

export function hasModuleAccess(user: User, module: ViewState): boolean {
  if (!user.isActive || user.mustChangePassword) return false;
  if (user.role === 'ADMIN') return true;

  const defaults = DEFAULT_MODULES_BY_ROLE[user.role] ?? [];
  return defaults.includes(module) || (user.allowedModules ?? []).includes(module);
}

export function canLoadDataset(user: User, dataset: AppDataset): boolean {
  return DATASET_MODULES[dataset].some((module) => hasModuleAccess(user, module));
}

export function getInitialView(user: User): ViewState {
  switch (user.role) {
    case 'ADMIN':
      return 'DASHBOARD';
    case 'OPERATOR':
      return 'SALES';
    case 'FACTORY':
      return 'PRODUCTION';
    case 'WHOLESALE_REPRESENTATIVE':
      return 'ATACADO';
  }
}
