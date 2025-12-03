export enum Category {
  ICE_CUBE = 'Gelo Cubo',
  ICE_FLAKE = 'Gelo Escama',
  ICE_BAR = 'Gelo Barra',
  ICE_FLAVOR = 'Gelo Sabor',
  BEVERAGE_ALCOHOL = 'Bebida Alcoólica',
  BEVERAGE_NON_ALCOHOL = 'Bebida Não Alcoólica',
  OTHER = 'Outros'
}

export enum Branch {
  MATRIZ = 'Matriz (Fábrica)',
  FILIAL = 'Filial (Adega)'
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  priceMatriz: number; // Preço Atacado
  priceFilial: number; // Preço Varejo
  cost: number;
  stockMatriz: number;
  stockFilial: number;
  unit: string; // kg, un, pack
  minStock: number;
}

export interface Sale {
  id: string;
  date: string;
  customerName: string;
  total: number;
  items: SaleItem[];
  branch: Branch;
  status: 'Completed' | 'Pending' | 'Cancelled';
  paymentMethod: 'Pix' | 'Credit' | 'Debit' | 'Cash';
  hasInvoice: boolean; // NF-e emitted
  invoiceKey?: string;
  invoiceUrl?: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtSale: number;
}

export interface FinancialRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'Income' | 'Expense';
  category: string;
}

export type Role = 'ADMIN' | 'OPERATOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarInitials: string;
}

export type ViewState = 'DASHBOARD' | 'INVENTORY' | 'SALES' | 'FINANCIAL' | 'AI_INSIGHTS' | 'SETTINGS';