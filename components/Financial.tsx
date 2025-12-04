import React, { useState } from 'react';
import { FinancialRecord } from '../types';
import { ArrowUpCircle, ArrowDownCircle, PieChart, FileText, Download, X, AlertCircle, Plus, Calendar, DollarSign, Repeat } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface FinancialProps {
   records: FinancialRecord[];
   onAddRecord: (records: FinancialRecord[]) => void;
}

const Financial: React.FC<FinancialProps> = ({ records, onAddRecord }) => {
   const [showTaxModal, setShowTaxModal] = useState(false);
   const [showAddModal, setShowAddModal] = useState(false);

   // Form State - Defaulted to Expense, removed logic to switch to Income in UI
   const [newRecord, setNewRecord] = useState<Partial<FinancialRecord>>({
      type: 'Expense',
      date: new Date().toISOString().split('T')[0],
      category: 'Fornecedores'
   });
   const [isRecurring, setIsRecurring] = useState(false);
   const [installments, setInstallments] = useState(2); // Default to 2 if recurring

   // Calculate totals dynamically from records
   const totalIncome = records.filter(r => r.type === 'Income').reduce((acc, curr) => acc + curr.amount, 0);
   const totalExpense = records.filter(r => r.type === 'Expense').reduce((acc, curr) => acc + curr.amount, 0);

   // Helper for currency
   const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
   };

   // Mock Tax Data - Set to 0 as requested for clean slate
   const taxData = [
      { name: 'CPP (Previdência)', value: 0, color: '#3b82f6' },
      { name: 'ICMS', value: 0, color: '#f97316' },
      { name: 'ISS', value: 0, color: '#1e40af' },
      { name: 'PIS/COFINS', value: 0, color: '#f43f5e' },
   ];

   const totalTax = 0;

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
               category: newRecord.category || 'Outros'
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
            category: newRecord.category || 'Outros'
         });
      }

      onAddRecord(recordsToAdd);
      setShowAddModal(false);
      // Reset form
      setNewRecord({ type: 'Expense', date: new Date().toISOString().split('T')[0], category: 'Fornecedores', description: '', amount: 0 });
      setIsRecurring(false);
      setInstallments(2);
   };

   return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
               <h2 className="text-2xl font-bold text-slate-800">Gestão Financeira</h2>
               <p className="text-slate-500">Fluxo de caixa, contas a pagar e impostos.</p>
            </div>
            <button
               onClick={() => setShowAddModal(true)}
               className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-900/10 transition-colors"
            >
               <Plus size={18} /> Lançar Despesa
            </button>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-emerald-500 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
               <div className="relative z-10">
                  <p className="text-emerald-100 font-medium">Entradas (Mês)</p>
                  <h3 className="text-3xl font-bold mt-1">{formatCurrency(totalIncome)}</h3>
               </div>
               <ArrowUpCircle className="absolute right-4 bottom-4 text-emerald-400 opacity-50" size={64} />
            </div>
            <div className="bg-rose-500 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
               <div className="relative z-10">
                  <p className="text-rose-100 font-medium">Saídas (Mês)</p>
                  <h3 className="text-3xl font-bold mt-1">{formatCurrency(totalExpense)}</h3>
               </div>
               <ArrowDownCircle className="absolute right-4 bottom-4 text-rose-400 opacity-50" size={64} />
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-center items-center text-center group cursor-pointer hover:border-orange-300 transition-colors" onClick={() => setShowTaxModal(true)}>
               <div className="bg-orange-50 p-3 rounded-full mb-2 group-hover:bg-orange-100 transition-colors">
                  <PieChart className="text-orange-600" size={28} />
               </div>
               <h4 className="font-bold text-slate-800">Relatório Fiscal</h4>
               <p className="text-xs text-slate-500 mb-3">Simples Nacional (Out/23)</p>
               <button className="text-blue-600 text-sm font-bold hover:underline">Ver Detalhes</button>
            </div>
         </div>

         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold text-slate-700">Extrato Recente</h3>
               <button className="text-xs text-blue-600 font-bold hover:underline">Ver Todo Histórico</button>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
               {records.map(record => (
                  <div key={record.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                     <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${record.type === 'Income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                           {record.type === 'Income' ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
                        </div>
                        <div>
                           <p className="font-bold text-slate-800">{record.description}</p>
                           <div className="flex gap-2">
                              <p className="text-xs text-slate-500 flex items-center gap-1"><Calendar size={10} /> {record.date}</p>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{record.category}</span>
                           </div>
                        </div>
                     </div>
                     <span className={`font-bold ${record.type === 'Income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {record.type === 'Income' ? '+' : '-'} {formatCurrency(record.amount)}
                     </span>
                  </div>
               ))}
            </div>
         </div>

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
                           <option value="Fornecedores">Fornecedores</option>
                           <option value="Manutenção">Manutenção</option>
                           <option value="Utilidades">Utilidades (Luz/Água)</option>
                           <option value="Pessoal">Pessoal / Salários</option>
                           <option value="Impostos">Impostos</option>
                           <option value="Aluguel">Aluguel</option>
                           <option value="Equipamentos">Equipamentos</option>
                           <option value="Outros">Outros</option>
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

         {/* Fiscal Modal (Existing) */}
         {showTaxModal && (
            <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-5 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                     <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg">
                           <FileText size={20} className="text-blue-700" />
                        </div>
                        <div>
                           <h3 className="font-bold text-slate-800">Demonstrativo de Impostos</h3>
                           <p className="text-xs text-slate-500">Regime: Simples Nacional</p>
                        </div>
                     </div>
                     <button onClick={() => setShowTaxModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                  </div>

                  <div className="p-6 overflow-y-auto">
                     <div className="flex flex-col md:flex-row gap-8 mb-8">
                        {/* Tax Chart */}
                        <div className="flex-1 flex flex-col items-center">
                           <div className="w-48 h-48 relative">
                              <ResponsiveContainer width="100%" height="100%">
                                 <RechartsPie>
                                    <Pie
                                       data={taxData}
                                       cx="50%"
                                       cy="50%"
                                       innerRadius={60}
                                       outerRadius={80}
                                       paddingAngle={5}
                                       dataKey="value"
                                    >
                                       {taxData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                       ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                 </RechartsPie>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                 <span className="text-2xl font-bold text-slate-800">{formatCurrency(totalTax)}</span>
                                 <span className="text-[10px] text-slate-400 uppercase tracking-wide">Total DAS</span>
                              </div>
                           </div>
                        </div>

                        {/* Tax Legend */}
                        <div className="flex-1 space-y-3">
                           <h4 className="font-semibold text-slate-700 mb-2">Detalhamento da Guia (DAS)</h4>
                           {taxData.map((item) => (
                              <div key={item.name} className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
                                 <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                                    <span className="text-sm text-slate-600">{item.name}</span>
                                 </div>
                                 <span className="font-bold text-slate-800 text-sm">{formatCurrency(item.value)}</span>
                              </div>
                           ))}
                           <div className="border-t border-slate-100 mt-4 pt-3 flex justify-between items-center">
                              <span className="font-bold text-slate-800">Vencimento</span>
                              <span className="text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded text-xs">20/11/2023</span>
                           </div>
                        </div>
                     </div>

                     <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-6 flex items-start gap-3">
                        <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                        <div>
                           <h5 className="font-bold text-amber-800 text-sm">Alerta Fiscal</h5>
                           <p className="text-amber-700 text-xs mt-1">
                              A alíquota efetiva subiu para 4.5% este mês devido ao aumento do faturamento bruto acumulado nos últimos 12 meses.
                           </p>
                        </div>
                     </div>

                     <button className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                        <Download size={18} /> Baixar Guia DAS (PDF)
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default Financial;