import React, { useState, useMemo } from 'react';
import { Sale, FinancialRecord, Product, Branch } from '../types';
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle, DollarSign, Download, FileSpreadsheet, Search, Filter, ArrowUpCircle, ArrowDownCircle, Calendar, Building2, CreditCard, Clock } from 'lucide-react';
import { getTodayDate } from '../services/utils';

interface ConciliacaoProps {
  sales: Sale[];
  financials: FinancialRecord[];
  products: Product[];
  onBack: () => void;
  onAddFinancialRecord: (records: FinancialRecord[]) => void;
}

interface Divergencia {
  id: string;
  date: string;
  customer: string;
  total: number;
  calculated: number;
  diff: number;
}

interface MissingFinancial {
  saleId: string;
  date: string;
  customer: string;
  amount: number;
  paymentMethod: string;
  branch: Branch;
}

interface OrphanIncome {
  financialId: string;
  date: string;
  description: string;
  amount: number;
}

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getTodayLocal = () => new Date().toISOString().split('T')[0];

const Conciliacao: React.FC<ConciliacaoProps> = ({ sales, financials, products, onBack, onAddFinancialRecord }) => {
  const [activeTab, setActiveTab] = useState<'resumo' | 'conciliacao' | 'fiado' | 'divergencias' | 'exportar'>('resumo');
  const [dateRange, setDateRange] = useState<'ALL_TIME' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'LAST_90_DAYS'>('THIS_MONTH');
  const [selectedBranch, setSelectedBranch] = useState<'ALL' | Branch>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const filterByDate = (dateString: string) => {
    if (!dateString || dateRange === 'ALL_TIME') return true;
    const today = new Date();
    const recordDate = new Date(dateString);
    if (dateRange === 'THIS_MONTH') {
      const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      return dateString.startsWith(prefix);
    }
    const past = new Date(today);
    past.setDate(today.getDate() - (dateRange === 'LAST_30_DAYS' ? 30 : 90));
    return recordDate >= past;
  };

  const filteredSales = useMemo(() =>
    sales.filter(s =>
      (selectedBranch === 'ALL' || s.branch === selectedBranch) &&
      filterByDate(s.date)
    ), [sales, selectedBranch, dateRange]);

  const filteredFinancials = useMemo(() =>
    financials.filter(f =>
      (selectedBranch === 'ALL' || f.branch === selectedBranch) &&
      filterByDate(f.date)
    ), [financials, selectedBranch, dateRange]);

  // Extract sale IDs from financial descriptions (pattern: #id or Venda #id)
  const extractSaleId = (desc: string): string | null => {
    const match = desc.match(/#([a-f0-9-]{8,})/i);
    return match ? match[1] : null;
  };

  // --- Reconciliation Data ---
  const reconciliation = useMemo(() => {
    const completedSales = filteredSales.filter(s =>
      s.status === 'Completed' || s.status === 'Finalizado pela Fábrica'
    );
    const pendingSales = filteredSales.filter(s => s.status === 'Pending');
    const cancelledSales = filteredSales.filter(s => s.status === 'Cancelled');
    const incomeRecords = filteredFinancials.filter(f => f.type === 'Income');
    const expenseRecords = filteredFinancials.filter(f => f.type === 'Expense');

    // Map financial records to sale IDs
    const financialSaleIds = new Set<string>();
    const orphanIncomes: OrphanIncome[] = [];
    incomeRecords.forEach(f => {
      const saleId = extractSaleId(f.description);
      if (saleId) {
        financialSaleIds.add(saleId);
      } else if (!f.category?.toLowerCase().includes('venda')) {
        orphanIncomes.push({
          financialId: f.id,
          date: f.date,
          description: f.description,
          amount: f.amount,
        });
      }
    });

    // Completed sales without matching financial record
    const missingFinancial: MissingFinancial[] = [];
    completedSales.forEach(s => {
      if (!financialSaleIds.has(s.id)) {
        missingFinancial.push({
          saleId: s.id,
          date: s.date,
          customer: s.customerName,
          amount: s.total,
          paymentMethod: s.paymentMethod,
          branch: s.branch,
        });
      }
    });

    // Duplicates by date+customer+total
    const seen = new Map<string, Sale[]>();
    const duplicates: Sale[][] = [];
    filteredSales.forEach(s => {
      const key = `${s.date}_${s.customerName}_${s.total.toFixed(2)}`;
      if (seen.has(key)) {
        seen.get(key)!.push(s);
        if (seen.get(key)!.length === 2) duplicates.push(seen.get(key)!);
      } else {
        seen.set(key, [s]);
      }
    });

    // Duplicate financial records (same sale ID in description)
    const financialCounts = new Map<string, number>();
    incomeRecords.forEach(f => {
      const id = extractSaleId(f.description);
      if (id) financialCounts.set(id, (financialCounts.get(id) || 0) + 1);
    });
    const duplicatedFinancials = Array.from(financialCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([id, count]) => ({
        saleId: id,
        count,
        records: incomeRecords.filter(f => extractSaleId(f.description) === id),
      }));

    // Totals
    const totalRevenue = completedSales.reduce((acc, s) => acc + s.total, 0);
    const totalFinancialIncome = incomeRecords
      .filter(f => f.category?.toLowerCase().includes('venda') || financialSaleIds.has(extractSaleId(f.description) || ''))
      .reduce((acc, f) => acc + f.amount, 0);
    const totalExpenses = expenseRecords.reduce((acc, f) => acc + f.amount, 0);
    const totalPending = pendingSales.reduce((acc, s) => acc + s.total, 0);
    const totalPaidInPending = pendingSales.reduce((acc, s) => acc + (s.amountPaid || 0), 0);
    const totalCancelled = cancelledSales.reduce((acc, s) => acc + s.total, 0);

    return {
      completedSales,
      pendingSales,
      cancelledSales,
      incomeRecords,
      expenseRecords,
      missingFinancial,
      orphanIncomes,
      duplicates,
      duplicatedFinancials,
      totalRevenue,
      totalFinancialIncome,
      totalExpenses,
      totalPending,
      totalPaidInPending,
      totalCancelled,
      revenueDiff: totalRevenue - totalFinancialIncome,
    };
  }, [filteredSales, filteredFinancials]);

  // --- Divergências (Item Sum vs Total) ---
  const divergencias = useMemo(() => {
    const result: Divergencia[] = [];
    const targetSales = reconciliation.completedSales;
    targetSales.forEach(s => {
      let sum = 0;
      (s.items || []).forEach(i => sum += i.quantity * i.priceAtSale);
      sum += s.deliveryFee || 0;
      const diff = sum - s.total;
      if (Math.abs(diff) > 0.05) {
        result.push({
          id: s.id.substring(0, 8),
          date: s.date,
          customer: s.customerName,
          total: s.total,
          calculated: sum,
          diff,
        });
      }
    });
    result.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return result;
  }, [reconciliation.completedSales]);

  // Create missing financial records for selected sales
  const handleCreateFinancialRecords = async (items: MissingFinancial[]) => {
    const newRecords: FinancialRecord[] = items.map(s => ({
      id: crypto.randomUUID(),
      date: s.date,
      description: `Venda #${s.saleId} - ${s.customer} (conciliado)`,
      amount: s.amount,
      type: 'Income',
      category: 'Vendas',
      branch: s.branch,
      paymentMethod: s.paymentMethod as any,
    }));
    onAddFinancialRecord(newRecords);
    setSuccessMsg(`${newRecords.length} registro(s) financeiro(s) criado(s) com sucesso!`);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleCreateSingleRecord = (item: MissingFinancial) => {
    handleCreateFinancialRecords([item]);
  };

  // Export CSV
  const exportCSV = () => {
    const rows = [['Data', 'Cliente', 'Valor', 'Status', 'Divergência']];
    divergencias.forEach(d => {
      rows.push([d.date, d.customer, d.total.toFixed(2), 'Item vs Total', d.diff.toFixed(2)]);
    });
    reconciliation.missingFinancial.forEach(m => {
      rows.push([m.date, m.customer, m.amount.toFixed(2), 'Sem registro financeiro', '0']);
    });
    reconciliation.pendingSales.forEach(s => {
      rows.push([s.date, s.customerName, s.total.toFixed(2), 'Fiado', '0']);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conciliacao_${getTodayLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // === TABS ===
  const tabClass = (tab: string) =>
    `px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition-all whitespace-nowrap ${
      activeTab === tab ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div className="flex flex-col h-full flex-1 overflow-y-auto bg-gray-50 w-full pb-20 md:pb-6 custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors shrink-0">
            <ArrowLeft size={24} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">Conciliação Financeira</h2>
            <p className="text-xs md:text-sm text-slate-500">Auditoria e reconciliação de vendas, financeiro e divergências.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="bg-white p-1 rounded-lg border border-slate-200 flex shrink-0">
            <button onClick={() => setSelectedBranch('ALL')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Geral</button>
            <button onClick={() => setSelectedBranch(Branch.MATRIZ)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === Branch.MATRIZ ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Matriz</button>
            <button onClick={() => setSelectedBranch(Branch.FILIAL)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === Branch.FILIAL ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Filial</button>
          </div>

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white outline-none cursor-pointer"
          >
            <option value="THIS_MONTH">Este Mês</option>
            <option value="LAST_30_DAYS">Últimos 30 Dias</option>
            <option value="LAST_90_DAYS">Últimos 90 Dias</option>
            <option value="ALL_TIME">Todo o Período</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex justify-center overflow-x-auto pb-4">
        <div className="bg-slate-200 p-1 rounded-xl flex shrink-0 gap-1">
          <button onClick={() => setActiveTab('resumo')} className={tabClass('resumo')}>
            <span className="hidden sm:inline">Resumo</span><span className="sm:hidden">Resumo</span>
          </button>
          <button onClick={() => setActiveTab('conciliacao')} className={tabClass('conciliacao')}>
            Conciliação {reconciliation.missingFinancial.length > 0 && `(${reconciliation.missingFinancial.length})`}
          </button>
          <button onClick={() => setActiveTab('fiado')} className={tabClass('fiado')}>
            Fiado {reconciliation.pendingSales.length > 0 && `(${reconciliation.pendingSales.length})`}
          </button>
          <button onClick={() => setActiveTab('divergencias')} className={tabClass('divergencias')}>
            Divergências {divergencias.length > 0 && `(${divergencias.length})`}
          </button>
          <button onClick={() => setActiveTab('exportar')} className={tabClass('exportar')}>Exportar</button>
        </div>
      </div>

      {/* Success Toast */}
      {successMsg && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white py-3 px-6 rounded-2xl shadow-2xl z-50 text-sm font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle size={18} /> {successMsg}
        </div>
      )}

      {/* === TAB: RESUMO === */}
      {activeTab === 'resumo' && (
        <div className="space-y-6 animate-in fade-in">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <DollarSign size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Receita (Vendas)</p>
                  <p className="text-lg font-black text-slate-800">{formatCurrency(reconciliation.totalRevenue)}</p>
                  <p className="text-[10px] text-slate-400">{reconciliation.completedSales.length} vendas concluídas</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <ArrowUpCircle size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Receita (Financeiro)</p>
                  <p className="text-lg font-black text-slate-800">{formatCurrency(reconciliation.totalFinancialIncome)}</p>
                </div>
              </div>
              <div className={`text-xs font-bold flex items-center gap-1 ${
                Math.abs(reconciliation.revenueDiff) < 0.01 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {Math.abs(reconciliation.revenueDiff) < 0.01 ? (
                  <><CheckCircle size={12} /> Conciliado</>
                ) : (
                  <><AlertTriangle size={12} /> Diferença: {formatCurrency(reconciliation.revenueDiff)}</>
                )}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Clock size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fiado</p>
                  <p className="text-lg font-black text-slate-800">{formatCurrency(reconciliation.totalPending)}</p>
                  <p className="text-[10px] text-slate-400">{reconciliation.pendingSales.length} pendentes</p>
                </div>
              </div>
              {reconciliation.totalPaidInPending > 0 && (
                <p className="text-xs text-slate-500">Pago: {formatCurrency(reconciliation.totalPaidInPending)}</p>
              )}
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <ArrowDownCircle size={20} className="text-rose-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Despesas</p>
                  <p className="text-lg font-black text-slate-800">{formatCurrency(reconciliation.totalExpenses)}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {reconciliation.expenseRecords.length} registros
              </p>
            </div>
          </div>

          {/* Alert Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {reconciliation.missingFinancial.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl">
                <div className="flex items-start gap-3">
                  <XCircle size={24} className="text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-800">Vendas sem Registro Financeiro</h4>
                    <p className="text-sm text-rose-700 mt-1">
                      {reconciliation.missingFinancial.length} venda(s) concluída(s) sem lançamento no financeiro.
                    </p>
                    <button
                      onClick={() => setActiveTab('conciliacao')}
                      className="mt-3 text-xs font-bold bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors"
                    >
                      Ver e Conciliar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {divergencias.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={24} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-amber-800">Divergências em Itens vs Total</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      {divergencias.length} venda(s) com valor divergente entre itens e total.
                    </p>
                    <button
                      onClick={() => setActiveTab('divergencias')}
                      className="mt-3 text-xs font-bold bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors"
                    >
                      Ver Detalhes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {reconciliation.duplicates.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 p-5 rounded-2xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={24} className="text-purple-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-purple-800">Vendas Duplicadas</h4>
                    <p className="text-sm text-purple-700 mt-1">
                      {reconciliation.duplicates.length} possível(eis) duplicata(s) de venda (mesma data, cliente e valor).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {reconciliation.missingFinancial.length === 0 && divergencias.length === 0 && reconciliation.duplicates.length === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl lg:col-span-3">
                <div className="flex items-center gap-3">
                  <CheckCircle size={24} className="text-emerald-500" />
                  <div>
                    <h4 className="font-bold text-emerald-800">Tudo Ok!</h4>
                    <p className="text-sm text-emerald-700">Nenhuma divergência encontrada no período selecionado.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Totals Summary */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-4">Comparativo: Vendas vs Financeiro</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Total de Vendas Concluídas</span>
                <span className="font-bold text-emerald-600">{formatCurrency(reconciliation.totalRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Total de Receitas no Financeiro (Vendas)</span>
                <span className="font-bold text-blue-600">{formatCurrency(reconciliation.totalFinancialIncome)}</span>
              </div>
              <div className={`flex justify-between items-center py-2 text-sm font-bold ${
                Math.abs(reconciliation.revenueDiff) < 0.01 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                <span>Diferença</span>
                <span>{formatCurrency(reconciliation.revenueDiff)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Vendas Canceladas</span>
                <span className="font-bold text-slate-500">{formatCurrency(reconciliation.totalCancelled)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-slate-600">Total de Despesas</span>
                <span className="font-bold text-rose-600">{formatCurrency(reconciliation.totalExpenses)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === TAB: CONCILIAÇÃO === */}
      {activeTab === 'conciliacao' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Missing Financial Records */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-3">
              <div>
                <h3 className="font-bold text-slate-700">Vendas sem Registro Financeiro</h3>
                <p className="text-xs text-slate-500">{reconciliation.missingFinancial.length} venda(s) concluída(s) sem lançamento</p>
              </div>
              {reconciliation.missingFinancial.length > 0 && (
                <button
                  onClick={() => handleCreateFinancialRecords(reconciliation.missingFinancial)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle size={14} /> Criar Todos os Registros
                </button>
              )}
            </div>

            {reconciliation.missingFinancial.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
                <CheckCircle size={18} className="text-emerald-500" /> Todas as vendas estão conciliadas com o financeiro.
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase font-bold">
                      <th className="text-left p-3">Data</th>
                      <th className="text-left p-3">Cliente</th>
                      <th className="text-right p-3">Valor</th>
                      <th className="text-center p-3">Pagamento</th>
                      <th className="text-center p-3">Filial</th>
                      <th className="text-center p-3">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reconciliation.missingFinancial.map((item) => (
                      <tr key={item.saleId} className="hover:bg-rose-50/50 transition-colors">
                        <td className="p-3 text-slate-600">{item.date}</td>
                        <td className="p-3 font-medium text-slate-800">{item.customer}</td>
                        <td className="p-3 text-right font-bold text-slate-800">{formatCurrency(item.amount)}</td>
                        <td className="p-3 text-center">
                          <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600">{item.paymentMethod}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-[10px] px-2 py-1 rounded ${
                            item.branch === Branch.MATRIZ ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                          }`}>
                            {item.branch === Branch.MATRIZ ? 'Matriz' : 'Filial'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleCreateSingleRecord(item)}
                            className="text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            + Financeiro
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Duplicated Financial Records */}
          {reconciliation.duplicatedFinancials.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-700">Registros Financeiros Duplicados</h3>
                <p className="text-xs text-slate-500">{reconciliation.duplicatedFinancials.length} venda(s) com múltiplos registros</p>
              </div>
              <div className="divide-y divide-slate-100">
                {reconciliation.duplicatedFinancials.map((d) => (
                  <div key={d.saleId} className="p-4">
                    <p className="font-bold text-sm text-slate-700">Venda #{d.saleId.substring(0, 8)}</p>
                    <div className="mt-2 space-y-1">
                      {d.records.map((r) => (
                        <div key={r.id} className="flex justify-between text-sm text-slate-600 bg-slate-50 p-2 rounded">
                          <span>{r.description}</span>
                          <span className="font-bold">{formatCurrency(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === TAB: FIADO === */}
      {activeTab === 'fiado' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Total em Aberto</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{formatCurrency(reconciliation.totalPending)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Total Já Pago</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(reconciliation.totalPaidInPending)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Saldo Restante</p>
              <p className="text-2xl font-black text-amber-600 mt-1">
                {formatCurrency(reconciliation.totalPending - reconciliation.totalPaidInPending)}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-700">Vendas Pendentes (Fiado)</h3>
              <p className="text-xs text-slate-500">{reconciliation.pendingSales.length} venda(s)</p>
            </div>

            {reconciliation.pendingSales.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                Nenhuma venda pendente no período.
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase font-bold">
                      <th className="text-left p-3">Data</th>
                      <th className="text-left p-3">Cliente</th>
                      <th className="text-right p-3">Total</th>
                      <th className="text-right p-3">Pago</th>
                      <th className="text-right p-3">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reconciliation.pendingSales.map((s) => {
                      const paid = s.amountPaid || 0;
                      const remaining = s.total - paid;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-slate-600">{s.date}</td>
                          <td className="p-3 font-medium text-slate-800">{s.customerName}</td>
                          <td className="p-3 text-right font-bold text-slate-800">{formatCurrency(s.total)}</td>
                          <td className="p-3 text-right font-bold text-emerald-600">{formatCurrency(paid)}</td>
                          <td className="p-3 text-right font-bold text-amber-600">{formatCurrency(remaining)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === TAB: DIVERGÊNCIAS === */}
      {activeTab === 'divergencias' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-700">Divergências entre Itens e Total</h3>
              <p className="text-xs text-slate-500">
                {divergencias.length} venda(s) onde a soma dos itens não bate com o total
                {divergencias.length > 0 && ` (maior diferença: ${formatCurrency(Math.abs(divergencias[0]?.diff || 0))})`}
              </p>
            </div>

            {divergencias.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
                <CheckCircle size={18} className="text-emerald-500" /> Nenhuma divergência encontrada.
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase font-bold">
                      <th className="text-left p-3">ID</th>
                      <th className="text-left p-3">Data</th>
                      <th className="text-left p-3">Cliente</th>
                      <th className="text-right p-3">Total no DB</th>
                      <th className="text-right p-3">Calculado</th>
                      <th className="text-right p-3">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {divergencias.map((d) => (
                      <tr key={d.id} className={`hover:bg-slate-50 transition-colors ${d.diff > 0 ? 'bg-amber-50/50' : 'bg-rose-50/50'}`}>
                        <td className="p-3 text-xs font-mono text-slate-500">{d.id}</td>
                        <td className="p-3 text-slate-600">{d.date}</td>
                        <td className="p-3 font-medium text-slate-800">{d.customer}</td>
                        <td className="p-3 text-right font-bold text-slate-800">{formatCurrency(d.total)}</td>
                        <td className="p-3 text-right font-bold text-slate-600">{formatCurrency(d.calculated)}</td>
                        <td className={`p-3 text-right font-bold ${d.diff > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {d.diff > 0 ? '+' : ''}{formatCurrency(d.diff)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Duplicates */}
          {reconciliation.duplicates.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-700">Possíveis Vendas Duplicadas</h3>
                <p className="text-xs text-slate-500">{reconciliation.duplicates.length} caso(s) com mesma data, cliente e valor</p>
              </div>
              <div className="divide-y divide-slate-100">
                {reconciliation.duplicates.map((pair, idx) => (
                  <div key={idx} className="p-4">
                    <p className="text-xs text-slate-500 mb-2">
                      {pair[0].date} - {pair[0].customerName} - {formatCurrency(pair[0].total)}
                    </p>
                    <div className="flex gap-3">
                      {pair.map((s) => (
                        <div key={s.id} className="flex-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <p className="text-xs font-mono text-slate-500">ID: {s.id.substring(0, 8)}</p>
                          <p className="text-sm font-bold text-slate-700">{s.status}</p>
                          {s.paymentMethod && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{s.paymentMethod}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === TAB: EXPORTAR === */}
      {activeTab === 'exportar' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <FileSpreadsheet size={24} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Exportar CSV</h3>
                  <p className="text-xs text-slate-500">Relatório completo de conciliação</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Inclui todas as divergências, vendas sem registro financeiro e vendas pendentes (fiado).
              </p>
              <button
                onClick={exportCSV}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Download size={18} /> Baixar CSV
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <CheckCircle size={24} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Resumo Rápido</h3>
                  <p className="text-xs text-slate-500">Informações consolidadas</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Vendas Concluídas:</span><span className="font-bold">{reconciliation.completedSales.length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Receita:</span><span className="font-bold text-emerald-600">{formatCurrency(reconciliation.totalRevenue)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Sem Registro Financeiro:</span><span className="font-bold text-rose-600">{reconciliation.missingFinancial.length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Divergências:</span><span className="font-bold text-amber-600">{divergencias.length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Fiado (aberto):</span><span className="font-bold text-amber-600">{formatCurrency(reconciliation.totalPending - reconciliation.totalPaidInPending)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Conciliacao;
