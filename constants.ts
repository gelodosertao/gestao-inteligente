import { Branch, Category, Product, Sale, FinancialRecord, User } from './types';

export const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'João Pedro',
    email: 'admin@gelodosertao.com',
    role: 'ADMIN',
    avatarInitials: 'JP',
    tenantId: '00000000-0000-0000-0000-000000000000'
  },
  {
    id: 'u2',
    name: 'Operador Caixa',
    email: 'caixa@gelodosertao.com',
    role: 'OPERATOR',
    avatarInitials: 'CX',
    tenantId: '00000000-0000-0000-0000-000000000000'
  }
];

export const CUSTOMER_SEGMENTS = [
  'Adega',
  'Ambulante',
  'Atacadista',
  'Bar',
  'Conveniência',
  'Distribuidora',
  'Eventos',
  'Geleiro',
  'Mercadinho',
  'Mercado',
  'Posto',
  'Restaurante',
  'Supermercado',
  'Cardápio Digital',
  'Outros'
];

export const MOCK_PRODUCTS: Product[] = [];
export const MOCK_SALES: Sale[] = [];
export const MOCK_FINANCIALS: FinancialRecord[] = [];