import { supabase } from './supabase';
import { Product, StoreSettings, Sale, FinancialRecord, Customer, StockMovement, Branch, Category, ProductionRecord, Shift, User, Role, CategoryItem, CashClosing, Order } from '../types';

// --- USERS & AUTH ---

// --- USERS & AUTH ---

export const dbUsers = {
  async login(email: string, password: string): Promise<User> {
    // 1. Query app_users directly
    const { data: user, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      throw new Error('Usuário não encontrado ou senha incorreta.');
    }

    // 2. Simple password check (In production, use hashing!)
    // Note: If you have old users with hashed passwords, this simple check might fail.
    // We assume for this "fix" that we are storing passwords plainly or simply.
    if (user.password !== password) {
      throw new Error('Senha incorreta.');
    }

    // 3. Save to LocalStorage (Simple Session)
    const sessionUser: User = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
      avatarInitials: user.avatar_initials
    };
    localStorage.setItem('app_user', JSON.stringify(sessionUser));

    return sessionUser;
  },

  async register(user: { name: string, email: string, password: string, role: Role }): Promise<User> {
    // 1. Check if user exists
    const { data: existing } = await supabase
      .from('app_users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (existing) {
      throw new Error('Este email já está cadastrado.');
    }

    // 2. Insert into app_users
    const newUser = {
      name: user.name,
      email: user.email,
      password: user.password, // Storing plain text as requested for simplicity/revert
      role: user.role,
      avatar_initials: user.name.substring(0, 2).toUpperCase()
    };

    const { data, error } = await supabase
      .from('app_users')
      .insert([newUser])
      .select()
      .single();

    if (error) {
      console.error("Erro ao registrar:", error);
      throw new Error("Erro ao criar conta: " + error.message);
    }

    // 3. Auto-login (Save to LocalStorage)
    const sessionUser: User = {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role as Role,
      avatarInitials: data.avatar_initials
    };
    localStorage.setItem('app_user', JSON.stringify(sessionUser));

    return sessionUser;
  },

  async logout(): Promise<void> {
    localStorage.removeItem('app_user');
    // Also sign out from Supabase just in case
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    // 1. Check LocalStorage first
    const stored = localStorage.getItem('app_user');
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  },

  async getAll(): Promise<User[]> {
    const { data, error } = await supabase.from('app_users').select('*');
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as Role,
      avatarInitials: row.avatar_initials
    }));
  },

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const { error } = await supabase
      .from('app_users')
      .update({ password: newPassword })
      .eq('id', userId);
    if (error) throw error;
  },

  async delete(userId: string): Promise<void> {
    const { error } = await supabase.from('app_users').delete().eq('id', userId);
    if (error) throw error;
  }
};

// --- CATEGORIES ---
export const dbCategories = {
  async getAll(type?: 'PRODUCT' | 'FINANCIAL'): Promise<CategoryItem[]> {
    let query = supabase.from('categories').select('*').order('name', { ascending: true });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type
    }));
  },

  async add(category: Omit<CategoryItem, 'id'>) {
    const { error } = await supabase.from('categories').insert([{
      name: category.name,
      type: category.type
    }]);
    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
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
      category: row.category,
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
      comboItems: row.combo_items,
      image: row.image,
      recipe: row.recipe,
      recipeBatchSize: row.recipe_batch_size,
      operationalCost: row.operational_cost
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
      combo_items: product.comboItems,
      image: product.image,
      recipe: product.recipe,
      recipe_batch_size: product.recipeBatchSize,
      operational_cost: product.operationalCost
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
      combo_items: product.comboItems,
      image: product.image,
      recipe: product.recipe,
      recipe_batch_size: product.recipeBatchSize,
      operational_cost: product.operationalCost
    }).eq('id', product.id);
    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  }
};

