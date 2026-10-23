import { supabase } from './supabase';
import { Product, StoreSettings, Sale, SaleItem, FinancialRecord, Customer, StockMovement, Branch, Category, ProductionRecord, Shift, User, Role, CategoryItem, CashClosing, Order, ReconciliationAction, ReconciliationCase } from '../types';
import { mapUserProfile } from '../security/userProfile';

// --- HELPER DE PAGINAÇÃO PARA BYPASS LIMITE 1000 DO SUPABASE ---
const fetchAllRecords = async (getQuery: (from: number, to: number) => any) => {
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await getQuery(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }
  return allData;
};

// --- USERS & AUTH ---

const USER_PROFILE_SELECT = `
  id,
  name,
  email,
  role,
  avatar_initials,
  tenant_id,
  allowed_modules,
  is_active,
  must_change_password,
  temporary_password_expires_at,
  tenants (name)
`;

async function loadUserProfile(userId: string): Promise<User> {
  const { data, error } = await supabase
    .from('app_users')
    .select(USER_PROFILE_SELECT)
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new Error('Perfil de usuário não localizado no sistema.');
  }

  return mapUserProfile(data);
}

async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) throw new Error(error.message || 'Falha ao executar operação administrativa.');
  if (!data?.success) throw new Error(data?.error || 'Operação administrativa recusada.');
  return data as T;
}

export const dbUsers = {
  async login(email: string, password: string): Promise<User> {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.error("Auth erro:", authError);
      throw new Error('Usuário não encontrado ou senha incorreta.');
    }

    const sessionUser = await loadUserProfile(authData.user.id);
    if (!sessionUser.isActive) {
      await supabase.auth.signOut();
      throw new Error('Conta desativada. Procure o administrador da sua empresa.');
    }

    localStorage.removeItem('app_user');
    return sessionUser;
  },

  async register(user: { name: string, email: string, password: string, role: Role, allowedModules?: string[] }): Promise<User> {
    const result = await invokeAdminUsers<{ success: true; user: unknown }>({
      action: 'create',
      name: user.name,
      email: user.email,
      temporaryPassword: user.password,
      role: user.role,
      allowedModules: user.allowedModules ?? [],
    });
    return mapUserProfile(result.user as Record<string, unknown>);
  },

  async logout(): Promise<void> {
    localStorage.removeItem('app_user');
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        localStorage.removeItem('app_user');
        return null;
      }

      localStorage.removeItem('app_user');
      const user = await loadUserProfile(session.user.id);
      if (!user.isActive) {
        await supabase.auth.signOut();
        return null;
      }
      return user;
    } catch (e) {
      console.error("Erro ao ler usuário:", e);
      localStorage.removeItem('app_user');
    }
    return null;
  },

  async getAll(): Promise<User[]> {
    const data = await fetchAllRecords((from, to) => supabase
      .from('app_users')
      .select(USER_PROFILE_SELECT)
      .range(from, to));
    return (data || []).map(mapUserProfile);
  },

  async update(user: User): Promise<void> {
    await invokeAdminUsers({
      action: 'update',
      userId: user.id,
      name: user.name,
      role: user.role,
      allowedModules: user.allowedModules ?? [],
      isActive: user.isActive,
    });
  },

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    await invokeAdminUsers({
      action: 'reset-password',
      userId,
      temporaryPassword: newPassword,
    });
  },

  async delete(userId: string): Promise<void> {
    await invokeAdminUsers({ action: 'delete', userId });
  },

  async changeOwnPassword(newPassword: string): Promise<User> {
    const { data, error } = await supabase.functions.invoke('change-password', {
      body: { newPassword },
    });
    if (error) throw new Error(error.message || 'Falha ao alterar a senha.');
    if (!data?.success) throw new Error(data?.error || 'Alteração de senha recusada.');
    return mapUserProfile(data.user);
  }
};

