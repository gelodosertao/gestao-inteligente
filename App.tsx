import React, { useState, useEffect } from 'react';
import AppSidebar from './components/AppSidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import Financial from './components/Financial';
import AIAssistant from './components/AIAssistant';
import Settings from './components/Settings';
import Login from './components/Login';
import Customers from './components/Customers';
import Pricing from './components/Pricing';
import OnlineMenu from './components/OnlineMenu';
import MenuConfig from './components/MenuConfig';
import Production from './components/Production';
import OrderCenter from './components/OrderCenter';
import { ViewState, User, Product, Sale, FinancialRecord, Branch, Customer, CashClosing } from './types';
import { MOCK_PRODUCTS, MOCK_SALES, MOCK_FINANCIALS } from './constants';
import { dbProducts, dbSales, dbFinancials, dbCustomers, dbCashClosings, dbUsers } from './services/db';
import { supabase } from './services/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');

  // Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [financials, setFinancials] = useState<FinancialRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cashClosings, setCashClosings] = useState<CashClosing[]>([]);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const [pricingProductId, setPricingProductId] = useState<string | null>(null);

  // --- AUTH & INITIAL DATA ---
  useEffect(() => {
    // Check for public menu access via URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('menu') === 'true') {
      setCurrentView('ONLINE_MENU');
    }

    // Check for active session on load
    dbUsers.getCurrentUser().then(user => {
      if (user) setCurrentUser(user);
    });
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadDataFromCloud();
    }
  }, [currentUser]);

  const loadDataFromCloud = async () => {
    setIsLoading(true);
    setDbError(null);
    try {
      // Parallel fetch for speed
      const [p, s, f, c, cc] = await Promise.all([
        dbProducts.getAll(currentUser.tenantId),
        dbSales.getAll(currentUser.tenantId),
        dbFinancials.getAll(currentUser.tenantId),
        dbCustomers.getAll(currentUser.tenantId),
        dbCashClosings.getAll(currentUser.tenantId)
      ]);

      setProducts(p.length > 0 ? p : []);
      setSales(s);
      setFinancials(f);
      setCustomers(c);
      setCashClosings(cc);

    } catch (error: any) {
      console.error("Erro ao conectar com Supabase:", error);
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        setDbError("Tabelas não encontradas no Supabase. Por favor, execute o script SQL no painel do banco de dados.");
      } else {
        setDbError("Erro de conexão com o banco de dados. Verifique a internet.");
      }
      setProducts(MOCK_PRODUCTS);
      setSales([]); // Cleaned as requested
      setFinancials([]); // Cleaned as requested
    } finally {
      setIsLoading(false);
    }
  };

  // --- GLOBAL ACTIONS (Connected to DB) ---

  const handleUpdateProduct = async (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    try {
      await dbProducts.update(updatedProduct);
    } catch (e: any) {
      console.error("Failed to update product in DB", e);
      alert(`Erro ao salvar alteração no banco de dados: ${e.message || e}`);
    }
  };

  const handleAddProduct = async (newProduct: Product) => {
    setProducts(prev => [...prev, newProduct]);
    try {
      await dbProducts.add(newProduct, currentUser!.tenantId);
    } catch (e: any) {
      console.error(e);
      alert(`Erro ao criar produto no banco: ${e.message || e}`);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    setProducts(prev => prev.filter(p => p.id !== productId));
    try {
      await dbProducts.delete(productId);
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir produto no banco.");
    }
  };

  const handleAddSale = async (newSale: Sale) => {
    setSales(prev => [newSale, ...prev]);

    // Calculate total quantity sold for each product (handling Combos)
    const soldQuantities: Record<string, number> = {};

    newSale.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product?.comboItems && product.comboItems.length > 0) {
        // It's a Combo: deduct stock from components
        product.comboItems.forEach(component => {
          soldQuantities[component.productId] = (soldQuantities[component.productId] || 0) + (component.quantity * item.quantity);
        });
      } else {
        // Simple Product: deduct directly
        soldQuantities[item.productId] = (soldQuantities[item.productId] || 0) + item.quantity;
      }
    });

    const updatedProductsList = products.map(prod => {
      const qtySold = soldQuantities[prod.id];
      if (qtySold) {
        if (newSale.branch === Branch.FILIAL) {
          return { ...prod, stockFilial: Math.max(0, prod.stockFilial - qtySold) };
        } else {
          return { ...prod, stockMatriz: Math.max(0, prod.stockMatriz - qtySold) };
        }
      }
      return prod;
    });
    setProducts(updatedProductsList);

    // Only add to financials if Completed
    if (newSale.status === 'Completed') {
      const newFinancial: FinancialRecord = {
        id: `f-${Date.now()}`,
        date: newSale.date,
        description: `Venda #${newSale.id} - ${newSale.customerName}`,
        amount: newSale.total,
        type: 'Income',
        category: 'Vendas',
        branch: newSale.branch
      };
      setFinancials(prev => [newFinancial, ...prev]);

      try {
        await dbSales.add(newSale, currentUser!.tenantId);
        await dbFinancials.addBatch([newFinancial], currentUser!.tenantId);

        for (const prodId of Object.keys(soldQuantities)) {
          const product = updatedProductsList.find(p => p.id === prodId);
          if (product) {
            await dbProducts.update(product);
          }
        }
      } catch (e) {
        console.error("Erro ao sincronizar venda com banco:", e);
        alert(`A venda foi registrada localmente mas houve erro ao salvar na nuvem: ${e.message || JSON.stringify(e)}`);
      }
    } else {
      // If Pending, just save sale and update stock (stock is reserved even if pending? Usually yes)
      try {
        await dbSales.add(newSale, currentUser!.tenantId);
        for (const prodId of Object.keys(soldQuantities)) {
          const product = updatedProductsList.find(p => p.id === prodId);
          if (product) {
            await dbProducts.update(product);
          }
        }
      } catch (e) {
        console.error("Erro ao sincronizar venda pendente:", e);
      }
    }


  };

  const handleAddFinancialRecord = async (newRecords: FinancialRecord[]) => {
    setFinancials(prev => [...newRecords, ...prev]);
    try {
      await dbFinancials.addBatch(newRecords, currentUser!.tenantId);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar despesas no banco.");
    }
  };

  const handleUpdateFinancialRecord = async (updatedRecord: FinancialRecord) => {
    setFinancials(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
    try {
      await dbFinancials.update(updatedRecord);
    } catch (e) {
      console.error(e);
      alert("Erro ao atualizar registro financeiro no banco.");
    }
  };

  const handleDeleteFinancialRecord = async (recordId: string) => {
    if (!confirm("Tem certeza que deseja excluir este registro financeiro?")) return;
    setFinancials(prev => prev.filter(r => r.id !== recordId));
    try {
      await dbFinancials.delete(recordId);
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir registro financeiro no banco.");
    }
  };

  const handleAddCustomer = async (newCustomer: Customer) => {
    setCustomers(prev => [...prev, newCustomer]);
    try {
      await dbCustomers.add(newCustomer, currentUser!.tenantId);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar cliente no banco.");
    }
  };

  const handleImportCustomers = async (newCustomers: Customer[]) => {
    setCustomers(prev => [...prev, ...newCustomers]);
    try {
      await dbCustomers.addBatch(newCustomers, currentUser!.tenantId);
    } catch (e) {
      console.error(e);
      alert("Erro ao importar clientes no banco.");
    }
  };

  const handleUpdateCustomer = async (updatedCustomer: Customer) => {
    setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
    try {
      await dbCustomers.update(updatedCustomer);
    } catch (e) {
      console.error(e);
      alert("Erro ao atualizar cliente no banco.");
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
    setCustomers(prev => prev.filter(c => c.id !== customerId));
    try {
      await dbCustomers.delete(customerId);
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir cliente no banco.");
    }
  };

  const handleUpdateSale = async (updatedSale: Sale) => {
    setSales(prev => prev.map(s => s.id === updatedSale.id ? updatedSale : s));
    try {
      await dbSales.update(updatedSale);
    } catch (e) {
      console.error(e);
      alert("Erro ao atualizar venda no banco.");
    }
  };

  const handleDeleteSale = async (saleId: string) => {
    const saleToDelete = sales.find(s => s.id === saleId);
    if (!saleToDelete) return;

    if (!confirm("Tem certeza que deseja excluir esta venda? O estoque será devolvido automaticamente.")) return;

    // Calculate stock to return
    const returnedQuantities: Record<string, number> = {};

    saleToDelete.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product?.comboItems && product.comboItems.length > 0) {
        // It's a Combo: return stock to components
        product.comboItems.forEach(component => {
          returnedQuantities[component.productId] = (returnedQuantities[component.productId] || 0) + (component.quantity * item.quantity);
        });
      } else {
        // Simple Product: return directly
        returnedQuantities[item.productId] = (returnedQuantities[item.productId] || 0) + item.quantity;
      }
    });

    // Update local products state
    const updatedProductsList = products.map(prod => {
      const qtyReturned = returnedQuantities[prod.id];
      if (qtyReturned) {
        if (saleToDelete.branch === Branch.FILIAL) {
          return { ...prod, stockFilial: prod.stockFilial + qtyReturned };
        } else {
          return { ...prod, stockMatriz: prod.stockMatriz + qtyReturned };
        }
      }
      return prod;
    });
    setProducts(updatedProductsList);

    // Update local sales state
    setSales(prev => prev.filter(s => s.id !== saleId));

    try {
      await dbSales.delete(saleId);

      // Update products in DB
      for (const prodId of Object.keys(returnedQuantities)) {
        const product = updatedProductsList.find(p => p.id === prodId);
        if (product) {
          await dbProducts.update(product);
        }
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir venda no banco.");
    }
  };

  const handleAddCashClosing = async (newClosing: CashClosing) => {
    setCashClosings(prev => [newClosing, ...prev]);
    try {
      await dbCashClosings.add(newClosing, currentUser!.tenantId);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar fechamento de caixa.");
    }
  };

  const handleDeleteCashClosing = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este fechamento?")) return;
    setCashClosings(prev => prev.filter(c => c.id !== id));
    try {
      await dbCashClosings.delete(id);
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir fechamento.");
    }
  };

  const handleResetData = async () => {
    alert("Para resetar o banco de dados Supabase, utilize o editor SQL no painel do Supabase (Comando TRUNCATE).");
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    if (user.role === 'FACTORY') {
      setCurrentView('PRODUCTION');
    } else if (user.role === 'OPERATOR') {
      setCurrentView('SALES');
    } else {
      setCurrentView('DASHBOARD');
    }
  };

  const handleLogout = async () => {
    await dbUsers.logout();
    setCurrentUser(null);
    setProducts([]);
    setSales([]);
    setFinancials([]);
  };

  const renderContent = () => {
    // Special case for Online Menu (Public)
    if (currentView === 'ONLINE_MENU') {
      return <OnlineMenu onBack={() => setCurrentView('DASHBOARD')} />;
    }

    if (isLoading) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
          <Loader2 size={48} className="animate-spin text-orange-500" />
          <p>Sincronizando dados com a Nuvem...</p>
        </div>
      );
    }

    if (dbError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-2xl mx-auto mt-10">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-red-700 mb-2">Atenção Necessária no Banco de Dados</h3>
          <p className="text-slate-700 mb-6">{dbError}</p>
          <div className="bg-white p-4 rounded border text-left text-xs font-mono overflow-x-auto text-slate-600">
            -- Execute este SQL no Supabase para corrigir o banco de dados:<br />
            -- (Copie o conteúdo do arquivo fix_database_schema.sql)<br />
            <br />
            -- Exemplo de comando rápido para criar a tabela de empresas:<br />
            create table if not exists tenants (id uuid default gen_random_uuid() primary key, name text not null);<br />
            insert into tenants (id, name) select '00000000-0000-0000-0000-000000000000', 'Gelo do Sertão' where not exists (select 1 from tenants where id = '00000000-0000-0000-0000-000000000000');
          </div>
          <div className="flex gap-4 justify-center mt-6">
            <button onClick={() => loadDataFromCloud()} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700">
              Tentar Conectar Novamente
            </button>
            <button onClick={handleLogout} className="bg-slate-200 text-slate-700 px-6 py-2 rounded-lg font-bold hover:bg-slate-300">
              Sair / Logout
            </button>
          </div>
        </div>
      )
    }

    switch (currentView) {
      case 'DASHBOARD':
        return <Dashboard products={products} sales={sales} financials={financials} customers={customers} onNavigate={setCurrentView} />;
      case 'INVENTORY':
        return <Inventory products={products} sales={sales} financials={financials} onUpdateProduct={handleUpdateProduct} onAddProduct={handleAddProduct} onDeleteProduct={handleDeleteProduct} onOpenPricing={(id) => { setPricingProductId(id); setCurrentView('PRICING'); }} onAddFinancialRecord={handleAddFinancialRecord} onBack={() => setCurrentView('DASHBOARD')} currentUser={currentUser!} />;
      case 'SALES':
        return <Sales sales={sales} products={products} customers={customers} onAddSale={handleAddSale} onAddCustomer={handleAddCustomer} currentUser={currentUser} onUpdateSale={handleUpdateSale} onDeleteSale={handleDeleteSale} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'CUSTOMERS':
        return <Customers customers={customers} onAddCustomer={handleAddCustomer} onImportCustomers={handleImportCustomers} currentUser={currentUser} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'PRICING':
        return <Pricing products={products} initialProductId={pricingProductId} onUpdateProduct={handleUpdateProduct} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'FINANCIAL':
        if (currentUser?.role !== 'ADMIN') return <Dashboard products={products} sales={sales} financials={financials} customers={customers} onNavigate={setCurrentView} />;
        return <Financial records={financials} sales={sales} products={products} cashClosings={cashClosings} onAddRecord={handleAddFinancialRecord} onUpdateRecord={handleUpdateFinancialRecord} onDeleteRecord={handleDeleteFinancialRecord} onAddCashClosing={handleAddCashClosing} onDeleteCashClosing={handleDeleteCashClosing} currentUser={currentUser} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'AI_INSIGHTS':
        return <AIAssistant products={products} sales={sales} financials={financials} onBack={() => setCurrentView('DASHBOARD')} />;

      // ... imports

      case 'MENU_CONFIG':
        return <MenuConfig onBack={() => setCurrentView('DASHBOARD')} tenantId={currentUser.tenantId} />;
      case 'PRODUCTION':
        return <Production products={products} currentUser={currentUser} onUpdateProduct={handleUpdateProduct} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'ORDER_CENTER':
        return <OrderCenter onBack={() => setCurrentView('DASHBOARD')} tenantId={currentUser.tenantId} />;
      case 'SETTINGS':
        if (!currentUser) return null;
        return <Settings currentUser={currentUser} onResetData={handleResetData} />;
      default:
        return <Dashboard products={products} sales={sales} financials={financials} customers={customers} />;
    }
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // If viewing Online Menu, bypass login
  if (currentView === 'ONLINE_MENU') {
    return <OnlineMenu onBack={() => setCurrentView('DASHBOARD')} />;
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} onOpenMenu={() => setCurrentView('ONLINE_MENU')} />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-blue-900 z-40 flex items-center px-4 shadow-md">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="text-white p-2 hover:bg-blue-800 rounded-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <span className="ml-4 text-white font-bold text-lg">Gelo do Sertão</span>
      </div>

      <AppSidebar
        currentView={currentView}
        setView={(view) => {
          setCurrentView(view);
          setIsMobileMenuOpen(false); // Close mobile menu on navigate
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileMenuOpen={isMobileMenuOpen}
        closeMobileMenu={() => setIsMobileMenuOpen(false)}
      />

      <main className={`flex-1 transition-all duration-300 pt-20 px-4 pb-4 md:p-4 lg:p-8 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-20 lg:ml-64'}`}>
        <div className="max-w-7xl mx-auto h-full">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;