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
  DRINK = 'Drinks/Coquetéis',
  RAW_MATERIAL = 'Insumo (Matéria-prima)'
}
export enum Branch {
  MATRIZ = 'Matriz (Fábrica)',
  FILIAL = 'Filial (Adega)'
}

export interface CategoryItem {
  id: string;
  name: string;
  type: 'PRODUCT' | 'FINANCIAL';
}

export interface ProductOption {
  name: string; // e.g., "Adicionais", "Fruta"
  type: 'checkbox' | 'radio' | 'text'; // checkbox = multiple, radio = single
  required?: boolean;
  choices: {
    name: string; // e.g., "Dose Extra", "Morango"
    priceChange?: number; // +5.00
  }[];
}

export interface Product {
  id: string;
  name: string;
  category: string;
  priceMatriz: number; // Preço Atacado
  priceFilial: number; // Preço Varejo
  cost: number;
  stockMatrizIbotirama: number;
  stockMatrizBarreiras: number;
  stockFilial: number;
  unit: string; // kg, un, pack
  minStock: number;
  packSize?: number; // Quantidade no fardo
  pricePack?: number; // Preço do fardo
  isStockControlled?: boolean; // Se false, não controla estoque (ex: Drinks feitos na hora)
  comboItems?: { productId: string; quantity: number }[]; // Se preenchido, é um Combo
  image?: string; // URL da imagem do produto
  description?: string; // Descrição do produto
  options?: ProductOption[]; // Opções de personalização
  barcode?: string; // Código de barras do produto
  expirationDate?: string; // Data de vencimento (YYYY-MM-DD)

  // Production / Recipe
  recipe?: { ingredientId: string; quantity: number }[]; // Insumos gastos por unidade produzida
  recipeBatchSize?: number; // Tamanho do lote de referência para a receita (ex: 888 unidades)
  operationalCost?: number; // Custo operacional extra por unidade (energia, mão de obra rateada)
}

export interface BusinessDay {
  day: string;
  isOpen: boolean;
  open: string;
  close: string;
}

export interface StoreSettings {
  id: string; // usually 'default'
  storeName: string;
  phone: string;
  address: string;
  coverImage?: string;
  backgroundImage?: string;
  logoImage?: string;
  openingHours: string; // Display text like "Seg-Sex: 08h-18h"
  businessHours?: BusinessDay[]; // Structured hours for logic
  primaryColor?: string; // Hex code
  facebookPixelId?: string;
  googleTagId?: string;
  deliveryBaseFee?: number;
  deliveryPerKm?: number;
  storeLat?: number;
  storeLng?: number;
}

export interface PaymentEntry {
  id: string;
  date: string;
  amount: number;
  method: 'Pix' | 'Credit' | 'Debit' | 'Cash';
  notes?: string;
}

export interface Sale {
  id: string;
  date: string;
  customerName: string;
  total: number;
  items: SaleItem[];
  branch: Branch;
  matrizDeposit?: 'Ibotirama' | 'Barreiras';
  status: 'Completed' | 'Pending' | 'Cancelled' | 'Finalizado pela Fábrica';
  paymentMethod: 'Pix' | 'Credit' | 'Debit' | 'Cash' | 'Split';
  paymentSplits?: { method: 'Pix' | 'Credit' | 'Debit' | 'Cash', amount: number }[];
  hasInvoice: boolean; // NF-e emitted
  invoiceKey?: string;
  invoiceUrl?: string;
  cashReceived?: number; // Valor recebido em dinheiro
  changeAmount?: number; // Troco devolvido
  // Propriedades para venda Fiado / Parcial
  amountPaid?: number; // Total pago
  paymentHistory?: PaymentEntry[]; // Histórico
  createdAt?: string; // ISO Date String for proper sorting/time display
  deliveryFee?: number; // Taxa de entrega
  source?: string; // Origem da venda (ex: 'OnlineMenu')
  sellerId?: string; // ID of the user who made the sale
  sellerName?: string; // Name of the user who made the sale
  sellerRole?: string; // Role of the user who made the sale
  commissionAmount?: number; // Calculated commission at the time of sale
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtSale: number;
  selectedOptions?: {
    optionName: string;
    choiceName: string;
    priceChange: number;
  }[];
  notes?: string;
}

export interface FinancialRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'Income' | 'Expense';
  category: string;
  branch?: Branch;
  paymentMethod?: 'Pix' | 'Credit' | 'Debit' | 'Cash';
}

export type Role = 'ADMIN' | 'OPERATOR' | 'FACTORY' | 'WHOLESALE_REPRESENTATIVE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarInitials: string;
  tenantId: string;
  tenantName?: string;
  allowedModules?: string[]; // IDs of modules the user can access
}

export type ViewState = 'DASHBOARD' | 'INVENTORY' | 'SALES' | 'FINANCIAL' | 'CASH_CLOSING' | 'AI_INSIGHTS' | 'SETTINGS' | 'CUSTOMERS' | 'PRICING' | 'ONLINE_MENU' | 'MENU_CONFIG' | 'PRODUCTION' | 'ORDER_CENTER' | 'REPORTS' | 'WHOLESALE_POS' | 'CRM';

export interface Order {
  id: string;
  date: string;
  customerName: string;
  customerPhone?: string;
  address?: string;
  deliveryMethod: 'DELIVERY' | 'PICKUP';
  paymentMethod: 'PIX' | 'CREDIT' | 'DEBIT' | 'CASH';
  items: SaleItem[];
  total: number;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
  branch: Branch;
  createdAt: number;
  deliveryFee?: number;
}

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
  creatorId?: string;   // ID of the user who registered the customer
  creatorName?: string; // Name of the user who registered the customer
  responsibleName?: string;
  establishmentName?: string;
  zipCode?: string;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  type: 'LOSS' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ENTRY';
  reason: string;
  branch: Branch;
  matrizDeposit?: 'Ibotirama' | 'Barreiras';
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

export interface CashClosing {
  id: string;
  date: string;
  branch: Branch;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  totalByPaymentMethod: {
    Pix: number;
    Credit: number;
    Debit: number;
    Cash: number;
  };
  cashInDrawer: number; // Valor contado
  difference: number; // Sobra ou Falta
  notes?: string;
  closedBy: string; // User name
}

// --- CRM MODULE ---

export type CrmLeadStatus = 'NOVO' | 'CONTATO' | 'PROPOSTA' | 'FECHADO' | 'PERDIDO';
export type CrmChannel = 'WhatsApp' | 'Instagram' | 'Facebook' | 'Indicação' | 'Site' | 'Outros';
export type CrmInteractionType = 'NOTA' | 'WHATSAPP' | 'LIGACAO' | 'EMAIL' | 'REUNIAO';
export type CrmTaskStatus = 'PENDENTE' | 'CONCLUIDA' | 'CANCELADA';

export interface CrmLead {
  id: string;
  tenantId: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  city?: string;
  channel: CrmChannel;
  status: CrmLeadStatus;
  estimatedValue: number;
  notes?: string;
  responsibleId?: string;
  responsibleName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmInteraction {
  id: string;
  tenantId: string;
  leadId: string;
  type: CrmInteractionType;
  content: string;
  userId?: string;
  userName?: string;
  createdAt: string;
}

export interface CrmTask {
  id: string;
  tenantId: string;
  leadId?: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: CrmTaskStatus;
  responsibleId?: string;
  responsibleName?: string;
  createdAt: string;
  updatedAt: string;
}