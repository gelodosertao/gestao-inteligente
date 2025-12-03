import React, { useState, useEffect } from 'react';
import AppSidebar from './components/AppSidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import Financial from './components/Financial';
import AIAssistant from './components/AIAssistant';
import Settings from './components/Settings';
import Login from './components/Login';
import { ViewState, User, Product, Sale, FinancialRecord, Branch } from './types';
import { MOCK_PRODUCTS, MOCK_SALES, MOCK_FINANCIALS } from './constants';
import { dbProducts, dbSales, dbFinancials } from './services/db';
import { Loader2, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');

  // Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [financials, setFinancials] = useState<FinancialRecord[]>([]);

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
      const [p, s, f] = await Promise.all([
        dbProducts.getAll(),
        dbSales.getAll(),
        dbFinancials.getAll()
      ]);

      setProducts(p.length > 0 ? p : []);
      setSales(s);
      setFinancials(f);

    } catch (error: any) {
      console.error("Erro ao conectar com Supabase:", error);
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        setDbError("Tabelas não encontradas no Supabase. Por favor, execute o script SQL no painel do banco de dados.");
      } else {
        setDbError("Erro de conexão com o banco de dados. Verifique a internet.");
      }
      setProducts(MOCK_PRODUCTS);
      setSales(MOCK_SALES);
      setFinancials(MOCK_FINANCIALS);
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
            create table financials (id text primary key, date text, description text, amount numeric, type text, category text);
          </div>
          <button onClick={() => loadDataFromCloud()} className="mt-6 bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700">
            Tentar Conectar Novamente
          </button>
        </div>
      )
    }

    switch (currentView) {
      case 'DASHBOARD':
        return <Dashboard products={products} sales={sales} financials={financials} />;
      case 'INVENTORY':
        return <Inventory products={products} onUpdateProduct={handleUpdateProduct} onAddProduct={handleAddProduct} />;
      case 'SALES':
        return <Sales sales={sales} products={products} onAddSale={handleAddSale} />;
      case 'FINANCIAL':
        if (currentUser?.role !== 'ADMIN') return <Dashboard products={products} sales={sales} financials={financials} />;
        return <Financial records={financials} onAddRecord={handleAddFinancialRecord} />;
      case 'AI_INSIGHTS':
        return <AIAssistant products={products} sales={sales} financials={financials} />;
      case 'SETTINGS':
        if (!currentUser) return null;
        return <Settings currentUser={currentUser} onResetData={handleResetData} />;
      default:
        return <Dashboard products={products} sales={sales} financials={financials} />;
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

      <main className="flex-1 ml-20 lg:ml-64 p-4 lg:p-8 transition-all duration-300">
        <div className="max-w-7xl mx-auto h-full">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;