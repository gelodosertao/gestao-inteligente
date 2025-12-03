import { Branch, Category, Product, Sale, FinancialRecord, User } from './types';

export const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'João Pedro',
    email: 'admin@gelodosertao.com',
    role: 'ADMIN',
    avatarInitials: 'JP'
  },
  {
    id: 'u2',
    name: 'Operador Caixa',
    email: 'caixa@gelodosertao.com',
    role: 'OPERATOR',
    avatarInitials: 'CX'
  }
];

export const MOCK_PRODUCTS: Product[] = [];
export const MOCK_SALES: Sale[] = [];
export const MOCK_FINANCIALS: FinancialRecord[] = [];