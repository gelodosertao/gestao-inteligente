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
import { ViewState, User, Product, Sale, FinancialRecord, Branch, Customer } from './types';
import { MOCK_PRODUCTS, MOCK_SALES, MOCK_FINANCIALS } from './constants';
import { dbProducts, dbSales, dbFinancials, dbCustomers } from './services/db';
import { Loader2, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');

  // Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [financials, setFinancials] = useState<FinancialRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // --- INITIAL DATA FETCH ---
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
      const [p, s, f, c] = await Promise.all([
        dbProducts.getAll(),
        dbSales.getAll(),
        dbFinancials.getAll(),
        dbCustomers.getAll()
      ]);

      setProducts(p.length > 0 ? p : []);
      setSales(s);
      setFinancials(f);
      setCustomers(c);

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
    } catch (e) {
      console.error("Failed to update product in DB", e);
      alert("Erro ao salvar alteração no banco de dados.");
    }
  };

  const handleAddProduct = async (newProduct: Product) => {
    setProducts(prev => [...prev, newProduct]);
    try {
      await dbProducts.add(newProduct);
    } catch (e) {
      console.error(e);
      alert("Erro ao criar produto no banco.");
    }
  };

  const handleAddSale = async (newSale: Sale) => {
    setSales(prev => [newSale, ...prev]);

    const updatedProductsList = products.map(prod => {
      const soldItem = newSale.items.find(item => item.productId === prod.id);
      if (soldItem) {
        if (newSale.branch === Branch.FILIAL) {
          return { ...prod, stockFilial: Math.max(0, prod.stockFilial - soldItem.quantity) };
        } else {
          return { ...prod, stockMatriz: Math.max(0, prod.stockMatriz - soldItem.quantity) };
        }
      }
      return prod;
    });
    setProducts(updatedProductsList);

    const newFinancial: FinancialRecord = {
      id: `f-${Date.now()}`,
      date: newSale.date,
      description: `Venda #${newSale.id} - ${newSale.customerName}`,
      amount: newSale.total,
      type: 'Income',
      category: 'Vendas'
    };
    setFinancials(prev => [newFinancial, ...prev]);

    try {
      await dbSales.add(newSale);
      await dbFinancials.addBatch([newFinancial]);

      for (const item of newSale.items) {
        const product = updatedProductsList.find(p => p.id === item.productId);
        if (product) {
          await dbProducts.update(product);
        }
      }
    } catch (e) {
      console.error("Erro ao sincronizar venda com banco:", e);
      alert("A venda foi registrada localmente mas houve erro ao salvar na nuvem.");
    }
  };

  const handleAddFinancialRecord = async (newRecords: FinancialRecord[]) => {
    setFinancials(prev => [...newRecords, ...prev]);
    try {
      await dbFinancials.addBatch(newRecords);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar despesas no banco.");
    }
  };

  const handleAddCustomer = async (newCustomer: Customer) => {
    setCustomers(prev => [...prev, newCustomer]);
    try {
      await dbCustomers.add(newCustomer);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar cliente no banco.");
    }
  };

  const handleImportCustomers = async (newCustomers: Customer[]) => {
    setCustomers(prev => [...prev, ...newCustomers]);
    try {
      await dbCustomers.addBatch(newCustomers);
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
    if (!confirm("Tem certeza que deseja excluir esta venda? O estoque NÃO será revertido automaticamente.")) return;
    setSales(prev => prev.filter(s => s.id !== saleId));
    try {
      await dbSales.delete(saleId);
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir venda no banco.");
    }
  };

  const handleResetData = async () => {
    alert("Para resetar o banco de dados Supabase, utilize o editor SQL no painel do Supabase (Comando TRUNCATE).");
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentView('DASHBOARD');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setProducts([]);
    setSales([]);
    setFinancials([]);
  };

  const renderContent = () => {
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
            -- Execute este SQL no Supabase:<br />
            create table products (id text primary key, name text, category text, price_matriz numeric, price_filial numeric, cost numeric, stock_matriz integer, stock_filial integer, unit text, min_stock integer);<br />
            create table sales (id text primary key, date text, customer_name text, total numeric, branch text, status text, payment_method text, has_invoice boolean, items jsonb);<br />
            create table financials (id text primary key, date text, description text, amount numeric, type text, category text);<br />
            create table customers (id text primary key, name text, cpf_cnpj text, email text, phone text, address text, segment text, city text, state text);
          </div>
          <button onClick={() => loadDataFromCloud()} className="mt-6 bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700">
            Tentar Conectar Novamente
          </button>
        </div>
      )
    }

    switch (currentView) {
      case 'DASHBOARD':
        return <Dashboard products={products} sales={sales} financials={financials} customers={customers} />;
      case 'INVENTORY':
        return <Inventory products={products} onUpdateProduct={handleUpdateProduct} onAddProduct={handleAddProduct} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'SALES':
        return <Sales sales={sales} products={products} customers={customers} onAddSale={handleAddSale} onAddCustomer={handleAddCustomer} currentUser={currentUser} onUpdateSale={handleUpdateSale} onDeleteSale={handleDeleteSale} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'CUSTOMERS':
        return <Customers customers={customers} onAddCustomer={handleAddCustomer} onImportCustomers={handleImportCustomers} currentUser={currentUser} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'PRICING':
        return <Pricing products={products} onUpdateProduct={handleUpdateProduct} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'FINANCIAL':
        if (currentUser?.role !== 'ADMIN') return <Dashboard products={products} sales={sales} financials={financials} customers={customers} />;
        return <Financial records={financials} sales={sales} products={products} onAddRecord={handleAddFinancialRecord} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'AI_INSIGHTS':
        return <AIAssistant products={products} sales={sales} financials={financials} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'SETTINGS':
        if (!currentUser) return null;
        return <Settings currentUser={currentUser} onResetData={handleResetData} />;
      default:
        return <Dashboard products={products} sales={sales} financials={financials} customers={customers} />;
    }
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <AppSidebar
        currentView={currentView}
        setView={setCurrentView}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="flex-1 md:ml-20 lg:ml-64 p-4 lg:p-8 transition-all duration-300 mb-20 md:mb-0">
        <div className="max-w-7xl mx-auto h-full">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;