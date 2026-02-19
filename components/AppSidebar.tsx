import React from 'react';
import { LayoutDashboard, Package, ShoppingCart, DollarSign, Sparkles, Settings, LogOut, Sun, Users, Calculator, ChevronLeft, ChevronRight, Factory, Globe, Truck, PieChart } from 'lucide-react';
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
  { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN'] },
  { id: 'INVENTORY', label: 'Estoque', icon: Package, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'PRODUCTION', label: 'Produção', icon: Factory, roles: ['ADMIN', 'FACTORY'] },
  { id: 'SALES', label: 'Vendas', icon: ShoppingCart, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'ORDER_CENTER', label: 'Central de Pedidos', icon: Truck, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'CUSTOMERS', label: 'Clientes', icon: Users, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'PRICING', label: 'Custos', icon: Calculator, roles: ['ADMIN'] },
  { id: 'FINANCIAL', label: 'Financeiro', icon: DollarSign, roles: ['ADMIN'] },
  { id: 'REPORTS', label: 'Relatórios', icon: PieChart, roles: ['ADMIN'] },
  { id: 'MENU_CONFIG', label: 'Site / Cardápio', icon: Globe, roles: ['ADMIN'] },
];

const AppSidebar: React.FC<AppSidebarProps> = ({ currentView, setView, currentUser, onLogout, isCollapsed, toggleSidebar, isMobileMenuOpen, closeMobileMenu, pendingOrdersCount }) => {

  const visibleItems = ALL_MENU_ITEMS.filter(item => {
    // 1. Admin always has full access (unless restricted by some other logic, but usually Admin = Root)
    if (currentUser.role === 'ADMIN') return true;

    // 2. If user has specific allowed modules defined, adhere STRICTLY to them
    if (currentUser.allowedModules && currentUser.allowedModules.length > 0) {
      return currentUser.allowedModules.includes(item.id);
    }

    // 3. Fallback for legacy users (no allowedModules set): use Role-based defaults
    return item.roles.includes(currentUser.role);
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
        bg-blue-900 text-white shadow-xl border-r border-blue-800
        transition-all duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'md:w-20' : 'md:w-64'}
      `}>
        <div className="p-4 flex flex-col items-center justify-center border-b border-blue-800 h-28 relative overflow-hidden shrink-0">
          {/* Logo Image */}
          <div className="relative z-10 flex flex-col items-center select-none">
            <img src="/logo.png" alt="Gelo do Sertão" className="h-16 w-auto object-contain drop-shadow-md" />
          </div>
          <div className="absolute -right-4 -top-4 text-orange-500 opacity-10 rotate-12">
            <Sun size={80} />
          </div>

          {/* Toggle Button (Desktop Only) */}
          <button
            onClick={toggleSidebar}
            className="hidden md:flex absolute bottom-2 right-2 text-blue-300 hover:text-white bg-blue-950/50 p-1 rounded-full transition-colors"
            title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="flex-1 py-6 px-2 lg:px-4 space-y-2 overflow-y-auto overflow-x-hidden">
          {visibleItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewState)}
                className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-all duration-200 group relative
                  ${isActive
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40'
                    : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                  }
                  ${isCollapsed ? 'md:justify-center' : ''}
                `}
                title={isCollapsed ? item.label : ''}
              >
                <item.icon size={20} className={`shrink-0 ${isActive ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
                <span className={`font-medium whitespace-nowrap ${isCollapsed ? 'md:hidden' : 'block'}`}>{item.label}</span>
                {isActive && <div className={`absolute right-3 w-1.5 h-1.5 rounded-full bg-white animate-pulse ${isCollapsed ? 'md:hidden' : 'block'}`} />}

                {/* Pending Badge */}
                {item.id === 'ORDER_CENTER' && (pendingOrdersCount || 0) > 0 && (
                  <div className={`absolute right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-pulse ${isCollapsed ? 'top-1 right-1' : ''}`}>
                    {pendingOrdersCount}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-blue-800 space-y-2 bg-blue-950/30 shrink-0">
          {currentUser.role === 'ADMIN' && (
            <button
              onClick={() => setView('SETTINGS')}
              className={`w-full flex items-center justify-start gap-3 p-2 rounded-lg transition-colors 
                ${currentView === 'SETTINGS' ? 'bg-blue-800 text-orange-400' : 'text-blue-300 hover:text-white hover:bg-blue-800'}
                ${isCollapsed ? 'md:justify-center' : ''}
              `}
              title={isCollapsed ? "Configurações" : ''}
            >
              <Settings size={20} className="shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap ${isCollapsed ? 'md:hidden' : 'block'}`}>Configurações</span>
            </button>
          )}

          <div className={`flex items-center gap-3 pt-2 ${isCollapsed ? 'md:hidden' : ''}`}>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-400 to-orange-600 flex items-center justify-center font-bold text-white shadow-sm border-2 border-blue-800 shrink-0">
              {currentUser.avatarInitials}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold truncate text-white">{currentUser.name}</p>
              <p className="text-[10px] text-blue-300 uppercase tracking-wider">
                {currentUser.role === 'ADMIN' ? 'Sócio Admin' : currentUser.role === 'FACTORY' ? 'Fábrica' : 'Operador'}
              </p>
            </div>
            <button onClick={onLogout} className="text-blue-300 hover:text-rose-400 transition-colors p-1" title="Sair">
              <LogOut size={18} />
            </button>
          </div>

          {/* Collapsed User Icon (Desktop Only) */}
          <div className={`hidden ${isCollapsed ? 'md:flex' : ''} justify-center pt-2`}>
            <button onClick={onLogout} className="text-blue-300 hover:text-rose-400" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AppSidebar;