// --- CATEGORIES ---
export const dbCategories = {
  async getAll(tenantId: string, type?: 'PRODUCT' | 'FINANCIAL'): Promise<CategoryItem[]> {
    const data = await fetchAllRecords((from, to) => {
      let query = supabase.from('categories').select('*').eq('tenant_id', tenantId).order('name', { ascending: true });
      if (type) query = query.eq('type', type);
      return query.range(from, to);
    });

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
    const data = await fetchAllRecords((from, to) => supabase.from('products').select('*').eq('tenant_id', tenantId).range(from, to));
    
    if (!data) return [];

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
export type SaleOperationAction = 'create' | 'update' | 'cancel';

export interface SaleOperationResult {
  operationId: string;
  saleId: string;
  action: SaleOperationAction;
  status: Sale['status'];
}

export const dbSales = {
  async getAll(tenantId: string): Promise<Sale[]> {
    const data = await fetchAllRecords((from, to) => supabase.from('sales').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).range(from, to));

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
      discount: row.discount,
      source: row.source,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      sellerRole: row.seller_role,
      commissionAmount: row.commission_amount,
      nfeStatus: row.nfe_status,
      nfeNumber: row.nfe_number,
      nfeSeries: row.nfe_series,
      nfeXml: row.nfe_xml,
      nfeIssuedAt: row.nfe_issued_at,
      customerDetails: row.customer_details,
      invoiceKey: row.invoice_key,
      invoiceUrl: row.invoice_url
    }));
  },

  async applyOperation(
    action: SaleOperationAction,
    sale: Sale,
    operationId: string
  ): Promise<SaleOperationResult> {
    const { data, error } = await supabase.rpc('apply_sale_operation', {
      p_operation_id: operationId,
      p_sale_id: sale.id,
      p_action: action,
      p_payload: action === 'cancel' ? {} : sale
    });

    if (error) throw error;
    return data as SaleOperationResult;
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
      discount: sale.discount,
      source: sale.source,
      seller_id: sale.sellerId,
      seller_name: sale.sellerName,
      seller_role: sale.sellerRole,
      commission_amount: sale.commissionAmount,
      nfe_status: sale.nfeStatus,
      nfe_number: sale.nfeNumber,
      nfe_series: sale.nfeSeries,
      nfe_xml: sale.nfeXml,
      nfe_issued_at: sale.nfeIssuedAt,
      customer_details: sale.customerDetails,
      invoice_key: sale.invoiceKey,
      invoice_url: sale.invoiceUrl,
      tenant_id: tenantId
    };

    if (sale.paymentSplits) {
      saleData.payment_splits = sale.paymentSplits;
    }

    const { error } = await supabase.from('sales').upsert([saleData]);
    if (error) throw error;

    // ETAPA 2: Inserir itens na tabela sale_items
    if (sale.items && sale.items.length > 0) {
      const saleItemsData = sale.items.map((item: SaleItem) => ({
        sale_id: sale.id,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        price_at_sale: item.priceAtSale,
        ncm: item.ncm || null,
        cfop: item.cfop || null,
        cst: item.cst || null,
        tenant_id: tenantId
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItemsData);
      if (itemsError) throw itemsError;
      console.log('Itens salvos com sucesso:', saleItemsData);
    }
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
      discount: sale.discount,
      source: sale.source,
      seller_id: sale.sellerId,
      seller_name: sale.sellerName,
      seller_role: sale.sellerRole,
      commission_amount: sale.commissionAmount,
      nfe_status: sale.nfeStatus,
      nfe_number: sale.nfeNumber,
      nfe_series: sale.nfeSeries,
      nfe_xml: sale.nfeXml,
      nfe_issued_at: sale.nfeIssuedAt,
      customer_details: sale.customerDetails,
      invoice_key: sale.invoiceKey,
      invoice_url: sale.invoiceUrl
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
    const data = await fetchAllRecords((from, to) => supabase.from('financials').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).range(from, to));

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
    const data = await fetchAllRecords((from, to) => supabase.from('customers').select('*').eq('tenant_id', tenantId).order('name', { ascending: true }).range(from, to));

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
      zipCode: row.zip_code,
      razaoSocial: row.razao_social,
      inscricaoEstadual: row.inscricao_estadual,
      logradouro: row.logradouro,
      numero: row.numero,
      bairro: row.bairro,
    }));
  },

  async add(customer: Customer, tenantId: string) {
    const { data, error } = await supabase.from('customers').insert([{
      id: customer.id,
      name: customer.name,
      cpf_cnpj: customer.cpfCnpj,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      segment: customer.segment,
      city: customer.city,
      state: customer.state,
      branch: customer.branch,
      tenant_id: tenantId,
      creator_id: customer.creatorId,
      creator_name: customer.creatorName,
      responsible_name: customer.responsibleName,
      establishment_name: customer.establishmentName,
      zip_code: customer.zipCode,
      razao_social: customer.razaoSocial,
      inscricao_estadual: customer.inscricaoEstadual,
      logradouro: customer.logradouro,
      numero: customer.numero,
      bairro: customer.bairro,
    }]).select();
    if (error) throw error;
    return data?.[0];
  },

  async addBatch(customers: Customer[], tenantId: string) {
    if (customers.length === 0) return;
    const mapped = customers.map(c => ({
      id: c.id,
      name: c.name,
      cpf_cnpj: c.cpfCnpj,
      email: c.email,
      phone: c.phone,
      address: c.address,
      segment: c.segment,
      city: c.city,
      state: c.state,
      branch: c.branch,
      tenant_id: tenantId,
      creator_id: c.creatorId,
      creator_name: c.creatorName,
      responsible_name: c.responsibleName,
      establishment_name: c.establishmentName,
      zip_code: c.zipCode,
      razao_social: c.razaoSocial,
      inscricao_estadual: c.inscricaoEstadual,
      logradouro: c.logradouro,
      numero: c.numero,
      bairro: c.bairro,
    }));
    const { error } = await supabase.from('customers').insert(mapped);
    if (error) throw error;
  },

  async update(customer: Customer) {
    const { error } = await supabase.from('customers').update({
      name: customer.name,
      cpf_cnpj: customer.cpfCnpj,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      segment: customer.segment,
      city: customer.city,
      state: customer.state,
      branch: customer.branch,
      creator_name: customer.creatorName,
      responsible_name: customer.responsibleName,
      establishment_name: customer.establishmentName,
      zip_code: customer.zipCode,
      razao_social: customer.razaoSocial,
      inscricao_estadual: customer.inscricaoEstadual,
      logradouro: customer.logradouro,
      numero: customer.numero,
      bairro: customer.bairro,
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
    const data = await fetchAllRecords((from, to) => supabase.from('stock_movements').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).range(from, to));

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
    const data = await fetchAllRecords((from, to) => supabase.from('production_logs').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).range(from, to));

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
    const data = await fetchAllRecords((from, to) => supabase.from('cash_closings').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).range(from, to));

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
    const data = await fetchAllRecords((from, to) => supabase.from('orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).range(from, to));

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
    const data = await fetchAllRecords((from, to) => supabase.from('crm_leads').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).range(from, to));
    
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

// --- FINANCIAL RECONCILIATION ---
export const dbReconciliation = {
  async getCases(): Promise<ReconciliationCase[]> {
    const { data, error } = await supabase.rpc('get_financial_reconciliation_cases');
    if (error) throw error;
    return Array.isArray(data) ? data as ReconciliationCase[] : [];
  },

  async resolveCase(
    caseKey: string,
    action: ReconciliationAction,
    options: { financialId?: string; saleId?: string; note?: string } = {}
  ) {
    const { data, error } = await supabase.rpc('resolve_financial_reconciliation_case', {
      p_case_key: caseKey,
      p_action: action,
      p_financial_id: options.financialId ?? null,
      p_sale_id: options.saleId ?? null,
      p_note: options.note ?? null,
    });
    if (error) throw error;
    return data as { caseKey: string; status: string; adjustmentFinancialId?: string | null; idempotent: boolean };
  },
};
