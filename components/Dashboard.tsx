import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { TrendingUp, Users, AlertTriangle, ArrowUpRight, X, Filter, Download, Calendar, DollarSign, ArrowDownCircle, Globe } from 'lucide-react';
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

  // State for Power BI Filters
  const [dateRange, setDateRange] = useState('THIS_MONTH'); // 'THIS_MONTH', 'LAST_MONTH', 'YEAR'

  // Helper for formatting currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // --- FILTERING BY BRANCH ---
  const filteredSales = sales.filter(s => selectedBranch === 'ALL' || s.branch === selectedBranch);
  const filteredFinancials = financials.filter(f => selectedBranch === 'ALL' || f.branch === selectedBranch);
  const filteredCustomers = customers.filter(c => selectedBranch === 'ALL' || c.branch === selectedBranch);

  // --- CALCULATIONS (Monthly Logic) ---
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const isSameMonth = (dateStr: string, month: number, year: number) => {
    const d = new Date(dateStr);
    return d.getMonth() === month && d.getFullYear() === year;
  };

  // Current Month Data
  const currentMonthSales = filteredSales.filter(s => isSameMonth(s.date, currentMonth, currentYear));
  const currentMonthRevenue = currentMonthSales.filter(s => s.status === 'Completed').reduce((acc, curr) => acc + curr.total, 0);
  const currentMonthPending = currentMonthSales.filter(s => s.status === 'Pending').reduce((acc, curr) => acc + curr.total, 0);
  const currentMonthExpenses = filteredFinancials.filter(f => f.type === 'Expense' && isSameMonth(f.date, currentMonth, currentYear)).reduce((acc, curr) => acc + curr.amount, 0);
  const currentMonthProfit = currentMonthRevenue - currentMonthExpenses;

  // Last Month Data (for trends)
  // Note: We use the SAME filter for branch to get accurate trends for the selected view
  const lastMonthSales = sales.filter(s => (selectedBranch === 'ALL' || s.branch === selectedBranch) && isSameMonth(s.date, lastMonth, lastMonthYear));
  const lastMonthRevenue = lastMonthSales.filter(s => s.status === 'Completed').reduce((acc, curr) => acc + curr.total, 0);
  const lastMonthPending = lastMonthSales.filter(s => s.status === 'Pending').reduce((acc, curr) => acc + curr.total, 0);
  const lastMonthExpenses = financials.filter(f => (selectedBranch === 'ALL' || f.branch === selectedBranch) && f.type === 'Expense' && isSameMonth(f.date, lastMonth, lastMonthYear)).reduce((acc, curr) => acc + curr.amount, 0);
  const lastMonthProfit = lastMonthRevenue - lastMonthExpenses;

  // Trends
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const diff = ((current - previous) / previous) * 100;
    return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
  };

  const revenueTrend = calculateTrend(currentMonthRevenue, lastMonthRevenue);
  const pendingTrend = calculateTrend(currentMonthPending, lastMonthPending);
  const expenseTrend = calculateTrend(currentMonthExpenses, lastMonthExpenses);
  const profitTrend = calculateTrend(currentMonthProfit, lastMonthProfit);
  const salesCountTrend = calculateTrend(currentMonthSales.length, lastMonthSales.length);

  // Stock Data - Dynamic based on Branch
  const lowStockCount = products.filter(p => {
    if (selectedBranch === 'ALL') return p.stockMatriz < p.minStock || p.stockFilial < p.minStock;
    if (selectedBranch === Branch.MATRIZ) return p.stockMatriz < p.minStock;
    if (selectedBranch === Branch.FILIAL) return p.stockFilial < p.minStock;
    return false;
  }).length;

  // Chart Data Preparation (Filtered by Date Range for Power BI)
  // Default Dashboard shows last 30 days or current month
  const revenueData = filteredSales
    .filter(s => {
      if (dateRange === 'THIS_MONTH') return isSameMonth(s.date, currentMonth, currentYear);
      if (dateRange === 'LAST_MONTH') return isSameMonth(s.date, lastMonth, lastMonthYear);
      return s.date.startsWith(currentYear.toString());
    })
    .map(s => ({
      date: s.date.slice(5), // mm-dd
      amount: s.total
    })).reduce((acc: any[], curr) => {
      const found = acc.find(a => a.date === curr.date);
      if (found) found.amount += curr.amount;
      else acc.push(curr);
      return acc;
    }, []).sort((a, b) => a.date.localeCompare(b.date));

  const stockData = products.slice(0, 6).map(p => {
    const item: any = { name: p.name.split(' ')[0] + ' ' + (p.name.split(' ')[1] || '') };
    if (selectedBranch === 'ALL' || selectedBranch === Branch.MATRIZ) item.Matriz = p.stockMatriz;
    if (selectedBranch === 'ALL' || selectedBranch === Branch.FILIAL) item.Filial = p.stockFilial;
    return item;
  });

  const categoryData = [
    { name: 'Gelo', value: filteredSales.filter(s => s.items.some(i => i.productName.includes('Gelo'))).length },
    { name: 'Bebidas', value: filteredSales.filter(s => s.items.some(i => !i.productName.includes('Gelo'))).length },
  ];

  // Dynamic Calculations for BI
  const filteredSalesForBI = filteredSales.filter(s => {
    if (dateRange === 'THIS_MONTH') return isSameMonth(s.date, currentMonth, currentYear);
    if (dateRange === 'LAST_MONTH') return isSameMonth(s.date, lastMonth, lastMonthYear);
    return s.date.startsWith(currentYear.toString());
  });

  const avgTicket = filteredSalesForBI.length > 0 ? filteredSalesForBI.reduce((acc, s) => acc + s.total, 0) / filteredSalesForBI.length : 0;
  const salesForecast = currentMonthRevenue * 1.1; // Simple +10% forecast
  const conversionRate = 18.5; // Static for now

  // Seasonality Data (Real Aggregation)
  const seasonalityData = Array.from({ length: 12 }, (_, i) => {
    const monthSales = filteredSales.filter(s => isSameMonth(s.date, i, currentYear)).reduce((acc, s) => acc + s.total, 0);
    return {
      month: new Date(0, i).toLocaleString('pt-BR', { month: 'short' }),
      vendas: monthSales
    };
  });

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

  const customersBySegment = filteredCustomers.reduce((acc: any[], curr) => {
    const segment = normalizeString(curr.segment || '');
    const found = acc.find(a => a.name === segment);
    if (found) found.value += 1;
    else acc.push({ name: segment, value: 1 });
    return acc;
  }, []).sort((a, b) => b.value - a.value);

  const customersByCity = filteredCustomers.reduce((acc: any[], curr) => {
    const city = normalizeString(curr.city || '');
    const found = acc.find(a => a.name === city);
    if (found) found.value += 1;
    else acc.push({ name: city, value: 1 });
    return acc;
  }, []).sort((a, b) => b.value - a.value).slice(0, 10); // Top 10 cities

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Visão Geral</h2>
          <p className="text-slate-500">Acompanhe o desempenho da Gelo do Sertão em tempo real.</p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
          {onNavigate && (
            <button
              onClick={() => onNavigate('MENU_CONFIG')}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-all shadow-sm flex items-center gap-2"
            >
              <Globe size={16} /> Configurar Site
            </button>
          )}
          <div className="bg-white p-1 rounded-lg border border-slate-200 flex">
            <button
              onClick={() => setSelectedBranch('ALL')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedBranch === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Geral
            </button>
            <button
              onClick={() => setSelectedBranch(Branch.MATRIZ)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedBranch === Branch.MATRIZ ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Matriz
            </button>
            <button
              onClick={() => setSelectedBranch(Branch.FILIAL)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedBranch === Branch.FILIAL ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Filial
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card
          title="Receita (Mês)"
          value={formatCurrency(currentMonthRevenue)}
          icon={<TrendingUp />}
          trend={revenueTrend}
          color="bg-blue-600"
        />
        <Card
          title="A Receber (Fiado)"
          value={formatCurrency(currentMonthPending)}
          icon={<AlertTriangle />}
          trend={pendingTrend}
          color="bg-yellow-500"
        />
        <Card
          title="Despesas (Mês)"
          value={formatCurrency(currentMonthExpenses)}
          icon={<ArrowDownCircle />}
          trend={expenseTrend}
          color="bg-rose-500"
        />
        <Card
          title="Lucro Líquido (Mês)"
          value={formatCurrency(currentMonthProfit)}
          icon={<DollarSignIcon />}
          trend={profitTrend}
          color="bg-emerald-500"
        />
        <Card
          title="Vendas (Mês)"
          value={currentMonthSales.length.toString()}
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
              <LineChart data={revenueData}>
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
                    <h4 className="font-bold text-slate-700 mb-4">Top 10 Cidades</h4>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={customersByCity}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" fontSize={11} interval={0} angle={-45} textAnchor="end" height={60} />
                          <YAxis />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#82ca9d" radius={[4, 4, 0, 0]} name="Clientes" />
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