import { supabase } from './supabase';
import { Product, StoreSettings, Sale, FinancialRecord, Customer, StockMovement, Branch, Category, ProductionRecord, Shift, User, Role, CategoryItem, CashClosing, Order } from '../types';

// --- USERS & AUTH ---

// --- USERS & AUTH ---

export const dbUsers = {
  async login(email: string, password: string): Promise<User> {
    // 1. Logar usando o Auth Oficial do Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.error("Auth erro:", authError);
      throw new Error('Usuário não encontrado ou senha incorreta.');
    }

    // 2. Com a sessão gerada e protegida (JWT em mãos), puxar o perfil do usuário e a Empresa
    const { data: user, error } = await supabase
      .from('app_users')
      .select(`
        *,
        tenants (name)
      `)
      .eq('id', authData.user.id)
      .single();

    if (error || !user) {
      throw new Error('Perfil de usuário não localizado no sistema.');
    }

    // 3. Save to LocalStorage (Simple Session)
    const sessionUser: User = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
      avatarInitials: user.avatar_initials,
      tenantId: user.tenant_id || '00000000-0000-0000-0000-000000000000',
      tenantName: user.tenants?.name || 'G.AI Gestão',
      allowedModules: user.allowed_modules
    };
    localStorage.setItem('app_user', JSON.stringify(sessionUser));

    return sessionUser;
  },

  async register(user: { name: string, email: string, password: string, role: Role, allowedModules?: string[] }, existingTenantId?: string): Promise<User> {
    let tenantId = existingTenantId;

    // 2. Create Tenant ONLY if not provided
    if (!tenantId) {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert([{ name: user.name + " Store" }])
        .select()
        .single();

      if (tenantError) {
        console.error("Erro ao criar tenant:", tenantError);
        throw new Error("Erro ao criar organização.");
      }
      tenantId = tenant.id;
    }

    // 3. Criar a conta oficial no Supabase Auth usando o Client Secundário
    // (Avisando que, se um admin estiver logado e criando contas pra gerentes, o persistSession:false impede ele de ser deslogado!)
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Configuração do Supabase (URL/Key) não encontrada no .env");
    }

    const registerClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Criar conta de autenticação
    const { data: authData, error: authError } = await registerClient.auth.signUp({
      email: user.email,
      password: user.password
    });

    if (authError) {
      throw new Error(authError.message === 'User already registered' ? 'Este email já está cadastrado.' : authError.message);
    }

    const authUid = authData.user!.id;

    // 4. Inserir na app_users ligando ao UID do Auth
    const newUser = {
      id: authUid,
      name: user.name,
      email: user.email,
      password: user.password, // Você ainda mantém aqui se quiser retrocompatibilidade até testar, depois ideal remover
      role: user.role,
      avatar_initials: user.name.substring(0, 2).toUpperCase(),
      tenant_id: tenantId,
      allowed_modules: user.allowedModules
    };

    const { data, error } = await supabase
      .from('app_users')
      .insert([newUser])
      .select()
      .single();

    if (error) {
      console.error("Erro ao registrar perfíl:", error);
      throw new Error("Conta Auth criada, mas falhou ao gravar perfil: " + error.message);
    }

    const sessionUser: User = {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role as Role,
      avatarInitials: data.avatar_initials,
      tenantId: data.tenant_id,
      allowedModules: data.allowed_modules
    };

    // Puxar o nome da empresa para guardar na sessão inicial
    if (sessionUser.tenantId) {
      const { data: tenantData } = await supabase.from('tenants').select('name').eq('id', sessionUser.tenantId).single();
      if (tenantData) sessionUser.tenantName = tenantData.name;
    }

    if (!existingTenantId) {
      localStorage.setItem('app_user', JSON.stringify(sessionUser));
      // Precisamos avisar o client atual do Supabase caso seja auto-registro sem ser admin
      await supabase.auth.signInWithPassword({ email: user.email, password: user.password });
    }

    return sessionUser;
  },

  async logout(): Promise<void> {
    localStorage.removeItem('app_user');
    // Also sign out from Supabase just in case
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    // 1. Check LocalStorage first
    try {
      const stored = localStorage.getItem('app_user');
      if (stored) {
        const user = JSON.parse(stored);
        // Garante que o tenantId nunca seja undefined/null para evitar dados zerados
        if (user && !user.tenantId) {
          user.tenantId = '00000000-0000-0000-0000-000000000000';
        }
        return user;
      }
    } catch (e) {
      console.error("Erro ao ler usuário do cache:", e);
      localStorage.removeItem('app_user');
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
      avatarInitials: row.avatar_initials,
      tenantId: row.tenant_id || '00000000-0000-0000-0000-000000000000',
      allowedModules: row.allowed_modules
    }));
  },

  async update(user: User): Promise<void> {
    const { error } = await supabase
      .from('app_users')
      .update({
        name: user.name,
        role: user.role,
        allowed_modules: user.allowedModules
      })
      .eq('id', user.id);
    if (error) throw error;
  },

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const { error } = await supabase.rpc('update_user_password', {
      target_user_id: userId,
      new_password: newPassword
    });

    if (error) throw new Error(error.message || 'Falha ao atualizar a senha no servidor.');
  },

  async delete(userId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_auth_user', {
      target_user_id: userId
    });

    if (error) throw new Error(error.message || 'Falha ao excluir o usuário do servidor.');
  }
};

