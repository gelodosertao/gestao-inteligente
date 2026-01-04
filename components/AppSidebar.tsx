import React from 'react';
import { LayoutDashboard, Package, ShoppingCart, DollarSign, Sparkles, Settings, LogOut, Sun, Users, Calculator, ChevronLeft, ChevronRight, Factory } from 'lucide-react';
import { ViewState, User } from '../types';

interface AppSidebarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  currentUser: User;
  onLogout: () => void;
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ currentView, setView, currentUser, onLogout, isCollapsed, toggleSidebar }) => {
  // Define menu structure based on roles
  const allMenuItems = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN'] },
    { id: 'INVENTORY', label: 'Estoque', icon: Package, roles: ['ADMIN', 'OPERATOR'] },
    { id: 'PRODUCTION', label: 'Produção', icon: Factory, roles: ['ADMIN', 'FACTORY'] },
    { id: 'SALES', label: 'Vendas', icon: ShoppingCart, roles: ['ADMIN', 'OPERATOR'] },
    { id: 'CUSTOMERS', label: 'Clientes', icon: Users, roles: ['ADMIN', 'OPERATOR'] },
    { id: 'PRICING', label: 'Custos', icon: Calculator, roles: ['ADMIN'] },
    { id: 'FINANCIAL', label: 'Financeiro', icon: DollarSign, roles: ['ADMIN'] },
    { id: 'AI_INSIGHTS', label: 'IA', icon: Sparkles, roles: ['ADMIN', 'OPERATOR'] },
  ];

  const visibleItems = allMenuItems.filter(item => item.roles.includes(currentUser.role));

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <div className={`hidden md:flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 shadow-xl border-r border-blue-800 bg-blue-900 text-white ${isCollapsed ? 'w-20' : 'w-20 lg:w-64'}`}>
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
            className="hidden lg:flex absolute bottom-2 right-2 text-blue-300 hover:text-white bg-blue-950/50 p-1 rounded-full transition-colors"
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
                className={`w-full flex items-center justify-center lg:justify-start gap-3 p-3 rounded-xl transition-all duration-200 group relative
                  ${isActive
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40'
                    : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                  }
                `}
                title={isCollapsed ? item.label : ''}
              >
                <item.icon size={20} className={`shrink-0 ${isActive ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
                <span className={`hidden font-medium whitespace-nowrap ${!isCollapsed ? 'lg:block' : ''}`}>{item.label}</span>
                {isActive && <div className={`hidden absolute right-3 w-1.5 h-1.5 rounded-full bg-white animate-pulse ${!isCollapsed ? 'lg:block' : ''}`} />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-blue-800 space-y-2 bg-blue-950/30 shrink-0">
          {currentUser.role === 'ADMIN' && (
            <button
              onClick={() => setView('SETTINGS')}
              className={`w-full flex items-center justify-center lg:justify-start gap-3 p-2 rounded-lg transition-colors ${currentView === 'SETTINGS' ? 'bg-blue-800 text-orange-400' : 'text-blue-300 hover:text-white hover:bg-blue-800'}`}
              title={isCollapsed ? "Configurações" : ''}
            >
              <Settings size={20} className="shrink-0" />
              <span className={`hidden text-sm font-medium whitespace-nowrap ${!isCollapsed ? 'lg:block' : ''}`}>Configurações</span>
            </button>
          )}

          <div className={`hidden items-center gap-3 pt-2 ${!isCollapsed ? 'lg:flex' : ''}`}>
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

          <div className={`flex justify-center pt-2 ${!isCollapsed ? 'lg:hidden' : ''}`}>
            <button onClick={onLogout} className="text-blue-300 hover:text-rose-400" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-blue-900 text-white z-50 border-t border-blue-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-safe">
        <div className="flex justify-around items-center p-2">
          {visibleItems.slice(0, 5).map((item) => { // Show max 5 items on mobile to fit
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewState)}
                className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all
                   ${isActive ? 'text-orange-400' : 'text-blue-300'}
                 `}
              >
                <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setView('SETTINGS')}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${currentView === 'SETTINGS' ? 'text-orange-400' : 'text-blue-300'}`}
          >
            <Settings size={24} />
            <span className="text-[10px] mt-1 font-medium">Ajustes</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default AppSidebar;