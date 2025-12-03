import { supabase } from './supabase';
import { Product, Sale, FinancialRecord, Category, Branch, User, Role } from '../../types';

// --- USERS & AUTH ---
export const dbUsers = {
  async login(email: string, password: string): Promise<User> {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      throw new Error('Usuário não encontrado. Verifique o e-mail.');
    }

    // Verificação simples de senha (para o protótipo)
    // Nota: Em produção, use supabase.auth ou hash de senha
    if (data.password !== password) {
      throw new Error('Senha incorreta.');
    }

    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role as Role,
      avatarInitials: data.avatar_initials
    };
  },

  async register(user: { name: string, email: string, password: string, role: Role }): Promise<User> {
    const newUser = {
      id: crypto.randomUUID(), // Gera ID único
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
      avatar_initials: user.name.substring(0, 2).toUpperCase()
    };

    const { error } = await supabase.from('app_users').insert([newUser]);

    if (error) {
      if (error.message.includes('duplicate')) throw new Error('E-mail já cadastrado.');
      throw error;
    }

    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      avatarInitials: newUser.avatar_initials
    };
  }
};

// --- PRODUCTS ---
export const dbProducts = {
  async getAll(): Promise<Product[]> {
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category as Category,
      priceMatriz: row.price_matriz,
      priceFilial: row.price_filial,
      cost: row.cost,
      stockMatriz: row.stock_matriz,
      stockFilial: row.stock_filial,
      unit: row.unit,
      minStock: row.min_stock
    }));
  },

  async add(product: Product) {
    const { error } = await supabase.from('products').insert([{
      id: product.id,
      name: product.name,
      category: product.category,
      price_matriz: product.priceMatriz,
      price_filial: product.priceFilial,
      cost: product.cost,
      stock_matriz: product.stockMatriz,
      stock_filial: product.stockFilial,
      unit: product.unit,
      min_stock: product.minStock
    }]);
    if (error) throw error;
  },

  async update(product: Product) {
    const { error } = await supabase.from('products').update({
      name: product.name,
      category: product.category,
      price_matriz: product.priceMatriz,
      price_filial: product.priceFilial,
      cost: product.cost,
      stock_matriz: product.stockMatriz,
      stock_filial: product.stockFilial,
      unit: product.unit,
      min_stock: product.minStock
    }).eq('id', product.id);
    if (error) throw error;
  }
};

// --- SALES ---
export const dbSales = {
  async getAll(): Promise<Sale[]> {
    const { data, error } = await supabase.from('sales').select('*').order('date', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      customerName: row.customer_name,
      total: row.total,
      branch: row.branch as Branch,
      status: row.status as any,
      paymentMethod: row.payment_method as any,
      hasInvoice: row.has_invoice,
      items: row.items // JSONB auto-mapped
    }));
  },

  async add(sale: Sale) {
    const { error } = await supabase.from('sales').insert([{
      id: sale.id,
      date: sale.date,
      customer_name: sale.customerName,
      total: sale.total,
      branch: sale.branch,
      status: sale.status,
      payment_method: sale.paymentMethod,
      has_invoice: sale.hasInvoice,
      items: sale.items
    }]);
    if (error) throw error;
  }
};

// --- FINANCIALS ---
export const dbFinancials = {
  async getAll(): Promise<FinancialRecord[]> {
    const { data, error } = await supabase.from('financials').select('*').order('date', { ascending: false });
    if (error) throw error;

    return data || [];
  },

  async addBatch(records: FinancialRecord[]) {
    if (records.length === 0) return;
    const { error } = await supabase.from('financials').insert(records);
    if (error) throw error;
  }
};