// --- TENANTS & SaaS ---
export const dbTenants = {
  async registerCompany(data: {
    companyName: string,
    cnpj: string,
    ownerName: string,
    ownerEmail: string,
    ownerPassword: string
  }): Promise<User> {
    // 1. Criar a Empresa (Tenant)
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert([{
        name: data.companyName,
        cnpj: data.cnpj,
        subscription_status: 'TRIAL'
      }])
      .select()
      .single();

    if (tenantError) {
      if (tenantError.code === '23505') throw new Error("Este CNPJ já está cadastrado em nosso sistema.");
      throw new Error("Falha ao registrar empresa: " + tenantError.message);
    }

    // 2. Registrar o Usuário como ADMIN (Owner) vinculado a essa empresa
    return dbUsers.register({
      name: data.ownerName,
      email: data.ownerEmail,
      password: data.ownerPassword,
      role: 'ADMIN',
      allowedModules: ['DASHBOARD', 'SALES', 'INVENTORY', 'FINANCIAL', 'CUSTOMERS', 'PRODUCTION', 'ORDER_CENTER', 'REPORTS', 'CRM', 'SETTINGS']
    }, tenant.id);
  },

  async getMyCompany(tenantId: string) {
    const { data, error } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    if (error) throw error;
    return data;
  }
};

