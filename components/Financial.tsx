import React, { useState, useMemo, useCallback } from 'react';
import { FinancialRecord, Branch, Sale, Product, CategoryItem, CashClosing, User } from '../types';
import { dbCategories } from '../services/db';
import { ArrowUpCircle, ArrowDownCircle, X, Plus, Calendar, DollarSign, Repeat, ArrowLeft, Building2, BarChart3, LineChart, Filter, Trash2, Lock, CheckCircle, AlertTriangle, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
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
   const [viewMode, setViewMode] = useState<'MOVEMENTS' | 'DRE' | 'CASH_CLOSING'>('DRE');
   const [selectedBranch, setSelectedBranch] = useState<'ALL' | Branch>('ALL');
   const [dateRange, setDateRange] = useState<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'LAST_60_DAYS' | 'LAST_90_DAYS' | 'ALL_TIME' | 'CUSTOM'>('THIS_MONTH');
   const [customStartDate, setCustomStartDate] = useState(getTodayDate());
   const [customEndDate, setCustomEndDate] = useState(getTodayDate());
   const [searchTerm, setSearchTerm] = useState('');

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
   const [isAddingInlineCategory, setIsAddingInlineCategory] = useState(false);

   const handleAddInlineCategory = async () => {
      if (!newCategoryName.trim()) return;
      try {
         if (!currentUser) return;
         await dbCategories.add({ name: newCategoryName, type: 'FINANCIAL' }, currentUser.tenantId);
         const updatedCats = await dbCategories.getAll(currentUser.tenantId, 'FINANCIAL');
         setCategories(updatedCats);
         setNewRecord({ ...newRecord, category: newCategoryName });
         setNewCategoryName('');
         setIsAddingInlineCategory(false);
      } catch (error) {
         console.error("Erro ao adicionar categoria", error);
         alert("Erro ao adicionar categoria.");
      }
   };

   // DRE Standard Categories for Subcategory Selection
   const DRE_CATEGORIES = {
      "Deduções da Receita": [
         "Imposto (DAS - Simples Nacional)",
         "Devoluções de Vendas",
         "Descontos Incondicionais"
      ],
      "Custos (Fornecedores)": [
         "Compra de Mercadorias",
         "Compra de Insumos",
         "Pagamento de Fornecedores"
      ],
      "Despesas com Vendas": [
         "Comissões",
         "Fretes e Entregas",
         "Marketing e Publicidade",
         "Embalagens"
      ],
      "Despesas Administrativas": [
         "Pró-labore",
         "Salários e Encargos",
         "Aluguel",
         "Água",
         "Energia Elétrica (Luz)",
         "Internet e Telefone",
         "Material de Escritório / Limpeza",
         "Honorários Contábeis",
         "Manutenção e Reparos",
         "Outras Despesas Administrativas"
      ],
      "Despesas Financeiras": [
         "Taxas Bancárias",
         "Tarifas de Maquininha",
         "Juros Pagos"
      ],
      "Impostos e Outras Despesas": [
         "IRPJ / CSLL",
         "Outras Despesas"
      ]
   };

   React.useEffect(() => {
      loadCategories();
   }, []);

   const loadCategories = () => {
      if (!currentUser) return;
      dbCategories.getAll(currentUser.tenantId, 'FINANCIAL')
         .then(setCategories)
         .catch(err => console.error("Erro ao carregar categorias", err));
   };

   const handleAddCategory = async () => {
      if (!newCategoryName.trim()) return;
      try {
         if (!currentUser) return;
         await dbCategories.add({ name: newCategoryName, type: 'FINANCIAL' }, currentUser.tenantId);
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

   // --- OPTIMIZED FILTERING ---
   const filterByDate = useCallback((dateString: string) => {
      if (!dateString) return false;
      if (dateRange === 'ALL_TIME') return true;

      const recordDate = new Date(dateString);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize today

      if (dateRange === 'TODAY') {
         const recDate = new Date(dateString);
         recDate.setHours(0, 0, 0, 0); // Normalize record date to midnight for comparison
         // Fix timezone offset issue by comparing ISO strings up to 'T'
         return dateString === getTodayDate();
      }

      if (dateRange === 'THIS_WEEK') {
         const firstDayOfWeek = new Date(today);
         firstDayOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
         firstDayOfWeek.setHours(0, 0, 0, 0);
         return recordDate >= firstDayOfWeek && recordDate <= new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1); // +1 to include today fully
      }

      if (dateRange === 'THIS_MONTH') {
         const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
         return dateString.startsWith(currentMonthPrefix);
      }

      if (dateRange === 'LAST_30_DAYS') {
         const pastDate = new Date(today);
         pastDate.setDate(today.getDate() - 30);
         return recordDate >= pastDate && recordDate <= today;
      }

      if (dateRange === 'LAST_60_DAYS') {
         const pastDate = new Date(today);
         pastDate.setDate(today.getDate() - 60);
         return recordDate >= pastDate && recordDate <= today;
      }

      if (dateRange === 'LAST_90_DAYS') {
         const pastDate = new Date(today);
         pastDate.setDate(today.getDate() - 90);
         return recordDate >= pastDate && recordDate <= today;
      }

      if (dateRange === 'CUSTOM') {
         return dateString >= customStartDate && dateString <= customEndDate;
      }

      return true;
   }, [dateRange, customStartDate, customEndDate]);

   const filteredRecords = useMemo(() => records.filter(r => (selectedBranch === 'ALL' || r.branch === selectedBranch) && filterByDate(r.date)), [records, selectedBranch, filterByDate]);

   // Only include COMPLETED sales in financial reports
   const filteredSales = useMemo(() => sales.filter(s => (selectedBranch === 'ALL' || s.branch === selectedBranch) && filterByDate(s.date) && s.status === 'Completed'), [sales, selectedBranch, filterByDate]);

   // Unified Records for Display (Matches Cash Flow Logic)
   const unifiedRecords = useMemo(() => {
      // Exclude only auto-generated Sales Income. Keep Expenses even if category is 'Vendas'.
      const nonSaleRecords = filteredRecords.filter(r => !(r.category === 'Vendas' && r.type === 'Income'));

      const salesAsRecords: FinancialRecord[] = [];

      filteredSales.forEach(sale => {
         if (sale.paymentMethod === 'Split' && sale.paymentSplits) {
            sale.paymentSplits.forEach((split, index) => {
               salesAsRecords.push({
                  id: `sale-${sale.id}-split-${index}`,
                  date: sale.date || getTodayDate(),
                  description: `Venda #${(sale.id || '').slice(0, 8)} - ${sale.customerName || 'Cliente'} (${split.method})`,
                  amount: split.amount,
                  type: 'Income',
                  category: 'Vendas',
                  branch: sale.branch,
                  paymentMethod: split.method
               });
            });
         } else {
            salesAsRecords.push({
               id: `sale-${sale.id || Math.random()}`,
               date: sale.date || getTodayDate(),
               description: `Venda #${(sale.id || '').slice(0, 8)} - ${sale.customerName || 'Cliente'}`,
               amount: sale.total || 0,
               type: 'Income',
               category: 'Vendas',
               branch: sale.branch,
               paymentMethod: sale.paymentMethod as any
            });
         }
      });

      return [...nonSaleRecords, ...salesAsRecords].sort((a, b) => {
         // Sort by date desc, then by id
         // String comparison for ISO dates is faster and correct
         const dateA = a.date || '';
         const dateB = b.date || '';
         if (dateA !== dateB) return dateB.localeCompare(dateA);
         return (b.id || '').localeCompare(a.id || '');
      });
   }, [filteredRecords, filteredSales]);

   const searchedRecords = useMemo(() => {
      if (!searchTerm.trim()) return unifiedRecords;
      const lowerTerm = searchTerm.toLowerCase();
      return unifiedRecords.filter(r =>
         r.description.toLowerCase().includes(lowerTerm) ||
         r.category.toLowerCase().includes(lowerTerm) ||
         r.amount.toString().includes(lowerTerm)
      );
   }, [unifiedRecords, searchTerm]);

   // --- CASH CLOSING CALCULATIONS ---
   const closingData = useMemo(() => {
      const daySales = sales.filter(s => s.date === closingDate && s.branch === closingBranch && s.status === 'Completed');

      const totalSales = daySales.reduce((acc, s) => acc + s.total, 0);

      // Calculate Cash/Pix/Card breakdown
      const byMethod = daySales.reduce((acc, s) => {
         if (s.paymentMethod === 'Split' && s.paymentSplits) {
            s.paymentSplits.forEach(split => {
               acc[split.method] = (acc[split.method] || 0) + split.amount;
            });
         } else if (s.paymentMethod !== 'Split') {
            acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total;
         }
         return acc;
      }, { Pix: 0, Credit: 0, Debit: 0, Cash: 0 } as { Pix: number; Credit: number; Debit: number; Cash: number; });

      // Get expenses for the day
      const dayExpenses = records
         .filter(r => r.date === closingDate && r.branch === closingBranch && r.type === 'Expense')
         .reduce((acc, r) => acc + r.amount, 0);

      // Calculate Cash Details (Received vs Change)
      const totalCashReceived = daySales.reduce((acc, s) => acc + (s.cashReceived || 0), 0);
      const totalChangeGiven = daySales.reduce((acc, s) => acc + (s.changeAmount || 0), 0);

      // Previous Closing Balance (Opening Balance)
      // Find the most recent closing BEFORE the selected date
      const previousClosing = cashClosings
         .filter(c => c.branch === closingBranch && c.date < closingDate)
         .sort((a, b) => b.date.localeCompare(a.date))[0];

      const openingBalance = previousClosing ? previousClosing.cashInDrawer : 0;

      // Expected Cash in Drawer: Opening + Cash Sales - Expenses
      // Note: We only count CASH sales for the drawer. Pix/Card go to bank.
      const cashSales = byMethod['Cash'] || 0;
      const expectedInDrawer = openingBalance + cashSales - dayExpenses;

      return {
         totalSales,
         byMethod,
         dayExpenses,
         totalExpense: dayExpenses, // Alias for compatibility
         totalCashReceived,
         totalChangeGiven,
         openingBalance,
         expectedInDrawer,
         netResult: totalSales - dayExpenses
      };
   }, [sales, records, cashClosings, closingDate, closingBranch]);

   const handleSaveClosing = () => {
      if (!currentUser) return;

      const newClosing: CashClosing = {
         id: crypto.randomUUID(),
         date: closingDate,
         branch: closingBranch,
         openingBalance: closingData.openingBalance,
         totalIncome: closingData.totalSales,
         totalExpense: closingData.dayExpenses,
         totalByPaymentMethod: closingData.byMethod,
         cashInDrawer,
         difference: cashInDrawer - closingData.expectedInDrawer, // Recalculate difference based on new expected
         notes: closingNotes,
         closedBy: currentUser.name
      };

      onAddCashClosing(newClosing);
      alert("Caixa fechado com sucesso!");
   };

   // --- DRE CALCULATIONS ---
   const calculateDRE = useCallback(() => {
      const allSalesInPeriod = sales.filter(s => (selectedBranch === 'ALL' || s.branch === selectedBranch) && filterByDate(s.date));
      const completedSales = allSalesInPeriod.filter(s => s.status === 'Completed');
      const cancelledSales = allSalesInPeriod.filter(s => s.status === 'Cancelled');

      const totalCompletedSales = completedSales.reduce((acc, s) => acc + s.total, 0);
      const totalCancelledSales = cancelledSales.reduce((acc, s) => acc + s.total, 0);

      const receitaBruta = totalCompletedSales + totalCancelledSales;

      let devolucoesVendas = 0;
      let descontosIncondicionais = 0;
      let impostosVendas = 0;

      const despesasVendas: Record<string, number> = {};
      const despesasAdministrativas: Record<string, number> = {};
      const despesasFinanceiras: Record<string, number> = {};
      const outrasDespesasMap: Record<string, number> = {};
      const outrasReceitasMap: Record<string, number> = {};

      let irpjCsll = 0;

      let totalDespesasVendas = 0;
      let totalDespesasAdministrativas = 0;
      let totalDespesasFinanceiras = 0;
      let totalOutrasDespesas = 0;
      let totalOutrasReceitas = 0;

      filteredRecords.forEach(r => {
         const desc = r.description || r.category || 'Outros';
         const catLower = r.category.toLowerCase();
         const amount = r.amount;

         if (r.type === 'Expense') {
            // Deduções
            if (catLower.includes('imposto (das') || catLower.includes('das ') || catLower.includes('simples nacional') || catLower.includes('das -')) {
               impostosVendas += amount;
            } else if (catLower.includes('devoluç') || catLower.includes('devoluc')) {
               devolucoesVendas += amount;
            } else if (catLower.includes('desconto')) {
               descontosIncondicionais += amount;
            }
            // Impostos sobre Lucro
            else if (catLower.includes('irpj') || catLower.includes('csll')) {
               irpjCsll += amount;
            }
            // Vendas
            else if (catLower.includes('comissão') || catLower.includes('comissao') || catLower.includes('frete') || catLower.includes('venda') || catLower.includes('marketing') || catLower.includes('embalagem')) {
               despesasVendas[desc] = (despesasVendas[desc] || 0) + amount;
               totalDespesasVendas += amount;
            }
            // Financeiras
            else if (catLower.includes('juros') || catLower.includes('taxa') || catLower.includes('banc') || catLower.includes('maquininha') || catLower.includes('tarifa')) {
               despesasFinanceiras[desc] = (despesasFinanceiras[desc] || 0) + amount;
               totalDespesasFinanceiras += amount;
            }
            // Outras
            else if (catLower.includes('outras despesas')) {
               outrasDespesasMap[desc] = (outrasDespesasMap[desc] || 0) + amount;
               totalOutrasDespesas += amount;
            }
            // Fornecedores e Compras (Exclude from admin expenses, keep separated or ignore in DRE as it might be CMV)
            // But to avoid hiding it completely, we can map them to 'Outras Despesas' or a separate variable if we wanted. But user complained about it mixing in admin. 
            // Let's exclude them from 'Despesas Administrativas' so it doesn't inflate operational costs. We assume CMV is computed via Stock.
            else if (catLower.includes('fornecedor') || catLower.includes('compra de mercadoria') || catLower.includes('compra de insumo')) {
               // Ignore in DRE (handled by CMV) or keep track? We'll ignore it from DRE operational expenses.
            }
            // Administrativas (Fallback)
            else {
               despesasAdministrativas[desc] = (despesasAdministrativas[desc] || 0) + amount;
               totalDespesasAdministrativas += amount;
            }
         } else if (r.type === 'Income') {
            if (catLower !== 'vendas') {
               outrasReceitasMap[desc] = (outrasReceitasMap[desc] || 0) + amount;
               totalOutrasReceitas += amount;
            }
         }
      });

      const totalDeducoes = devolucoesVendas + totalCancelledSales + descontosIncondicionais + impostosVendas;
      const receitaLiquida = receitaBruta - totalDeducoes;

      const cmv = completedSales.reduce((totalCMV, sale) => {
         const saleCMV = sale.items.reduce((acc, item) => {
            const product = products.find(p => p.id === item.productId);
            return acc + (item.quantity * (product?.cost || 0));
         }, 0);
         return totalCMV + saleCMV;
      }, 0);

      const resultadoBruto = receitaLiquida - cmv;
      const totalDespesasOperacionais = totalDespesasVendas + totalDespesasAdministrativas + totalDespesasFinanceiras;
      const resultadoAntesImpostos = resultadoBruto - totalDespesasOperacionais + totalOutrasReceitas - totalOutrasDespesas;
      const resultadoLiquido = resultadoAntesImpostos - irpjCsll;

      const marginBase = receitaLiquida > 0 ? receitaLiquida : (receitaBruta > 0 ? receitaBruta : 1);
      const profitMargin = (resultadoLiquido / marginBase) * 100;

      return {
         receitaBruta,
         deducoes: {
            devolucoesVendas,
            vendasCanceladas: totalCancelledSales,
            descontosIncondicionais,
            impostosVendas,
            total: totalDeducoes
         },
         receitaLiquida,
         cmv,
         resultadoBruto,
         despesasVendas: { total: totalDespesasVendas, items: despesasVendas },
         despesasAdministrativas: { total: totalDespesasAdministrativas, items: despesasAdministrativas },
         despesasFinanceiras: { total: totalDespesasFinanceiras, items: despesasFinanceiras },
         totalDespesasOperacionais,
         outrasReceitas: { total: totalOutrasReceitas, items: outrasReceitasMap },
         outrasDespesas: { total: totalOutrasDespesas, items: outrasDespesasMap },
         resultadoAntesImpostos,
         irpjCsll,
         resultadoLiquido,
         profitMargin,

         grossRevenue: receitaBruta,
         variableCosts: cmv,
         totalExpenses: totalDespesasOperacionais + irpjCsll + totalOutrasDespesas + totalDeducoes,
         netProfit: resultadoLiquido
      };
   }, [sales, filteredRecords, records, selectedBranch, dateRange, products, customStartDate]);

   const dreData = useMemo(() => calculateDRE(), [calculateDRE]);

   // --- CASH FLOW CALCULATIONS REMOVED ---
   // The Cash Flow view has been removed as per user request.
   // Keeping DRE and Movements only.

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
      if (!newRecord.amount || !newRecord.date) return;

      // Default description if empty
      const description = newRecord.description || 'Sem descrição';

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
               id: crypto.randomUUID(),
               date: currentDate.toISOString().split('T')[0],
               description: `${description} (${i + 1}/${installments})`,
               amount: amount,
               type: recordType,
               category: newRecord.category || 'Outros',
               branch: newRecord.branch
            });
         }
      } else {
         // Single record
         recordsToAdd.push({
            id: crypto.randomUUID(),
            date: newRecord.date,
            description: description,
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

   // Chart Data Preparation
   const chartData = useMemo(() => {
      return [
         { name: 'Receita', value: dreData.grossRevenue, fill: '#10b981' },
         { name: 'CMV', value: dreData.variableCosts, fill: '#f59e0b' },
         { name: 'Despesas', value: dreData.totalExpenses, fill: '#ef4444' },
         { name: 'Lucro', value: dreData.netProfit, fill: '#3b82f6' }
      ];
   }, [dreData]);

   return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
         <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex items-center gap-3 w-full lg:w-auto">
               <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors shrink-0">
                  <ArrowLeft size={24} className="text-slate-600" />
               </button>
               <div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800">Gestão Financeira</h2>
                  <p className="text-xs md:text-sm text-slate-500">Fluxo de caixa, DRE e controle de despesas.</p>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
               {/* Branch Selector */}
               <div className="bg-white p-1 rounded-lg border border-slate-200 flex shrink-0">
                  <button onClick={() => setSelectedBranch('ALL')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Geral</button>
                  <button onClick={() => setSelectedBranch(Branch.MATRIZ)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === Branch.MATRIZ ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Matriz</button>
                  <button onClick={() => setSelectedBranch(Branch.FILIAL)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === Branch.FILIAL ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Filial</button>
               </div>

               <div className="flex gap-2 shrink-0">
                  <button
                     onClick={() => setShowAddModal(true)}
                     className="bg-blue-800 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-900/10 transition-colors text-xs md:text-sm whitespace-nowrap"
                  >
                     <Plus size={16} /> <span className="hidden sm:inline">Lançar</span> Despesa
                  </button>

                  <button
                     onClick={() => setShowCategoryModal(true)}
                     className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-slate-900/10 transition-colors text-xs md:text-sm whitespace-nowrap"
                  >
                     <Filter size={16} /> <span className="hidden sm:inline">Categorias</span>
                  </button>
               </div>

               <div className="bg-white p-1 rounded-lg border border-slate-200 flex shrink-0 items-center gap-2">
                  <select
                     value={dateRange}
                     onChange={(e) => setDateRange(e.target.value as any)}
                     className="px-3 py-1.5 rounded-md text-xs font-bold text-slate-600 bg-transparent outline-none cursor-pointer hover:bg-slate-50"
                  >
                     <option value="TODAY">Hoje</option>
                     <option value="THIS_WEEK">Esta Semana</option>
                     <option value="THIS_MONTH">Este Mês</option>
                     <option value="LAST_30_DAYS">Últimos 30 Dias</option>
                     <option value="LAST_60_DAYS">Últimos 60 Dias</option>
                     <option value="LAST_90_DAYS">Últimos 90 Dias</option>
                     <option value="ALL_TIME">Todo o Período</option>
                     <option value="CUSTOM">Personalizado</option>
                  </select>

                  {dateRange === 'CUSTOM' && (
                     <div className="flex items-center gap-1 pr-2 animate-in fade-in slide-in-from-right-2">
                        <input
                           type="date"
                           value={customStartDate}
                           onChange={(e) => setCustomStartDate(e.target.value)}
                           className="w-24 px-2 py-1 border border-slate-200 rounded text-xs"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                           type="date"
                           value={customEndDate}
                           onChange={(e) => setCustomEndDate(e.target.value)}
                           className="w-24 px-2 py-1 border border-slate-200 rounded text-xs"
                        />
                     </div>
                  )}
               </div>
            </div>
         </div>

         {/* VIEW TOGGLE */}
         <div className="flex justify-center overflow-x-auto pb-2 md:pb-0">
            <div className="bg-slate-200 p-1 rounded-xl flex shrink-0">
               <button
                  onClick={() => setViewMode('DRE')}
                  className={`px-4 md:px-6 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center gap-2 transition-all whitespace-nowrap ${viewMode === 'DRE' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  <BarChart3 size={16} /> DRE Gerencial
               </button>
               <button
                  onClick={() => setViewMode('MOVEMENTS')}
                  className={`px-4 md:px-6 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center gap-2 transition-all whitespace-nowrap ${viewMode === 'MOVEMENTS' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  <LineChart size={16} /> Movimentações
               </button>
               <button
                  onClick={() => setViewMode('CASH_CLOSING')}
                  className={`px-4 md:px-6 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center gap-2 transition-all whitespace-nowrap ${viewMode === 'CASH_CLOSING' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  <Lock size={16} /> Fechamento
               </button>
            </div>
         </div>

         {viewMode === 'MOVEMENTS' && (
            <div className="space-y-6 animate-in fade-in">
               {/* Transaction List */}
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
                     <h3 className="font-bold text-slate-700">Movimentações Recentes</h3>
                     <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                           type="text"
                           placeholder="Buscar movimentação..."
                           className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                           value={searchTerm}
                           onChange={(e) => setSearchTerm(e.target.value)}
                        />
                     </div>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                     {searchedRecords.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                           Nenhuma movimentação encontrada.
                        </div>
                     ) : (
                        searchedRecords.map(record => {
                           const isSaleRecord = record.id.startsWith('sale-');
                           return (
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
                                    {!isSaleRecord && (
                                       <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => handleEditRecord(record)} className="text-slate-400 hover:text-blue-600 p-1">
                                             <Building2 size={16} />
                                          </button>
                                          <button onClick={() => onDeleteRecord(record.id)} className="text-slate-400 hover:text-red-600 p-1">
                                             <X size={16} />
                                          </button>
                                       </div>
                                    )}
                                 </div>
                              </div>
                           );
                        })
                     )}
                  </div>
               </div>
            </div>
         )}

         {viewMode === 'DRE' && (
            <div className="space-y-6 animate-in fade-in">
               {/* DRE View */}
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Summary & Chart */}
                  <div className="lg:col-span-1 space-y-6">
                     <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4">Resumo do Período</h3>
                        <div className="h-64 w-full">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                 <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                 <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${val / 1000}k`} />
                                 <RechartsTooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: 'transparent' }} />
                                 <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>


                  </div>

                  {/* Right Column: Detailed DRE */}
                  <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                     <div className="text-center mb-8">
                        <h3 className="text-2xl font-bold text-slate-800">Demonstração do Resultado</h3>
                        <p className="text-slate-500">Visão Gerencial Detalhada {selectedBranch !== 'ALL' ? `- ${selectedBranch}` : ''}</p>
                     </div>

                     <div className="space-y-3 font-mono text-sm md:text-base">
                        {/* 1. Receita Bruta */}
                        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                           <span className="font-bold text-blue-900">(=) Receita Bruta de Vendas e/ou Serviços</span>
                           <span className="font-bold text-blue-900">{formatCurrency(dreData.receitaBruta)}</span>
                        </div>

                        {/* 2. Deduções */}
                        <div className="mt-2">
                           <div className="flex justify-between items-center px-4 py-1 text-rose-700 font-bold">
                              <span>(-) Deduções da Receita Bruta</span>
                              <span>{formatCurrency(dreData.deducoes.total)}</span>
                           </div>
                           <div className="space-y-1 pl-6 text-sm">
                              <div className="flex justify-between text-slate-500 hover:bg-slate-50 border-l border-slate-200 pl-2">
                                 <span>(-) Devoluções de Vendas</span>
                                 <span>{formatCurrency(dreData.deducoes.devolucoesVendas)}</span>
                              </div>
                              <div className="flex justify-between text-slate-500 hover:bg-slate-50 border-l border-slate-200 pl-2">
                                 <span>(-) Vendas Canceladas</span>
                                 <span>{formatCurrency(dreData.deducoes.vendasCanceladas)}</span>
                              </div>
                              <div className="flex justify-between text-slate-500 hover:bg-slate-50 border-l border-slate-200 pl-2">
                                 <span>(-) Descontos Incondicionais</span>
                                 <span>{formatCurrency(dreData.deducoes.descontosIncondicionais)}</span>
                              </div>
                              <div className="flex justify-between text-slate-500 hover:bg-slate-50 border-l border-slate-200 pl-2">
                                 <span>(-) Impostos sobre Vendas (DAS - Simples Nacional)</span>
                                 <span>{formatCurrency(dreData.deducoes.impostosVendas)}</span>
                              </div>
                           </div>
                        </div>

                        {/* 3. Receita Líquida */}
                        <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200 mt-2">
                           <span className="font-bold text-slate-800">(=) Receita Líquida de Vendas e/ou Serviços</span>
                           <span className="font-bold text-slate-800">{formatCurrency(dreData.receitaLiquida)}</span>
                        </div>

                        {/* 4. CMV */}
                        <div className="flex justify-between items-center px-4 py-2 text-rose-600 font-bold mt-2 hover:bg-rose-50 rounded-lg transition-colors">
                           <span>(-) Custo das Mercadorias Vendidas (CMV)</span>
                           <span>{formatCurrency(dreData.cmv)}</span>
                        </div>

                        <div className="border-t border-slate-200 my-2"></div>

                        {/* 5. Resultado Bruto */}
                        <div className="flex justify-between items-center p-3 bg-slate-100 rounded-lg border border-slate-200 mt-2">
                           <span className="font-bold text-slate-800">(=) Resultado Bruto (Lucro Bruto)</span>
                           <span className="font-bold text-slate-800">{formatCurrency(dreData.resultadoBruto)}</span>
                        </div>

                        {/* 6. Despesas Operacionais */}
                        <div className="mt-4">
                           <div className="flex justify-between items-center px-4 py-2 font-bold text-rose-700 bg-rose-50/50 rounded-lg mb-2">
                              <span>(-) Despesas Operacionais</span>
                              <span>{formatCurrency(dreData.totalDespesasOperacionais)}</span>
                           </div>

                           <div className="space-y-4 pl-4">
                              {/* Despesas com Vendas */}
                              <div className="border-l-2 border-slate-200 pl-4">
                                 <div className="flex justify-between font-bold text-slate-700 mb-1">
                                    <span>(-) Despesas com Vendas (Comissões, fretes)</span>
                                    <span>{formatCurrency(dreData.despesasVendas.total)}</span>
                                 </div>
                                 <div className="space-y-1 pl-2">
                                    {Object.entries(dreData.despesasVendas.items).map(([desc, amount]) => (
                                       <div key={`vend-${desc}`} className="flex justify-between text-xs text-slate-500 hover:bg-slate-50 px-1">
                                          <span>{desc}</span>
                                          <span>{formatCurrency(amount)}</span>
                                       </div>
                                    ))}
                                 </div>
                              </div>

                              {/* Despesas Administrativas */}
                              <div className="border-l-2 border-slate-200 pl-4">
                                 <div className="flex justify-between font-bold text-slate-700 mb-1">
                                    <span>(-) Despesas Administrativas (Salários, aluguel, luz)</span>
                                    <span>{formatCurrency(dreData.despesasAdministrativas.total)}</span>
                                 </div>
                                 <div className="space-y-1 pl-2">
                                    {Object.entries(dreData.despesasAdministrativas.items).map(([desc, amount]) => (
                                       <div key={`adm-${desc}`} className="flex justify-between text-xs text-slate-500 hover:bg-slate-50 px-1">
                                          <span>{desc}</span>
                                          <span>{formatCurrency(amount)}</span>
                                       </div>
                                    ))}
                                 </div>
                              </div>

                              {/* Despesas Financeiras */}
                              <div className="border-l-2 border-slate-200 pl-4">
                                 <div className="flex justify-between font-bold text-slate-700 mb-1">
                                    <span>(-) Despesas Financeiras Líquidas</span>
                                    <span>{formatCurrency(dreData.despesasFinanceiras.total)}</span>
                                 </div>
                                 <div className="space-y-1 pl-2">
                                    {Object.entries(dreData.despesasFinanceiras.items).map(([desc, amount]) => (
                                       <div key={`fin-${desc}`} className="flex justify-between text-xs text-slate-500 hover:bg-slate-50 px-1">
                                          <span>{desc}</span>
                                          <span>{formatCurrency(amount)}</span>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           </div>
                        </div>

                        {/* Outras Receitas / Despesas */}
                        <div className="mt-4 border-l-2 border-slate-200 pl-4">
                           <div className="flex justify-between font-bold text-slate-700 mb-1">
                              <span>(+) Outras Receitas / (-) Outras Despesas</span>
                              <span>{formatCurrency(dreData.outrasReceitas.total - dreData.outrasDespesas.total)}</span>
                           </div>
                           <div className="space-y-1 pl-2">
                              {Object.entries(dreData.outrasReceitas.items).map(([desc, amount]) => (
                                 <div key={`rec-${desc}`} className="flex justify-between text-xs text-emerald-600 hover:bg-emerald-50 px-1">
                                    <span>(+) {desc}</span>
                                    <span>{formatCurrency(amount)}</span>
                                 </div>
                              ))}
                              {Object.entries(dreData.outrasDespesas.items).map(([desc, amount]) => (
                                 <div key={`des-${desc}`} className="flex justify-between text-xs text-rose-500 hover:bg-rose-50 px-1">
                                    <span>(-) {desc}</span>
                                    <span>{formatCurrency(amount)}</span>
                                 </div>
                              ))}
                           </div>
                        </div>

                        <div className="border-t border-slate-200 my-4"></div>

                        {/* 7. LAIR */}
                        <div className="flex justify-between items-center p-3 bg-slate-100 rounded-lg border border-slate-200">
                           <span className="font-bold text-slate-800">(=) Resultado Antes dos Impostos (LAIR)</span>
                           <span className="font-bold text-slate-800">{formatCurrency(dreData.resultadoAntesImpostos)}</span>
                        </div>

                        {/* 8. IRPJ / CSLL */}
                        <div className="flex justify-between items-center px-4 py-2 text-rose-600 font-bold mt-2">
                           <span>(-) IRPJ e CSLL</span>
                           <span>{formatCurrency(dreData.irpjCsll)}</span>
                        </div>

                        <div className="border-t-2 border-slate-800 my-4"></div>

                        {/* 9. Resultado Líquido */}
                        <div className={`flex justify-between items-center p-4 rounded-xl text-white shadow-lg transform transition-transform hover:scale-[1.01] ${dreData.resultadoLiquido >= 0 ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : 'bg-gradient-to-r from-rose-600 to-red-600'}`}>
                           <div className="flex flex-col">
                              <span className="text-xl font-bold">(=) Resultado Líquido do Exercício</span>
                              <span className="text-xs opacity-80">Margem: {dreData.profitMargin.toFixed(1)}%</span>
                           </div>
                           <span className="text-3xl font-bold">{formatCurrency(dreData.resultadoLiquido)}</span>
                        </div>
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

                        {/* Summary of Cash Flow for Verification */}
                        <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
                           <h4 className="font-bold text-slate-700 text-sm mb-2">Conferência do Dia (Dinheiro)</h4>
                           <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Entrada (Bruto):</span>
                              <span className="font-bold text-emerald-600">+ {formatCurrency(closingData.totalCashReceived)}</span>
                           </div>
                           <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Saída (Troco):</span>
                              <span className="font-bold text-rose-600">- {formatCurrency(closingData.totalChangeGiven)}</span>
                           </div>
                           <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Saída (Despesas):</span>
                              <span className="font-bold text-rose-600">- {formatCurrency(closingData.totalExpense)}</span>
                           </div>
                           <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold">
                              <span className="text-slate-800">Saldo Esperado (s/ Abertura):</span>
                              <span className="text-blue-600">{formatCurrency(closingData.totalCashReceived - closingData.totalChangeGiven - closingData.totalExpense)}</span>
                           </div>
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
                                          {closing.date.split('-').reverse().join('/')}
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
                        <label className="block text-sm font-bold text-slate-700 mb-1">Categoria (Subcategoria)</label>
                        {isAddingInlineCategory ? (
                           <div className="flex gap-2">
                              <input
                                 type="text"
                                 placeholder="Nova Categoria..."
                                 className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                 value={newCategoryName}
                                 onChange={(e) => setNewCategoryName(e.target.value)}
                                 autoFocus
                              />
                              <button
                                 onClick={handleAddInlineCategory}
                                 className="bg-green-600 text-white px-3 rounded-lg hover:bg-green-700"
                              >
                                 <CheckCircle size={18} />
                              </button>
                              <button
                                 onClick={() => setIsAddingInlineCategory(false)}
                                 className="bg-slate-200 text-slate-600 px-3 rounded-lg hover:bg-slate-300"
                              >
                                 <X size={18} />
                              </button>
                           </div>
                        ) : (
                           <div className="flex gap-2">
                              <select
                                 className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                                 value={newRecord.category}
                                 onChange={(e) => setNewRecord({ ...newRecord, category: e.target.value })}
                              >
                                 <option value="" disabled>Selecione uma subcategoria...</option>
                                 {Object.entries(DRE_CATEGORIES).map(([groupName, subCats]) => (
                                    <optgroup label={groupName} key={groupName}>
                                       {subCats.map(subCat => (
                                          <option key={subCat} value={subCat}>{subCat}</option>
                                       ))}
                                    </optgroup>
                                 ))}
                                 {categories.length > 0 && (
                                    <optgroup label="Categorias Personalizadas">
                                       {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </optgroup>
                                 )}
                              </select>
                              <button
                                 onClick={() => { setIsAddingInlineCategory(true); setNewCategoryName(''); }}
                                 className="bg-slate-100 border border-slate-300 text-slate-600 px-3 rounded-lg hover:bg-slate-200"
                                 title="Nova Categoria"
                              >
                                 <Plus size={18} />
                              </button>
                           </div>
                        )}
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