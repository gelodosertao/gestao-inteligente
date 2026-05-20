import React, { useState } from 'react';
import {
  PartyPopper, Search, Calendar, AlertTriangle, MapPin, Zap,
  Share2, RefreshCw, TrendingUp, CalendarPlus, CalendarDays,
  Flame, Siren, Pin, Layers, Globe, Building2, Map, Info,
  CalendarCheck, Download
} from 'lucide-react';
import { supabase } from '../services/supabase';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface Festa {
  nome: string;
  data: string;            // data principal / fim (ISO YYYY-MM-DD)
  data_inicio?: string;    // início da festa (ISO YYYY-MM-DD) — se multi-dia
  data_fim?: string;       // fim da festa (ISO YYYY-MM-DD) — igual a data se 1 dia
  duracao_dias?: number;   // calculado
  categoria: 'NACIONAL' | 'NORDESTE' | 'MUNICIPAL' | 'REGIONAL' | 'GOOGLE';
  impacto: 'ALTÍSSIMO' | 'ALTO' | 'MEDIO' | 'BAIXO';
  tipo: 'FIXO' | 'GOOGLE';
  dica: string;
  endereco?: string;
  dias_restantes?: number; // dias até o INÍCIO da festa
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

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatarData = (isoDate: string, weekday = true) => {
  const d = toDate(isoDate);
  return d.toLocaleDateString('pt-BR', {
    ...(weekday ? { weekday: 'short' } : {}),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatarRangeData = (festa: Festa): string => {
  const inicio = festa.data_inicio || festa.data;
  const fim = festa.data_fim || festa.data;
  if (inicio === fim) return formatarData(inicio);
  const di = toDate(inicio);
  const df = toDate(fim);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  const si = di.toLocaleDateString('pt-BR', opts);
  const sf = df.toLocaleDateString('pt-BR', { ...opts, year: 'numeric' });
  return `${si} — ${sf}`;
};

const getDuracao = (festa: Festa): number => {
  if (festa.duracao_dias) return festa.duracao_dias;
  const inicio = festa.data_inicio || festa.data;
  const fim = festa.data_fim || festa.data;
  const diff = (toDate(fim).getTime() - toDate(inicio).getTime()) / 86400000;
  return Math.round(diff) + 1;
};

// ─── ENRIQUECIMENTO LOCAL (fallback para API sem data_inicio) ─────────────────
// Quando a Edge Function retorna apenas "data" (versão antiga), este mapa
// injeta data_inicio e data_fim com base no nome da festa.
// Durações baseadas na realidade de cada evento.
const DURACOES_CONHECIDAS: { pattern: RegExp; diasAntes: number; diasApos: number }[] = [
  { pattern: /carnaval/i,               diasAntes: 3,  diasApos: 0 },  // sáb → terça
  { pattern: /temporada junina/i,       diasAntes: 29, diasApos: 0 },  // 1–30/jun
  { pattern: /são joão/i,               diasAntes: 1,  diasApos: 0 },  // 23–24/jun
  { pattern: /santo antônio/i,          diasAntes: 1,  diasApos: 0 },  // 12–13/jun
  { pattern: /são pedro/i,              diasAntes: 1,  diasApos: 0 },  // 28–29/jun
  { pattern: /romaria.*lapa|lapa.*romaria|bom jesus/i, diasAntes: 8, diasApos: 0 },  // 29/jul–6/ago (9 dias)
  { pattern: /réveillon/i,              diasAntes: 1,  diasApos: 0 },  // 30–31/dez
  { pattern: /natal/i,                  diasAntes: 1,  diasApos: 0 },  // 24–25/dez
  { pattern: /aniversário.*ibotirama|ibotirama.*aniversário/i, diasAntes: 2, diasApos: 0 },
  { pattern: /micareta.*ibotirama|ibotirama.*micareta/i,       diasAntes: 2, diasApos: 0 },
  { pattern: /aniversário.*barreiras|barreiras.*aniversário/i, diasAntes: 2, diasApos: 0 },
  { pattern: /expo.*barreiras|agrobahia/i, diasAntes: 4, diasApos: 0 },
  { pattern: /aniversário.*guanambi|guanambi.*aniversário/i,   diasAntes: 2, diasApos: 0 },
  { pattern: /micareta regional/i,      diasAntes: 3,  diasApos: 0 },
];

function enriquecerFesta(festa: Festa): Festa {
  // Se já tem data_inicio real vinda da API, não mexe
  if (festa.data_inicio && festa.data_inicio !== festa.data) return festa;

  const dataFim = festa.data_fim || festa.data;
  const match = DURACOES_CONHECIDAS.find(r => r.pattern.test(festa.nome));

  if (!match || match.diasAntes === 0) {
    return { ...festa, data_inicio: dataFim, data_fim: dataFim };
  }

  const fimDate = toDate(dataFim);
  const inicioDate = new Date(fimDate);
  inicioDate.setDate(fimDate.getDate() - match.diasAntes);
  const dataInicio = inicioDate.toISOString().split('T')[0];
  const duracao = match.diasAntes + 1 + match.diasApos;

  return { ...festa, data_inicio: dataInicio, data_fim: dataFim, duracao_dias: duracao };
}

const getImpactoConfig = (impacto: string) => {
  switch (impacto) {
    case 'ALTÍSSIMO': return {
      bg: 'bg-red-50 border-red-200', stripe: 'bg-red-500',
      badge: 'bg-red-100 text-red-700', label: 'Altíssimo',
      Icon: Flame,
    };
    case 'ALTO': return {
      bg: 'bg-orange-50 border-orange-200', stripe: 'bg-orange-500',
      badge: 'bg-orange-100 text-orange-700', label: 'Alto',
      Icon: Siren,
    };
    case 'MEDIO': return {
      bg: 'bg-yellow-50 border-yellow-200', stripe: 'bg-yellow-500',
      badge: 'bg-yellow-100 text-yellow-700', label: 'Médio',
      Icon: Pin,
    };
    default: return {
      bg: 'bg-slate-50 border-slate-200', stripe: 'bg-slate-400',
      badge: 'bg-slate-100 text-slate-600', label: 'Baixo',
      Icon: Layers,
    };
  }
};

const getCategoriaConfig = (cat: string) => {
  const map: Record<string, { label: string; Icon: any }> = {
    NACIONAL:  { label: 'Nacional',   Icon: Globe },
    NORDESTE:  { label: 'Nordeste',   Icon: Map },
    MUNICIPAL: { label: 'Municipal',  Icon: Building2 },
    REGIONAL:  { label: 'Regional',   Icon: Map },
    GOOGLE:    { label: 'Encontrado', Icon: Search },
  };
  return map[cat] || { label: cat, Icon: Info };
};

const getUrgencia = (dias: number | undefined) => {
  if (dias === undefined) return { color: 'text-slate-500', bg: 'bg-slate-100', label: '—' };
  if (dias === 0)  return { color: 'text-red-700',    bg: 'bg-red-100',    label: 'Hoje!' };
  if (dias <= 7)   return { color: 'text-red-600',    bg: 'bg-red-100',    label: `${dias}d` };
  if (dias <= 30)  return { color: 'text-orange-600', bg: 'bg-orange-100', label: `${dias}d` };
  return { color: 'text-emerald-600', bg: 'bg-emerald-100', label: `${dias}d` };
};

// ─── GERADOR DE ICS ────────────────────────────────────────────────────────────

const isoParaICS = (iso: string) => iso.replace(/-/g, '');

const gerarICS = (festas: Festa[], cidade: string): string => {
  const eventos = festas.map((f) => {
    const inicio = f.data_inicio || f.data;
    const fimRaw = f.data_fim || f.data;
    // ICS: DTEND para all-day deve ser D+1
    const fimDate = toDate(fimRaw);
    fimDate.setDate(fimDate.getDate() + 1);
    const fimICS = fimDate.toISOString().split('T')[0].replace(/-/g, '');

    const uid = `${f.nome.replace(/\s+/g, '-')}-${inicio}@gai-gelodosertao`;
    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${isoParaICS(inicio)}`,
      `DTEND;VALUE=DATE:${fimICS}`,
      `SUMMARY:${f.nome}`,
      `DESCRIPTION:Impacto: ${f.impacto}. ${f.dica}`,
      ...(f.endereco ? [`LOCATION:${f.endereco}`] : []),
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//G.AI Gelo do Sertao//Cacador de Festas//PT',
    `X-WR-CALNAME:Festas - ${cidade}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...eventos,
    'END:VCALENDAR',
  ].join('\r\n');
};

const baixarCalendario = (festas: Festa[], cidade: string) => {
  const ics = gerarICS(festas, cidade);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `festas-${cidade.toLowerCase().replace(/\s+/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
};

const linkGoogleCalendar = (festa: Festa): string => {
  const inicio = festa.data_inicio || festa.data;
  const fim = festa.data_fim || festa.data;
  // Google Calendar exige data fim = D+1 para all-day
  const fimDate = toDate(fim);
  fimDate.setDate(fimDate.getDate() + 1);
  const fimStr = fimDate.toISOString().split('T')[0].replace(/-/g, '');

  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: festa.nome,
    dates: `${isoParaICS(inicio)}/${fimStr}`,
    details: `${festa.dica}\n\nImpacto para venda de gelo: ${festa.impacto}`,
    ...(festa.endereco ? { location: festa.endereco } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
};

// ─── CARD DE FESTA ─────────────────────────────────────────────────────────────

const FestaCard: React.FC<{ festa: Festa }> = ({ festa }) => {
  const config = getImpactoConfig(festa.impacto);
  const catConfig = getCategoriaConfig(festa.categoria);
  const urgencia = getUrgencia(festa.dias_restantes);
  const dias = festa.dias_restantes ?? 0;
  const duracao = getDuracao(festa);
  const { Icon: ImpactoIcon } = config;
  const { Icon: CatIcon } = catConfig;

  return (
    <div className={`relative border rounded-2xl p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${config.bg}`}>
      {/* Countdown */}
      <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-black ${urgencia.bg} ${urgencia.color}`}>
        {urgencia.label}
      </div>

      {/* Stripe lateral de impacto */}
      <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${config.stripe}`} />

      <div className="pl-3">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 pr-14">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${config.badge}`}>
            <ImpactoIcon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 leading-snug text-sm">{festa.nome}</h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${config.badge}`}>
                {config.label}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                <CatIcon size={10} />
                {catConfig.label}
              </span>
              {festa.tipo === 'GOOGLE' && (
                <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                  Google Events
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Range de datas */}
        <div className="flex items-center gap-1.5 mt-3 text-slate-700">
          <CalendarDays size={13} className="flex-shrink-0 text-slate-400" />
          <span className="text-xs font-semibold">{formatarRangeData(festa)}</span>
          {duracao > 1 && (
            <span className="ml-1 text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
              {duracao} dias
            </span>
          )}
        </div>

        {/* Barra de progresso até o início */}
        {dias <= 90 && (
          <div className="mt-2">
            <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  dias <= 7 ? 'bg-red-500' : dias <= 30 ? 'bg-orange-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.max(4, 100 - (dias / 90) * 100)}%` }}
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
            <span className="font-bold text-slate-700">Dica: </span>
            {festa.dica}
          </p>
        </div>

        {/* Ações de calendário */}
        <div className="mt-3 flex items-center gap-2">
          <a
            href={linkGoogleCalendar(festa)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1.5 rounded-lg transition-colors"
            title="Salvar no Google Calendar"
          >
            <CalendarPlus size={12} />
            Google Agenda
          </a>
          <button
            onClick={() => baixarCalendario([festa], festa.nome)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
            title="Baixar arquivo .ics (Outlook, Apple Calendar...)"
          >
            <Download size={12} />
            .ics
          </button>
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
    if (!cidade.trim()) { setErro('Digite o nome da cidade.'); return; }
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
      (f) => `• ${f.nome} — ${formatarRangeData(f)} (em ${f.dias_restantes}d)`
    ).join('\n');
    const msg = `Festas em ${resultado.cidade}/${resultado.estado} — próximos ${resultado.janela_dias} dias:\n\n${linhas}\n\nVia G.AI - Gelo do Sertão`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const festasFiltradas = resultado?.festas.filter(
    (f) => filtroImpacto === 'TODOS' || f.impacto === filtroImpacto
  ) ?? [];

  const counts = resultado ? {
    total: resultado.total,
    urgentes: resultado.festas.filter(f => (f.dias_restantes ?? 99) <= 7).length,
    altissimo: resultado.festas.filter(f => f.impacto === 'ALTÍSSIMO').length,
  } : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <PartyPopper size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Caçador de Festas</h2>
          <p className="text-sm text-slate-500">Antecipe demandas. Programe seu estoque. Não perca vendas.</p>
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
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium"
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
            className="bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-400 hover:to-rose-500 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50 whitespace-nowrap"
          >
            {carregando ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
            {carregando ? 'Buscando...' : 'Buscar Festas'}
          </button>
        </div>
        {erro && (
          <div className="mt-3 bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {erro}
          </div>
        )}
      </div>

      {/* KPIs */}
      {resultado && counts && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-3xl font-black text-slate-800">{counts.total}</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">Total de Festas</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-3xl font-black text-red-600">{counts.urgentes}</p>
            <p className="text-xs text-red-500 mt-1 font-medium flex items-center justify-center gap-1">
              <Siren size={12} /> Em 7 dias
            </p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-3xl font-black text-orange-600">{counts.altissimo}</p>
            <p className="text-xs text-orange-500 mt-1 font-medium flex items-center justify-center gap-1">
              <Flame size={12} /> Altíssimo Impacto
            </p>
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
          <div className="flex gap-2">
            <button
              id="festas-download-ics-btn"
              onClick={() => baixarCalendario(festasFiltradas, `${resultado.cidade}-${resultado.estado}`)}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
              title="Baixar todos os eventos como arquivo de calendário (.ics)"
            >
              <CalendarCheck size={15} />
              Salvar Calendário
            </button>
            <button
              id="festas-whatsapp-btn"
              onClick={compartilharWhatsApp}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm"
            >
              <Share2 size={15} />
              WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
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
          <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PartyPopper size={36} className="text-orange-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Pronto para buscar</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Informe uma cidade e estado acima para ver todas as festas e eventos dos próximos meses.
            Planeje seu estoque com antecedência e não perca nenhuma venda.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {[
              { label: 'Carnaval', Icon: Flame },
              { label: 'São João', Icon: Calendar },
              { label: 'Municipais', Icon: Building2 },
            ].map(({ label, Icon }) => (
              <div key={label} className="bg-orange-50 rounded-xl p-3 text-center">
                <Icon size={22} className="text-orange-500 mx-auto" />
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

      {/* Rodapé */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <TrendingUp size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-blue-800">Sobre as fontes de dados</p>
          <p className="text-xs text-blue-600 mt-1">
            <strong>Calendário Fixo:</strong> Festas recorrentes com datas precisas (Carnaval, São João, festas municipais).<br />
            <strong>Google Events:</strong> Eventos dinâmicos buscados em tempo real. Cobertura melhor em cidades maiores.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FestasRadar;
