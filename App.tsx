import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ViewState, User, Product, Sale, FinancialRecord, Branch, Customer, CashClosing } from './types';
import { dbProducts, dbSales, dbFinancials, dbCustomers, dbCashClosings, dbUsers } from './services/db';
import { dbLogistics } from './components/painel-logistica/src/services/dbLogistics';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Menu } from 'lucide-react';
import { usePlatform } from './hooks/usePlatform';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import ExpirationAlert from './components/ExpirationAlert';
import { canLoadDataset, getInitialView, hasModuleAccess } from './security/accessControl';

// Lazy Load Components to prevent circular dependencies and "Cannot access before initialization" errors
const AppSidebar = React.lazy(() => import('./components/AppSidebar'));
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const Inventory = React.lazy(() => import('./components/Inventory'));
const Sales = React.lazy(() => import('./components/Sales'));
const Financial = React.lazy(() => import('./components/Financial'));
const AIAssistant = React.lazy(() => import('./components/AIAssistant'));
const Settings = React.lazy(() => import('./components/Settings'));
const Login = React.lazy(() => import('./components/Login'));
const Customers = React.lazy(() => import('./components/Customers'));
const Pricing = React.lazy(() => import('./components/Pricing'));
const PasswordChange = React.lazy(() => import('./components/PasswordChange'));
const FeatureUnavailable = React.lazy(() => import('./components/PublicMenuUnavailable'));
const Production = React.lazy(() => import('./components/Production'));
const OrderCenter = React.lazy(() => import('./components/OrderCenter'));
const Reports = React.lazy(() => import('./components/Reports'));
const Conciliacao = React.lazy(() => import('./components/Conciliacao'));
const WholesalePOS = React.lazy(() => import('./components/WholesalePOS'));
const VisitorLanding = React.lazy(() => import('./components/VisitorLanding'));
const B2BLanding = React.lazy(() => import('./components/B2BLanding'));
const WhatsAppRedirect = React.lazy(() => import('./components/WhatsAppRedirect'));
const TermsAndPrivacy = React.lazy(() => import('./components/TermsAndPrivacy'));
// CRM Temporarily Disabled
// const CRM = React.lazy(() => import('./components/CRM'));

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const { isNative } = usePlatform();
  const { isActive } = useAppLifecycle();

  // Sync currentView with URL for backward compatibility with sidebar logic
  const currentView = useMemo(() => {
    const path = location.pathname;
    if (path === '/pdv-atacado') return 'ATACADO';
    if (path === '/pdv-adega') return 'SALES';
    if (path === '/cardapio-adega') return 'ONLINE_MENU';
    if (path.startsWith('/gestao/estoque')) return 'INVENTORY';
    if (path.startsWith('/gestao/financeiro') || path.startsWith('/gestao/fechamento-caixa')) return 'FINANCIAL';
    if (path.startsWith('/gestao/clientes')) return 'CUSTOMERS';
    if (path.startsWith('/gestao/producao')) return 'PRODUCTION';
    if (path.startsWith('/gestao/relatorios')) return 'REPORTS';
    if (path.startsWith('/gestao/pedidos')) return 'ORDER_CENTER';
    if (path.startsWith('/gestao/custos')) return 'PRICING';
    if (path.startsWith('/gestao/configuracoes')) return 'SETTINGS';
    if (path.startsWith('/gestao/site')) return 'MENU_CONFIG';
    if (path.startsWith('/gestao/ai')) return 'AI_INSIGHTS';
    if (path.startsWith('/gestao/crm')) return 'CRM';
    if (path.startsWith('/gestao/festas')) return 'FESTAS_RADAR';
    if (path.startsWith('/gestao/logistica')) return 'LOGISTICS';
    if (path.startsWith('/gestao/conciliacao')) return 'CONCILIACAO';
    if (path === '/gestao') return 'DASHBOARD';
    return 'DASHBOARD';
  }, [location.pathname]);

  const setCurrentView = (view: ViewState) => {
    switch (view) {
      case 'ATACADO': navigate('/pdv-atacado'); break;
      case 'SALES': navigate('/pdv-adega'); break;
      case 'ONLINE_MENU': navigate('/cardapio-adega'); break;
      case 'DASHBOARD': navigate('/gestao'); break;
      case 'INVENTORY': navigate('/gestao/estoque'); break;
      case 'FINANCIAL': navigate('/gestao/financeiro'); break;
      case 'CUSTOMERS': navigate('/gestao/clientes'); break;
      case 'PRODUCTION': navigate('/gestao/producao'); break;
      case 'REPORTS': navigate('/gestao/relatorios'); break;
      case 'ORDER_CENTER': navigate('/gestao/pedidos'); break;
      case 'PRICING': navigate('/gestao/custos'); break;
      case 'SETTINGS': navigate('/gestao/configuracoes'); break;
      case 'MENU_CONFIG': navigate('/gestao/site'); break;
      case 'AI_INSIGHTS': navigate('/gestao/ai'); break;
      case 'CRM': navigate('/gestao/crm'); break;
      case 'FESTAS_RADAR': navigate('/gestao/festas'); break;
      case 'LOGISTICS': navigate('/gestao/logistica'); break;
      case 'CONCILIACAO': navigate('/gestao/conciliacao'); break;
      default: navigate('/gestao');
    }
  };

  // Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [financials, setFinancials] = useState<FinancialRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cashClosings, setCashClosings] = useState<CashClosing[]>([]);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const [pricingProductId, setPricingProductId] = useState<string | null>(null);

  // --- AUTH & INITIAL DATA ---
  useEffect(() => {
    const isMenuMode = location.pathname === '/cardapio-adega';
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const securityVersion = 'security-p0-v1';
        if (localStorage.getItem('security_session_version') !== securityVersion) {
          await dbUsers.logout();
          localStorage.setItem('security_session_version', securityVersion);
          return;
        }

        const user = await dbUsers.getCurrentUser();
        if (cancelled || !user) return;
        setCurrentUser(user);

        if (user.mustChangePassword && !isMenuMode) {
          navigate('/alterar-senha', { replace: true });
        } else if (!isMenuMode && (location.pathname === '/' || location.pathname === '/login')) {
          setCurrentView(getInitialView(user));
        }
      } catch (error) {
        console.error('Falha ao restaurar sessão:', error);
        setCurrentUser(null);
      } finally {
        if (!cancelled) setAuthResolved(true);
      }
    };

    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  const tenantId = currentUser?.tenantId || '00000000-0000-0000-0000-000000000000';

  const { data: appData, isFetching: isQueryFetching, error: queryError, refetch } = useQuery({
    queryKey: ['app-data', tenantId],
    queryFn: async () => {
      if (!currentUser) return { p: [], s: [], f: [], c: [], cc: [] };
      const [p, s, f, c, cc] = await Promise.all([
        canLoadDataset(currentUser, 'products') ? dbProducts.getAll(tenantId) : Promise.resolve([]),
        canLoadDataset(currentUser, 'sales') ? dbSales.getAll(tenantId) : Promise.resolve([]),
        canLoadDataset(currentUser, 'financials') ? dbFinancials.getAll(tenantId) : Promise.resolve([]),
        canLoadDataset(currentUser, 'customers') ? dbCustomers.getAll(tenantId) : Promise.resolve([]),
        canLoadDataset(currentUser, 'cashClosings') ? dbCashClosings.getAll(tenantId) : Promise.resolve([]),
      ]);
      return { p, s, f, c, cc };
    },
    enabled: !!currentUser && currentUser.isActive && !currentUser.mustChangePassword && isActive,
    staleTime: 1000 * 60 * 5, // 5 min
    networkMode: 'offlineFirst',
  });

  // Sync with local state for optimistic updates
  useEffect(() => {
    if (appData) {
      setProducts(appData.p.length > 0 ? appData.p : []);
      setSales(appData.s);
      setFinancials(appData.f);
      setCustomers(appData.c);
      setCashClosings(appData.cc);
    }
  }, [appData]);

  // Error handling
  useEffect(() => {
    if (queryError) {
      console.error("Erro no React Query:", queryError);
      setDbError("Sincronização falhou. Operando em modo offline se os dados estiverem em cache.");
    } else {
      setDbError(null);
    }
  }, [queryError]);

  // Handle Loading state (Only show loader if no cache exists)
  useEffect(() => {
    setIsLoading(isQueryFetching && !appData);
  }, [isQueryFetching, appData]);

  useEffect(() => {
    if (currentUser && currentUser.isActive && !currentUser.mustChangePassword && isActive) {
      // Initial Order Count
      checkPendingOrders();
      // Poll every 30s - only when app is active
      const interval = setInterval(checkPendingOrders, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser, isActive]);

  const lastPendingCountRef = React.useRef(0);

  const checkPendingOrders = async () => {
    if (!currentUser) return;
    try {
      const orders = await import('./services/db').then(m => m.dbOrders.getAll(currentUser.tenantId));
      const pending = orders.filter(o => o.status === 'PENDING').length;

      if (pending > lastPendingCountRef.current && pending > 0) {
        try {
          const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
          audio.play().catch(e => console.log('Audio play ignored (user overlap):', e));
        } catch (e) { }
      }

      lastPendingCountRef.current = pending;
      setPendingOrdersCount(pending);
    } catch (e) {
      console.error("Error checking orders", e);
    }
  };

  // --- GLOBAL ACTIONS (Connected to DB) ---

  const pendingSaleOperations = React.useRef(new Map<string, string>());

  const getSaleOperation = (action: 'create' | 'update' | 'cancel', sale: Sale) => {
    const key = `${action}:${sale.id}:${JSON.stringify(action === 'cancel' ? {} : sale)}`;
    const existing = pendingSaleOperations.current.get(key);
    if (existing) return { key, operationId: existing };

    const operationId = crypto.randomUUID();
    pendingSaleOperations.current.set(key, operationId);
    return { key, operationId };
  };

  const refreshSaleData = async () => {
    const refreshed = await refetch();
    if (!refreshed.data) return;

    setProducts(refreshed.data.p);
    setSales(refreshed.data.s);
    setFinancials(refreshed.data.f);
  };

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
    if (currentUser?.role !== 'ADMIN') {
      alert('Apenas administradores podem excluir registros.');
      return;
    }
    setProducts(prev => prev.filter(p => p.id !== productId));
    try {
      await dbProducts.delete(productId);
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir produto no banco.");
    }
  };

  const handleAddSale = async (newSale: Sale) => {
    const operation = getSaleOperation('create', newSale);

    try {
      await dbSales.applyOperation('create', newSale, operation.operationId);
      await refreshSaleData();
      pendingSaleOperations.current.delete(operation.key);
    } catch (error: any) {
      console.error("Erro ao registrar venda:", error);
      await refreshSaleData().catch(refreshError => console.error("Erro ao recarregar vendas:", refreshError));
      alert(`A venda não foi confirmada. Tente novamente: ${error.message || JSON.stringify(error)}`);
      return;
    }

    // Logistics Integration for Wholesale POS Deliveries
    if (newSale.source === 'ATACADO' && newSale.deliveryMethod === 'Delivery') {
      try {
        const customer = customers.find(c => c.name === newSale.customerName);
        let { route, deliveries } = await dbLogistics.getActiveRoute();
        let routeId = route?.id;
        
        if (!routeId) {
          const defaultDepot = {
            name: "Fábrica Matriz",
            address: "Endereço da Fábrica",
            lat: -12.1856,
            lng: -44.9959,
          };
          routeId = await dbLogistics.saveActiveRoute(defaultDepot, []);
        }

        const orderDetails = newSale.items.map(item => `${item.quantity}x ${item.productName}`).join(', ');

        const newStop = {
          id: '',
          clientName: newSale.customerName,
          address: newSale.deliveryAddress || customer?.address || 'Endereço não informado',
          city: newSale.deliveryCity || customer?.city || 'Ibotirama',
          orderDetails: `Pedido #${newSale.id.substring(0, 8)} - ${orderDetails}`,
          lat: null,
          lng: null,
          status: 'pending' as const,
          sequence: (deliveries?.length || 0) + 1
        };

        await dbLogistics.addStop(routeId, newStop);
        console.log("Venda enviada para o painel de logística!");
      } catch (error) {
        console.error("Erro ao enviar venda para logística:", error);
      }
    }
  };

  const handleAddFinancialRecord = async (newRecords: FinancialRecord[]) => {
    setFinancials(prev => [...newRecords, ...prev]);
    try {
      await dbFinancials.addBatch(newRecords, currentUser!.tenantId);
    } catch (e: any) {
      console.error("ERRO COMPLETO:", e);
      alert(`Erro ao salvar despesas no banco: ${e.message || JSON.stringify(e)}`);
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
    if (currentUser?.role !== 'ADMIN') {
      alert('Apenas administradores podem excluir registros.');
      return;
    }
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
    if (currentUser?.role !== 'ADMIN') {
      alert('Apenas administradores podem excluir registros.');
      return;
    }
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
    const operation = getSaleOperation('update', updatedSale);

    try {
      await dbSales.applyOperation('update', updatedSale, operation.operationId);
      await refreshSaleData();
      pendingSaleOperations.current.delete(operation.key);
    } catch (error: any) {
      console.error("Erro ao atualizar venda:", error);
      await refreshSaleData().catch(refreshError => console.error("Erro ao recarregar vendas:", refreshError));
      alert(`A alteração não foi confirmada. Tente novamente: ${error.message || JSON.stringify(error)}`);
    }
  };

  const handleDeleteSale = async (saleId: string) => {
    if (currentUser?.role !== 'ADMIN') {
      alert('Apenas administradores podem excluir registros.');
      return;
    }
    const saleToDelete = sales.find(s => s.id === saleId);
    if (!saleToDelete) return;

    if (!confirm("Tem certeza que deseja excluir esta venda? O estoque será devolvido automaticamente.")) return;

    const operation = getSaleOperation('cancel', saleToDelete);

    try {
      await dbSales.applyOperation('cancel', saleToDelete, operation.operationId);
      await refreshSaleData();
      pendingSaleOperations.current.delete(operation.key);
    } catch (error: any) {
      console.error("Erro ao cancelar venda:", error);
      await refreshSaleData().catch(refreshError => console.error("Erro ao recarregar vendas:", refreshError));
      alert(`O cancelamento não foi confirmado. Tente novamente: ${error.message || JSON.stringify(error)}`);
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
    if (currentUser?.role !== 'ADMIN') {
      alert('Apenas administradores podem excluir registros.');
      return;
    }
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
    if (user.mustChangePassword) {
      navigate('/alterar-senha', { replace: true });
      return;
    }
    setCurrentView(getInitialView(user));
  };

  const handlePasswordChanged = (user: User) => {
    setCurrentUser(user);
    setCurrentView(getInitialView(user));
  };

  const handleLogout = async () => {
    await dbUsers.logout();
    setCurrentUser(null);
    setProducts([]);
    setSales([]);
    setFinancials([]);
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="bg-gai-navy p-10 text-center relative overflow-hidden flex flex-col items-center justify-center text-slate-500 gap-4">
          <Loader2 size={48} className="animate-spin text-orange-500" />
          <p>Sincronizando dados com a Nuvem...</p>
        </div>
      );
    }

    if (dbError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
          {/* Background particles */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-cyan-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>

          <div className="relative bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 md:p-12 max-w-lg w-full text-center shadow-2xl">
            {/* Animated Ice Cube SVG */}
            <div className="relative w-32 h-36 mx-auto mb-6 select-none">
              <svg viewBox="0 0 120 140" className="w-full h-full" fill="none">
                {/* Steam particles */}
                <g className="ice-steam" style={{ transformOrigin: '60px 50px' }}>
                  <circle cx="45" cy="25" r="4" fill="white" opacity="0.2" />
                </g>
                <g className="ice-steam" style={{ transformOrigin: '50px 40px' }}>
                  <circle cx="70" cy="20" r="3" fill="white" opacity="0.15" />
                </g>
                <g className="ice-steam" style={{ transformOrigin: '65px 45px' }}>
                  <circle cx="55" cy="15" r="5" fill="white" opacity="0.1" />
                </g>

                {/* Puddle */}
                <ellipse cx="60" cy="125" rx="35" ry="8" className="ice-puddle" fill="#38bdf8" opacity="0.3" />

                {/* Ice Cube Body */}
                <g className="ice-cube-body" style={{ transformOrigin: '60px 80px' }}>
                  {/* Back face */}
                  <polygon points="30,45 60,30 90,45 60,60" fill="#7dd3fc" opacity="0.3" />
                  {/* Left face */}
                  <polygon points="30,45 30,90 60,105 60,60" fill="#38bdf8" opacity="0.5" />
                  {/* Right face */}
                  <polygon points="60,60 60,105 90,90 90,45" fill="#0ea5e9" opacity="0.6" />
                  {/* Top face */}
                  <polygon points="30,45 60,30 90,45 60,60" fill="#bae6fd" opacity="0.5" />
                  {/* Front face */}
                  <polygon points="30,90 60,105 90,90 60,75" fill="#0284c7" opacity="0.4" />

                  {/* Shine highlights */}
                  <line x1="38" y1="50" x2="50" y2="43" className="ice-cube-shine" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                  <line x1="68" y1="48" x2="78" y2="43" className="ice-cube-shine" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" style={{ animationDelay: '0.5s' }} />
                  <line x1="42" y1="95" x2="52" y2="88" className="ice-cube-shine" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" style={{ animationDelay: '1s' }} />
                </g>

                {/* Water droplets */}
                <g className="ice-droplet" style={{ transformOrigin: '55px 100px' }}>
                  <ellipse cx="55" cy="105" rx="3" ry="4" fill="#38bdf8" opacity="0.8" />
                </g>
                <g className="ice-droplet" style={{ transformOrigin: '65px 100px' }}>
                  <ellipse cx="65" cy="108" rx="2.5" ry="3.5" fill="#7dd3fc" opacity="0.7" />
                </g>
                <g className="ice-droplet" style={{ transformOrigin: '45px 100px' }}>
                  <ellipse cx="45" cy="106" rx="2" ry="3" fill="#38bdf8" opacity="0.6" />
                </g>
              </svg>
            </div>

            <h2 className="text-2xl font-black text-white mb-2">Ops! O gelo derreteu...</h2>
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              A conexão com o servidor falhou. Pode ser apenas uma instabilidade passageira.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-left">
              <p className="text-xs text-slate-400 font-mono leading-relaxed">
                {dbError}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => refetch()}
                className="flex-1 py-3.5 px-6 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white font-bold rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-98 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Atualizar Página
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3.5 px-6 border border-white/10 hover:bg-white/5 text-slate-300 hover:text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sair
              </button>
            </div>

            <p className="text-[10px] text-slate-500 mt-6">
              Se o problema persistir, tente limpar o cache do navegador ou contate o suporte.
            </p>
          </div>
        </div>
      )
    }

    return (
      <Suspense fallback={
        <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
          <Loader2 size={48} className="animate-spin text-orange-500" />
          <p>Carregando módulo...</p>
        </div>
      }>
        {renderContentInternal()}
      </Suspense>
    );
  };

  const renderContentInternal = () => {
    if (!currentUser || !hasModuleAccess(currentUser, currentView)) {
      return (
        <div className="flex flex-col items-center justify-center p-12 mt-10 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Acesso restrito</h2>
          <p className="text-slate-500">Seu perfil não possui permissão para acessar este módulo.</p>
        </div>
      );
    }

    switch (currentView) {
      case 'DASHBOARD':
        if (currentUser?.role !== 'ADMIN' && !(currentUser?.allowedModules || []).includes('DASHBOARD')) {
          return (
            <div className="flex flex-col items-center justify-center p-12 mt-10 bg-white rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Acesso Restrito</h2>
              <p className="text-slate-500">Você não tem permissão para visualizar o Dashboard geral.</p>
            </div>
          );
        }
        return <Dashboard products={products} sales={sales} financials={financials} customers={customers} onNavigate={setCurrentView} />;
      case 'REPORTS':
        return <Reports sales={sales} products={products} customers={customers} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'CONCILIACAO':
        if (currentUser?.role !== 'ADMIN') {
          return <div className="flex flex-col items-center justify-center p-12 mt-10 bg-white rounded-2xl shadow-sm border border-slate-200"><h2 className="text-2xl font-bold text-slate-800 mb-2">Acesso restrito</h2><p className="text-slate-500">A conciliação financeira é exclusiva para administradores.</p></div>;
        }
        return <Conciliacao sales={sales} financials={financials} products={products} onBack={() => setCurrentView('DASHBOARD')} onDataChanged={refreshSaleData} />;
      case 'INVENTORY':
        return <Inventory products={products} sales={sales} financials={financials} onUpdateProduct={handleUpdateProduct} onAddProduct={handleAddProduct} onDeleteProduct={handleDeleteProduct} onOpenPricing={(id) => { setPricingProductId(id); setCurrentView('PRICING'); }} onAddFinancialRecord={handleAddFinancialRecord} onBack={() => setCurrentView('DASHBOARD')} currentUser={currentUser!} />;
      case 'SALES':
        return <Sales sales={sales} products={products} customers={customers} onAddSale={handleAddSale} onAddCustomer={handleAddCustomer} currentUser={currentUser!} onUpdateSale={handleUpdateSale} onDeleteSale={handleDeleteSale} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'CUSTOMERS':
        return <Customers customers={customers} onAddCustomer={handleAddCustomer} onImportCustomers={handleImportCustomers} currentUser={currentUser!} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'PRICING':
        return <Pricing products={products} initialProductId={pricingProductId} onUpdateProduct={handleUpdateProduct} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'FINANCIAL':
        if (currentUser?.role !== 'ADMIN' && !(currentUser?.allowedModules || []).includes('FINANCIAL')) return <Dashboard products={products} sales={sales} financials={financials} customers={customers} onNavigate={setCurrentView} />;
        return <Financial records={financials} sales={sales} products={products} cashClosings={cashClosings} onAddRecord={handleAddFinancialRecord} onUpdateRecord={handleUpdateFinancialRecord} onDeleteRecord={handleDeleteFinancialRecord} onAddCashClosing={handleAddCashClosing} onDeleteCashClosing={handleDeleteCashClosing} currentUser={currentUser!} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'AI_INSIGHTS':
        return <AIAssistant products={products} sales={sales} financials={financials} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'MENU_CONFIG':
        return <FeatureUnavailable featureName="Site / Cardápio" />;
      case 'PRODUCTION':
        return <Production products={products} currentUser={currentUser!} onUpdateProduct={handleUpdateProduct} onAddProduct={handleAddProduct} onBack={() => setCurrentView('DASHBOARD')} />;
      case 'SETTINGS':
        return <Settings currentUser={currentUser!} onResetData={handleResetData} />;
      case 'FESTAS_RADAR':
        return <FeatureUnavailable featureName="Caçador de Festas" />;
      case 'LOGISTICS':
        return <FeatureUnavailable featureName="Painel de Logística" />;
      // CRM removido temporariamente
      default:
        return <Dashboard products={products} sales={sales} financials={financials} customers={customers} onNavigate={setCurrentView} />;
    }
  };

  // Master Render Logic using Routes
  if (!authResolved && location.pathname !== '/cardapio-adega') {
    return <div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-orange-500" /></div>;
  }

  return (
    <Routes>
      {/* Public Route */}
      <Route path="/cardapio-adega" element={
        <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-orange-500" /></div>}>
          <FeatureUnavailable featureName="Cardápio" fullScreen />
        </Suspense>
      } />

      <Route path="/logistica/*" element={
        <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-orange-500" /></div>}>
          <FeatureUnavailable featureName="Painel de Logística" fullScreen />
        </Suspense>
      } />

      {/* Login Route */}
      <Route path="/login" element={
        !currentUser ? (
          <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-blue-900"><Loader2 size={48} className="animate-spin text-white" /></div>}>
            <Login onLogin={handleLogin} />
          </Suspense>
        ) : <Navigate to={currentUser.mustChangePassword ? '/alterar-senha' : '/gestao'} replace />
      } />

      <Route path="/alterar-senha" element={
        currentUser ? (
          <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-orange-500" /></div>}>
            <PasswordChange user={currentUser} onChanged={handlePasswordChanged} onLogout={handleLogout} />
          </Suspense>
        ) : <Navigate to="/login" replace />
      } />

      <Route path="/*" element={
        !currentUser ? <Navigate to="/login" replace /> : currentUser.mustChangePassword ? <Navigate to="/alterar-senha" replace /> : (
          <Routes>
            <Route path="/pdv-atacado" element={
              hasModuleAccess(currentUser, 'ATACADO') ? <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-orange-500" /></div>}>
                <div className="flex w-full min-h-dvh bg-slate-50 text-slate-900 font-sans">
                  <WholesalePOS
                    products={products}
                    sales={sales}
                    customers={customers}
                    currentUser={currentUser}
                    onAddSale={handleAddSale}
                    onAddCustomer={handleAddCustomer}
                    onLogout={handleLogout}
                    onUpdateSale={handleUpdateSale}
                    onDeleteSale={handleDeleteSale}
                    onBack={currentUser.role === 'ADMIN' || currentUser.role === 'WHOLESALE_REPRESENTATIVE' ? () => navigate('/gestao') : undefined}
                  />
                </div>
              </Suspense> : <Navigate to="/gestao" replace />
            } />

            <Route path="/pdv-adega" element={
              hasModuleAccess(currentUser, 'SALES') ? <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-orange-500" /></div>}>
                <div className="flex w-full min-h-dvh bg-slate-50 text-slate-900 font-sans">
                  <Sales
                    sales={sales}
                    products={products}
                    customers={customers}
                    onAddSale={handleAddSale}
                    onAddCustomer={handleAddCustomer}
                    currentUser={currentUser!}
                    onUpdateSale={handleUpdateSale}
                    onDeleteSale={handleDeleteSale}
                    onBack={() => navigate('/gestao')}
                    onLogout={handleLogout}
                    pendingOrdersCount={pendingOrdersCount}
                  />
                </div>
              </Suspense> : <Navigate to="/gestao" replace />
            } />

            <Route path="*" element={
              <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-orange-500" /></div>}>
                <div className="flex w-full min-h-dvh bg-slate-50 text-slate-900 font-sans">
                  <div className="md:hidden fixed top-0 left-0 right-0 pt-safe glass z-40 shadow-xl">
                    <div className="h-16 flex items-center justify-between px-4">
                      <div className="flex items-center">
                        <button
                          onClick={() => setIsMobileMenuOpen(true)}
                          className="text-slate-800 p-2 hover:bg-slate-100 rounded-xl active-scale touch-target"
                        >
                          <Menu size={24} />
                        </button>
                        <span className="ml-3 text-slate-900 font-black text-sm tracking-[0.2em] uppercase">GELO DO SERTÃO</span>
                        {isNative && (
                          <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase">App</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <ExpirationAlert products={products} />
                        <div className="bg-orange-500 w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-lg shadow-orange-500/20">
                          GS
                        </div>
                      </div>
                    </div>
                  </div>

                  <AppSidebar
                    currentView={currentView}
                    setView={setCurrentView}
                    currentUser={currentUser!}
                    onLogout={handleLogout}
                    isCollapsed={isSidebarCollapsed}
                    toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    isMobileMenuOpen={isMobileMenuOpen}
                    closeMobileMenu={() => setIsMobileMenuOpen(false)}
                    pendingOrdersCount={pendingOrdersCount}
                  />

                  <main className={`flex-1 transition-all duration-300 pb-safe ${currentView === 'SALES' ? 'pt-[calc(4rem+env(safe-area-inset-top))] p-0' : 'pt-[calc(5rem+env(safe-area-inset-top))] px-4 pb-4 md:p-4 lg:p-8'} ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-20 lg:ml-64'}`}>
                    <div className="hidden md:block fixed top-4 right-4 z-50 md:top-6 md:right-8">
                      <ExpirationAlert products={products} />
                    </div>
                    <div className={`${currentView === 'SALES' ? 'w-full px-2' : 'max-w-7xl mx-auto'} h-full pb-8 md:pb-4`}>
                      {renderContent()}
                    </div>
                  </main>
                </div>
              </Suspense>
            } />
          </Routes>
        )
      } />

      <Route path="/" element={
        <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-900"><Loader2 size={48} className="animate-spin text-white" /></div>}>
          <VisitorLanding />
        </Suspense>
      } />

      <Route path="/parceiro" element={
        <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-900"><Loader2 size={48} className="animate-spin text-white" /></div>}>
          <B2BLanding />
        </Suspense>
      } />

      <Route path="/wpp" element={
        <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-green-500" /></div>}>
          <WhatsAppRedirect />
        </Suspense>
      } />

      <Route path="/termos" element={
        <Suspense fallback={<div className="h-dvh w-screen flex items-center justify-center bg-slate-50"><Loader2 size={48} className="animate-spin text-orange-500" /></div>}>
          <TermsAndPrivacy />
        </Suspense>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