// --- STORE SETTINGS ---
export const dbSettings = {
  async get(): Promise<StoreSettings | null> {
    const { data, error } = await supabase.from('store_settings').select('*').single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "Row not found"
    if (!data) return null;

    return {
      id: data.id,
      storeName: data.store_name,
      phone: data.phone,
      address: data.address,
      coverImage: data.cover_image,
      backgroundImage: data.background_image,
      logoImage: data.logo_image,
      openingHours: data.opening_hours,
      primaryColor: data.primary_color
    };
  },

  async save(settings: StoreSettings) {
    const { error } = await supabase.from('store_settings').upsert({
      id: settings.id,
      store_name: settings.storeName,
      phone: settings.phone,
      address: settings.address,
      cover_image: settings.coverImage,
      background_image: settings.backgroundImage,
      logo_image: settings.logoImage,
      opening_hours: settings.openingHours,
      primary_color: settings.primaryColor
    });
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
      paymentSplits: row.payment_splits,
      hasInvoice: row.has_invoice,
      items: row.items, // JSONB auto-mapped
      cashReceived: row.cash_received,
      changeAmount: row.change_amount
    }));
  },

  async add(sale: Sale) {
    const saleData: any = {
      id: sale.id,
      date: sale.date,
      customer_name: sale.customerName,
      total: sale.total,
      branch: sale.branch,
      status: sale.status,
      payment_method: sale.paymentMethod,
      has_invoice: sale.hasInvoice,
      items: sale.items,
      cash_received: sale.cashReceived,
      change_amount: sale.changeAmount
    };

    if (sale.paymentSplits) {
      saleData.payment_splits = sale.paymentSplits;
    }

    const { error } = await supabase.from('sales').insert([saleData]);
    if (error) throw error;
  },

  async update(sale: Sale) {
    const saleData: any = {
      date: sale.date,
      customer_name: sale.customerName,
      total: sale.total,
      branch: sale.branch,
      status: sale.status,
      payment_method: sale.paymentMethod,
      has_invoice: sale.hasInvoice,
      items: sale.items,
      cash_received: sale.cashReceived,
      change_amount: sale.changeAmount
    };

    if (sale.paymentSplits) {
      saleData.payment_splits = sale.paymentSplits;
    }

    const { error } = await supabase.from('sales').update(saleData).eq('id', sale.id);
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
      branch: row.branch as Branch,
      paymentMethod: row.payment_method // Map from DB column
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
      branch: r.branch,
      payment_method: r.paymentMethod // Map to DB column
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
      branch: record.branch,
      payment_method: record.paymentMethod // Map to DB column
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

// --- PRODUCTION LOGS ---
export const dbProduction = {
  async getAll(): Promise<ProductionRecord[]> {
    const { data, error } = await supabase.from('production_logs').select('*').order('date', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      productId: row.product_id,
      productName: row.product_name,
      quantity: row.quantity,
      shift: row.shift as Shift,
      responsible: row.responsible,
      notes: row.notes
    }));
  },

  async add(record: ProductionRecord) {
    const { error } = await supabase.from('production_logs').insert([{
      id: record.id,
      date: record.date,
      product_id: record.productId,
      product_name: record.productName,
      quantity: record.quantity,
      shift: record.shift,
      responsible: record.responsible,
      notes: record.notes
    }]);
    if (error) throw error;
  }
};

// --- CASH CLOSINGS ---
export const dbCashClosings = {
  async getAll(): Promise<CashClosing[]> {
    const { data, error } = await supabase.from('cash_closings').select('*').order('date', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      branch: row.branch as Branch,
      openingBalance: row.opening_balance,
      totalIncome: row.total_income,
      totalExpense: row.total_expense,
      totalByPaymentMethod: row.total_by_payment_method, // JSONB
      cashInDrawer: row.cash_in_drawer,
      difference: row.difference,
      notes: row.notes,
      closedBy: row.closed_by
    }));
  },

  async add(closing: CashClosing) {
    const { error } = await supabase.from('cash_closings').insert([{
      id: closing.id,
      date: closing.date,
      branch: closing.branch,
      opening_balance: closing.openingBalance,
      total_income: closing.totalIncome,
      total_expense: closing.totalExpense,
      total_by_payment_method: closing.totalByPaymentMethod,
      cash_in_drawer: closing.cashInDrawer,
      difference: closing.difference,
      notes: closing.notes,
      closed_by: closing.closedBy
    }]);
    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase.from('cash_closings').delete().eq('id', id);
    if (error) throw error;
  }
};

// --- ORDERS ---
export const dbOrders = {
  async getAll(): Promise<Order[]> {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      address: row.address,
      deliveryMethod: row.delivery_method,
      paymentMethod: row.payment_method,
      items: row.items,
      total: row.total,
      status: row.status,
      branch: row.branch,
      createdAt: row.created_at
    }));
  },

  async add(order: Order) {
    const { error } = await supabase.from('orders').insert([{
      id: order.id,
      date: order.date,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      address: order.address,
      delivery_method: order.deliveryMethod,
      payment_method: order.paymentMethod,
      items: order.items,
      total: order.total,
      status: order.status,
      branch: order.branch,
      created_at: order.createdAt
    }]);
    if (error) throw error;
  },

  async updateStatus(id: string, status: string) {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) throw error;
  }
};