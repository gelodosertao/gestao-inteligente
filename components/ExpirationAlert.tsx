import React, { useState, useEffect, useMemo } from 'react';
import { Bell, AlertTriangle, X } from 'lucide-react';
import { Product } from '../types';

interface ExpirationAlertProps {
  products: Product[];
}

const ExpirationAlert: React.FC<ExpirationAlertProps> = ({ products }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasPlayedSound, setHasPlayedSound] = useState(false);

  const expiringProducts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts: { product: Product; daysRemaining: number; label: string }[] = [];

    products.forEach(p => {
      if (!p.expirationDate) return;
      
      const [y, m, d] = p.expirationDate.split('-').map(Number);
      const expDate = new Date(y, m - 1, d);
      expDate.setHours(0, 0, 0, 0);

      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Warn if <= 15 days
      if (diffDays <= 15 && diffDays >= 0) {
         alerts.push({
           product: p,
           daysRemaining: diffDays,
           label: diffDays === 0 ? 'Vence Hoje!' : `Vence em ${diffDays} dia(s)`
         });
      } else if (diffDays < 0) {
         alerts.push({
           product: p,
           daysRemaining: diffDays,
           label: `Vencido há ${Math.abs(diffDays)} dia(s)`
         });
      }
    });

    return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [products]);

  // Sound alert logic for specific thresholds
  useEffect(() => {
    if (expiringProducts.length > 0 && !hasPlayedSound) {
      const shouldPlay = expiringProducts.some(a => [15, 7, 1, 0].includes(a.daysRemaining));
      if (shouldPlay) {
         try {
           // A noticeable alert sound
           const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
           audio.play().catch(e => console.log('Audio play ignored', e));
         } catch(e) {}
         setHasPlayedSound(true);
      }
    }
  }, [expiringProducts, hasPlayedSound]);

  if (expiringProducts.length === 0) return null;

  const urgentCount = expiringProducts.filter(p => p.daysRemaining <= 7).length;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white p-2.5 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors relative"
        title="Alertas de Validade"
      >
        <Bell size={20} className={urgentCount > 0 ? "text-red-500 animate-pulse" : "text-orange-500"} />
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
          {expiringProducts.length}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" />
              Alertas de Validade
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          
          <div className="max-h-80 overflow-y-auto p-2">
            <p className="text-xs text-slate-500 px-2 pb-2">
              Promoções sugeridas para evitar perdas:
            </p>
            {expiringProducts.map(alert => (
              <div 
                key={alert.product.id} 
                className={`p-3 mb-2 rounded-lg border flex flex-col gap-1
                  ${alert.daysRemaining < 0 ? 'bg-red-50 border-red-200' : 
                    alert.daysRemaining <= 7 ? 'bg-orange-50 border-orange-200' : 
                    'bg-yellow-50 border-yellow-200'}`
                }
              >
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-slate-800 text-sm">{alert.product.name}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap
                    ${alert.daysRemaining < 0 ? 'bg-red-100 text-red-700' : 
                      alert.daysRemaining <= 7 ? 'bg-orange-100 text-orange-700' : 
                      'bg-yellow-100 text-yellow-800'}`
                  }>
                    {alert.label}
                  </span>
                </div>
                <div className="text-xs text-slate-600 flex gap-4">
                  <span>Estoque Matriz: {(alert.product.stockMatrizBarreiras || 0) + (alert.product.stockMatrizIbotirama || 0)}</span>
                  <span>Filial: {alert.product.stockFilial || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpirationAlert;
