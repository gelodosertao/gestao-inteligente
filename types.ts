export enum Category {
  WATER = 'Água',
  BEER = 'Cerveja',
  ENERGY_DRINK = 'Energético',
  ICE_BAR = 'Gelo Barra',
  ICE_CUBE = 'Gelo Cubo',
  ICE_FLAKE = 'Gelo Escama',
  ICE_FLAVOR = 'Gelo Sabor',
  GIN = 'Gin',
  LIQUEUR = 'Licor',
  OTHER = 'Outros',
  SODA = 'Refrigerante',
  VODKA = 'Vodka',
  WHISKY = 'Whisky'
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
  packSize?: number; // Quantidade no fardo
  pricePack?: number; // Preço do fardo
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
  branch?: Branch;
}

export type Role = 'ADMIN' | 'OPERATOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarInitials: string;
}

export type ViewState = 'DASHBOARD' | 'INVENTORY' | 'SALES' | 'FINANCIAL' | 'AI_INSIGHTS' | 'SETTINGS' | 'CUSTOMERS' | 'PRICING' | 'ONLINE_MENU';

export interface Customer {
  id: string;
  name: string;
  cpfCnpj?: string;
  email?: string;
  phone?: string;
  address?: string;
  segment?: string;
  city?: string;
  state?: string;
  branch?: Branch;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  type: 'LOSS' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN';
  reason: string;
  branch: Branch;
}