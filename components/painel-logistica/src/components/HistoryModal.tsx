import React, { useState } from 'react';
import { RouteHistoryItem, Delivery, DepotSettings } from '../types';
import { X, Calendar, MapPin, Navigation, Clock, Trash2, RotateCcw, Search, ChevronDown, ChevronUp, CheckCircle, Eye } from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: RouteHistoryItem[];
  onDeleteHistoryItem: (id: string) => void;
  onLoadHistoryItem: (item: RouteHistoryItem) => void;
  onClearHistory: () => void;
}

export default function HistoryModal({
  isOpen,
  onClose,
  history,
  onDeleteHistoryItem,
  onLoadHistoryItem,
  onClearHistory,
}: HistoryModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter routes by date, depot name, or client names inside deliveries
  const filteredHistory = history.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesDate = item.date.toLowerCase().includes(searchLower);
    const matchesDepot = item.depot.name.toLowerCase().includes(searchLower);
    const matchesClients = item.deliveries.some(
      (d) =>
        d.clientName.toLowerCase().includes(searchLower) ||
        d.address.toLowerCase().includes(searchLower)
    );
    return matchesDate || matchesDepot || matchesClients;
  });

  const toggleExpand = (id: string) => {
    setExpandedRouteId(expandedRouteId === id ? null : id);
  };

  return (
    <div className="fixed inset-0 bg-[#090d16]/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in print:hidden">
      <div className="bg-[#131d31]/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-2xl h-[85vh] overflow-hidden border border-white/15 flex flex-col text-white">
        
        {/* Header */}
        <div className="px-6 py-4 bg-white/5 border-b border-white/10 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              📅 Histórico de Rotas Concluídas
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Consulte itinerários finalizados e audite entregas de dias anteriores</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search and Global Actions Bar */}
        <div className="p-4 bg-slate-950/20 border-b border-white/5 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por data, cliente, depósito..."
              className="w-full text-xs pl-9 pr-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-sans"
            />
            <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
          </div>

          {history.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Tem certeza que deseja apagar TODO o histórico de rotas? Esta ação é irreversível.')) {
                  onClearHistory();
                }
              }}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-all border border-rose-500/20 cursor-pointer"
            >
              Apagar Histórico Completo
            </button>
          )}
        </div>

        {/* Routes list */}
        <div className="flex-grow overflow-y-auto p-6 space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Calendar className="mx-auto text-slate-500 mb-3 animate-pulse" size={40} />
              <p className="text-sm font-bold">Nenhuma rota arquivada no histórico!</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Quando concluir todas as entregas do dia, clique no botão "Concluir Rota e Arquivar" no painel principal para salvá-la aqui.
              </p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              Nenhuma rota encontrada para o termo pesquisado.
            </div>
          ) : (
            filteredHistory.map((item) => {
              const isExpanded = expandedRouteId === item.id;
              const completedCount = item.deliveries.filter(d => d.status === 'delivered').length;

              return (
                <div
                  key={item.id}
                  className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-lg hover:border-white/20 transition-all"
                >
                  {/* Route Summary Card Header */}
                  <div 
                    className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between cursor-pointer select-none hover:bg-white/5 transition-all"
                    onClick={() => toggleExpand(item.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-100">{item.date}</span>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                            {completedCount}/{item.stopCount} Entregues
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                          <MapPin size={12} className="text-slate-500" />
                          <span>{item.depot.name}</span>
                        </p>
                      </div>
                    </div>

                    {/* Right side stats and collapsible trigger */}
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-white/5">
                      <div className="flex gap-4 text-xs font-mono">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-slate-400 block uppercase font-sans">Km Total</span>
                          <span className="font-bold text-white">{item.totalDistance}</span>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-slate-400 block uppercase font-sans">Tempo Est.</span>
                          <span className="font-bold text-white">{item.totalDuration}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {/* Quick Action Buttons */}
                        <button
                          onClick={() => {
                            if (window.confirm('Deseja carregar esta rota para o painel de hoje? Isso irá substituir seu planejamento atual.')) {
                              onLoadHistoryItem(item);
                            }
                          }}
                          className="p-1 px-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          title="Restaurar planejamento no mapa"
                        >
                          <RotateCcw size={12} />
                          <span>Carregar</span>
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Apagar esta rota do histórico?')) {
                              onDeleteHistoryItem(item.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 size={13} />
                        </button>
                        <div className="text-slate-400 pl-1">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible details of stops within this route */}
                  {isExpanded && (
                    <div className="border-t border-white/5 bg-slate-950/25 p-4 space-y-2.5 animate-fade-in">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-2">ORDEM DE ENTREGA DIÁRIA</h4>
                      <div className="space-y-2">
                        {item.deliveries.map((delivery, index) => (
                          <div 
                            key={delivery.id} 
                            className="flex items-start justify-between bg-white/5 p-2.5 rounded-xl border border-white/5 text-xs text-slate-200"
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-lg shrink-0 ${
                                delivery.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}>
                                {delivery.sequence}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-white truncate">{delivery.clientName}</p>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{delivery.address}</p>
                                <p className="text-[10px] text-slate-300 mt-1 font-semibold">{delivery.orderDetails}</p>
                              </div>
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              delivery.status === 'delivered' 
                                ? 'bg-emerald-500/20 text-emerald-300' 
                                : delivery.status === 'in_transit'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-500/20 text-slate-400'
                            }`}>
                              {delivery.status === 'delivered' ? 'Entregue' : delivery.status === 'in_transit' ? 'Trânsito' : 'Pendente'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
}
