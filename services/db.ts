import { supabase } from './supabase';
import { Product, Sale, FinancialRecord, Category, Branch, User, Role, Customer, StockMovement } from '../types';

// --- USERS & AUTH ---

async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

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

    const hashedPassword = await hashPassword(password);

    // Check if password matches (hashed)
    if (data.password !== hashedPassword) {
      // Fallback for legacy plain text passwords (optional, for transition)
      if (data.password !== password) {
        throw new Error('Senha incorreta.');
      }
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
    const hashedPassword = await hashPassword(user.password);

    const newUser = {
      id: crypto.randomUUID(), // Gera ID único
      name: user.name,
      email: user.email,
      password: hashedPassword,
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
      minStock: row.min_stock,
      packSize: row.pack_size,
      pricePack: row.price_pack,
      isStockControlled: row.is_stock_controlled,
      comboItems: row.combo_items
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
      min_stock: product.minStock,
      pack_size: product.packSize,
      price_pack: product.pricePack,
      is_stock_controlled: product.isStockControlled,
      combo_items: product.comboItems
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
      min_stock: product.minStock,
      pack_size: product.packSize,
      price_pack: product.pricePack,
      is_stock_controlled: product.isStockControlled,
      combo_items: product.comboItems
    }).eq('id', product.id);
    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase.from('products').delete().eq('id', id);
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
  },

  async update(sale: Sale) {
    const { error } = await supabase.from('sales').update({
      date: sale.date,
      customer_name: sale.customerName,
      total: sale.total,
      branch: sale.branch,
      status: sale.status,
      payment_method: sale.paymentMethod,
      has_invoice: sale.hasInvoice,
      items: sale.items
    }).eq('id', sale.id);
    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) throw error;
  }
};

// --- FINANCIALS ---
export const dbFinancials = {
  async getAll(): Promise<FinancialRecord[]> {
    const { data, error } = await supabase.from('financials').select('*').order('date', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      category: row.category,
      branch: row.branch as Branch
    }));
  },

  async addBatch(records: FinancialRecord[]) {
    if (records.length === 0) return;
    const rows = records.map(r => ({
      id: r.id,
      date: r.date,
      description: r.description,
      amount: r.amount,
      type: r.type,
      category: r.category,
      branch: r.branch
    }));
    const { error } = await supabase.from('financials').insert(rows);
    if (error) throw error;
  },

  async update(record: FinancialRecord) {
    const { error } = await supabase.from('financials').update({
      date: record.date,
      description: record.description,
      amount: record.amount,
      type: record.type,
      category: record.category,
      branch: record.branch
    }).eq('id', record.id);
    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase.from('financials').delete().eq('id', id);
    if (error) throw error;
  }
};

// --- CUSTOMERS ---
export const dbCustomers = {
  async getAll(): Promise<Customer[]> {
    const { data, error } = await supabase.from('customers').select('*').order('name', { ascending: true });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      cpfCnpj: row.cpf_cnpj,
      email: row.email,
      phone: row.phone,
      address: row.address
    }));
  },

  async add(customer: Customer) {
    const { error } = await supabase.from('customers').insert([{
      id: customer.id,
      name: customer.name,
      cpf_cnpj: customer.cpfCnpj,
      email: customer.email,
      phone: customer.phone,
      address: customer.address
    }]);
    if (error) throw error;
  },

  async addBatch(customers: Customer[]) {
    if (customers.length === 0) return;
    const rows = customers.map(c => ({
      id: c.id,
      name: c.name,
      cpf_cnpj: c.cpfCnpj,
      email: c.email,
      phone: c.phone,
      address: c.address
    }));
    const { error } = await supabase.from('customers').insert(rows);
    if (error) throw error;
  },

  async update(customer: Customer) {
    const { error } = await supabase.from('customers').update({
      name: customer.name,
      cpf_cnpj: customer.cpfCnpj,
      email: customer.email,
      phone: customer.phone,
      address: customer.address
    }).eq('id', customer.id);
    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
  }
};

// --- STOCK MOVEMENTS ---
export const dbStockMovements = {
  async getAll(): Promise<StockMovement[]> {
    const { data, error } = await supabase.from('stock_movements').select('*').order('date', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      productId: row.product_id,
      productName: row.product_name,
      quantity: row.quantity,
      type: row.type,
      reason: row.reason,
      branch: row.branch as Branch
    }));
  },

  async add(movement: StockMovement) {
    const { error } = await supabase.from('stock_movements').insert([{
      id: movement.id,
      date: movement.date,
      product_id: movement.productId,
      product_name: movement.productName,
      quantity: movement.quantity,
      type: movement.type,
      reason: movement.reason,
      branch: movement.branch
    }]);
    if (error) throw error;
  }
};