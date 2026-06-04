import { Delivery } from '../types';
import { IceCream, MapPin, Navigation, Clock, CheckCircle } from 'lucide-react';

interface StatsDashboardProps {
  deliveries: Delivery[];
  routeMetrics: { [key: string]: { distance: string; duration: string } };
  returnToDepot: boolean;
}

export default function StatsDashboard({
  deliveries,
  routeMetrics,
  returnToDepot,
}: StatsDashboardProps) {
  const totalStops = deliveries.length;
  const completed = deliveries.filter((d) => d.status === 'delivered').length;
  const pending = totalStops - completed;

  // Calculate total ice sacs to load
  // Scans for numbers in strings like "10 sacos de Gelo Moído (5kg)"
  let totalBags = 0;
  deliveries.forEach((d) => {
    const matches = d.orderDetails.match(/\d+/g);
    if (matches) {
      // Sum matches to estimate cargo size
      const sum = matches.reduce((acc, val) => acc + parseInt(val), 0);
      // Ensure we don't accidentally count weights like "(5kg)" if there's multiple numbers.
      // A safe heuristic is taking the first number in the string which represents the bags count, or sum if simple
      const firstNumMatch = d.orderDetails.match(/^\s*(\d+)/);
      if (firstNumMatch) {
         totalBags += parseInt(firstNumMatch[1]);
      } else {
         totalBags += parseInt(matches[0]); // fallback to first matched number
      }
    } else {
      totalBags += 5; // default fallback per client
    }
  });

  // Calculate actual route distance & duration from segments
  let totalDistanceMeters = 0;
  let totalDurationMinutes = 0;

  Object.values(routeMetrics).forEach((metric) => {
    const distText = metric.distance.replace(/[^\d.]/g, '');
    const durText = metric.duration.replace(/[^\d.]/g, '');
    
    totalDistanceMeters += parseFloat(distText) || 0;
    totalDurationMinutes += parseFloat(durText) || 0;
  });

  const formattedDistance = totalDistanceMeters > 0 
    ? `${totalDistanceMeters.toFixed(1)} km` 
    : '-- km';

  const formatMinutes = (mins: number) => {
    if (mins === 0) return '--';
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = Math.round(mins % 60);
    return `${hrs}h ${remainingMins}m`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {/* Total Deliveries */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl shadow-lg flex flex-col justify-between transition-all hover:bg-white/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Paradas</span>
          <div className="p-1 px-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
            <MapPin size={14} />
          </div>
        </div>
        <div>
          <span className="text-2xl font-black text-white tracking-tight">{totalStops}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Pontos de entrega</span>
        </div>
      </div>

      {/* Completion */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl shadow-lg flex flex-col justify-between transition-all hover:bg-white/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Progresso</span>
          <div className="p-1 px-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <CheckCircle size={14} />
          </div>
        </div>
        <div>
          <span className="text-2xl font-black text-white tracking-tight">
            {completed}/{totalStops}
          </span>
          <span className="text-[10px] text-emerald-400 font-medium block mt-0.5">
            {totalStops > 0 ? `${Math.round((completed / totalStops) * 100)}% concluído` : 'Sem rotas'}
          </span>
        </div>
      </div>

      {/* total cargo loading */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl shadow-lg flex flex-col justify-between transition-all hover:bg-white/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Carga Máxima</span>
          <div className="p-1 px-1.5 bg-sky-500/10 text-sky-400 rounded-lg">
            <IceCream size={14} />
          </div>
        </div>
        <div>
          <span className="text-2xl font-black text-white tracking-tight">{totalBags}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Sacos de gelo estimados</span>
        </div>
      </div>

      {/* Travelling Distance */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl shadow-lg flex flex-col justify-between transition-all hover:bg-white/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Distância</span>
          <div className="p-1 px-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <Navigation size={14} />
          </div>
        </div>
        <div>
          <span className="text-2xl font-black text-white tracking-tight">{formattedDistance}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {returnToDepot ? 'Inclui retorno' : 'Só ida'}
          </span>
        </div>
      </div>

      {/* Travelling Duration */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-3.5 rounded-2xl shadow-lg flex flex-col justify-between col-span-2 md:col-span-1 transition-all hover:bg-white/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tempo Trânsito</span>
          <div className="p-1 px-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
            <Clock size={14} />
          </div>
        </div>
        <div>
          <span className="text-2xl font-black text-white tracking-tight">{formatMinutes(totalDurationMinutes)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Est. condução real</span>
        </div>
      </div>
    </div>
  );
}
