import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { TrendingUp, Users, AlertTriangle, ArrowUpRight, X, Filter, Download, Calendar, DollarSign, ArrowDownCircle, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import { Product, Sale, FinancialRecord, Customer, Branch, ViewState } from '../types';

interface DashboardProps {
  products: Product[];
  sales: Sale[];
  financials: FinancialRecord[];
  customers: Customer[];
  onNavigate?: (view: ViewState) => void;
}

// Updated Colors: Blue (Primary), Orange (Secondary/Highlight)
const COLORS = ['#f97316', '#1e40af', '#3b82f6', '#fb923c'];

const Dashboard: React.FC<DashboardProps> = ({ products, sales, financials, customers, onNavigate }) => {
  const [showPowerBI, setShowPowerBI] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<'ALL' | Branch>('ALL');

  // --- DATE FILTERING ---
  const [period, setPeriod] = useState<'DAY' | 'WEEK' | 'MONTH'>('MONTH');
  const [currentDate, setCurrentDate] = useState(new Date());

  const getPeriodDates = (date: Date, type: 'DAY' | 'WEEK' | 'MONTH') => {
    const start = new Date(date);
    const end = new Date(date);

    if (type === 'DAY') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'WEEK') {
      const day = start.getDay(); // 0 (Sun) to 6 (Sat)
      const diff = start.getDate() - day; // set to Sunday
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);

      end.setDate(diff + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (period === 'DAY') newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    if (period === 'WEEK') newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    if (period === 'MONTH') newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const formatPeriodLabel = () => {
    if (period === 'DAY') return currentDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });
    if (period === 'WEEK') {
      const { start, end } = getPeriodDates(currentDate, 'WEEK');
      return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} à ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    }
    return currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  // State for Power BI Filters
  const [dateRange, setDateRange] = useState('THIS_MONTH'); // 'THIS_MONTH', 'LAST_MONTH', 'YEAR'

  // Helper for formatting currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // --- FILTERING BY BRANCH ---
  const filteredSales = useMemo(() => sales.filter(s => selectedBranch === 'ALL' || s.branch === selectedBranch), [sales, selectedBranch]);
  const filteredFinancials = useMemo(() => financials.filter(f => selectedBranch === 'ALL' || f.branch === selectedBranch), [financials, selectedBranch]);
  const filteredCustomers = useMemo(() => customers.filter(c => selectedBranch === 'ALL' || c.branch === selectedBranch), [customers, selectedBranch]);

  // --- CALCULATIONS (Dynamic Period Logic) ---
  const { start: periodStart, end: periodEnd } = getPeriodDates(currentDate, period);

  // Previous Period for Trend
  const prevDate = new Date(currentDate);
  if (period === 'DAY') prevDate.setDate(prevDate.getDate() - 1);
  if (period === 'WEEK') prevDate.setDate(prevDate.getDate() - 7);
  if (period === 'MONTH') prevDate.setMonth(prevDate.getMonth() - 1);

  const { start: prevStart, end: prevEnd } = getPeriodDates(prevDate, period);

  const isInRange = (dateStr: string, start: Date, end: Date) => {
    // Fix timezone offset issue by treating string as local
    const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
    const checkDate = new Date(y, m - 1, d, 12, 0, 0); // Noon to avoid timezone shifts
    return checkDate >= start && checkDate <= end;
  };

  // --- LEGACY / BI VARIABLES (Restored for Power BI Section) ---
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const isSameMonth = (dateStr: string, month: number, year: number) => {
    const d = new Date(dateStr);
    return d.getMonth() === month && d.getFullYear() === year;
  };

  // Current Month Data (Legacy for BI)
  const biData = useMemo(() => {
    const currentMonthSales = filteredSales.filter(s => isSameMonth(s.date, currentMonth, currentYear));
    const currentMonthRevenue = currentMonthSales.filter(s => s.status === 'Completed').reduce((acc, curr) => acc + curr.total, 0);
    return { currentMonthRevenue };
  }, [filteredSales, currentMonth, currentYear]);

  // Current Period Data
  const periodData = useMemo(() => {
    const currentPeriodSales = filteredSales.filter(s => isInRange(s.date, periodStart, periodEnd));
    const currentPeriodRevenue = currentPeriodSales.filter(s => s.status === 'Completed').reduce((acc, curr) => acc + curr.total, 0);
    const currentPeriodPending = currentPeriodSales.filter(s => s.status === 'Pending').reduce((acc, curr) => acc + curr.total, 0);
    const currentPeriodExpenses = filteredFinancials.filter(f => f.type === 'Expense' && isInRange(f.date, periodStart, periodEnd)).reduce((acc, curr) => acc + curr.amount, 0);

    // Calculate Previous Balance (Accumulated) ONLY if viewing MONTH
    // Calculate Previous Balance (Accumulated) for ALL periods
    // We use periodStart to determine the cutoff date
    const startDateStr = periodStart.toLocaleDateString('sv-SE', { timeZone: 'America/Bahia' });

    const previousRecords = filteredFinancials.filter(r => r.date < startDateStr);
    const previousSales = filteredSales.filter(s => s.date < startDateStr && s.status === 'Completed');

    const prevIncome = previousRecords.filter(r => r.type === 'Income').reduce((acc, r) => acc + r.amount, 0)
      + previousSales.reduce((acc, s) => acc + s.total, 0);

    const prevExpense = previousRecords.filter(r => r.type === 'Expense').reduce((acc, r) => acc + r.amount, 0);

    const previousBalance = prevIncome - prevExpense;

    const currentPeriodProfit = (currentPeriodRevenue - currentPeriodExpenses) + previousBalance;

    return { currentPeriodSales, currentPeriodRevenue, currentPeriodPending, currentPeriodExpenses, currentPeriodProfit, previousBalance };
  }, [filteredSales, filteredFinancials, periodStart, periodEnd, period, currentDate]);

  const { currentPeriodSales, currentPeriodRevenue, currentPeriodPending, currentPeriodExpenses, currentPeriodProfit } = periodData;

  // Previous Period Data (for trends)
  const prevPeriodData = useMemo(() => {
    const prevPeriodSalesRaw = sales.filter(s => (selectedBranch === 'ALL' || s.branch === selectedBranch) && isInRange(s.date, prevStart, prevEnd));
    const prevPeriodRevenue = prevPeriodSalesRaw.filter(s => s.status === 'Completed').reduce((acc, curr) => acc + curr.total, 0);
    const prevPeriodPending = prevPeriodSalesRaw.filter(s => s.status === 'Pending').reduce((acc, curr) => acc + curr.total, 0);
    const prevPeriodExpenses = financials.filter(f => (selectedBranch === 'ALL' || f.branch === selectedBranch) && f.type === 'Expense' && isInRange(f.date, prevStart, prevEnd)).reduce((acc, curr) => acc + curr.amount, 0);
    const prevPeriodProfit = prevPeriodRevenue - prevPeriodExpenses;
    return { prevPeriodSalesRaw, prevPeriodRevenue, prevPeriodPending, prevPeriodExpenses, prevPeriodProfit };
  }, [sales, financials, selectedBranch, prevStart, prevEnd]);

  // Trends
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const diff = ((current - previous) / previous) * 100;
    return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
  };

  const revenueTrend = calculateTrend(periodData.currentPeriodRevenue, prevPeriodData.prevPeriodRevenue);
  const pendingTrend = calculateTrend(periodData.currentPeriodPending, prevPeriodData.prevPeriodPending);
  const expenseTrend = calculateTrend(periodData.currentPeriodExpenses, prevPeriodData.prevPeriodExpenses);
  const profitTrend = calculateTrend(periodData.currentPeriodProfit, prevPeriodData.prevPeriodProfit);
  const salesCountTrend = calculateTrend(periodData.currentPeriodSales.length, prevPeriodData.prevPeriodSalesRaw.length);

  // Stock Data - Dynamic based on Branch
  const stockData = useMemo(() => products.slice(0, 6).map(p => {
    const safeName = p.name || 'Produto Sem Nome';
    const item: any = { name: safeName.split(' ')[0] + ' ' + (safeName.split(' ')[1] || '') };
    if (selectedBranch === 'ALL' || selectedBranch === Branch.MATRIZ) item.Matriz = p.stockMatriz || 0;
    if (selectedBranch === 'ALL' || selectedBranch === Branch.FILIAL) item.Filial = p.stockFilial || 0;
    return item;
  }), [products, selectedBranch]);

  // Chart Data Preparation (Filtered by Date Range for Power BI)
  // Default Dashboard shows last 30 days or current month
  const revenueData = useMemo(() => filteredSales
    .filter(s => {
      if (!s.date) return false;
      if (dateRange === 'THIS_MONTH') return isSameMonth(s.date, currentMonth, currentYear);
      if (dateRange === 'LAST_MONTH') return isSameMonth(s.date, lastMonth, lastMonthYear);
      return s.date.startsWith(currentYear.toString());
    })
    .map(s => ({
      date: s.date ? s.date.slice(5) : '00-00', // mm-dd
      amount: s.total || 0
    })).reduce((acc: any[], curr) => {
      const found = acc.find(a => a.date === curr.date);
      if (found) found.amount += curr.amount;
      else acc.push(curr);
      return acc;
    }, []).sort((a, b) => a.date.localeCompare(b.date)), [filteredSales, dateRange, currentMonth, currentYear, lastMonth, lastMonthYear]);

  const categoryData = useMemo(() => [
    { name: 'Gelo', value: filteredSales.filter(s => s.items.some(i => i.productName.includes('Gelo'))).length },
    { name: 'Bebidas', value: filteredSales.filter(s => s.items.some(i => !i.productName.includes('Gelo'))).length },
  ], [filteredSales]);

  // Dynamic Calculations for BI
  const filteredSalesForBI = useMemo(() => filteredSales.filter(s => {
    if (dateRange === 'THIS_MONTH') return isSameMonth(s.date, currentMonth, currentYear);
    if (dateRange === 'LAST_MONTH') return isSameMonth(s.date, lastMonth, lastMonthYear);
    return s.date.startsWith(currentYear.toString());
  }), [filteredSales, dateRange, currentMonth, currentYear, lastMonth, lastMonthYear]);

  const avgTicket = filteredSalesForBI.length > 0 ? filteredSalesForBI.reduce((acc, s) => acc + s.total, 0) / filteredSalesForBI.length : 0;
  const salesForecast = biData.currentMonthRevenue * 1.1; // Simple +10% forecast
  const conversionRate = 18.5; // Static for now

  // Seasonality Data (Real Aggregation)
  const seasonalityData = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const monthSales = filteredSales.filter(s => isSameMonth(s.date, i, currentYear)).reduce((acc, s) => acc + s.total, 0);
    return {
      month: new Date(0, i).toLocaleString('pt-BR', { month: 'short' }),
      vendas: monthSales
    };
  }), [filteredSales, currentYear]);

  const marginData = [
    { name: 'Gelo Sabor', margem: 65 },
    { name: 'Gelo Cubo', margem: 45 },
    { name: 'Gelo Escama', margem: 40 },
    { name: 'Destilados', margem: 30 },
    { name: 'Cervejas', margem: 25 },
  ];

  // Customer Analytics
  const normalizeString = (str: string) => {
    if (!str) return 'Não Informado';
    return str.trim().charAt(0).toUpperCase() + str.trim().slice(1).toLowerCase();
  };

  const customersBySegment = useMemo(() => filteredCustomers.reduce((acc: any[], curr) => {
    const segment = normalizeString(curr.segment || '');
    const found = acc.find(a => a.name === segment);
    if (found) found.value += 1;
    else acc.push({ name: segment, value: 1 });
    return acc;
  }, []).sort((a, b) => b.value - a.value), [filteredCustomers]);

  const customersByCity = useMemo(() => filteredCustomers.reduce((acc: any[], curr) => {
    const city = normalizeString(curr.city || '');
    const found = acc.find(a => a.name === city);
    if (found) found.value += 1;
    else acc.push({ name: city, value: 1 });
    return acc;
  }, []).sort((a, b) => b.value - a.value).slice(0, 10), [filteredCustomers]); // Top 10 cities

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Visão Geral</h2>
          <p className="text-slate-500">Acompanhe o desempenho da Gelo do Sertão em tempo real.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          {/* Date Navigation */}
          <div className="bg-white p-1 rounded-lg border border-slate-200 flex items-center justify-between md:justify-start">
            <button onClick={() => navigatePeriod('prev')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><ChevronLeft size={18} /></button>
            <span className="px-2 text-sm font-bold text-slate-700 min-w-[120px] text-center capitalize">{formatPeriodLabel()}</span>
            <button onClick={() => navigatePeriod('next')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><ChevronRight size={18} /></button>
          </div>

          {/* Period Selector */}
          <div className="bg-white p-1 rounded-lg border border-slate-200 flex justify-center">
            <button onClick={() => setPeriod('DAY')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${period === 'DAY' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>Dia</button>
            <button onClick={() => setPeriod('WEEK')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${period === 'WEEK' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>Semana</button>
            <button onClick={() => setPeriod('MONTH')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${period === 'MONTH' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>Mês</button>
          </div>

          {/* Branch Selector */}
          <div className="bg-white p-1 rounded-lg border border-slate-200 flex justify-center">
            <button
              onClick={() => setSelectedBranch('ALL')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${selectedBranch === 'ALL' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Geral
            </button>
            <button
              onClick={() => setSelectedBranch(Branch.MATRIZ)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${selectedBranch === Branch.MATRIZ ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Matriz
            </button>
            <button
              onClick={() => setSelectedBranch(Branch.FILIAL)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${selectedBranch === Branch.FILIAL ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Filial
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card
          title="Receita"
          value={formatCurrency(currentPeriodRevenue)}
          icon={<TrendingUp />}
          trend={revenueTrend}
          color="bg-blue-600"
        />
        <Card
          title="A Receber (Fiado)"
          value={formatCurrency(currentPeriodPending)}
          icon={<AlertTriangle />}
          trend={pendingTrend}
          color="bg-yellow-500"
        />
        <Card
          title="Despesas"
          value={formatCurrency(currentPeriodExpenses)}
          icon={<ArrowDownCircle />}
          trend={expenseTrend}
          color="bg-rose-500"
        />
        <Card
          title="Saldo Acumulado"
          value={formatCurrency(currentPeriodProfit)}
          icon={<DollarSignIcon />}
          trend={profitTrend}
          color="bg-emerald-500"
        />
        <Card
          title="Vendas"
          value={currentPeriodSales.length.toString()}
          icon={<Users />}
          trend={salesCountTrend}
          color="bg-orange-500"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-4">Estoque: Matriz vs Filial</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                <RechartsTooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                <Bar dataKey="Matriz" fill="#1e40af" radius={[4, 4, 0, 0]} name="Matriz (Azul)" />
                <Bar dataKey="Filial" fill="#f97316" radius={[4, 4, 0, 0]} name="Filial (Laranja)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-4">Evolução de Vendas</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currentPeriodSales
                .map(s => ({
                  date: period === 'DAY'
                    ? (s.date.includes('T') ? s.date.split('T')[1].slice(0, 5) : '00:00')
                    : s.date.slice(5, 10), // HH:MM for Day, MM-DD for others
                  amount: s.total
                })).reduce((acc: any[], curr) => {
                  const found = acc.find(a => a.date === curr.date);
                  if (found) found.amount += curr.amount;
                  else acc.push(curr);
                  return acc;
                }, []).sort((a, b) => a.date.localeCompare(b.date))
              }>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="amount" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: '#f97316' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-1">
          <h3 className="font-semibold text-slate-700 mb-4">Mix de Vendas</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-900 to-blue-800 p-6 rounded-2xl shadow-lg lg:col-span-2 text-white flex flex-col justify-center relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-2">Relatórios Power BI</h3>
            <p className="text-blue-100 mb-6 max-w-md">
              Acesse análises profundas sobre sazonalidade, perdas na produção e margem por produto.
            </p>
            <button
              onClick={() => setShowPowerBI(true)}
              className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 w-fit shadow-lg shadow-orange-900/20"
            >
              Gerar Relatório Completo <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4">
            <TrendingUp size={200} />
          </div>
        </div>
      </div>

      {/* Power BI Modal Simulation */}
      {
        showPowerBI && (
          <div className="fixed inset-0 bg-blue-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-50 w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col">
              <div className="bg-[#f2c811] p-4 flex justify-between items-center text-slate-900">
                <div className="flex items-center gap-3">
                  <div className="bg-black/10 p-2 rounded">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">Gelo do Sertão - BI Corporativo</h3>
                    <p className="text-xs font-medium opacity-80">Atualizado: Agora mesmo</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPowerBI(false)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
                {/* Fake BI Controls */}
                <div className="flex flex-wrap gap-3 mb-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <button
                    onClick={() => setDateRange('THIS_MONTH')}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded transition-colors ${dateRange === 'THIS_MONTH' ? 'bg-orange-100 text-orange-700 font-bold border border-orange-200' : 'text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100'}`}
                  >
                    <Calendar size={16} /> Este Mês
                  </button>
                  <button
                    onClick={() => setDateRange('LAST_MONTH')}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded transition-colors ${dateRange === 'LAST_MONTH' ? 'bg-orange-100 text-orange-700 font-bold border border-orange-200' : 'text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100'}`}
                  >
                    <Calendar size={16} /> Mês Passado
                  </button>
                  <button
                    onClick={() => setDateRange('YEAR')}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded transition-colors ${dateRange === 'YEAR' ? 'bg-orange-100 text-orange-700 font-bold border border-orange-200' : 'text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100'}`}
                  >
                    <Calendar size={16} /> Este Ano
                  </button>
                  <div className="flex-1" />
                  <button className="flex items-center gap-2 text-sm text-slate-600 hover:text-orange-600">
                    <Download size={16} /> Exportar PDF
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                    <p className="text-sm text-slate-500">Previsão de Vendas (Próx. Mês)</p>
                    <p className="text-2xl font-bold text-blue-800">{formatCurrency(salesForecast)}</p>
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><ArrowUpRight size={12} /> +5% vs mês anterior</p>
                  </div>
                  <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                    <p className="text-sm text-slate-500">Ticket Médio</p>
                    <p className="text-2xl font-bold text-slate-800">{formatCurrency(avgTicket)}</p>
                  </div>
                  <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                    <p className="text-sm text-slate-500">Taxa de Conversão</p>
                    <p className="text-2xl font-bold text-slate-800">{conversionRate}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                    <h4 className="font-bold text-slate-700 mb-4">Sazonalidade de Vendas (Anual)</h4>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={seasonalityData}>
                          <defs>
                            <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="month" fontSize={12} tickLine={false} />
                          <YAxis fontSize={12} tickLine={false} />
                          <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                          <Area type="monotone" dataKey="vendas" stroke="#f97316" fillOpacity={1} fill="url(#colorVendas)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                    <h4 className="font-bold text-slate-700 mb-4">Margem por Categoria</h4>
                    <div className="h-80 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={marginData}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" unit="%" />
                          <YAxis dataKey="name" type="category" width={100} />
                          <RechartsTooltip />
                          <Bar dataKey="margem" fill="#1e40af" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Customer Analytics Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                    <h4 className="font-bold text-slate-700 mb-4">Clientes por Ramo de Atividade</h4>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={customersBySegment}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={120} fontSize={11} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]} barSize={20} name="Clientes" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                    <h4 className="font-bold text-slate-700 mb-4">Top 5 Clientes (Receita)</h4>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={
                          filteredSalesForBI.reduce((acc: any[], curr) => {
                            const name = curr.customerName || 'Consumidor Final';
                            const found = acc.find(a => a.name === name);
                            if (found) found.value += curr.total;
                            else acc.push({ name, value: curr.total });
                            return acc;
                          }, [])
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 5)
                        }>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tickFormatter={(val) => `R$${val}`} />
                          <YAxis dataKey="name" type="category" width={120} fontSize={11} />
                          <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} name="Total Comprado" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 border-t border-slate-200 p-2 flex justify-center text-xs text-slate-400">
                Power BI Embedded Simulation • Gelo do Sertão © 2023
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

// Helper Components
const Card = ({ title, value, icon, trend, color }: any) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow group">
    <div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      <span className={`text-xs font-medium px-2 py-0.5 rounded mt-2 inline-block ${trend.includes('-') ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'}`}>{trend}</span>
    </div>
    <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110`}>
      {React.cloneElement(icon, { size: 24 })}
    </div>
  </div>
);

const DollarSignIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
);

export default Dashboard;