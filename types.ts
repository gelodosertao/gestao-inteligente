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
  WHISKY = 'Whisky',
  DRINK = 'Drinks/Coquetéis'
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
  isStockControlled?: boolean; // Se false, não controla estoque (ex: Drinks feitos na hora)
  comboItems?: { productId: string; quantity: number }[]; // Se preenchido, é um Combo
  image?: string; // URL da imagem do produto
}

export interface StoreSettings {
  id: string; // usually 'default'
  storeName: string;
  phone: string;
  address: string;
  coverImage?: string;
  backgroundImage?: string;
  logoImage?: string;
  openingHours: string; // e.g. "Seg-Sex: 08h-18h"
  primaryColor?: string; // Hex code
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

export type Role = 'ADMIN' | 'OPERATOR' | 'FACTORY';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarInitials: string;
}

export type ViewState = 'DASHBOARD' | 'INVENTORY' | 'SALES' | 'FINANCIAL' | 'AI_INSIGHTS' | 'SETTINGS' | 'CUSTOMERS' | 'PRICING' | 'ONLINE_MENU' | 'MENU_CONFIG' | 'PRODUCTION';

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

export type Shift = 'Manhã' | 'Tarde' | 'Noite' | 'Madrugada';

export interface ProductionRecord {
  id: string;
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  shift: Shift;
  responsible: string;
  notes?: string;
}