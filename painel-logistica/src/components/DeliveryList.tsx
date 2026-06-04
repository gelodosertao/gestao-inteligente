import React, { useState } from 'react';
import { Delivery, DepotSettings } from '../types';
import { 
  ArrowUp, 
  ArrowDown, 
  Check, 
  Clock, 
  MapPin, 
  Navigation, 
  Trash2, 
  Edit3, 
  Play, 
  AlertCircle,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DeliveryListProps {
  depot: DepotSettings;
  deliveries: Delivery[];
  routeMetrics: { [key: string]: { distance: string; duration: string } };
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onUpdateStatus: (id: string, status: 'pending' | 'in_transit' | 'delivered') => void;
  onDelete: (id: string) => void;
  onStartEditing: (delivery: Delivery) => void;
}

export default function DeliveryList({
  depot,
  deliveries,
  routeMetrics,
  onMoveUp,
  onMoveDown,
  onUpdateStatus,
  onDelete,
  onStartEditing,
}: DeliveryListProps) {
  // Sort deliveries by sequence
  const sortedDeliveries = [...deliveries].sort((a, b) => a.sequence - b.sequence);

  // Helper to retrieve segment statistics
  const getSegmentStats = (index: number, delivery: Delivery) => {
    if (delivery.lat === null || delivery.lng === null) return null;

    if (index === 0) {
      return routeMetrics['depot-to-stop-1'] || null;
    }

    const prevStop = sortedDeliveries[index - 1];
    if (prevStop.lat === null || prevStop.lng === null) return null;

    return routeMetrics[`stop-${prevStop.id}-to-stop-${delivery.id}`] || null;
  };

  return (
    <div className="space-y-3">
      {/* Starting point (Depot Header) */}
      <div className="bg-rose-500/10 backdrop-blur-md p-3.5 rounded-2xl border border-rose-500/30 shadow-lg flex items-start gap-4">
        <div className="p-2.5 bg-gradient-to-br from-rose-400 to-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/20">
          <Truck size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-rose-350 uppercase tracking-wider block">PONTO DE PARTIDA</span>
              <h4 className="font-bold text-sm text-white leading-snug">{depot.name}</h4>
            </div>
            <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold px-2 py-0.5 rounded-full mt-0.5">
              Fábrica / CD
            </span>
          </div>
          <p className="text-xs text-rose-200/75 mt-1 truncate">{depot.address}</p>
        </div>
      </div>

      {sortedDeliveries.length === 0 ? (
        <div className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-8 text-center text-slate-350 backdrop-blur-sm">
          <AlertCircle className="mx-auto text-slate-500 mb-2" size={32} />
          <p className="text-sm font-medium">Nenhuma entrega agendada para hoje.</p>
          <p className="text-xs text-slate-500 mt-1">Importe de vendas simuladas ou adicione manualmente no botão superior.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {sortedDeliveries.map((delivery, index) => {
              const stats = getSegmentStats(index, delivery);
              const isGeocoded = delivery.lat !== null && delivery.lng !== null;
              
              return (
                <motion.div
                  key={delivery.id}
                  layoutId={delivery.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`border rounded-2xl p-4 shadow-xl backdrop-blur-md transition-all ${
                    delivery.status === 'delivered'
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : delivery.status === 'in_transit'
                      ? 'border-amber-400/25 bg-amber-500/5 '
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  {/* Driving Metrics Connection Thread */}
                  {isGeocoded && stats && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 mb-2.5 bg-slate-950/40 border border-white/5 rounded-xl text-[10.5px] text-slate-300 font-medium">
                      <Clock size={11} className="text-blue-400" />
                      <span>{stats.duration}</span>
                      <span className="text-white/10">|</span>
                      <Navigation size={11} className="text-indigo-400" />
                      <span>{stats.distance}</span>
                      <span className="text-white/10">|</span>
                      <span className="text-slate-400 text-[10px]">
                        {index === 0 ? 'desde Fábrica' : `desde Stop #${index}`}
                      </span>
                    </div>
                  )}

                  {!isGeocoded && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 mb-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10.5px] text-rose-300 font-medium animate-pulse">
                      <AlertCircle size={12} className="text-rose-400" />
                      <span>Não geocodificado no mapa.</span>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    {/* Circle sequence number with statuses */}
                    <div className="mt-0.5 select-none text-white">
                      <span
                        className={`flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold leading-none ${
                          delivery.status === 'delivered'
                            ? 'bg-emerald-500 shadow-md shadow-emerald-500/25'
                            : delivery.status === 'in_transit'
                            ? 'bg-amber-500 shadow-md shadow-amber-500/25'
                            : 'bg-blue-600 shadow-md shadow-blue-500/25'
                        }`}
                      >
                        {delivery.status === 'delivered' ? '✓' : delivery.sequence}
                      </span>
                    </div>

                    {/* Delivery content area */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h5 className={`font-bold text-sm leading-tight text-white ${delivery.status === 'delivered' ? 'line-through text-slate-400' : ''}`}>
                          {delivery.clientName}
                        </h5>
                        
                        {/* Interactive sequences and editing actions */}
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <button
                            onClick={() => onMoveUp(delivery.id)}
                            disabled={index === 0}
                            className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                            title="Mover para cima"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            onClick={() => onMoveDown(delivery.id)}
                            disabled={index === sortedDeliveries.length - 1}
                            className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                            title="Mover para baixo"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            onClick={() => onStartEditing(delivery)}
                            className="p-1 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                            title="Editar pedido"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => onDelete(delivery.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Excluir entrega"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <p className={`text-xs text-slate-350 mt-1 truncate ${delivery.status === 'delivered' ? 'text-slate-500' : ''}`}>
                        <MapPin size={11} className="inline mr-1 align-text-bottom text-slate-400" />
                        {delivery.address}
                      </p>

                      <div className={`mt-2 bg-slate-950/25 p-2 rounded-xl border border-white/5 ${delivery.status === 'delivered' ? 'bg-emerald-500/5 opacity-60' : ''}`}>
                        <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">PRODUTOS</span>
                        <p className={`text-xs font-semibold ${delivery.status === 'delivered' ? 'text-slate-400' : 'text-slate-200'}`}>
                          {delivery.orderDetails}
                        </p>
                      </div>

                      {/* Status toggle selector */}
                      <div className="flex gap-1.5 mt-3">
                        <button
                          onClick={() => onUpdateStatus(delivery.id, 'pending')}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all border ${
                            delivery.status === 'pending'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-400/35 shadow-md shadow-blue-500/10'
                              : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:border-white/10'
                          }`}
                        >
                          Pendente
                        </button>
                        <button
                          onClick={() => onUpdateStatus(delivery.id, 'in_transit')}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all border flex items-center gap-1 ${
                            delivery.status === 'in_transit'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-400/35 shadow-md shadow-amber-500/10'
                              : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:border-white/10'
                          }`}
                        >
                          <Play size={8} className="fill-current" /> A Caminho
                        </button>
                        <button
                          onClick={() => onUpdateStatus(delivery.id, 'delivered')}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all border flex items-center gap-1 ${
                            delivery.status === 'delivered'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35 shadow-md shadow-emerald-500/10'
                              : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:border-white/10'
                          }`}
                        >
                          <Check size={9} strokeWidth={3} /> Entregue
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
