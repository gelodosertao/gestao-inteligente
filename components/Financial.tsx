import React, { useState, useMemo } from 'react';
import { FinancialRecord, Branch, Sale, Product, CategoryItem, CashClosing, User } from '../types';
import { dbCategories } from '../services/db';
import { ArrowUpCircle, ArrowDownCircle, X, Plus, Calendar, DollarSign, Repeat, ArrowLeft, Building2, BarChart3, LineChart, Filter, Trash2, Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { getTodayDate } from '../services/utils';

interface FinancialProps {
   records: FinancialRecord[];
   sales: Sale[];
   products: Product[];
   cashClosings: CashClosing[];
   onAddRecord: (records: FinancialRecord[]) => void;
   onUpdateRecord: (record: FinancialRecord) => void;
   onDeleteRecord: (id: string) => void;
   onAddCashClosing: (closing: CashClosing) => void;
   onDeleteCashClosing: (id: string) => void;
   currentUser: User | null;
   onBack: () => void;
}

const Financial: React.FC<FinancialProps> = ({ records, sales, products, cashClosings, onAddRecord, onUpdateRecord, onDeleteRecord, onAddCashClosing, onDeleteCashClosing, currentUser, onBack }) => {

   const [showAddModal, setShowAddModal] = useState(false);
   const [viewMode, setViewMode] = useState<'CASH_FLOW' | 'DRE' | 'CASH_CLOSING'>('CASH_FLOW');
   const [selectedBranch, setSelectedBranch] = useState<'ALL' | Branch>('ALL');
   const [dateRange, setDateRange] = useState('THIS_MONTH'); // Simplified for now

   // Cash Closing State
   const [closingDate, setClosingDate] = useState(getTodayDate());
   const [closingBranch, setClosingBranch] = useState<Branch>(Branch.FILIAL);
   const [openingBalance, setOpeningBalance] = useState<number>(0);
   const [cashInDrawer, setCashInDrawer] = useState<number>(0);
   const [closingNotes, setClosingNotes] = useState('');

   // Form State - Defaulted to Expense, removed logic to switch to Income in UI
   const [newRecord, setNewRecord] = useState<Partial<FinancialRecord>>({
      type: 'Expense',
      date: getTodayDate(),
      category: 'Fornecedores',
      branch: Branch.MATRIZ
   });
   const [isRecurring, setIsRecurring] = useState(false);
   const [installments, setInstallments] = useState(2); // Default to 2 if recurring
   const [categories, setCategories] = useState<CategoryItem[]>([]);
   const [showCategoryModal, setShowCategoryModal] = useState(false);
   const [newCategoryName, setNewCategoryName] = useState('');

   React.useEffect(() => {
      loadCategories();
   }, []);

   const loadCategories = () => {
      dbCategories.getAll('FINANCIAL')
         .then(setCategories)
         .catch(err => console.error("Erro ao carregar categorias", err));
   };

   const handleAddCategory = async () => {
      if (!newCategoryName.trim()) return;
      try {
         await dbCategories.add({ name: newCategoryName, type: 'FINANCIAL' });
         setNewCategoryName('');
         loadCategories();
      } catch (error) {
         console.error("Erro ao adicionar categoria", error);
         alert("Erro ao adicionar categoria. Verifique se já existe.");
      }
   };

   const handleDeleteCategory = async (id: string) => {
      if (!confirm("Tem certeza que deseja excluir esta categoria?")) return;
      try {
         await dbCategories.delete(id);
         loadCategories();
      } catch (error) {
         console.error("Erro ao excluir categoria", error);
      }
   };

   // --- FILTERING ---
   const filterByDate = (dateString: string) => {
      if (dateRange === 'ALL_TIME') return true;
      const date = new Date(dateString);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
   };

   const filteredRecords = records.filter(r => (selectedBranch === 'ALL' || r.branch === selectedBranch) && filterByDate(r.date));
   const filteredSales = sales.filter(s => (selectedBranch === 'ALL' || s.branch === selectedBranch) && filterByDate(s.date));

   // --- CASH CLOSING CALCULATIONS ---
   const closingData = useMemo(() => {
      const daySales = sales.filter(s => s.date === closingDate && s.branch === closingBranch && s.status === 'Completed');
      const dayExpenses = records.filter(r => r.date === closingDate && r.branch === closingBranch && r.type === 'Expense');

      const totalIncome = daySales.reduce((acc, s) => acc + s.total, 0);
      const totalExpense = dayExpenses.reduce((acc, r) => acc + r.amount, 0);

      const byMethod = {
         Pix: daySales.filter(s => s.paymentMethod === 'Pix').reduce((acc, s) => acc + s.total, 0),
         Credit: daySales.filter(s => s.paymentMethod === 'Credit').reduce((acc, s) => acc + s.total, 0),
         Debit: daySales.filter(s => s.paymentMethod === 'Debit').reduce((acc, s) => acc + s.total, 0),
         Cash: daySales.filter(s => s.paymentMethod === 'Cash').reduce((acc, s) => acc + s.total, 0),
      };

      // Expected Cash in Drawer = Opening + Cash Sales - Expenses (Assuming expenses are paid in cash if not specified, usually safe for small business)
      const expectedCash = openingBalance + byMethod.Cash - totalExpense;
      const difference = cashInDrawer - expectedCash;

      return {
         totalIncome,
         totalExpense,
         byMethod,
         expectedCash,
         difference
      };
   }, [sales, records, closingDate, closingBranch, openingBalance, cashInDrawer]);

   const handleSaveClosing = () => {
      if (!currentUser) return;

      const newClosing: CashClosing = {
         id: `cc-${Date.now()}`,
         date: closingDate,
         branch: closingBranch,
         openingBalance,
         totalIncome: closingData.totalIncome,
         totalExpense: closingData.totalExpense,
         totalByPaymentMethod: closingData.byMethod,
         cashInDrawer,
         difference: closingData.difference,
         notes: closingNotes,
         closedBy: currentUser.name
      };

      onAddCashClosing(newClosing);
      alert("Caixa fechado com sucesso!");
   };

   // --- DRE CALCULATIONS ---
   const calculateDRE = () => {
      // 1. Gross Revenue (Faturamento Bruto)
      const grossRevenue = filteredSales.reduce((acc, s) => acc + s.total, 0);

      // 2. Deductions (Impostos sobre Venda - Simplificado)
      // Assuming 'Impostos' category in expenses are sales taxes for now, or we could estimate
      const taxExpenses = filteredRecords.filter(r => r.type === 'Expense' && r.category === 'Impostos').reduce((acc, r) => acc + r.amount, 0);
      const netRevenue = grossRevenue - taxExpenses;

      // 3. CMV (Custo da Mercadoria Vendida)
      let cmv = 0;
      filteredSales.forEach(sale => {
         sale.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
               cmv += (product.cost || 0) * item.quantity;
            }
         });
      });

      // 4. Gross Profit
      const grossProfit = netRevenue - cmv;

      // 5. Operating Expenses (Despesas Operacionais)
      const operatingExpenses = filteredRecords
         .filter(r => r.type === 'Expense' && r.category !== 'Impostos') // Exclude taxes already deducted
         .reduce((acc, r) => acc + r.amount, 0);

      // 6. Net Profit (Lucro Líquido)
      const netProfit = grossProfit - operatingExpenses;

      // Group Expenses for Detail View
      const expensesByCategory = filteredRecords
         .filter(r => r.type === 'Expense')
         .reduce((acc: any, curr) => {
            acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
            return acc;
         }, {});

      return {
         grossRevenue,
         taxExpenses,
         netRevenue,
         cmv,
         grossProfit,
         operatingExpenses,
         netProfit,
         expensesByCategory
      };
   };

   const dreData = calculateDRE();

   // --- CASH FLOW CALCULATIONS ---
   const calculateCashFlow = () => {
      // Combine Sales (Income) and Records (Income/Expense)
      const dailyMap = new Map<string, { income: number, expense: number, balance: number }>();

      // Process Sales as Income
      filteredSales.forEach(sale => {
         const date = sale.date; // YYYY-MM-DD
         const current = dailyMap.get(date) || { income: 0, expense: 0, balance: 0 };
         current.income += sale.total;
         dailyMap.set(date, current);
      });

      // Process Financial Records
      filteredRecords.forEach(record => {
         const date = record.date;
         const current = dailyMap.get(date) || { income: 0, expense: 0, balance: 0 };
         if (record.type === 'Income') {
            current.income += record.amount;
         } else {
            current.expense += record.amount;
         }
         dailyMap.set(date, current);
      });

      // Convert to Array and Sort
      const sortedDates = Array.from(dailyMap.keys()).sort();
      let runningBalance = 0;

      return sortedDates.map(date => {
         const data = dailyMap.get(date)!;
         const dailyNet = data.income - data.expense;
         runningBalance += dailyNet;
         return {
            date: date.slice(5), // MM-DD
            fullDate: date,
            ...data,
            accumulated: runningBalance
         };
      });
   };

   const cashFlowData = calculateCashFlow();
   const currentBalance = cashFlowData.length > 0 ? cashFlowData[cashFlowData.length - 1].accumulated : 0;

   // Helper for currency
   const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
   };

   const [showEditModal, setShowEditModal] = useState(false);
   const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null);

   const handleEditRecord = (record: FinancialRecord) => {
      setEditingRecord({ ...record });
      setShowEditModal(true);
   };

   const handleUpdateRecordSave = () => {
      if (!editingRecord) return;
      onUpdateRecord(editingRecord);
      setShowEditModal(false);
      setEditingRecord(null);
   };

   const handleSaveRecord = () => {
      if (!newRecord.description || !newRecord.amount || !newRecord.date) return;

      const recordsToAdd: FinancialRecord[] = [];
      const baseDate = new Date(newRecord.date);
      const amount = Number(newRecord.amount);

      // Forces Expense type for manual records
      const recordType = 'Expense';

      if (isRecurring && installments > 1) {
         // Generate recurring records
         for (let i = 0; i < installments; i++) {
            const currentDate = new Date(baseDate);
            currentDate.setMonth(baseDate.getMonth() + i);

            recordsToAdd.push({
               id: `f-${Date.now()}-${i}`,
               date: currentDate.toISOString().split('T')[0],
               description: `${newRecord.description} (${i + 1}/${installments})`,
               amount: amount,
               type: recordType,
               category: newRecord.category || 'Outros',
               branch: newRecord.branch
            });
         }
      } else {
         // Single record
         recordsToAdd.push({
            id: `f-${Date.now()}`,
            date: newRecord.date,
            description: newRecord.description,
            amount: amount,
            type: recordType,
            category: newRecord.category || 'Outros',
            branch: newRecord.branch
         });
      }

      onAddRecord(recordsToAdd);
      setShowAddModal(false);
      // Reset form
      setNewRecord({ type: 'Expense', date: getTodayDate(), category: 'Fornecedores', description: '', amount: 0, branch: Branch.MATRIZ });
      setIsRecurring(false);
      setInstallments(2);
   };

   return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
               <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <ArrowLeft size={24} className="text-slate-600" />
               </button>
               <div>
                  <h2 className="text-2xl font-bold text-slate-800">Gestão Financeira</h2>
                  <p className="text-slate-500">Fluxo de caixa, DRE e controle de despesas.</p>
               </div>
            </div>

            <div className="flex gap-2">
               {/* Branch Selector */}
               <div className="bg-white p-1 rounded-lg border border-slate-200 flex">
                  <button onClick={() => setSelectedBranch('ALL')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Geral</button>
                  <button onClick={() => setSelectedBranch(Branch.MATRIZ)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === Branch.MATRIZ ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Matriz</button>
                  <button onClick={() => setSelectedBranch(Branch.FILIAL)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === Branch.FILIAL ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Filial</button>
               </div>

               <button
                  onClick={() => setShowAddModal(true)}
                  className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-900/10 transition-colors"
               >
                  <Plus size={18} /> Lançar Despesa
               </button>

               <button
                  onClick={() => setShowCategoryModal(true)}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-slate-900/10 transition-colors"
               >
                  <Filter size={18} /> Categorias
               </button>

               <div className="bg-white p-1 rounded-lg border border-slate-200 flex">
                  <button onClick={() => setDateRange('THIS_MONTH')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dateRange === 'THIS_MONTH' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Este Mês</button>
                  <button onClick={() => setDateRange('ALL_TIME')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dateRange === 'ALL_TIME' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Tudo</button>
               </div>
            </div>
         </div>

         {/* VIEW TOGGLE */}
         <div className="flex justify-center">
            <div className="bg-slate-200 p-1 rounded-xl flex">
               <button
                  onClick={() => setViewMode('CASH_FLOW')}
                  className={`px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${viewMode === 'CASH_FLOW' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  <LineChart size={18} /> Fluxo de Caixa
               </button>
               <button
                  onClick={() => setViewMode('DRE')}
                  className={`px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${viewMode === 'DRE' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  <BarChart3 size={18} /> DRE Gerencial
               </button>
               <button
                  onClick={() => setViewMode('CASH_CLOSING')}
                  className={`px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${viewMode === 'CASH_CLOSING' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  <Lock size={18} /> Fechamento de Caixa
               </button>
            </div>
         </div>

         {viewMode === 'CASH_FLOW' ? (
            <div className="space-y-6 animate-in fade-in">
               {/* Summary Cards */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                     <p className="text-slate-500 font-medium text-sm">Saldo Atual</p>
                     <h3 className={`text-3xl font-bold mt-1 ${currentBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(currentBalance)}
                     </h3>
                  </div>
                  <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                     <p className="text-rose-700 font-medium text-sm">Saídas (Período)</p>
                     <h3 className="text-2xl font-bold mt-1 text-rose-800">
                        {formatCurrency(cashFlowData.reduce((acc, d) => acc + d.expense, 0))}
                     </h3>
                  </div>
               </div>

               {/* Chart */}
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-80">
                  <h4 className="font-bold text-slate-700 mb-4">Evolução do Saldo</h4>
                  <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={cashFlowData}>
                        <defs>
                           <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" fontSize={12} />
                        <YAxis fontSize={12} />
                        <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                        <Area type="monotone" dataKey="accumulated" stroke="#3b82f6" fillOpacity={1} fill="url(#colorBalance)" name="Saldo Acumulado" strokeWidth={2} />
                     </AreaChart>
                  </ResponsiveContainer>
               </div>

               {/* Transaction List */}
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                     <h3 className="font-bold text-slate-700">Movimentações Recentes</h3>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                     {filteredRecords.map(record => (
                        <div key={record.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors group">
                           <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${record.type === 'Income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                 {record.type === 'Income' ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
                              </div>
                              <div>
                                 <p className="font-bold text-slate-800">{record.description}</p>
                                 <div className="flex gap-2 items-center">
                                    <p className="text-xs text-slate-500 flex items-center gap-1"><Calendar size={10} /> {record.date}</p>
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{record.category}</span>
                                    {record.branch && (
                                       <span className={`text-[10px] px-1.5 py-0.5 rounded border ${record.branch === Branch.MATRIZ ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                                          {record.branch === Branch.MATRIZ ? 'Matriz' : 'Filial'}
                                       </span>
                                    )}
                                    {record.paymentMethod && (
                                       <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                                          {record.paymentMethod === 'Credit' ? 'Crédito' : record.paymentMethod === 'Debit' ? 'Débito' : record.paymentMethod === 'Cash' ? 'Dinheiro' : record.paymentMethod}
                                       </span>
                                    )}
                                 </div>
                              </div>
                           </div>
                           <div className="flex items-center gap-4">
                              <span className={`font-bold ${record.type === 'Income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                 {record.type === 'Income' ? '+' : '-'} {formatCurrency(record.amount)}
                              </span>
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <button onClick={() => handleEditRecord(record)} className="text-slate-400 hover:text-blue-600 p-1">
                                    <Building2 size={16} />
                                 </button>
                                 <button onClick={() => onDeleteRecord(record.id)} className="text-slate-400 hover:text-red-600 p-1">
                                    <X size={16} />
                                 </button>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         ) : (
            <div className="space-y-6 animate-in fade-in">
               {/* DRE View */}
               <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-4xl mx-auto">
                  <div className="text-center mb-8">
                     <h3 className="text-2xl font-bold text-slate-800">Demonstração do Resultado do Exercício</h3>
                     <p className="text-slate-500">Visão Gerencial {selectedBranch !== 'ALL' ? `- ${selectedBranch}` : ''}</p>
                  </div>

                  <div className="space-y-4">
                     {/* Gross Revenue */}
                     <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                        <span className="font-bold text-blue-900">(=) Receita Bruta de Vendas</span>
                        <span className="font-bold text-blue-900">{formatCurrency(dreData.grossRevenue)}</span>
                     </div>

                     {/* Deductions */}
                     <div className="flex justify-between items-center px-4 text-rose-600">
                        <span>(-) Impostos / Deduções</span>
                        <span>{formatCurrency(dreData.taxExpenses)}</span>
                     </div>

                     <div className="border-t border-slate-200 my-2"></div>

                     {/* Net Revenue */}
                     <div className="flex justify-between items-center px-3 font-bold text-slate-700">
                        <span>(=) Receita Líquida</span>
                        <span>{formatCurrency(dreData.netRevenue)}</span>
                     </div>

                     {/* CMV */}
                     <div className="flex justify-between items-center px-4 text-rose-600">
                        <span>(-) Custo da Mercadoria Vendida (CMV)</span>
                        <span>{formatCurrency(dreData.cmv)}</span>
                     </div>

                     <div className="border-t border-slate-200 my-2"></div>

                     {/* Gross Profit */}
                     <div className="flex justify-between items-center p-3 bg-slate-100 rounded-lg">
                        <span className="font-bold text-slate-800">(=) Lucro Bruto</span>
                        <span className="font-bold text-slate-800">{formatCurrency(dreData.grossProfit)}</span>
                     </div>

                     {/* Operating Expenses */}
                     <div className="pl-4 space-y-2">
                        <div className="flex justify-between items-center font-medium text-rose-700">
                           <span>(-) Despesas Operacionais</span>
                           <span>{formatCurrency(dreData.operatingExpenses)}</span>
                        </div>
                        {/* Detail Expenses */}
                        <div className="pl-4 text-sm text-slate-500 space-y-1">
                           {Object.entries(dreData.expensesByCategory).map(([cat, amount]: [string, any]) => (
                              cat !== 'Impostos' && (
                                 <div key={cat} className="flex justify-between">
                                    <span>• {cat}</span>
                                    <span>{formatCurrency(amount)}</span>
                                 </div>
                              )
                           ))}
                        </div>
                     </div>

                     <div className="border-t-2 border-slate-800 my-4"></div>

                     {/* Net Profit */}
                     <div className={`flex justify-between items-center p-4 rounded-xl text-white shadow-lg ${dreData.netProfit >= 0 ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                        <span className="text-xl font-bold">(=) Resultado Líquido (Lucro/Prejuízo)</span>
                        <span className="text-2xl font-bold">{formatCurrency(dreData.netProfit)}</span>
                     </div>

                     {/* Margin Indicator */}
                     <div className="text-center mt-4">
                        <span className="text-sm font-medium text-slate-500">
                           Margem Líquida: {dreData.grossRevenue > 0 ? ((dreData.netProfit / dreData.grossRevenue) * 100).toFixed(1) : 0}%
                        </span>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {viewMode === 'CASH_CLOSING' && (
            <div className="space-y-6 animate-in fade-in">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* --- CLOSING FORM --- */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                     <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                        <Lock className="text-orange-500" size={24} />
                        <h3 className="text-xl font-bold text-slate-800">Novo Fechamento</h3>
                     </div>

                     <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                           <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">Data</label>
                              <input
                                 type="date"
                                 className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                                 value={closingDate}
                                 onChange={(e) => setClosingDate(e.target.value)}
                              />
                           </div>
                           <div>
                              <label className="block text-sm font-bold text-slate-700 mb-1">Unidade</label>
                              <select
                                 className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white"
                                 value={closingBranch}
                                 onChange={(e) => setClosingBranch(e.target.value as Branch)}
                              >
                                 <option value={Branch.MATRIZ}>Matriz</option>
                                 <option value={Branch.FILIAL}>Filial</option>
                              </select>
                           </div>
                        </div>

                        <div className="space-y-2">
                           <label className="block text-sm font-bold text-slate-700">Valor em Caixa (Dinheiro)</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                              <input
                                 type="number"
                                 className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-bold text-xl text-slate-900"
                                 value={cashInDrawer}
                                 onChange={(e) => setCashInDrawer(Number(e.target.value))}
                              />
                           </div>
                           <p className="text-xs text-slate-500">Informe o valor total em dinheiro encontrado na gaveta.</p>
                        </div>

                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Observações</label>
                           <textarea
                              className="w-full px-4 py-2 border border-slate-200 rounded-lg h-20"
                              placeholder="Justifique a diferença ou adicione notas..."
                              value={closingNotes}
                              onChange={(e) => setClosingNotes(e.target.value)}
                           />
                        </div>

                        <button
                           onClick={handleSaveClosing}
                           className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2"
                        >
                           <Lock size={18} /> Confirmar Fechamento
                        </button>
                     </div>
                  </div>

                  {/* --- CLOSING HISTORY --- */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                     <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-slate-700">Histórico de Fechamentos</h3>
                     </div>
                     <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                        {cashClosings.length === 0 ? (
                           <div className="p-8 text-center text-slate-400">Nenhum fechamento registrado.</div>
                        ) : (
                           cashClosings.map(closing => (
                              <div key={closing.id} className="p-4 hover:bg-slate-50 transition-colors group">
                                 <div className="flex justify-between items-start mb-2">
                                    <div>
                                       <p className="font-bold text-slate-800 flex items-center gap-2">
                                          {new Date(closing.date).toLocaleDateString()}
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${closing.branch === Branch.MATRIZ ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                                             {closing.branch === Branch.MATRIZ ? 'Matriz' : 'Filial'}
                                          </span>
                                       </p>
                                       <p className="text-xs text-slate-500">Feito por: {closing.closedBy}</p>
                                    </div>
                                    <button
                                       onClick={() => onDeleteCashClosing(closing.id)}
                                       className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                       <Trash2 size={16} />
                                    </button>
                                 </div>

                                 <div className="flex justify-between items-center text-sm mb-2 bg-slate-50 p-3 rounded-lg">
                                    <span className="font-bold text-slate-700">Valor em Caixa:</span>
                                    <span className="font-bold text-xl text-slate-900">{formatCurrency(closing.cashInDrawer)}</span>
                                 </div>
                                 {closing.notes && (
                                    <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 italic">
                                       "{closing.notes}"
                                    </div>
                                 )}
                              </div>
                           ))
                        )}
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* --- ADD RECORD MODAL --- */}
         {showAddModal && (
            <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                  <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
                     <h3 className="font-bold flex items-center gap-2">
                        <DollarSign size={20} className="text-orange-400" /> Lançar Despesa
                     </h3>
                     <button onClick={() => setShowAddModal(false)}><X size={20} /></button>
                  </div>

                  <div className="p-6 space-y-4">
                     <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-sm font-medium">
                        <p>Este formulário registra apenas saídas (pagamentos). Para registrar entradas, utilize o PDV.</p>
                     </div>

                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Unidade (Pagador)</label>
                        <div className="flex gap-2">
                           <button
                              onClick={() => setNewRecord({ ...newRecord, branch: Branch.MATRIZ })}
                              className={`flex-1 py-2 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 ${newRecord.branch === Branch.MATRIZ ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                           >
                              <Building2 size={16} /> Matriz
                           </button>
                           <button
                              onClick={() => setNewRecord({ ...newRecord, branch: Branch.FILIAL })}
                              className={`flex-1 py-2 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 ${newRecord.branch === Branch.FILIAL ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                           >
                              <Building2 size={16} /> Filial
                           </button>
                        </div>
                     </div>

                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Descrição</label>
                        <input
                           type="text"
                           placeholder="Ex: Aluguel da Loja, Compra de Máquina..."
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-slate-900 font-medium"
                           value={newRecord.description || ''}
                           onChange={(e) => setNewRecord({ ...newRecord, description: e.target.value })}
                        />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Valor</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                              <input
                                 type="number"
                                 placeholder="0,00"
                                 className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-bold text-lg bg-white text-slate-900 text-right"
                                 value={newRecord.amount || ''}
                                 onChange={(e) => setNewRecord({ ...newRecord, amount: Number(e.target.value) })}
                              />
                           </div>
                        </div>
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Vencimento</label>
                           <input
                              type="date"
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-slate-900 font-medium h-[46px]"
                              value={newRecord.date}
                              onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                           />
                        </div>
                     </div>

                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Categoria</label>
                        <select
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                           value={newRecord.category}
                           onChange={(e) => setNewRecord({ ...newRecord, category: e.target.value })}
                        >
                           {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                     </div>

                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Forma de Pagamento</label>
                        <select
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                           value={newRecord.paymentMethod || 'Pix'}
                           onChange={(e) => setNewRecord({ ...newRecord, paymentMethod: e.target.value as any })}
                        >
                           <option value="Pix">Pix</option>
                           <option value="Cash">Dinheiro</option>
                           <option value="Credit">Cartão de Crédito</option>
                           <option value="Debit">Cartão de Débito</option>
                        </select>
                     </div>

                     {/* Recurrence Section */}
                     <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                           <input
                              type="checkbox"
                              id="recurrence"
                              className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                              checked={isRecurring}
                              onChange={(e) => setIsRecurring(e.target.checked)}
                           />
                           <label htmlFor="recurrence" className="text-sm font-bold text-slate-800 flex items-center gap-1 cursor-pointer">
                              <Repeat size={14} /> Repetir Lançamento (Parcelado/Mensal)
                           </label>
                        </div>

                        {isRecurring && (
                           <div className="mt-3 pl-6 animate-in slide-in-from-top-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Número de Parcelas / Meses</label>
                              <div className="flex items-center gap-3">
                                 <input
                                    type="number"
                                    min="2"
                                    max="60"
                                    className="w-20 px-3 py-1.5 border border-slate-300 rounded-lg text-center font-bold bg-white text-slate-900"
                                    value={installments}
                                    onChange={(e) => setInstallments(Math.max(2, Number(e.target.value)))}
                                 />
                                 <span className="text-sm text-slate-500">vezes (mensais)</span>
                              </div>
                              <p className="text-xs text-blue-600 mt-2">
                                 * Serão gerados {installments} lançamentos futuros automaticamente.
                              </p>
                           </div>
                        )}
                     </div>

                     <button
                        onClick={handleSaveRecord}
                        className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10"
                     >
                        Confirmar Despesa
                     </button>
                  </div>
               </div>
            </div>
         )}


         {/* --- EDIT RECORD MODAL --- */}
         {showEditModal && editingRecord && (
            <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                  <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
                     <h3 className="font-bold flex items-center gap-2">
                        <DollarSign size={20} className="text-orange-400" /> Editar Lançamento
                     </h3>
                     <button onClick={() => setShowEditModal(false)}><X size={20} /></button>
                  </div>

                  <div className="p-6 space-y-4">
                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Unidade</label>
                        <div className="flex gap-2">
                           <button
                              onClick={() => setEditingRecord({ ...editingRecord, branch: Branch.MATRIZ })}
                              className={`flex-1 py-2 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 ${editingRecord.branch === Branch.MATRIZ ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                           >
                              <Building2 size={16} /> Matriz
                           </button>
                           <button
                              onClick={() => setEditingRecord({ ...editingRecord, branch: Branch.FILIAL })}
                              className={`flex-1 py-2 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 ${editingRecord.branch === Branch.FILIAL ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                           >
                              <Building2 size={16} /> Filial
                           </button>
                        </div>
                     </div>

                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Descrição</label>
                        <input
                           type="text"
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-slate-900 font-medium"
                           value={editingRecord.description}
                           onChange={(e) => setEditingRecord({ ...editingRecord, description: e.target.value })}
                        />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Valor</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                              <input
                                 type="number"
                                 className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-bold text-lg bg-white text-slate-900 text-right"
                                 value={editingRecord.amount}
                                 onChange={(e) => setEditingRecord({ ...editingRecord, amount: Number(e.target.value) })}
                              />
                           </div>
                        </div>
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Data</label>
                           <input
                              type="date"
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-slate-900 font-medium h-[46px]"
                              value={editingRecord.date}
                              onChange={(e) => setEditingRecord({ ...editingRecord, date: e.target.value })}
                           />
                        </div>
                     </div>

                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Categoria</label>
                        <select
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                           value={editingRecord.category}
                           onChange={(e) => setEditingRecord({ ...editingRecord, category: e.target.value })}
                        >
                           {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                     </div>

                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Forma de Pagamento</label>
                        <select
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                           value={editingRecord.paymentMethod || 'Pix'}
                           onChange={(e) => setEditingRecord({ ...editingRecord, paymentMethod: e.target.value as any })}
                        >
                           <option value="Pix">Pix</option>
                           <option value="Cash">Dinheiro</option>
                           <option value="Credit">Cartão de Crédito</option>
                           <option value="Debit">Cartão de Débito</option>
                        </select>
                     </div>

                     <button
                        onClick={handleUpdateRecordSave}
                        className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10"
                     >
                        Salvar Alterações
                     </button>
                  </div>
               </div>
            </div>
         )}


         {/* --- MODAL GERENCIAR CATEGORIAS --- */}
         {showCategoryModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                  <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                     <h3 className="font-bold flex items-center gap-2">
                        <Filter size={20} className="text-orange-400" /> Gerenciar Categorias (Despesas)
                     </h3>
                     <button onClick={() => setShowCategoryModal(false)}><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                     <div className="flex gap-2">
                        <input
                           type="text"
                           placeholder="Nova Categoria..."
                           className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                           value={newCategoryName}
                           onChange={(e) => setNewCategoryName(e.target.value)}
                        />
                        <button
                           onClick={handleAddCategory}
                           className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold"
                        >
                           <Plus size={20} />
                        </button>
                     </div>

                     <div className="max-h-[300px] overflow-y-auto border border-slate-100 rounded-lg">
                        <table className="w-full text-left">
                           <tbody className="divide-y divide-slate-100">
                              {categories.map((cat) => (
                                 <tr key={cat.id} className="hover:bg-slate-50 group">
                                    <td className="p-3 text-slate-700 font-medium">{cat.name}</td>
                                    <td className="p-3 text-right">
                                       <button
                                          onClick={() => handleDeleteCategory(cat.id)}
                                          className="text-slate-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                       >
                                          <Trash2 size={16} />
                                       </button>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default Financial;