import React, { useState } from 'react';
import { PartyPopper, Search, Calendar, AlertTriangle, Clock, MapPin, Zap, Download, Share2, RefreshCw, X, TrendingUp } from 'lucide-react';
import { supabase } from '../services/supabase';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface Festa {
  nome: string;
  data: string;
  categoria: 'NACIONAL' | 'NORDESTE' | 'MUNICIPAL' | 'REGIONAL' | 'GOOGLE';
  impacto: 'ALTÍSSIMO' | 'ALTO' | 'MEDIO' | 'BAIXO';
  tipo: 'FIXO' | 'GOOGLE';
  dica: string;
  endereco?: string;
  dias_restantes?: number;
  urgencia?: string;
  thumbnail?: string;
}

interface FestasResultado {
  cidade: string;
  estado: string;
  consultado_em: string;
  janela_dias: number;
  total: number;
  festas: Festa[];
}

// ─── DADOS BRASIL ─────────────────────────────────────────────────────────────

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO'
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const formatarData = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const data = new Date(y, m - 1, d);
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

const getImpactoConfig = (impacto: string) => {
  switch (impacto) {
    case 'ALTÍSSIMO': return { bg: 'bg-red-50 border-red-200', badge: 'bg-red-500', text: 'ALTÍSSIMO', icon: '🔥', ring: 'ring-red-200' };
    case 'ALTO':      return { bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-500', text: 'ALTO', icon: '⚡', ring: 'ring-orange-200' };
    case 'MEDIO':     return { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-500', text: 'MÉDIO', icon: '📌', ring: 'ring-yellow-200' };
    default:          return { bg: 'bg-slate-50 border-slate-200', badge: 'bg-slate-400', text: 'BAIXO', icon: '📋', ring: 'ring-slate-200' };
  }
};

const getUrgenciaConfig = (dias: number | undefined) => {
  if (dias === undefined) return { color: 'text-slate-500', bg: 'bg-slate-100', label: '?' };
  if (dias <= 7)  return { color: 'text-red-600',    bg: 'bg-red-100',    label: `${dias}d` };
  if (dias <= 30) return { color: 'text-orange-600', bg: 'bg-orange-100', label: `${dias}d` };
  return { color: 'text-emerald-600', bg: 'bg-emerald-100', label: `${dias}d` };
};

const getCategoriaLabel = (cat: string) => {
  const map: Record<string, string> = {
    NACIONAL: '🇧🇷 Nacional',
    NORDESTE: '🌵 Nordeste',
    MUNICIPAL: '🏛️ Municipal',
    REGIONAL: '🗺️ Regional',
    GOOGLE: '🌐 Online',
  };
  return map[cat] || cat;
};

// ─── CARD DE FESTA ────────────────────────────────────────────────────────────

const FestaCard: React.FC<{ festa: Festa }> = ({ festa }) => {
  const config = getImpactoConfig(festa.impacto);
  const urgencia = getUrgenciaConfig(festa.dias_restantes);
  const dias = festa.dias_restantes ?? 0;

  return (
    <div className={`relative border rounded-2xl p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${config.bg}`}>
      {/* Countdown Badge */}
      <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-black ${urgencia.bg} ${urgencia.color}`}>
        {urgencia.label}
      </div>

      {/* Impacto stripe */}
      <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${config.badge}`} />

      <div className="pl-3">
        {/* Header */}
        <div className="flex items-start gap-3 pr-12">
          <span className="text-2xl flex-shrink-0 mt-0.5">{config.icon}</span>
          <div>
            <h3 className="font-bold text-slate-800 leading-tight text-sm">{festa.nome}</h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${config.badge}`}>
                {config.text}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {getCategoriaLabel(festa.categoria)}
              </span>
              {festa.tipo === 'GOOGLE' && (
                <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                  Google Events
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Data */}
        <div className="flex items-center gap-1.5 mt-3 text-slate-600">
          <Calendar size={13} className="flex-shrink-0" />
          <span className="text-xs font-semibold capitalize">{formatarData(festa.data)}</span>
        </div>

        {/* Progresso visual até a festa */}
        {dias <= 90 && (
          <div className="mt-2">
            <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  dias <= 7 ? 'bg-red-500' : dias <= 30 ? 'bg-orange-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.max(5, 100 - (dias / 90) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Endereço */}
        {festa.endereco && (
          <div className="flex items-center gap-1.5 mt-2 text-slate-500">
            <MapPin size={11} className="flex-shrink-0" />
            <span className="text-[11px] truncate">{festa.endereco}</span>
          </div>
        )}

        {/* Dica de negócio */}
        <div className="mt-3 bg-white/70 rounded-lg px-3 py-2 border border-white/50">
          <p className="text-[11px] text-slate-600 leading-snug">
            <span className="font-bold text-slate-700">💡 Dica: </span>
            {festa.dica}
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const FestasRadar: React.FC = () => {
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('BA');
  const [diasFrente, setDiasFrente] = useState(90);
  const [resultado, setResultado] = useState<FestasResultado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroImpacto, setFiltroImpacto] = useState<string>('TODOS');

  const buscarFestas = async () => {
    if (!cidade.trim()) {
      setErro('Digite o nome da cidade.');
      return;
    }

    setCarregando(true);
    setErro(null);
    setResultado(null);

    try {
      const { data, error } = await supabase.functions.invoke('buscar-festas', {
        body: { cidade: cidade.trim(), estado, dias_frente: diasFrente },
      });

      if (error) throw error;
      setResultado(data as FestasResultado);
    } catch (e: any) {
      console.error('Erro ao buscar festas:', e);
      setErro('Não foi possível buscar festas. Verifique se a Edge Function está implantada.');
    } finally {
      setCarregando(false);
    }
  };

  const compartilharWhatsApp = () => {
    if (!resultado) return;
    const linhas = resultado.festas.slice(0, 5).map(
      (f) => `• ${f.nome} — ${formatarData(f.data)} (${f.dias_restantes}d)`
    ).join('\n');
    const msg = `🎉 Festas em ${resultado.cidade}/${resultado.estado} nos próximos ${resultado.janela_dias} dias:\n\n${linhas}\n\n_Via G.AI - Gelo do Sertão_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const festasFiltradas = resultado?.festas.filter(
    (f) => filtroImpacto === 'TODOS' || f.impacto === filtroImpacto
  ) ?? [];

  const counts = resultado ? {
    ALTÍSSIMO: resultado.festas.filter(f => f.impacto === 'ALTÍSSIMO').length,
    ALTO: resultado.festas.filter(f => f.impacto === 'ALTO').length,
    MEDIO: resultado.festas.filter(f => f.impacto === 'MEDIO').length,
    urgentes: resultado.festas.filter(f => (f.dias_restantes ?? 99) <= 7).length,
  } : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <PartyPopper size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Caçador de Festas</h2>
              <p className="text-sm text-slate-500">Antecipe demandas. Programe seu estoque. Não perca vendas.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Painel de Busca */}
      <div className="bg-gradient-to-br from-slate-900 to-blue-950 rounded-2xl p-6 shadow-xl text-white">
        <h3 className="font-bold text-sm text-blue-300 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Search size={14} /> Buscar por Cidade
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="festas-cidade-input"
            type="text"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscarFestas()}
            placeholder="Ex: Ibotirama, Barreiras, Bom Jesus da Lapa..."
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm font-medium"
          />
          <select
            id="festas-estado-select"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold w-full sm:w-28"
          >
            {ESTADOS_BR.map(uf => (
              <option key={uf} value={uf} className="bg-slate-800">{uf}</option>
            ))}
          </select>
          <select
            id="festas-dias-select"
            value={diasFrente}
            onChange={(e) => setDiasFrente(Number(e.target.value))}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm w-full sm:w-36"
          >
            <option value={30} className="bg-slate-800">30 dias</option>
            <option value={60} className="bg-slate-800">60 dias</option>
            <option value={90} className="bg-slate-800">90 dias</option>
            <option value={180} className="bg-slate-800">6 meses</option>
          </select>
          <button
            id="festas-buscar-btn"
            onClick={buscarFestas}
            disabled={carregando}
            className="bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-400 hover:to-pink-500 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-900/30 disabled:opacity-50 whitespace-nowrap"
          >
            {carregando ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
            {carregando ? 'Caçando...' : 'Caçar Festas'}
          </button>
        </div>

        {erro && (
          <div className="mt-3 bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {erro}
          </div>
        )}
      </div>

      {/* KPIs de resultado */}
      {resultado && counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-3xl font-black text-slate-800">{resultado.total}</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">Total de Festas</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-3xl font-black text-red-600">{counts.urgentes}</p>
            <p className="text-xs text-red-500 mt-1 font-medium">🔴 Em 7 dias</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-3xl font-black text-orange-600">{counts.ALTÍSSIMO}</p>
            <p className="text-xs text-orange-500 mt-1 font-medium">🔥 Impacto Altíssimo</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-3xl font-black text-emerald-600">{diasFrente}d</p>
            <p className="text-xs text-emerald-500 mt-1 font-medium">Janela Monitorada</p>
          </div>
        </div>
      )}

      {/* Filtros + Ações */}
      {resultado && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {['TODOS', 'ALTÍSSIMO', 'ALTO', 'MEDIO'].map(imp => (
              <button
                key={imp}
                onClick={() => setFiltroImpacto(imp)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroImpacto === imp
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {imp === 'TODOS' ? 'Todos' : imp}
              </button>
            ))}
          </div>
          <button
            id="festas-whatsapp-btn"
            onClick={compartilharWhatsApp}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm"
          >
            <Share2 size={15} />
            Enviar por WhatsApp
          </button>
        </div>
      )}

      {/* Lista de Festas */}
      {festasFiltradas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {festasFiltradas.map((festa, idx) => (
            <FestaCard key={`${festa.nome}-${idx}`} festa={festa} />
          ))}
        </div>
      )}

      {/* Estado vazio */}
      {!resultado && !carregando && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PartyPopper size={36} className="text-orange-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Pronto para Caçar!</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Informe uma cidade e estado acima para ver todas as festas e eventos dos próximos meses.
            Planeje seu estoque com antecedência e não perca nenhuma venda!
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {[
              { emoji: '🎭', label: 'Carnaval' },
              { emoji: '🌽', label: 'São João' },
              { emoji: '🏛️', label: 'Municipais' },
            ].map(({ emoji, label }) => (
              <div key={label} className="bg-orange-50 rounded-xl p-3 text-center">
                <p className="text-2xl">{emoji}</p>
                <p className="text-[10px] font-bold text-orange-700 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {resultado && festasFiltradas.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <p className="text-slate-500">Nenhuma festa encontrada para o filtro selecionado.</p>
        </div>
      )}

      {/* Rodapé informativo */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <TrendingUp size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-blue-800">Sobre as fontes de dados</p>
          <p className="text-xs text-blue-600 mt-1">
            📌 <strong>Calendário Fixo:</strong> Festas recorrentes pré-programadas com alta precisão (Carnaval, São João, festas municipais).<br />
            🌐 <strong>Google Events:</strong> Eventos dinâmicos buscados em tempo real via SerpAPI. Cobertura melhor em cidades maiores.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FestasRadar;
