import React from 'react';
import { LayoutDashboard, Package, ShoppingCart, DollarSign, Sparkles, Settings, LogOut, Users, Calculator, ChevronLeft, ChevronRight, Factory, Globe, Truck, PieChart, Lock, TrendingUp, Store } from 'lucide-react';
import { ViewState, User } from '../types';

interface AppSidebarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  currentUser: User;
  onLogout: () => void;
  isCollapsed: boolean;
  toggleSidebar: () => void;
  isMobileMenuOpen?: boolean;
  closeMobileMenu?: () => void;
  pendingOrdersCount?: number;
}

// Define menu structure based on roles (exported for use in Settings)
export const ALL_MENU_ITEMS = [
  { id: 'ORDER_CENTER', label: 'Central de Pedidos', icon: Truck, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'CUSTOMERS', label: 'Clientes', icon: Users, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'CRM', label: 'CRM / Marketing', icon: TrendingUp, roles: ['ADMIN'] },
  { id: 'PRICING', label: 'Custos', icon: Calculator, roles: ['ADMIN'] },
  { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN'] },
  { id: 'INVENTORY', label: 'Estoque', icon: Package, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'CASH_CLOSING', label: 'Fechar Caixa', icon: Lock, roles: ['OPERATOR'] },
  { id: 'FINANCIAL', label: 'Financeiro', icon: DollarSign, roles: ['ADMIN'] },
  { id: 'SALES', label: 'PDV Adega', icon: Store, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'WHOLESALE_POS', label: 'PDV Atacado', icon: ShoppingCart, roles: ['ADMIN', 'WHOLESALE_REPRESENTATIVE'] },
  { id: 'PRODUCTION', label: 'Produção', icon: Factory, roles: ['ADMIN', 'FACTORY'] },
  { id: 'REPORTS', label: 'Relatórios', icon: PieChart, roles: ['ADMIN'] },
  { id: 'MENU_CONFIG', label: 'Site / Cardápio', icon: Globe, roles: ['ADMIN'] },
];

const AppSidebar: React.FC<AppSidebarProps> = ({ currentView, setView, currentUser, onLogout, isCollapsed, toggleSidebar, isMobileMenuOpen, closeMobileMenu, pendingOrdersCount }) => {

  const visibleItems = ALL_MENU_ITEMS.filter(item => {
    // 1. Admin always has full access
    if (currentUser.role === 'ADMIN') return true;

    // 2. Role-based defaults
    const isRoleDefault = item.roles.includes(currentUser.role);

    // 3. Specifically allowed modules (explicit override or addition)
    const isSpecificallyAllowed = (currentUser.allowedModules || []).includes(item.id);

    return isRoleDefault || isSpecificallyAllowed;
  });

  return (
    <>
      {/* MOBILE BACKDROP */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeMobileMenu}
        />
      )}

      {/* SIDEBAR (Desktop & Mobile Drawer) */}
      <div className={`
        fixed left-0 top-0 z-50 h-screen flex flex-col 
        bg-gai-navy text-white shadow-2xl border-r border-white/5
        transition-all duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'md:w-20' : 'md:w-64'}
      `}>
        <div className="flex flex-col items-center justify-center relative shrink-0 transition-all duration-300">
          <div className={`w-full bg-white flex flex-col items-center border-b border-slate-200 transition-all duration-500 ${isCollapsed ? 'p-1.5 h-20' : 'p-6 h-48'}`}>
            {/* Logo Container - Persists on Collapse */}
            <div className={`relative z-10 w-full h-full flex items-center justify-center select-none duration-500`}>
              <img
                src="/logo_gai.png"
                alt="G.AI"
                className={`object-contain transition-all duration-500 drop-shadow-sm ${isCollapsed ? 'max-h-[66px] max-w-[90%] w-auto' : 'max-h-32 w-auto'}`}
              />
            </div>
          </div>

          {/* Company Name Section */}
          {!isCollapsed && currentUser?.tenantName && (
            <div className="w-full bg-gai-navy pt-4 pb-2 text-center animate-in slide-in-from-top-2 duration-700">
              <p className="text-[10px] font-black text-gai-cyan tracking-[0.3em] uppercase opacity-90 leading-none">
                {currentUser.tenantName}
              </p>
            </div>
          )}

          {/* Sparkles Clipped Separately */}
          <div className="absolute -right-6 -top-6 text-gai-tech opacity-5 rotate-12 pointer-events-none overflow-hidden h-40 w-40">
            <Sparkles size={100} />
          </div>

          {/* Toggle Button - NOW FULLY VISIBLE */}
          <button
            onClick={toggleSidebar}
            className={`hidden md:flex absolute z-50 top-1/2 -right-4 -translate-y-1/2 
              w-8 h-8 rounded-full bg-gai-navy text-white shadow-xl
              items-center justify-center hover:bg-gai-tech transition-all duration-300
              border border-white/20
            `}
            title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto overflow-x-hidden scrollbar-hide">
          {visibleItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewState)}
                className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-all duration-300 group relative
                  ${isActive
                    ? 'bg-gai-tech text-white shadow-lg shadow-gai-tech/20'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }
                  ${isCollapsed ? 'md:justify-center' : ''}
                `}
                title={isCollapsed ? item.label : ''}
              >
                <item.icon size={20} className={`shrink-0 transition-transform duration-300 ${isActive ? 'text-white scale-110' : 'group-hover:scale-110'}`} />
                <span className={`font-semibold text-sm whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'md:opacity-0 md:w-0' : 'opacity-100'}`}>{item.label}</span>
                {isActive && <div className={`absolute right-3 w-1 h-4 rounded-full bg-white/30 ${isCollapsed ? 'md:hidden' : 'block'}`} />}

                {/* Pending Badge */}
                {item.id === 'ORDER_CENTER' && (pendingOrdersCount || 0) > 0 && (
                  <div className={`absolute right-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-white/20 animate-pulse ${isCollapsed ? 'top-1 right-1' : ''}`}>
                    {pendingOrdersCount}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 space-y-3 bg-black/10 shrink-0">
          {currentUser.role === 'ADMIN' && (
            <button
              onClick={() => setView('SETTINGS')}
              className={`w-full flex items-center justify-start gap-3 p-2.5 rounded-xl transition-all 
                ${currentView === 'SETTINGS' ? 'bg-white/10 text-gai-tech' : 'text-slate-400 hover:text-white hover:bg-white/5'}
                ${isCollapsed ? 'md:justify-center' : ''}
              `}
              title={isCollapsed ? "Configurações" : ''}
            >
              <Settings size={20} className="shrink-0" />
              <span className={`text-sm font-semibold whitespace-nowrap ${isCollapsed ? 'md:hidden' : 'block'}`}>Ajustes G.AI</span>
            </button>
          )}

          <div className={`flex items-center gap-3 pt-1 ${isCollapsed ? 'md:hidden' : ''}`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gai-tech to-gai-navy flex items-center justify-center font-bold text-white shadow-lg border border-white/10 shrink-0">
              {currentUser.avatarInitials}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold truncate text-white leading-tight">{currentUser.name}</p>
              <p className="text-[10px] text-gai-cyan font-black uppercase tracking-widest opacity-70">
                {currentUser.role}
              </p>
            </div>
            <button onClick={onLogout} className="text-slate-500 hover:text-rose-400 transition-colors p-1" title="Sair">
              <LogOut size={18} />
            </button>
          </div>

          {/* Collapsed User Icon (Desktop Only) */}
          <div className={`hidden ${isCollapsed ? 'md:flex' : ''} justify-center pt-1`}>
            <button onClick={onLogout} className="text-slate-500 hover:text-rose-400" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AppSidebar;