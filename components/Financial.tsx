import React, { useState, useMemo, useCallback } from 'react';
import { FinancialRecord, Branch, Sale, Product, CategoryItem, CashClosing, User } from '../types';
import { dbCategories } from '../services/db';
import { ArrowUpCircle, ArrowDownCircle, X, Plus, Calendar, DollarSign, Repeat, ArrowLeft, Building2, BarChart3, LineChart, Filter, Trash2, Lock, CheckCircle, AlertTriangle, Search, Eye, EyeOff, ChevronDown, ChevronRight, TrendingUp, TrendingDown, PieChart, ShoppingBag, Receipt, CreditCard } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { getTodayDate, normalizePaymentMethod, translatePaymentMethod } from '../services/utils';

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

const DRE_CATEGORIES: Record<string, string[]> = {
   'Deduções e Impostos': ['Devoluções de Vendas', 'Impostos sobre Vendas', 'Descontos Concedidos'],
   'Custos Diretos (Mercadorias/Insumos)': ['Compra de Mercadoria', 'Compra de Insumos', 'Fornecedores', 'Frete s/ Compras'],
   'Despesas com Vendas': ['Comissão de Vendas', 'Embalagens', 'Publicidade & Marketing', 'Frete s/ Vendas'],
   'Despesas Administrativas': ['Salários & Encargos', 'Pró-Labore', 'Aluguel', 'Energia Elétrica / Luz', 'Água / Saneamento', 'Internet / Telefone', 'Manutenção & Peças', 'Material de Limpeza / Escritório', 'Contabilidade'],
   'Despesas Financeiras': ['Taxas de Cartão / Maquininha', 'Juros & Tarifas Bancárias'],
   'Outras Despesas': ['Outras Despesas Operacionais']
};

