
import React, { useState, useMemo } from 'react';
import { Sale, Product, Customer, Branch } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Calendar, Filter, Download, DollarSign, TrendingUp, Users, ShoppingBag, CreditCard, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { getTodayDate } from '../services/utils';

interface ReportsProps {
    sales: Sale[];
    products: Product[];
    customers: Customer[];
    onBack?: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Reports: React.FC<ReportsProps> = ({ sales, products, customers, onBack }) => {
    const [activeTab, setActiveTab] = useState<'SALES_LIST' | 'SALES_ANALYSIS' | 'PRODUCTS' | 'CUSTOMERS'>('SALES_ANALYSIS');

    // Filters
    const [dateRange, setDateRange] = useState<'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'CUSTOM'>('THIS_MONTH');
    const [customStartDate, setCustomStartDate] = useState(getTodayDate());
    const [customEndDate, setCustomEndDate] = useState(getTodayDate());
    const [selectedBranch, setSelectedBranch] = useState<'ALL' | Branch>('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    // Helpers
    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const getFilteredSales = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        return sales.filter(s => {
            // 1. Branch Filter
            if (selectedBranch !== 'ALL' && s.branch !== selectedBranch) return false;

            // 2. Date Filter
            if (!s.date) return false;
            const d = new Date(s.date);

            // Fix timezone for string comparison if needed, but simple YYYY-MM checks work for local dates usually
            // Assuming s.date is YYYY-MM-DD string
            const [sYear, sMonth, sDay] = s.date.split('-').map(Number);

            if (dateRange === 'THIS_MONTH') {
                return sMonth === currentMonth + 1 && sYear === currentYear;
            }
            if (dateRange === 'LAST_MONTH') {
                return sMonth === lastMonth + 1 && sYear === lastMonthYear;
            }
            if (dateRange === 'LAST_30_DAYS') {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(now.getDate() - 30);
                const saleDate = new Date(sYear, sMonth - 1, sDay);
                return saleDate >= thirtyDaysAgo && saleDate <= now;
            }
            if (dateRange === 'CUSTOM') {
                return s.date >= customStartDate && s.date <= customEndDate;
            }

            return true;
        }).sort((a, b) => b.date.localeCompare(a.date)); // Sort Descending
    }, [sales, dateRange, customStartDate, customEndDate, selectedBranch]);

    // --- ANALYTICS DATA ---

    // 1. Sales by Payment Method
    const salesByPaymentMethod = useMemo(() => {
        const data: Record<string, number> = {};
        getFilteredSales.forEach(s => {
            if (s.status !== 'Completed') return;

            if (s.paymentMethod === 'Split' && s.paymentSplits) {
                s.paymentSplits.forEach(split => {
                    data[split.method] = (data[split.method] || 0) + split.amount;
                });
            } else {
                const method = s.paymentMethod === 'Credit' ? 'Crédito'
                    : s.paymentMethod === 'Debit' ? 'Débito'
                        : s.paymentMethod === 'Cash' ? 'Dinheiro'
                            : s.paymentMethod;
                data[method] = (data[method] || 0) + s.total;
            }
        });

        return Object.entries(data).map(([name, value]) => ({ name, value }));
    }, [getFilteredSales]);