// --- CATEGORIES ---
export const dbCategories = {
  async getAll(tenantId: string, type?: 'PRODUCT' | 'FINANCIAL'): Promise<CategoryItem[]> {
    let query = supabase.from('categories').select('*').eq('tenant_id', tenantId).order('name', { ascending: true });

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

  async add(category: Omit<CategoryItem, 'id'>, tenantId: string) {
    const { error } = await supabase.from('categories').insert([{
      name: category.name,
      type: category.type,
      tenant_id: tenantId
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
  async getAll(tenantId: string): Promise<Product[]> {
    const { data, error } = await supabase.from('products').select('*').eq('tenant_id', tenantId);
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      priceMatriz: row.price_matriz,
      priceFilial: row.price_filial,
      cost: row.cost,
      stockMatrizIbotirama: row.stock_matriz_ibotirama || 0,
      stockMatrizBarreiras: row.stock_matriz_barreiras || 0,
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

      operationalCost: row.operational_cost,
      options: row.options,
      barcode: row.barcode,
      expirationDate: row.expiration_date
    }));
  },

  async add(product: Product, tenantId: string) {
    const { error } = await supabase.from('products').insert([{
      id: product.id,
      name: product.name,
      category: product.category,
      price_matriz: product.priceMatriz,
      price_filial: product.priceFilial,
      cost: product.cost,
      stock_matriz_ibotirama: product.stockMatrizIbotirama,
      stock_matriz_barreiras: product.stockMatrizBarreiras,
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
      operational_cost: product.operationalCost,

      options: product.options,
      barcode: product.barcode,
      expiration_date: product.expirationDate,
      tenant_id: tenantId
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
      stock_matriz_ibotirama: product.stockMatrizIbotirama,
      stock_matriz_barreiras: product.stockMatrizBarreiras,
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

      operational_cost: product.operationalCost,
      options: product.options,
      barcode: product.barcode,
      expiration_date: product.expirationDate
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
  async get(tenantId: string): Promise<StoreSettings | null> {
    const { data, error } = await supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single();
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
      businessHours: data.business_hours,
      primaryColor: data.primary_color,
      facebookPixelId: data.facebook_pixel_id,
      googleTagId: data.google_tag_id,
      deliveryBaseFee: data.delivery_base_fee,
      deliveryPerKm: data.delivery_per_km
    };
  },

  async save(settings: StoreSettings, tenantId: string) {
    const { error } = await supabase.from('store_settings').upsert({
      id: tenantId, // Use tenantId as the ID to ensure 1 per tenant
      store_name: settings.storeName,
      phone: settings.phone,
      address: settings.address,
      cover_image: settings.coverImage,
      background_image: settings.backgroundImage,
      logo_image: settings.logoImage,
      opening_hours: settings.openingHours,
      business_hours: settings.businessHours,
      primary_color: settings.primaryColor,
      facebook_pixel_id: settings.facebookPixelId,
      google_tag_id: settings.googleTagId,
      delivery_base_fee: settings.deliveryBaseFee,
      delivery_per_km: settings.deliveryPerKm,
      tenant_id: tenantId
    });
    if (error) throw error;
  }
};

// --- SALES ---
export const dbSales = {
  async getAll(tenantId: string): Promise<Sale[]> {
    const { data, error } = await supabase.from('sales').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      customerName: row.customer_name,
      total: row.total,
      branch: row.branch as Branch,
      matrizDeposit: row.matriz_deposit,
      status: row.status as any,
      paymentMethod: row.payment_method as any,
      paymentSplits: row.payment_splits,
      hasInvoice: row.has_invoice,
      items: row.items, // JSONB auto-mapped
      cashReceived: row.cash_received,
      changeAmount: row.change_amount,
      amountPaid: row.amount_paid,
      paymentHistory: row.payment_history,
      createdAt: row.created_at,
      deliveryFee: row.delivery_fee,
      source: row.source,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      sellerRole: row.seller_role,
      commissionAmount: row.commission_amount
    }));
  },

  async add(sale: Sale, tenantId: string) {
    const saleData: any = {
      id: sale.id,
      date: sale.date,
      customer_name: sale.customerName,
      total: sale.total,
      branch: sale.branch,
      matriz_deposit: sale.matrizDeposit,
      status: sale.status,
      payment_method: sale.paymentMethod,
      has_invoice: sale.hasInvoice,
      items: sale.items,
      cash_received: sale.cashReceived,
      change_amount: sale.changeAmount,
      amount_paid: sale.amountPaid,
      payment_history: sale.paymentHistory,
      created_at: sale.createdAt,
      delivery_fee: sale.deliveryFee,
      source: sale.source,
      seller_id: sale.sellerId,
      seller_name: sale.sellerName,
      seller_role: sale.sellerRole,
      commission_amount: sale.commissionAmount,
      tenant_id: tenantId
    };

    if (sale.paymentSplits) {
      saleData.payment_splits = sale.paymentSplits;
    }

    const { error } = await supabase.from('sales').upsert([saleData]);
    if (error) throw error;
  },

  async update(sale: Sale) {
    const saleData: any = {
      date: sale.date,
      customer_name: sale.customerName,
      total: sale.total,
      branch: sale.branch,
      matriz_deposit: sale.matrizDeposit,
      status: sale.status,
      payment_method: sale.paymentMethod,
      has_invoice: sale.hasInvoice,
      items: sale.items,
      cash_received: sale.cashReceived,
      change_amount: sale.changeAmount,
      amount_paid: sale.amountPaid,
      payment_history: sale.paymentHistory,
      delivery_fee: sale.deliveryFee,
      source: sale.source,
      seller_id: sale.sellerId,
      seller_name: sale.sellerName,
      seller_role: sale.sellerRole,
      commission_amount: sale.commissionAmount
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
  async getAll(tenantId: string): Promise<FinancialRecord[]> {
    const { data, error } = await supabase.from('financials').select('*').eq('tenant_id', tenantId).order('date', { ascending: false });
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

  async addBatch(records: FinancialRecord[], tenantId: string) {
    if (records.length === 0) return;
    const rows = records.map(r => ({
      id: r.id,
      date: r.date,
      description: r.description,
      amount: r.amount,
      type: r.type,
      category: r.category,
      branch: r.branch,
      payment_method: r.paymentMethod, // Map to DB column
      tenant_id: tenantId
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
  async getAll(tenantId: string): Promise<Customer[]> {
    const { data, error } = await supabase.from('customers').select('*').eq('tenant_id', tenantId).order('name', { ascending: true });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      cpfCnpj: row.cpf_cnpj,
      email: row.email,
      phone: row.phone,
      address: row.address,
      city: row.city,
      state: row.state,
      segment: row.segment,
      branch: row.branch as Branch,
      creatorId: row.creator_id,
      creatorName: row.creator_name,
      responsibleName: row.responsible_name,
      establishmentName: row.establishment_name,
      zipCode: row.zip_code
    }));
  },

  async add(customer: Customer, tenantId: string) {
    const { error } = await supabase.from('customers').insert([{
      id: customer.id,
      name: customer.name,
      cpf_cnpj: customer.cpfCnpj,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      segment: customer.segment,
      branch: customer.branch,
      creator_id: customer.creatorId,
      creator_name: customer.creatorName,
      responsible_name: customer.responsibleName,
      establishment_name: customer.establishmentName,
      zip_code: customer.zipCode,
      tenant_id: tenantId
    }]);
    if (error) throw error;
  },

  async addBatch(customers: Customer[], tenantId: string) {
    if (customers.length === 0) return;
    const rows = customers.map(c => ({
      id: c.id,
      name: c.name,
      cpf_cnpj: c.cpfCnpj,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      state: c.state,
      segment: c.segment,
      branch: c.branch,
      creator_id: c.creatorId,
      creator_name: c.creatorName,
      responsible_name: c.responsibleName,
      establishment_name: c.establishmentName,
      zip_code: c.zipCode,
      tenant_id: tenantId
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
      address: customer.address,
      city: customer.city,
      state: customer.state,
      segment: customer.segment,
      branch: customer.branch,
      creator_id: customer.creatorId,
      creator_name: customer.creatorName,
      responsible_name: customer.responsibleName,
      establishment_name: customer.establishmentName,
      zip_code: customer.zipCode
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
  async getAll(tenantId: string): Promise<StockMovement[]> {
    const { data, error } = await supabase.from('stock_movements').select('*').eq('tenant_id', tenantId).order('date', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      productId: row.product_id,
      productName: row.product_name,
      quantity: row.quantity,
      type: row.type,
      reason: row.reason,
      branch: row.branch as Branch,
      matrizDeposit: row.matriz_deposit
    }));
  },

  async add(movement: StockMovement, tenantId: string) {
    const { error } = await supabase.from('stock_movements').insert([{
      id: movement.id,
      date: movement.date,
      product_id: movement.productId,
      product_name: movement.productName,
      quantity: movement.quantity,
      type: movement.type,
      reason: movement.reason,
      branch: movement.branch,
      matriz_deposit: movement.matrizDeposit,
      tenant_id: tenantId
    }]);
    if (error) throw error;
  }
};

// --- PRODUCTION LOGS ---
export const dbProduction = {
  async getAll(tenantId: string): Promise<ProductionRecord[]> {
    const { data, error } = await supabase.from('production_logs').select('*').eq('tenant_id', tenantId).order('date', { ascending: false });
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

  async add(record: ProductionRecord, tenantId: string) {
    const { error } = await supabase.from('production_logs').insert([{
      id: record.id,
      date: record.date,
      product_id: record.productId,
      product_name: record.productName,
      quantity: record.quantity,
      shift: record.shift,
      responsible: record.responsible,
      notes: record.notes,
      tenant_id: tenantId
    }]);
    if (error) throw error;
  }
};

// --- CASH CLOSINGS ---
export const dbCashClosings = {
  async getAll(tenantId: string): Promise<CashClosing[]> {
    const { data, error } = await supabase.from('cash_closings').select('*').eq('tenant_id', tenantId).order('date', { ascending: false });
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

  async add(closing: CashClosing, tenantId: string) {
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
      closed_by: closing.closedBy,
      tenant_id: tenantId
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
  async getAll(tenantId: string): Promise<Order[]> {
    const { data, error } = await supabase.from('orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
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
      createdAt: row.created_at,
      deliveryFee: row.delivery_fee
    }));
  },

  async add(order: Order, tenantId: string) {
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
      created_at: order.createdAt,
      delivery_fee: order.deliveryFee,
      tenant_id: tenantId
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

// --- CRM ---
import type { CrmLead, CrmInteraction, CrmTask } from '../types';

export const dbCrm = {
  // LEADS
  async getLeads(tenantId: string): Promise<CrmLead[]> {
    const { data, error } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      company: row.company,
      city: row.city,
      channel: row.channel,
      status: row.status,
      estimatedValue: row.estimated_value || 0,
      notes: row.notes,
      responsibleId: row.responsible_id,
      responsibleName: row.responsible_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async addLead(lead: Omit<CrmLead, 'id' | 'createdAt' | 'updatedAt'>, tenantId: string): Promise<CrmLead> {
    const { data, error } = await supabase
      .from('crm_leads')
      .insert([{
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        city: lead.city,
        channel: lead.channel,
        status: lead.status,
        estimated_value: lead.estimatedValue,
        notes: lead.notes,
        responsible_id: lead.responsibleId,
        responsible_name: lead.responsibleName,
        tenant_id: tenantId,
      }])
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id, tenantId: data.tenant_id, name: data.name, phone: data.phone,
      email: data.email, company: data.company, city: data.city, channel: data.channel,
      status: data.status, estimatedValue: data.estimated_value || 0, notes: data.notes,
      responsibleId: data.responsible_id, responsibleName: data.responsible_name,
      createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },

  async updateLead(lead: CrmLead): Promise<void> {
    const { error } = await supabase
      .from('crm_leads')
      .update({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        city: lead.city,
        channel: lead.channel,
        status: lead.status,
        estimated_value: lead.estimatedValue,
        notes: lead.notes,
        responsible_id: lead.responsibleId,
        responsible_name: lead.responsibleName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id);
    if (error) throw error;
  },

  async deleteLead(id: string): Promise<void> {
    const { error } = await supabase.from('crm_leads').delete().eq('id', id);
    if (error) throw error;
  },

  // INTERACTIONS
  async getInteractions(leadId: string): Promise<CrmInteraction[]> {
    const { data, error } = await supabase
      .from('crm_interactions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      leadId: row.lead_id,
      type: row.type,
      content: row.content,
      userId: row.user_id,
      userName: row.user_name,
      createdAt: row.created_at,
    }));
  },

  async addInteraction(interaction: Omit<CrmInteraction, 'id' | 'createdAt'>, tenantId: string): Promise<CrmInteraction> {
    const { data, error } = await supabase
      .from('crm_interactions')
      .insert([{
        lead_id: interaction.leadId,
        type: interaction.type,
        content: interaction.content,
        user_id: interaction.userId,
        user_name: interaction.userName,
        tenant_id: tenantId,
      }])
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id, tenantId: data.tenant_id, leadId: data.lead_id,
      type: data.type, content: data.content, userId: data.user_id,
      userName: data.user_name, createdAt: data.created_at,
    };
  },

  // TASKS
  async getTasks(tenantId: string): Promise<CrmTask[]> {
    const { data, error } = await supabase
      .from('crm_tasks')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      leadId: row.lead_id,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      status: row.status,
      responsibleId: row.responsible_id,
      responsibleName: row.responsible_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async addTask(task: Omit<CrmTask, 'id' | 'createdAt' | 'updatedAt'>, tenantId: string): Promise<CrmTask> {
    const { data, error } = await supabase
      .from('crm_tasks')
      .insert([{
        lead_id: task.leadId || null,
        title: task.title,
        description: task.description,
        due_date: task.dueDate || null,
        status: task.status,
        responsible_id: task.responsibleId,
        responsible_name: task.responsibleName,
        tenant_id: tenantId,
      }])
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id, tenantId: data.tenant_id, leadId: data.lead_id,
      title: data.title, description: data.description, dueDate: data.due_date,
      status: data.status, responsibleId: data.responsible_id,
      responsibleName: data.responsible_name, createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },

  async updateTask(task: CrmTask): Promise<void> {
    const { error } = await supabase
      .from('crm_tasks')
      .update({
        title: task.title,
        description: task.description,
        due_date: task.dueDate || null,
        status: task.status,
        responsible_id: task.responsibleId,
        responsible_name: task.responsibleName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);
    if (error) throw error;
  },

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase.from('crm_tasks').delete().eq('id', id);
    if (error) throw error;
  },

  // EMAIL SENDING (via Supabase Edge Function + Resend)
  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { to, subject, html }
    });

    // Fallback error handling if Edge Function fails
    if (error) throw new Error(error.message || 'Erro ao comunicar com o servidor de e-mail.');
  },
};