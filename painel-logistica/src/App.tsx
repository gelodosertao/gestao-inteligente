import { useState, useEffect, useCallback, useRef } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { Delivery, DepotSettings, RouteHistoryItem } from './types';
import { defaultDepot, sampleDeliveries } from './utils/sampleData';
import { dbLogistics, isSupabaseConfigured } from './services/dbLogistics';
import { optimizeRouteSequence, generateGoogleMapsNavigationUrl } from './utils/routeOptimizer';
import IceRouteMap from './components/IceRouteMap';
import StatsDashboard from './components/StatsDashboard';
import DeliveryList from './components/DeliveryList';
import AddEditDeliveryModal from './components/AddEditDeliveryModal';
import DepotSettingsModal from './components/DepotSettingsModal';
import HistoryModal from './components/HistoryModal';
import { 
  Plus, 
  Sparkles, 
  RotateCcw, 
  Printer, 
  Share2, 
  Trash2, 
  Settings, 
  Truck, 
  ClipboardCheck, 
  MapPin, 
  FileText,
  Clock,
  Navigation,
  Info,
  Calendar,
  Archive
} from 'lucide-react';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export default function App() {
  // 1. Core Logistics States
  const [depot, setDepot] = useState<DepotSettings>(() => {
    const saved = localStorage.getItem('iceroute_depot');
    return saved ? JSON.parse(saved) : defaultDepot;
  });

  const [deliveries, setDeliveries] = useState<Delivery[]>(() => {
    const saved = localStorage.getItem('iceroute_deliveries');
    return saved ? JSON.parse(saved) : [];
  });

  const [returnToDepot, setReturnToDepot] = useState<boolean>(true);
  
  // Real driving travel metrics reported by Google Maps segments in real-time
  const [routeMetrics, setRouteMetrics] = useState<{ [key: string]: { distance: string; duration: string } }>({});

  const [routeHistory, setRouteHistory] = useState<RouteHistoryItem[]>(() => {
    const saved = localStorage.getItem('iceroute_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Supabase integration state
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const useDb = isSupabaseConfigured();
  const isSyncing = useRef(false);

  // 2. Control & Modal States
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [isDepotOpen, setIsDepotOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ============================================================
  // SUPABASE: Carregar dados do banco na montagem
  // ============================================================
  useEffect(() => {
    if (!useDb) {
      setIsLoadingDb(false);
      return;
    }

    const loadFromSupabase = async () => {
      try {
        // Carregar rota ativa
        const { route, depot: dbDepot, deliveries: dbDeliveries } = await dbLogistics.getActiveRoute();
        
        if (route && dbDepot) {
          setActiveRouteId(route.id);
          setDepot(dbDepot);
          setDeliveries(dbDeliveries);
          localStorage.setItem('iceroute_depot', JSON.stringify(dbDepot));
          localStorage.setItem('iceroute_deliveries', JSON.stringify(dbDeliveries));
        }

        // Carregar histórico
        const history = await dbLogistics.getArchivedRoutes();
        if (history.length > 0) {
          setRouteHistory(history);
          localStorage.setItem('iceroute_history', JSON.stringify(history));
        }
      } catch (err) {
        console.error('[IceRoute] Erro ao carregar do Supabase:', err);
      } finally {
        setIsLoadingDb(false);
      }
    };

    loadFromSupabase();
  }, [useDb]);

  // ============================================================
  // SYNC: Salvar automaticamente no Supabase quando deliveries/depot mudam
  // ============================================================
  const syncToSupabase = useCallback(async (currentDepot: DepotSettings, currentDeliveries: Delivery[]) => {
    if (!useDb || isSyncing.current || isLoadingDb) return;
    isSyncing.current = true;
    try {
      const routeId = await dbLogistics.saveActiveRoute(currentDepot, currentDeliveries, activeRouteId || undefined);
      if (!activeRouteId) setActiveRouteId(routeId);
    } catch (err) {
      console.error('[IceRoute] Erro ao sincronizar com Supabase:', err);
    } finally {
      isSyncing.current = false;
    }
  }, [useDb, activeRouteId, isLoadingDb]);

  // Synchronize collections with localStorage (mantém como cache rápido)
  useEffect(() => {
    localStorage.setItem('iceroute_depot', JSON.stringify(depot));
  }, [depot]);

  useEffect(() => {
    localStorage.setItem('iceroute_deliveries', JSON.stringify(deliveries));
  }, [deliveries]);

  useEffect(() => {
    localStorage.setItem('iceroute_history', JSON.stringify(routeHistory));
  }, [routeHistory]);

  // Toast message layout timeout timer
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Show a notification toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  // 3. Operational Logistics Heuristics
  const handleAddOrEditDelivery = async (data: Omit<Delivery, 'sequence' | 'status'> & { id?: string }) => {
    if (data.id) {
      // Editing
      const updatedDeliveries = deliveries.map((d) =>
        d.id === data.id
          ? {
              ...d,
              clientName: data.clientName,
              address: data.address,
              city: data.city,
              orderDetails: data.orderDetails,
              lat: data.lat,
              lng: data.lng,
            }
          : d
      );
      setDeliveries(updatedDeliveries);
      showToast(`Entrega para "${data.clientName}" atualizada.`);

      // Sync com Supabase
      if (useDb) {
        try {
          await dbLogistics.updateStop(data.id, {
            clientName: data.clientName,
            address: data.address,
            city: data.city,
            orderDetails: data.orderDetails,
            lat: data.lat,
            lng: data.lng,
          });
        } catch (err) {
          console.error('[IceRoute] Erro ao atualizar parada no DB:', err);
        }
      }
    } else {
      // Adding new
      const newDelivery: Delivery = {
        id: Date.now().toString(),
        clientName: data.clientName,
        address: data.address,
        city: data.city,
        orderDetails: data.orderDetails,
        lat: data.lat,
        lng: data.lng,
        status: 'pending',
        sequence: deliveries.length + 1,
      };
      setDeliveries((prev) => [...prev, newDelivery]);
      showToast(`Entrega para "${data.clientName}" inserida no planejamento!`);

      // Sync com Supabase
      if (useDb && activeRouteId) {
        try {
          const dbId = await dbLogistics.addStop(activeRouteId, newDelivery);
          // Atualizar o ID local com o UUID gerado pelo banco
          setDeliveries((prev) =>
            prev.map((d) => (d.id === newDelivery.id ? { ...d, id: dbId } : d))
          );
        } catch (err) {
          console.error('[IceRoute] Erro ao adicionar parada no DB:', err);
        }
      } else if (useDb && !activeRouteId) {
        // Criar rota ativa e adicionar parada
        try {
          const newDeliveries = [...deliveries, newDelivery];
          const routeId = await dbLogistics.saveActiveRoute(depot, newDeliveries);
          setActiveRouteId(routeId);
        } catch (err) {
          console.error('[IceRoute] Erro ao criar rota no DB:', err);
        }
      }
    }
    setEditingDelivery(null);
  };

  const handleStartEditing = (delivery: Delivery) => {
    setEditingDelivery(delivery);
    setIsAddEditOpen(true);
  };

  const handleDeleteDelivery = async (id: string) => {
    const name = deliveries.find((d) => d.id === id)?.clientName || '';
    setDeliveries((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      // Re-normalize sequence numbers after removal
      return filtered.map((d, idx) => ({ ...d, sequence: idx + 1 }));
    });
    showToast(`Entrega de "${name}" removida.`);

    // Sync com Supabase
    if (useDb && activeRouteId) {
      try {
        await dbLogistics.deleteStop(id, activeRouteId);
      } catch (err) {
        console.error('[IceRoute] Erro ao deletar parada do DB:', err);
      }
    }
  };

  const handleUpdateStatus = async (id: string, status: 'pending' | 'in_transit' | 'delivered') => {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d))
    );

    // Sync com Supabase
    if (useDb) {
      try {
        await dbLogistics.updateStopStatus(id, status);
      } catch (err) {
        console.error('[IceRoute] Erro ao atualizar status no DB:', err);
      }
    }
  };

  // Move stops up or down manually
  const handleMoveUp = async (id: string) => {
    const index = deliveries.findIndex((d) => d.id === id);
    if (index <= 0) return;

    const newList = [...deliveries];
    // swap positions
    const temp = newList[index];
    newList[index] = newList[index - 1];
    newList[index - 1] = temp;

    // renumber sequence
    const updated = newList.map((item, idx) => ({
      ...item,
      sequence: idx + 1,
    }));
    setDeliveries(updated);

    // Sync reorder com Supabase
    if (useDb) {
      try { await dbLogistics.reorderStops(updated); } catch (err) { console.error('[IceRoute] Erro ao reordenar no DB:', err); }
    }
  };

  const handleMoveDown = async (id: string) => {
    const index = deliveries.findIndex((d) => d.id === id);
    if (index < 0 || index >= deliveries.length - 1) return;

    const newList = [...deliveries];
    // swap positions
    const temp = newList[index];
    newList[index] = newList[index + 1];
    newList[index + 1] = temp;

    // renumber sequence
    const updated = newList.map((item, idx) => ({
      ...item,
      sequence: idx + 1,
    }));
    setDeliveries(updated);

    // Sync reorder com Supabase
    if (useDb) {
      try { await dbLogistics.reorderStops(updated); } catch (err) { console.error('[IceRoute] Erro ao reordenar no DB:', err); }
    }
  };

  // Otimizar Rota (TSP local heuristic on Lat/Lng distances, starting from Depot)
  const handleOptimizeRoute = async () => {
    if (deliveries.length <= 1) {
      showToast('Adicione pelo menos 2 entregas para realizar o cálculo de otimização de caminhos!');
      return;
    }
    const optimized = optimizeRouteSequence(depot, deliveries);
    setDeliveries(optimized);
    showToast('✨ Rota otimizada pelo menor trajeto linear (Problema do Caixeiro Viajante) com sucesso!');

    // Sync reorder com Supabase
    if (useDb) {
      try { await dbLogistics.reorderStops(optimized); } catch (err) { console.error('[IceRoute] Erro ao sincronizar otimização no DB:', err); }
    }
  };

  // Simular Importação de Vendas (Reset setup triggers)
  const handleResetToPresets = async () => {
    setDeliveries(sampleDeliveries);
    setDepot(defaultDepot);
    setRouteMetrics({});
    showToast('Banco de vendas diárias simulado em São Paulo! Rota carregada.');

    // Sync com Supabase — gravar dados simulados como nova rota ativa
    if (useDb) {
      try {
        const routeId = await dbLogistics.saveActiveRoute(defaultDepot, sampleDeliveries, activeRouteId || undefined);
        setActiveRouteId(routeId);
      } catch (err) { console.error('[IceRoute] Erro ao sincronizar preset no DB:', err); }
    }
  };

  const handleClearRoute = async () => {
    setDeliveries([]);
    setRouteMetrics({});
    showToast('Tabela de itinerário limpa. Adicione novos pontos de carga de gelo.');

    // No Supabase, deletar a rota ativa e limpar referência
    if (useDb && activeRouteId) {
      try {
        await dbLogistics.deleteRoute(activeRouteId);
        setActiveRouteId(null);
      } catch (err) { console.error('[IceRoute] Erro ao limpar rota no DB:', err); }
    }
  };

  // Archive current active workload route to local history log
  const handleArchiveCurrentRoute = async () => {
    if (deliveries.length === 0) {
      showToast('⚠️ Não há nenhuma parada no itinerário para ser arquivada!');
      return;
    }

    const confirmArchive = window.confirm(
      `Deseja finalizar a rota de hoje com ${deliveries.length} paradas e registrá-la no histórico?`
    );

    if (!confirmArchive) return;

    // Sum estimated bags
    let totalBags = 0;
    deliveries.forEach((d) => {
      const matches = d.orderDetails.match(/\d+/g);
      if (matches) {
        const firstNumMatch = d.orderDetails.match(/^\s*(\d+)/);
        if (firstNumMatch) {
          totalBags += parseInt(firstNumMatch[1]);
        } else {
          totalBags += parseInt(matches[0]);
        }
      } else {
        totalBags += 5;
      }
    });

    let totalDistanceMeters = 0;
    let totalDurationMinutes = 0;
    (Object.values(routeMetrics) as { distance: string; duration: string }[]).forEach((metric) => {
      const distText = metric.distance.replace(/[^\d.]/g, '');
      const durText = metric.duration.replace(/[^\d.]/g, '');
      totalDistanceMeters += parseFloat(distText) || 0;
      totalDurationMinutes += parseFloat(durText) || 0;
    });

    const formattedDistance = totalDistanceMeters > 0 ? `${totalDistanceMeters.toFixed(1)} km` : '-- km';
    const formatMins = (mins: number) => {
       if (mins === 0) return '--';
       if (mins < 60) return `${mins} min`;
       const hrs = Math.floor(mins / 60);
       const rMins = Math.round(mins % 60);
       return `${hrs}h ${rMins}m`;
    };
    const formattedDuration = formatMins(totalDurationMinutes);

    const now = new Date();
    const dateOptions: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    const formattedDate = now.toLocaleDateString('pt-BR', dateOptions);

    const historyItem: RouteHistoryItem = {
      id: activeRouteId || Date.now().toString(),
      date: formattedDate,
      depot: { ...depot },
      deliveries: JSON.parse(JSON.stringify(deliveries)),
      totalDistance: formattedDistance,
      totalDuration: formattedDuration,
      stopCount: deliveries.length,
    };

    setRouteHistory((prev) => [historyItem, ...prev]);
    showToast('✨ Rota arquivada com sucesso! Você pode consultá-la na engrenagem de histórico.');

    // Sync com Supabase — arquivar a rota ativa
    if (useDb && activeRouteId) {
      try {
        await dbLogistics.archiveRoute(
          activeRouteId,
          formattedDate,
          formattedDistance,
          formattedDuration,
          deliveries.length
        );
      } catch (err) {
        console.error('[IceRoute] Erro ao arquivar no DB:', err);
      }
    }

    if (window.confirm('Deseja limpar todo o painel de rotas atual para planejar as entregas de um novo dia?')) {
      // Limpar local — não deletar do DB pois já foi arquivada
      setDeliveries([]);
      setRouteMetrics({});
      setActiveRouteId(null);
    }
  };

  const handleLoadHistoryItem = async (item: RouteHistoryItem) => {
    setDepot(item.depot);
    setDeliveries(item.deliveries);
    setRouteMetrics({});
    setIsHistoryOpen(false);
    showToast(`📅 Rota de "${item.date}" restaurada no painel principal!`);

    // Ao restaurar rota do histórico, criar nova rota ativa no Supabase
    if (useDb) {
      try {
        const routeId = await dbLogistics.saveActiveRoute(item.depot, item.deliveries);
        setActiveRouteId(routeId);
      } catch (err) { console.error('[IceRoute] Erro ao restaurar rota no DB:', err); }
    }
  };

  const handleDeleteHistoryItem = async (id: string) => {
    setRouteHistory((prev) => prev.filter((item) => item.id !== id));
    showToast('Manifesto removido do histórico local.');

    // Sync com Supabase
    if (useDb) {
      try { await dbLogistics.deleteRoute(id); } catch (err) { console.error('[IceRoute] Erro ao deletar do histórico no DB:', err); }
    }
  };

  const handleClearHistory = async () => {
    setRouteHistory([]);
    showToast('Todo o histórico de rotas foi limpo.');

    // Sync com Supabase
    if (useDb) {
      try { await dbLogistics.clearHistory(); } catch (err) { console.error('[IceRoute] Erro ao limpar histórico no DB:', err); }
    }
  };

  // Share message trigger to clipboard
  const handleShareRoute = () => {
    const activeStops = [...deliveries]
      .filter((d) => d.status !== 'delivered')
      .sort((a, b) => a.sequence - b.sequence);

    if (activeStops.length === 0) {
      showToast('Não há entregas pendentes para compartilhar!');
      return;
    }

    const navUrl = generateGoogleMapsNavigationUrl(depot, deliveries);

    let msg = `🚚 *ITINERÁRIO DE ENTREGAS DE GELO*\n`;
    msg += `🏢 *Distribuidor:* ${depot.name}\n`;
    msg += `📍 *Origem de Carga:* ${depot.address}\n`;
    msg += `-------------------------------------------\n\n`;
    msg += `🏁 *Ordem de Deslocamento (${activeStops.length} Clientes Pendentes):*\n`;
    
    activeStops.forEach((stop, idx) => {
      msg += `📍 *${idx + 1}ª Parada:* ${stop.clientName}\n`;
      msg += `   🏠 Endereço: ${stop.address}\n`;
      msg += `   🧊 Pedido: ${stop.orderDetails}\n\n`;
    });

    msg += `-------------------------------------------\n`;
    msg += `🗺️ *Navegador GPS Multi-Stops (Google Maps):*\n${navUrl}\n\n`;
    msg += `⚡ _Gerado em tempo real pelo painel IceRoute - Logística Integrada_`;

    navigator.clipboard.writeText(msg).then(() => {
      showToast('📋 Roteiro formatado copiado! Envie no WhatsApp ou chat de sua preferência.');
    }).catch(() => {
      showToast('Não foi possível copiar o roteiro automaticamente.');
    });
  };

  const handlePrintManifest = () => {
    window.print();
  };

  // Splash screen if API key is not yet set
  if (!hasValidKey) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 font-sans p-6 text-slate-700">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-lg p-8 text-center scroll-my-3">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5 text-2xl font-bold border border-blue-200">
            🧊
          </div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Chave da API do Google Maps Necessária</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Para planejar e otimizar as rotas diárias de entrega de gelo, precisamos de uma chave do Google Maps válida.
          </p>

          <div className="mt-6 bg-slate-50 p-4.5 rounded-xl border border-slate-150 text-left text-xs space-y-3.5">
            <div>
              <span className="font-bold text-slate-800">Passo 1:</span> Obtenha uma chave gratuita da API no Console da Google Cloud:
              <a 
                href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-blue-600 font-semibold hover:underline mt-1"
              >
                Criar conta no Google Maps Platform →
              </a>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <span className="font-bold text-slate-800">Passo 2:</span> Cole-a como uma variáviel secreta no AI Studio:
              <ul className="list-disc list-inside mt-1.5 space-y-1 text-slate-500 font-medium">
                <li>Abra as <strong className="text-slate-800">Settings</strong> (ícone de engrenagem no canto superior direito)</li>
                <li>Clique na guia <strong className="text-slate-800">Secrets</strong></li>
                <li>Crie uma chave chamada <code className="bg-slate-200 text-slate-800 px-1 py-0.5 rounded text-[10px]">GOOGLE_MAPS_PLATFORM_KEY</code></li>
                <li>Cole seu token e confirme com Enter</li>
              </ul>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 mt-5 italic">
            O aplicativo recopilará e atualizará as rotas automaticamente assim que a variável secreta for gravada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <div className="bg-[#0f172a] min-h-screen text-slate-100 flex flex-col font-sans print:bg-white print:text-black relative overflow-hidden">
        
        {/* Background Mesh Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0 print:hidden">
          <div className="absolute top-[-100px] left-[-100px] w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-100px] right-[-100px] w-[700px] h-[700px] bg-indigo-600/15 rounded-full blur-[150px]"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px] rotate-45"></div>
        </div>

        {/* Navigation / Header */}
        <header className="border-b border-white/10 backdrop-blur-xl bg-slate-900/40 px-6 py-4 flex flex-col sm:flex-row gap-4 justify-between items-center print:hidden z-20 relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-black text-lg">
              🧊
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2 leading-none">
                IceRoute <span className="text-blue-400 font-medium">Logística</span>
                <span className="text-[10px] tracking-widest px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-full uppercase font-bold">Microservice</span>
              </h1>
              <p className="text-[10.5px] text-slate-400 mt-1">Otimização e Gerenciamento Logístico Diário de Gelo</p>
            </div>
          </div>

          {/* Core Controls */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleResetToPresets}
              className="px-3.5 py-1.5 text-xs font-bold border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors backdrop-blur-md"
              title="Carrega dados simulados de teste"
            >
              <RotateCcw size={13} />
              Simular Vendas
            </button>
            <button
              onClick={handlePrintManifest}
              className="px-3.5 py-1.5 text-xs font-bold border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors backdrop-blur-md"
            >
              <Printer size={13} />
              Imprimir Itinerário
            </button>
            <button
              onClick={handleShareRoute}
              className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-[1.02] active:scale-98"
            >
              <Share2 size={13} />
              Enviar Itinerário (Driver)
            </button>
          </div>
        </header>

        {/* Master Body Layout */}
        <main className="flex-1 max-w-8xl w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col lg:flex-row gap-6 print:p-0 z-10 relative">
          
          {/* Printing Manifest Overlay Section (Only displays during printing, completely clean & styled) */}
          <div className="hidden print:block w-full text-slate-900 font-sans p-6">
            <div className="border-b-2 border-slate-900 pb-3 mb-6 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-bold tracking-tight uppercase">MANIFESTO DIÁRIO DE ENTREGAS</h1>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Emissor: {depot.name}</p>
                <p className="text-xs text-slate-500 font-mono">Ponto de Partida: {depot.address}</p>
              </div>
              <div className="text-right text-xs font-mono">
                <p>Data: {new Date().toLocaleDateString('pt-BR')}</p>
                <p>Entregas Totais: {deliveries.length}</p>
              </div>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="py-2.5 font-bold w-12 text-center">SEQ</th>
                  <th className="py-2.5 font-bold">CLIENTE</th>
                  <th className="py-2.5 font-bold">ENDEREÇO</th>
                  <th className="py-2.5 font-bold">PEDIDO DE GELO (CARGA)</th>
                  <th className="py-2.5 font-bold w-20 text-center">VISTO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {deliveries.sort((a,b) => a.sequence - b.sequence).map((d) => (
                  <tr key={d.id}>
                    <td className="py-3 text-center font-bold font-mono">{d.sequence}</td>
                    <td className="py-3 font-semibold">{d.clientName}</td>
                    <td className="py-3 text-slate-600">{d.address} ({d.city})</td>
                    <td className="py-3 font-bold">{d.orderDetails}</td>
                    <td className="py-3 border border-slate-300 h-8 w-20 text-center text-slate-200">[ &nbsp; ]</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="mt-12 pt-6 border-t border-slate-100 flex justify-between text-[11px] text-slate-400 font-mono">
              <p>Gerado eletronicamente via sistema integrado de rotas IceRoute.</p>
              <p>Assinatura Entregador: ____________________________</p>
            </div>
          </div>

          {/* Main User Interface Viewports */}
          <div className="w-full lg:w-5/12 flex flex-col print:hidden animate-fade-in gap-4 relative z-10">
            {/* High-level KPIs */}
            <StatsDashboard 
              deliveries={deliveries} 
              routeMetrics={routeMetrics} 
              returnToDepot={returnToDepot} 
            />

            {/* List and Operations Card */}
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 space-y-4 shadow-2xl relative text-white">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <h3 className="font-extrabold text-slate-100 text-sm">Quadro de Itinerários</h3>
                  <p className="text-[10.5px] text-slate-400">Arranje e visualize a ordem das entregas do dia</p>
                </div>

                <div className="flex gap-1.5">
                  <button
                    onClick={() => setIsHistoryOpen(true)}
                    className="p-2 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl cursor-pointer transition-colors flex items-center gap-1 text-[11px] font-semibold"
                    title="Ver Histórico de Rotas"
                  >
                    <Calendar size={13} />
                    <span className="hidden sm:inline">Histórico</span>
                  </button>

                  <button
                    onClick={handleArchiveCurrentRoute}
                    className="p-2 text-emerald-300 hover:text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl cursor-pointer transition-colors flex items-center gap-1 text-[11px] font-semibold"
                    title="Concluir e Arquivar Rota de Hoje"
                  >
                    <Archive size={13} />
                    <span className="hidden sm:inline">Concluir</span>
                  </button>

                  <button
                    onClick={() => setIsDepotOpen(true)}
                    className="p-2 text-slate-350 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl cursor-pointer transition-colors"
                    title="Configurar Fábrica Origem"
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    onClick={handleClearRoute}
                    className="p-2 text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-550 border border-rose-500/20 rounded-xl cursor-pointer transition-colors"
                    title="Excluir tudo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Sequential Actions & Automated Routing Optimizer */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleOptimizeRoute}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 text-xs flex items-center justify-center gap-1.5 cursor-pointer leading-none transition-all hover:scale-[1.01] active:scale-98"
                >
                  <Sparkles size={14} className="fill-current" />
                  Otimizar Melhor Trajeto (Smart TSP)
                </button>
                <button
                  onClick={() => setIsAddEditOpen(true)}
                  className="py-3 px-4 border border-dashed border-white/20 text-slate-250 hover:text-white hover:bg-white/10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus size={14} />
                  Nova Parada
                </button>
              </div>

              {/* Loop Closing Option Toggle */}
              <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 text-xs text-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300">🔄</span>
                  <div>
                    <span className="font-semibold text-slate-100">Retorno ao Depósito</span>
                    <p className="text-[10px] text-slate-405 mt-0.5">Calcula trajeto de volta após o último cliente</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={returnToDepot}
                    onChange={(e) => setReturnToDepot(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Scrollable list of stops */}
              <div className="max-h-[500px] overflow-y-auto pr-1">
                <DeliveryList
                  depot={depot}
                  deliveries={deliveries}
                  routeMetrics={routeMetrics}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={handleDeleteDelivery}
                  onStartEditing={handleStartEditing}
                />
              </div>
            </div>
          </div>

          {/* Interactive Routing Map viewport */}
          <div className="w-full lg:w-7/12 rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-slate-950/40 backdrop-blur-2xl print:hidden flex flex-col self-start lg:sticky lg:top-5 relative h-[560px] md:h-[650px] z-10">
            {/* Floating indicator info panel */}
            <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 text-white rounded-xl shadow-lg z-10 border border-white/10 flex items-center gap-2.5 max-w-[85%] sm:max-w-md">
              <div className="w-5.5 h-5.5 bg-blue-500 rounded-full flex items-center justify-center text-[10px]">🗺️</div>
              <div className="min-w-0">
                <h4 className="text-[11.5px] font-bold text-slate-50 italic tracking-wide font-sans">Itinerário de Linha Prática</h4>
                <p className="text-[9.5px] text-slate-300 truncate mt-0.5 font-medium">As rotas e trajetos acima atualizam em tempo real pelo Google.</p>
              </div>
            </div>

            <IceRouteMap
              depot={depot}
              deliveries={deliveries}
              returnToDepot={returnToDepot}
              onUpdateSegmentMetrics={(metrics) => setRouteMetrics(metrics)}
            />
          </div>
        </main>

        {/* Toast notifications */}
        {toastMessage && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl text-slate-100 py-3.5 px-6 rounded-2xl shadow-2xl flex items-center gap-2.5 z-50 animate-fade-in border border-white/10 text-xs font-bold leading-none">
            <ClipboardCheck size={14} className="text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modals */}
        <HistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          history={routeHistory}
          onDeleteHistoryItem={handleDeleteHistoryItem}
          onLoadHistoryItem={handleLoadHistoryItem}
          onClearHistory={handleClearHistory}
        />

        <AddEditDeliveryModal
          isOpen={isAddEditOpen}
          onClose={() => {
            setIsAddEditOpen(false);
            setEditingDelivery(null);
          }}
          onSave={handleAddOrEditDelivery}
          editingDelivery={editingDelivery}
          depot={depot}
        />

        <DepotSettingsModal
          isOpen={isDepotOpen}
          onClose={() => setIsDepotOpen(false)}
          currentDepot={depot}
          onSave={(updatedDepot) => {
            setDepot(updatedDepot);
            showToast(`Distribuidora cadastrada em: "${updatedDepot.name}"`);
          }}
        />
      </div>
    </APIProvider>
  );
}