const AccordionSection: React.FC<{ title: string; icon: React.ReactNode; sectionKey: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }> = ({ title, icon, sectionKey, expanded, onToggle, children }) => (
   <div className="border-b border-slate-100 last:border-b-0">
      <button
         type="button"
         onClick={onToggle}
         className="group flex min-h-14 w-full touch-manipulation items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 sm:px-5"
         aria-expanded={expanded}
         aria-controls={`dre-section-${sectionKey}`}
      >
         <span className="flex min-w-0 items-center gap-3 font-bold text-slate-800">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-blue-900 transition-colors group-hover:bg-blue-50" aria-hidden="true">{icon}</span>
            <span className="truncate">{title}</span>
         </span>
         <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors group-hover:bg-white group-hover:text-blue-900" aria-hidden="true">
            {expanded ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
         </span>
      </button>
      {expanded && <div id={`dre-section-${sectionKey}`} className="px-4 pb-5 sm:px-5">{children}</div>}
   </div>
);

const Financial: React.FC<FinancialProps> = ({ records, sales, products, cashClosings, onAddRecord, onUpdateRecord, onDeleteRecord, onAddCashClosing, onDeleteCashClosing, currentUser, onBack }) => {

   const [showAddModal, setShowAddModal] = useState(false);
   const [viewMode, setViewMode] = useState<'MOVEMENTS' | 'DRE' | 'CASH_CLOSING'>('DRE');
   const [selectedBranch, setSelectedBranch] = useState<'ALL' | Branch>('ALL');
   const [dateRange, setDateRange] = useState<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'LAST_60_DAYS' | 'LAST_90_DAYS' | 'ALL_TIME' | 'CUSTOM'>('ALL_TIME');
   const [customStartDate, setCustomStartDate] = useState(getTodayDate());
   const [customEndDate, setCustomEndDate] = useState(getTodayDate());
   const [searchTerm, setSearchTerm] = useState('');
   const [isValuesVisible, setIsValuesVisible] = useState(true);

   // DRE Accordion state
   const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
      deducoes: true,
      custosFornecedores: true,
      despesasVendas: true,
      despesasAdmin: false,
      despesasFin: false,
      outras: false
   });

   const toggleSection = (section: string) => {
      setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
   };

   const toggleAllSections = () => {
      const allExpanded = Object.values(expandedSections).every(Boolean);
      setExpandedSections({
         deducoes: !allExpanded,
         custosFornecedores: !allExpanded,
         despesasVendas: !allExpanded,
         despesasAdmin: !allExpanded,
         despesasFin: !allExpanded,
         outras: !allExpanded
      });
   };

   // Cash Closing State
   const [closingDate, setClosingDate] = useState(getTodayDate());
   const [closingBranch, setClosingBranch] = useState<Branch>(Branch.FILIAL);
   const [openingBalance, setOpeningBalance] = useState<number>(0);
   const [cashInDrawer, setCashInDrawer] = useState<number>(0);
   const [closingNotes, setClosingNotes] = useState('');

   const [newRecord, setNewRecord] = useState<Partial<FinancialRecord>>({
      type: 'Expense',
      date: getTodayDate(),
      category: '',
      branch: Branch.MATRIZ,
      paymentMethod: 'Pix'
   });
   const [isRecurring, setIsRecurring] = useState(false);
   const [installments, setInstallments] = useState(2);
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

   React.useEffect(() => {
      loadCategories();
   }, []);

   const loadCategories = () => {
      if (!currentUser) return;
      dbCategories.getAll(currentUser.tenantId, 'FINANCIAL')
         .then(setCategories)
         .catch(err => console.error("Erro ao carregar categorias", err));
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

   const filterByDate = useCallback((dateString: string) => {
      if (!dateString) return false;
      if (dateRange === 'ALL_TIME') return true;

      const recordDate = new Date(dateString);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateRange === 'TODAY') {
         return dateString === getTodayDate();
      }

      if (dateRange === 'THIS_WEEK') {
         const firstDayOfWeek = new Date(today);
         firstDayOfWeek.setDate(today.getDate() - today.getDay());
         firstDayOfWeek.setHours(0, 0, 0, 0);
         return recordDate >= firstDayOfWeek && recordDate <= new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
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

   const filteredSales = useMemo(() => sales.filter(s => (selectedBranch === 'ALL' || s.branch === selectedBranch) && filterByDate(s.date) && s.status === 'Completed'), [sales, selectedBranch, filterByDate]);

   const unifiedRecords = useMemo(() => {
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

   const closingData = useMemo(() => {
      const daySales = sales.filter(s => s.date === closingDate && s.branch === closingBranch && s.status === 'Completed');
      const totalSales = daySales.reduce((acc, s) => acc + s.total, 0);
      const byMethod = daySales.reduce((acc, s) => {
         if (normalizePaymentMethod(s.paymentMethod) === 'Split' && s.paymentSplits) {
            s.paymentSplits.forEach(split => {
               const key = normalizePaymentMethod(split.method) as keyof typeof acc;
               acc[key] = (acc[key] || 0) + split.amount;
            });
         } else if (normalizePaymentMethod(s.paymentMethod) !== 'Split') {
            const key = normalizePaymentMethod(s.paymentMethod) as keyof typeof acc;
            acc[key] = (acc[key] || 0) + s.total;
         }
         return acc;
      }, { Pix: 0, Credit: 0, Debit: 0, Cash: 0 } as { Pix: number; Credit: number; Debit: number; Cash: number; });

      const dayExpenses = records
         .filter(r => r.date === closingDate && r.branch === closingBranch && r.type === 'Expense')
         .reduce((acc, r) => acc + r.amount, 0);

      const totalCashReceived = daySales.reduce((acc, s) => acc + (s.cashReceived || 0), 0);
      const totalChangeGiven = daySales.reduce((acc, s) => acc + (s.changeAmount || 0), 0);

      const previousClosing = cashClosings
         .filter(c => c.branch === closingBranch && c.date < closingDate)
         .sort((a, b) => b.date.localeCompare(a.date))[0];

      const openingBalance = previousClosing ? previousClosing.cashInDrawer : 0;
      const cashSales = byMethod['Cash'] || 0;
      const expectedInDrawer = openingBalance + cashSales - dayExpenses;

      return {
         totalSales,
         byMethod,
         dayExpenses,
         totalExpense: dayExpenses,
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
         difference: cashInDrawer - closingData.expectedInDrawer,
         notes: closingNotes,
         closedBy: currentUser.name
      };

      onAddCashClosing(newClosing);
      alert("Caixa fechado com sucesso!");
   };

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
      let perdasEstoque = 0;

      const custosFornecedoresMap: Record<string, number> = {};
      const despesasVendas: Record<string, number> = {};
      const despesasAdministrativas: Record<string, number> = {};
      const despesasFinanceiras: Record<string, number> = {};
      const outrasDespesasMap: Record<string, number> = {};
      const outrasReceitasMap: Record<string, number> = {};

      let totalCustosFornecedores = 0;
      let irpjCsll = 0;

      let totalDespesasVendas = 0;
      let totalDespesasAdministrativas = 0;
      let totalDespesasFinanceiras = 0;
      let totalOutrasDespesas = 0;
      let totalOutrasReceitas = 0;

      filteredRecords.forEach(r => {
         const catName = r.category || 'Outros';
         const catLower = catName.toLowerCase();
         const amount = r.amount;

         if (r.type === 'Expense') {
            if (catLower.includes('perda') || catLower.includes('dano')) {
               perdasEstoque += amount;
            }
            else if (catLower.includes('imposto (das') || catLower === 'das' || catLower.startsWith('das ') || catLower.includes(' das ') || catLower.includes('simples nacional') || catLower.includes('das -')) {
               impostosVendas += amount;
            } else if (catLower.includes('devoluç') || catLower.includes('devoluc')) {
               devolucoesVendas += amount;
            } else if (catLower.includes('desconto')) {
               descontosIncondicionais += amount;
            }
            else if (catLower.includes('irpj') || catLower.includes('csll')) {
               irpjCsll += amount;
            }
            else if (catLower.includes('fornecedor') || catLower.includes('compra de mercadoria') || catLower.includes('compra de insumo') || catLower.includes('insumo')) {
               custosFornecedoresMap[catName] = (custosFornecedoresMap[catName] || 0) + amount;
               totalCustosFornecedores += amount;
            }
            else if (catLower.includes('comissão') || catLower.includes('comissao') || catLower.includes('frete') || catLower.includes('venda') || catLower.includes('marketing') || catLower.includes('embalagem') || catLower.includes('veículo') || catLower.includes('veiculo') || catLower.includes('combustível')) {
               despesasVendas[catName] = (despesasVendas[catName] || 0) + amount;
               totalDespesasVendas += amount;
            }
            else if (catLower.includes('juros') || catLower.includes('taxa') || catLower.includes('banc') || catLower.includes('maquininha') || catLower.includes('tarifa')) {
               despesasFinanceiras[catName] = (despesasFinanceiras[catName] || 0) + amount;
               totalDespesasFinanceiras += amount;
            }
            else if (catLower.includes('pró-labore') || catLower.includes('pro-labore') || catLower.includes('salário') || catLower.includes('salario') || catLower.includes('encargo') || catLower.includes('aluguel') || catLower.includes('água') || catLower.includes('agua') || catLower.includes('luz') || catLower.includes('energia') || catLower.includes('internet') || catLower.includes('telefone') || catLower.includes('escritório') || catLower.includes('escritorio') || catLower.includes('limpeza') || catLower.includes('contáb') || catLower.includes('contab') || catLower.includes('refrigera') || catLower.includes('câmara fria') || catLower.includes('camara fria') || catLower.includes('freezer') || catLower.includes('máquina') || catLower.includes('maquina') || catLower.includes('manutenção') || catLower.includes('manutencao') || catLower.includes('administrativ')) {
               despesasAdministrativas[catName] = (despesasAdministrativas[catName] || 0) + amount;
               totalDespesasAdministrativas += amount;
            }
            else {
               outrasDespesasMap[catName] = (outrasDespesasMap[catName] || 0) + amount;
               totalOutrasDespesas += amount;
            }
         } else if (r.type === 'Income') {
            if (catLower !== 'vendas') {
               outrasReceitasMap[catName] = (outrasReceitasMap[catName] || 0) + amount;
               totalOutrasReceitas += amount;
            }
         }
      });

      const totalDeducoes = devolucoesVendas + totalCancelledSales + descontosIncondicionais + impostosVendas;
      const receitaLiquida = receitaBruta - totalDeducoes;
      const cmvEstoque = completedSales.reduce((totalCMV, sale) => {
         const saleCMV = sale.items.reduce((acc, item) => {
            const product = products.find(p => p.id === item.productId);
            return acc + (item.quantity * (product?.cost || 0));
         }, 0);
         return totalCMV + saleCMV;
      }, 0) + perdasEstoque;

      const totalCustosDiretos = cmvEstoque + totalCustosFornecedores;
      const resultadoBruto = receitaLiquida - totalCustosDiretos;
      const totalDespesasOperacionais = totalDespesasVendas + totalDespesasAdministrativas + totalDespesasFinanceiras;
      const resultadoAntesImpostos = resultadoBruto - totalDespesasOperacionais + totalOutrasReceitas - totalOutrasDespesas;
      const resultadoLiquido = resultadoAntesImpostos - irpjCsll;
      const marginBase = receitaLiquida > 0 ? receitaLiquida : (receitaBruta > 0 ? receitaBruta : 1);
      const grossMargin = (resultadoBruto / marginBase) * 100;
      const profitMargin = (resultadoLiquido / marginBase) * 100;
      const calcPct = (val: number) => (marginBase > 0 ? (val / marginBase) * 100 : 0);

      return {
         receitaBruta,
         deducoes: {
            devolucoesVendas,
            vendasCanceladas: totalCancelledSales,
            descontosIncondicionais,
            impostosVendas,
            total: totalDeducoes,
            pct: calcPct(totalDeducoes)
         },
         receitaLiquida,
         cmvEstoque,
         custosFornecedores: { total: totalCustosFornecedores, items: custosFornecedoresMap, pct: calcPct(totalCustosFornecedores) },
         totalCustosDiretos,
         pctCustosDiretos: calcPct(totalCustosDiretos),
         resultadoBruto,
         grossMargin,
         despesasVendas: { total: totalDespesasVendas, items: despesasVendas, pct: calcPct(totalDespesasVendas) },
         despesasAdministrativas: { total: totalDespesasAdministrativas, items: despesasAdministrativas, pct: calcPct(totalDespesasAdministrativas) },
         despesasFinanceiras: { total: totalDespesasFinanceiras, items: despesasFinanceiras, pct: calcPct(totalDespesasFinanceiras) },
         totalDespesasOperacionais,
         pctDespesasOperacionais: calcPct(totalDespesasOperacionais),
         outrasReceitas: { total: totalOutrasReceitas, items: outrasReceitasMap, pct: calcPct(totalOutrasReceitas) },
         outrasDespesas: { total: totalOutrasDespesas, items: outrasDespesasMap, pct: calcPct(totalOutrasDespesas) },
         resultadoAntesImpostos,
         irpjCsll,
         resultadoLiquido,
         profitMargin,
         grossRevenue: receitaBruta,
         variableCosts: totalCustosDiretos,
         totalExpenses: totalDespesasOperacionais + irpjCsll + totalOutrasDespesas + totalDeducoes,
         netProfit: resultadoLiquido
      };
   }, [sales, filteredRecords, selectedBranch, dateRange, products, customStartDate, customEndDate, filterByDate]);

   const dreData = useMemo(() => calculateDRE(), [calculateDRE]);

   const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
   };

   const displayCurrency = (value: number) => isValuesVisible ? formatCurrency(value) : '••••••';
   const formatPercentage = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
   const displayPercentage = (value: number) => isValuesVisible ? formatPercentage(value) : '••••';

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
      const description = newRecord.description || 'Sem descrição';
      const recordsToAdd: FinancialRecord[] = [];
      const baseDate = new Date(newRecord.date);
      const amount = Number(newRecord.amount);
      const recordType = 'Expense';

      if (isRecurring && installments > 1) {
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
               branch: newRecord.branch,
               paymentMethod: newRecord.paymentMethod || 'Pix'
            });
         }
      } else {
         recordsToAdd.push({
            id: crypto.randomUUID(),
            date: newRecord.date,
            description: description,
            amount: amount,
            type: recordType,
            category: newRecord.category || 'Outros',
            branch: newRecord.branch,
            paymentMethod: newRecord.paymentMethod || 'Pix'
         });
      }

      onAddRecord(recordsToAdd);
      setShowAddModal(false);
      setNewRecord({ type: 'Expense', date: getTodayDate(), category: '', description: '', amount: 0, branch: Branch.MATRIZ, paymentMethod: 'Pix' });
      setIsRecurring(false);
      setInstallments(2);
   };

   const chartData = useMemo(() => {
      return [
         { name: 'Rec. Líquida', value: dreData.receitaLiquida, fill: '#0284c7' },
         { name: 'Custos/Insumos', value: dreData.totalCustosDiretos, fill: '#f59e0b' },
         { name: 'Desp. Operac.', value: dreData.totalDespesasOperacionais, fill: '#ef4444' },
         { name: 'Lucro Líquido', value: dreData.resultadoLiquido, fill: dreData.resultadoLiquido >= 0 ? '#10b981' : '#dc2626' }
      ];
   }, [dreData]);

   return (
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-gray-50 w-full pb-20 md:pb-6 custom-scrollbar">
          <div className="flex items-center gap-3 w-full flex-wrap">
                <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors shrink-0">
                   <ArrowLeft size={24} className="text-slate-600" />
                </button>
                <div>
                   <h2 className="text-xl md:text-2xl font-bold text-slate-800">Gestão Financeira</h2>
                   <p className="text-xs md:text-sm text-slate-500">Fluxo de caixa, DRE, fechamento de caixa e controle de despesas.</p>
                </div>
             </div>

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

            <div className="flex flex-wrap items-center gap-2 w-full">
                  <div className="bg-white p-1 rounded-lg border border-slate-200 flex shrink-0">
                     <button onClick={() => setSelectedBranch('ALL')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Geral</button>
                     <button onClick={() => setSelectedBranch(Branch.MATRIZ)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === Branch.MATRIZ ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Matriz</button>
                     <button onClick={() => setSelectedBranch(Branch.FILIAL)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedBranch === Branch.FILIAL ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Filial</button>
                  </div>

                  <div className="flex gap-2 shrink-0">
                     <button
                        onClick={() => setIsValuesVisible(!isValuesVisible)}
                        className={`p-2 rounded-lg font-bold flex items-center justify-center transition-all shadow-lg border outline-none ${isValuesVisible ? 'bg-white text-slate-400 border-slate-200 hover:text-orange-500' : 'bg-orange-500 text-white border-orange-400'}`}
                        title={isValuesVisible ? "Esconder Valores" : "Mostrar Valores"}
                     >
                        {isValuesVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                     </button>

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

         {viewMode === 'MOVEMENTS' && (
            <div className="space-y-6 animate-in fade-in">
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
                    <div className="overflow-x-auto w-full custom-scrollbar">
                       <div className="divide-y divide-slate-100 max-h-[400px] min-w-0">
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
                                                {translatePaymentMethod(record.paymentMethod)}
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
             </div>
)}

          {viewMode === 'DRE' && dreData && (
             <div className="space-y-5 animate-in fade-in motion-reduce:animate-none sm:space-y-6">
                <section aria-labelledby="dre-summary-title" className="overflow-hidden rounded-2xl border border-blue-900/10 bg-white shadow-sm">
                   <div className="relative overflow-hidden bg-blue-950 px-5 py-6 text-white sm:px-6 sm:py-7">
                      <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-orange-500/20 blur-3xl" aria-hidden="true" />
                      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                         <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Resumo executivo</p>
                            <h3 id="dre-summary-title" className="text-lg font-bold sm:text-xl">Resultado do período</h3>
                            <p className="mt-1 max-w-xl text-sm leading-relaxed text-blue-100">Visão consolidada da operação para apoiar decisões rápidas de receita, custos e rentabilidade.</p>
                         </div>
                         <div className="min-w-0 sm:text-right">
                            <p className="text-xs font-medium text-blue-200">Lucro líquido</p>
                            <p className={`mt-1 break-words text-3xl font-black tabular-nums tracking-tight sm:text-4xl ${dreData.resultadoLiquido >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                               {displayCurrency(dreData.resultadoLiquido)}
                            </p>
                            <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${dreData.resultadoLiquido >= 0 ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/15 text-rose-200'}`}>
                               Margem líquida {displayPercentage(dreData.profitMargin)}
                            </p>
                         </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                      <div className="group p-5 transition-colors hover:bg-blue-50/50">
                         <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                               <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Receita bruta</p>
                               <p className="mt-2 break-words text-xl font-black tabular-nums text-slate-900 sm:text-2xl">{displayCurrency(dreData.receitaBruta)}</p>
                            </div>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-800" aria-hidden="true"><DollarSign size={20} /></span>
                         </div>
                         <p className="mt-3 text-xs text-slate-500">Total de vendas antes das deduções.</p>
                      </div>
                      <div className="group p-5 transition-colors hover:bg-emerald-50/50">
                         <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                               <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Lucro bruto</p>
                               <p className={`mt-2 break-words text-xl font-black tabular-nums sm:text-2xl ${dreData.resultadoBruto >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{displayCurrency(dreData.resultadoBruto)}</p>
                            </div>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700" aria-hidden="true"><TrendingUp size={20} /></span>
                         </div>
                         <p className="mt-3 text-xs text-slate-500">Margem bruta de {displayPercentage(dreData.grossMargin)}.</p>
                      </div>
                      <div className="group p-5 transition-colors hover:bg-rose-50/50">
                         <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                               <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Despesas operacionais</p>
                               <p className="mt-2 break-words text-xl font-black tabular-nums text-rose-700 sm:text-2xl">{displayCurrency(dreData.totalDespesasOperacionais)}</p>
                            </div>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700" aria-hidden="true"><TrendingDown size={20} /></span>
                         </div>
                         <p className="mt-3 text-xs text-slate-500">{displayPercentage(dreData.pctDespesasOperacionais)} da base de receita.</p>
                      </div>
                   </div>
                </section>

                {chartData.length > 0 && (
                   <section aria-labelledby="dre-chart-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                         <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Comparativo</p>
                            <h3 id="dre-chart-title" className="mt-1 text-lg font-bold text-slate-900">Composição do resultado</h3>
                         </div>
                         <p className="text-xs text-slate-500">Valores consolidados no período selecionado</p>
                      </div>
                      <div className="h-72 w-full sm:h-80" role="img" aria-label="Gráfico comparativo de receita líquida, custos, despesas operacionais e lucro líquido">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                               <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                               <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} interval={0} />
                               <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value: number) => `${value < 0 ? '-' : ''}R$ ${Math.abs(value / 1000).toFixed(0)}k`} />
                               <ReferenceLine y={0} stroke="#94a3b8" />
                               <RechartsTooltip
                                  cursor={{ fill: '#f8fafc' }}
                                  formatter={(value: number) => [displayCurrency(value), 'Valor']}
                                  contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)' }}
                               />
                               <Bar dataKey="value" radius={[6, 6, 2, 2]} maxBarSize={72}>
                                  {chartData.map((entry, index) => <Cell key={`bar-${index}`} fill={entry.fill} />)}
                               </Bar>
                            </BarChart>
                         </ResponsiveContainer>
                      </div>
                   </section>
                )}

                <section aria-labelledby="dre-details-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                   <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div>
                         <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Detalhamento</p>
                         <h3 id="dre-details-title" className="mt-1 text-lg font-bold text-slate-900">Demonstrativo de Resultado</h3>
                      </div>
                      <button type="button" onClick={toggleAllSections} className="min-h-11 touch-manipulation self-start rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-blue-900 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:self-auto">
                         {Object.values(expandedSections).every(Boolean) ? 'Recolher tudo' : 'Expandir tudo'}
                      </button>
                   </div>

                   <div>
                      <AccordionSection title="Receita e deduções" icon={<DollarSign size={18} />} sectionKey="deducoes" expanded={expandedSections.deducoes} onToggle={() => toggleSection('deducoes')}>
                         <div className="space-y-1 text-sm [&_span:last-child]:tabular-nums">
                            <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2.5"><span className="text-slate-600">Receita Bruta (Vendas)</span><span className="shrink-0 font-bold text-slate-900">{displayCurrency(dreData.receitaBruta)}</span></div>
                            <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50"><span>Devoluções</span><span className="shrink-0">{displayCurrency(dreData.deducoes.devolucoesVendas)}</span></div>
                            <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50"><span>Vendas Canceladas</span><span className="shrink-0">{displayCurrency(dreData.deducoes.vendasCanceladas)}</span></div>
                            <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50"><span>Impostos sobre Vendas</span><span className="shrink-0">{displayCurrency(dreData.deducoes.impostosVendas)}</span></div>
                            <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50"><span>Descontos</span><span className="shrink-0">{displayCurrency(dreData.deducoes.descontosIncondicionais)}</span></div>
                            <div className="mt-2 flex items-start justify-between gap-4 rounded-lg bg-blue-50 px-3 py-3 font-bold text-blue-950"><span>Receita Líquida</span><span className="shrink-0">{displayCurrency(dreData.receitaLiquida)}</span></div>
                         </div>
                      </AccordionSection>

                      <AccordionSection title="Custos diretos" icon={<ShoppingBag size={18} />} sectionKey="custosFornecedores" expanded={expandedSections.custosFornecedores} onToggle={() => toggleSection('custosFornecedores')}>
                         <div className="space-y-1 text-sm [&_span:last-child]:tabular-nums">
                            <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2.5"><span className="text-slate-600">CMV Estoque</span><span className="shrink-0 font-medium text-slate-900">{displayCurrency(dreData.cmvEstoque)}</span></div>
                            <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2.5"><span className="text-slate-600">Custos Fornecedores</span><span className="shrink-0 font-medium text-slate-900">{displayCurrency(dreData.custosFornecedores.total)}</span></div>
                            <div className="mt-2 flex items-start justify-between gap-4 rounded-lg bg-amber-50 px-3 py-3 font-bold text-amber-900"><span>Total Custos Diretos</span><span className="shrink-0">{displayCurrency(dreData.totalCustosDiretos)}</span></div>
                            <div className={`flex items-start justify-between gap-4 rounded-lg px-3 py-3 font-bold ${dreData.resultadoBruto >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}><span>Resultado Bruto</span><span className="shrink-0">{displayCurrency(dreData.resultadoBruto)}</span></div>
                         </div>
                      </AccordionSection>

                      <AccordionSection title="Despesas com vendas" icon={<TrendingDown size={18} />} sectionKey="despesasVendas" expanded={expandedSections.despesasVendas} onToggle={() => toggleSection('despesasVendas')}>
                         <div className="space-y-1 text-sm [&_span:last-child]:tabular-nums">
                            {Object.entries(dreData.despesasVendas.items).map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50"><span>{key}</span><span className="shrink-0">{displayCurrency(value)}</span></div>)}
                            <div className="mt-2 flex items-start justify-between gap-4 rounded-lg bg-slate-100 px-3 py-3 font-bold text-slate-900"><span>Total Desp. Vendas</span><span className="shrink-0">{displayCurrency(dreData.despesasVendas.total)}</span></div>
                         </div>
                      </AccordionSection>

                      <AccordionSection title="Despesas administrativas" icon={<Building2 size={18} />} sectionKey="despesasAdmin" expanded={expandedSections.despesasAdmin} onToggle={() => toggleSection('despesasAdmin')}>
                         <div className="space-y-1 text-sm [&_span:last-child]:tabular-nums">
                            {Object.entries(dreData.despesasAdministrativas.items).map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50"><span>{key}</span><span className="shrink-0">{displayCurrency(value)}</span></div>)}
                            <div className="mt-2 flex items-start justify-between gap-4 rounded-lg bg-slate-100 px-3 py-3 font-bold text-slate-900"><span>Total Desp. Administrativas</span><span className="shrink-0">{displayCurrency(dreData.despesasAdministrativas.total)}</span></div>
                         </div>
                      </AccordionSection>

                      <AccordionSection title="Despesas financeiras" icon={<CreditCard size={18} />} sectionKey="despesasFin" expanded={expandedSections.despesasFin} onToggle={() => toggleSection('despesasFin')}>
                         <div className="space-y-1 text-sm [&_span:last-child]:tabular-nums">
                            {Object.entries(dreData.despesasFinanceiras.items).map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50"><span>{key}</span><span className="shrink-0">{displayCurrency(value)}</span></div>)}
                            <div className="mt-2 flex items-start justify-between gap-4 rounded-lg bg-slate-100 px-3 py-3 font-bold text-slate-900"><span>Total Desp. Financeiras</span><span className="shrink-0">{displayCurrency(dreData.despesasFinanceiras.total)}</span></div>
                         </div>
                      </AccordionSection>

                      <AccordionSection title="Outras receitas e despesas" icon={<Receipt size={18} />} sectionKey="outras" expanded={expandedSections.outras} onToggle={() => toggleSection('outras')}>
                         <div className="space-y-1 text-sm [&_span:last-child]:tabular-nums">
                            {Object.entries(dreData.outrasReceitas.items).map(([key, value]) => <div key={`rec-${key}`} className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-emerald-700 hover:bg-emerald-50"><span>Receita: {key}</span><span className="shrink-0">+{displayCurrency(value)}</span></div>)}
                            {Object.entries(dreData.outrasDespesas.items).map(([key, value]) => <div key={`exp-${key}`} className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50"><span>Despesa: {key}</span><span className="shrink-0">{displayCurrency(value)}</span></div>)}
                            <div className="mt-2 flex items-start justify-between gap-4 rounded-lg bg-slate-100 px-3 py-3 font-bold text-slate-900"><span>Resultado Antes de Impostos</span><span className="shrink-0">{displayCurrency(dreData.resultadoAntesImpostos)}</span></div>
                            {dreData.irpjCsll > 0 && <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 text-rose-700"><span>IRPJ/CSLL</span><span className="shrink-0">{displayCurrency(dreData.irpjCsll)}</span></div>}
                            <div className={`flex items-start justify-between gap-4 rounded-xl px-3 py-4 text-base font-black ${dreData.resultadoLiquido >= 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}><span>Resultado Líquido</span><span className="shrink-0">{displayCurrency(dreData.resultadoLiquido)}</span></div>
                         </div>
                      </AccordionSection>
                   </div>
                </section>
             </div>
          )}

          {viewMode === 'CASH_CLOSING' && closingData && (
             <div className="space-y-6 animate-in fade-in">
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                   <h3 className="font-bold text-slate-700 text-lg mb-4">Fechamento de Caixa</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                         <label className="block text-sm font-bold text-slate-700 mb-1">Data</label>
                         <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                         <label className="block text-sm font-bold text-slate-700 mb-1">Filial</label>
                         <select value={closingBranch} onChange={(e) => setClosingBranch(e.target.value as Branch)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value={Branch.MATRIZ}>Matriz</option>
                            <option value={Branch.FILIAL}>Filial</option>
                         </select>
                      </div>
                   </div>

<div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
                       <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500">Saldo Anterior</p>
                          <p className="font-bold text-slate-800 mt-1">{formatCurrency(closingData?.openingBalance ?? 0)}</p>
                       </div>
                       <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500">Vendas do Dia</p>
                          <p className="font-bold text-emerald-600 mt-1">{formatCurrency(closingData?.totalSales ?? 0)}</p>
                       </div>
                       <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500">Despesas do Dia</p>
                          <p className="font-bold text-red-600 mt-1">{formatCurrency(closingData?.dayExpenses ?? 0)}</p>
                       </div>
                       <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500">Esperado no Caixa</p>
                          <p className="font-bold text-slate-800 mt-1">{formatCurrency(closingData?.expectedInDrawer ?? 0)}</p>
                       </div>
                   </div>

                   <div className="mt-6 space-y-4">
                      <div>
                         <label className="block text-sm font-bold text-slate-700 mb-1">Dinheiro em Caixa (R$)</label>
                         <input type="number" value={cashInDrawer} onChange={(e) => setCashInDrawer(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                         <label className="block text-sm font-bold text-slate-700 mb-1">Observações</label>
                         <textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3} />
                      </div>
                      <button onClick={handleSaveClosing} className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg">
                         <Lock size={18} /> Fechar Caixa
                      </button>
                   </div>
                </div>
             </div>
          )}


          {/* --- EDIT RECORD MODAL --- */}
         {showEditModal && editingRecord && (
            <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-4 animate-in fade-in duration-200">
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
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-4 animate-in fade-in duration-200">
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
                           onClick={handleAddInlineCategory}
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