    // 2. Sales by Day (Line Chart)
    const salesByDay = useMemo(() => {
        const data: Record<string, number> = {};
        getFilteredSales.forEach(s => {
            if (s.status !== 'Completed') return;
            const dateKey = s.date.split('-').reverse().slice(0, 2).join('/'); // DD/MM
            data[dateKey] = (data[dateKey] || 0) + s.total;
        });

        return Object.entries(data)
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => {
                // Sort by comparing original date strings would be better, but keys are MM/DD
                // Let's rely on the already sorted getFilteredSales but we aggregated...
                // Re-sorting by simplified date
                return 0;
            }).reverse(); // getFilteredSales is desc, so reverse to asc for chart? 
        // actually let's just allow it or sort properly if needed.
    }, [getFilteredSales]);

    // Correct sorting for chart (Chronological)
    const salesByDaySorted = useMemo(() => {
        return [...salesByDay].reverse();
    }, [salesByDay]);


    // 3. Sales by Day of Week (Bar Chart)
    const salesByWeekDay = useMemo(() => {
        const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const data = new Array(7).fill(0);

        getFilteredSales.forEach(s => {
            if (s.status !== 'Completed') return;
            const [y, m, d] = s.date.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            data[date.getDay()] += s.total;
        });

        return days.map((day, index) => ({ name: day, value: data[index] }));
    }, [getFilteredSales]);

    // 4. Top Products
    const topProducts = useMemo(() => {
        const productSales: Record<string, { name: string, qty: number, total: number }> = {};

        getFilteredSales.forEach(s => {
            if (s.status !== 'Completed') return;
            s.items.forEach(item => {
                if (!productSales[item.productId]) {
                    productSales[item.productId] = { name: item.productName, qty: 0, total: 0 };
                }
                productSales[item.productId].qty += item.quantity;
                productSales[item.productId].total += (item.quantity * item.priceAtSale);
            });
        });

        return Object.values(productSales)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
    }, [getFilteredSales]);

    // 5. Sales List (Searchable)
    const salesList = useMemo(() => {
        if (!searchTerm) return getFilteredSales;
        const term = searchTerm.toLowerCase();
        return getFilteredSales.filter(s =>
            s.customerName.toLowerCase().includes(term) ||
            s.id.includes(term) ||
            s.items.some(i => i.productName.toLowerCase().includes(term))
        );
    }, [getFilteredSales, searchTerm]);

    // Calculate Totals for Summary Cards
    const totalRevenue = getFilteredSales.filter(s => s.status === 'Completed').reduce((acc, s) => acc + s.total, 0);
    const totalticket = getFilteredSales.filter(s => s.status === 'Completed').length > 0
        ? totalRevenue / getFilteredSales.filter(s => s.status === 'Completed').length
        : 0;
    const totalItemsSold = getFilteredSales.filter(s => s.status === 'Completed').reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0);
    const bestDay = salesByDay.sort((a, b) => b.amount - a.amount)[0];

    const exportToCSV = () => {
        // Header
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "ID,Data,Cliente,Filial,Status,Pagamento,Total,Itens\n";

        // Rows
        getFilteredSales.forEach(s => {
            const itemsStr = s.items.map(i => `${i.quantity}x ${i.productName}`).join(' | ');
            const row = `${s.id},${s.date},${s.customerName},${s.branch},${s.status},${s.paymentMethod},${s.total.toFixed(2)},"${itemsStr}"`;
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.href = encodedUri;
        link.download = `vendas_relatorio_${getTodayDate()}.csv`;
        link.click();
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">

            {/* Header & Controls */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="text-blue-600" /> Relatórios Detalhados
                    </h2>
                    <p className="text-slate-500 text-sm">Análise profunda de vendas e performance.</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {/* Branch */}
                    <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value as any)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 font-medium"
                    >
                        <option value="ALL">Todas as Filiais</option>
                        <option value={Branch.MATRIZ}>Matriz</option>
                        <option value={Branch.FILIAL}>Filial</option>
                    </select>

                    {/* Date Range */}
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value as any)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 font-medium"
                    >
                        <option value="THIS_MONTH">Este Mês</option>
                        <option value="LAST_MONTH">Mês Passado</option>
                        <option value="LAST_30_DAYS">Últimos 30 Dias</option>
                        <option value="CUSTOM">Personalizado</option>
                    </select>

                    {dateRange === 'CUSTOM' && (
                        <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-slate-50">
                            <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="bg-transparent text-sm outline-none px-1" />
                            <span>-</span>
                            <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="bg-transparent text-sm outline-none px-1" />
                        </div>
                    )}

                    <button onClick={exportToCSV} className="p-2 text-slate-600 hover:text-blue-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" title="Exportar CSV">
                        <Download size={20} />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                    <div>
                        <p className="text-slate-500 text-sm font-medium">Faturamento Total</p>
                        <h3 className="text-2xl font-bold text-blue-900">{formatCurrency(totalRevenue)}</h3>
                    </div>
                    <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                        <DollarSign size={24} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                    <div>
                        <p className="text-slate-500 text-sm font-medium">Ticket Médio</p>
                        <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(totalticket)}</h3>
                    </div>
                    <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
                        <ShoppingBag size={24} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                    <div>
                        <p className="text-slate-500 text-sm font-medium">Vendas Realizadas</p>
                        <h3 className="text-2xl font-bold text-slate-800">{getFilteredSales.filter(s => s.status === 'Completed').length}</h3>
                    </div>
                    <div className="bg-purple-100 p-3 rounded-full text-purple-600">
                        <Users size={24} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                    <div>
                        <p className="text-slate-500 text-sm font-medium">Melhor Dia</p>
                        <h3 className="text-lg font-bold text-slate-800">{bestDay ? bestDay.date : '-'}</h3>
                        <p className="text-xs text-green-600 font-bold">{bestDay ? formatCurrency(bestDay.amount) : '-'}</p>
                    </div>
                    <div className="bg-orange-100 p-3 rounded-full text-orange-600">
                        <Calendar size={24} />
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('SALES_ANALYSIS')}
                    className={`px-4 py-2 font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'SALES_ANALYSIS' ? 'bg-white text-blue-600 border-x border-t border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <TrendingUp size={16} className="inline mr-2" /> Análise Gráfica
                </button>
                <button
                    onClick={() => setActiveTab('SALES_LIST')}
                    className={`px-4 py-2 font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'SALES_LIST' ? 'bg-white text-blue-600 border-x border-t border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <ShoppingBag size={16} className="inline mr-2" /> Todas as Vendas
                </button>
                <button
                    onClick={() => setActiveTab('PRODUCTS')}
                    className={`px-4 py-2 font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'PRODUCTS' ? 'bg-white text-blue-600 border-x border-t border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Filter size={16} className="inline mr-2" /> Produtos Top
                </button>
            </div>

            {/* CONTENT */}
            <div className="bg-white rounded-b-xl rounded-r-xl shadow-sm border border-t-0 border-slate-200 p-6 min-h-[400px]">

                {/* TAB: ANALYSIS */}
                {activeTab === 'SALES_ANALYSIS' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Chart 1: Daily Revenue */}
                        <div className="lg:col-span-2 space-y-4">
                            <h3 className="font-bold text-slate-700">Faturamento Diário</h3>
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={salesByDaySorted}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" fontSize={12} tickLine={false} />
                                        <YAxis fontSize={12} tickLine={false} tickFormatter={(val) => `R$${val}`} />
                                        <RechartsTooltip formatter={(val: number) => formatCurrency(val)} />
                                        <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Chart 2: Week Day */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-700">Vendas por Dia da Semana</h3>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={salesByWeekDay}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" fontSize={11} tickLine={false} />
                                        <YAxis fontSize={12} tickLine={false} />
                                        <RechartsTooltip formatter={(val: number) => formatCurrency(val)} />
                                        <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Chart 3: Payment Methods */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-700">Meios de Pagamento</h3>
                            <div className="h-72 w-full flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={salesByPaymentMethod}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {salesByPaymentMethod.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(val: number) => formatCurrency(val)} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: SALES LIST */}
                {activeTab === 'SALES_LIST' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="relative w-full max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar por cliente ou ID..."
                                    className="pl-10 pr-4 py-2 w-full border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <span className="text-sm text-slate-500 font-medium">
                                Mostrando {salesList.length} registros
                            </span>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-xs">
                                    <tr>
                                        <th className="p-3">Data</th>
                                        <th className="p-3">ID</th>
                                        <th className="p-3">Cliente</th>
                                        <th className="p-3">Filial</th>
                                        <th className="p-3">Pagamento</th>
                                        <th className="p-3 text-right">Total</th>
                                        <th className="p-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {salesList.map(sale => (
                                        <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-3 text-slate-600">{sale.date.split('-').reverse().join('/')}</td>
                                            <td className="p-3 font-mono text-xs text-slate-400">{sale.id.slice(0, 8)}...</td>
                                            <td className="p-3 font-bold text-slate-700">{sale.customerName}</td>
                                            <td className="p-3 text-slate-600 text-xs">
                                                <span className={`px-2 py-1 rounded ${sale.branch === Branch.MATRIZ ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                                                    {sale.branch === Branch.MATRIZ ? 'Matriz' : 'Filial'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-slate-600">{sale.paymentMethod}</td>
                                            <td className="p-3 text-right font-bold text-slate-800">{formatCurrency(sale.total)}</td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${sale.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                        sale.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-red-100 text-red-700'
                                                    }`}>
                                                    {sale.status === 'Completed' ? 'Concluído' : sale.status === 'Pending' ? 'Pendente' : 'Cancelado'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {salesList.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-slate-400">Nenhuma venda encontrada no período.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB: PRODUCTS */}
                {activeTab === 'PRODUCTS' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-700">Top 10 Produtos (Receita)</h3>
                            <div className="space-y-2">
                                {topProducts.map((p, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg hover:shadow-md transition-shadow">
                                        <span className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${i < 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>
                                            #{i + 1}
                                        </span>
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-800">{p.name}</p>
                                            <p className="text-xs text-slate-500">{p.qty} unidades vendidas</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-blue-600">{formatCurrency(p.total)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                            <h3 className="font-bold text-slate-700 mb-4">Curva ABC (Participação)</h3>
                            <div className="h-96 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={topProducts}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={100}
                                            dataKey="total"
                                        >
                                            {topProducts.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(val: number) => formatCurrency(val)} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default Reports;
