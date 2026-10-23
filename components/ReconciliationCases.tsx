import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronRight, CircleAlert, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { ReconciliationAction, ReconciliationCase, Sale } from '../types';
import { dbReconciliation } from '../services/db';

interface ReconciliationCasesProps {
  sales: Sale[];
  onDataChanged: () => Promise<void>;
}

const formatCurrency = (value?: number | null) =>
  (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const caseLabels: Record<ReconciliationCase['caseType'], string> = {
  missing_revenue: 'Venda sem receita',
  orphan_revenue: 'Receita sem venda',
  duplicate_revenue: 'Possível receita duplicada',
  amount_mismatch: 'Valor divergente',
  pending_sale_revenue: 'Venda pendente com receita',
  duplicate_reversal: 'Estorno aplicado',
};

const actionLabels: Record<ReconciliationAction, string> = {
  review: 'Registrar revisão sem ajuste',
  create_missing_revenue: 'Criar a receita da venda',
  reverse_financial: 'Criar estorno compensatório',
  link_financial: 'Vincular receita a uma venda',
};

function availableActions(item: ReconciliationCase): ReconciliationAction[] {
  if (item.caseType === 'missing_revenue') return ['create_missing_revenue', 'review'];
  if (item.caseType === 'orphan_revenue') return ['link_financial', 'reverse_financial', 'review'];
  if (item.caseType === 'duplicate_revenue' || item.caseType === 'amount_mismatch' || item.caseType === 'pending_sale_revenue') {
    return ['reverse_financial', 'review'];
  }
  return [];
}

const statusStyle: Record<ReconciliationCase['status'], string> = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  APPLIED: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
};

const statusLabel: Record<ReconciliationCase['status'], string> = {
  PENDING_REVIEW: 'Pendente',
  APPLIED: 'Aplicado',
  RESOLVED: 'Resolvido',
};

const ReconciliationCases: React.FC<ReconciliationCasesProps> = ({ sales, onDataChanged }) => {
  const [cases, setCases] = useState<ReconciliationCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ReconciliationCase['status'] | 'ALL'>('PENDING_REVIEW');
  const [selected, setSelected] = useState<ReconciliationCase | null>(null);
  const [action, setAction] = useState<ReconciliationAction>('review');
  const [financialId, setFinancialId] = useState('');
  const [saleId, setSaleId] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'configure' | 'confirm'>('configure');
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');

  const loadCases = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setCases(await dbReconciliation.getCases());
    } catch (error: any) {
      setLoadError(error.message || 'Não foi possível carregar os casos auditados.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadCases(); }, []);

  const pendingCount = cases.filter(item => item.status === 'PENDING_REVIEW').length;
  const filteredCases = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return cases.filter(item => {
      if (status !== 'ALL' && item.status !== status) return false;
      if (!normalizedQuery) return true;
      return [
        caseLabels[item.caseType],
        item.caseKey,
        item.sale?.id,
        item.sale?.customerName,
        item.financialId,
        ...item.financials.flatMap(financial => [financial.id, financial.description]),
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(normalizedQuery);
    });
  }, [cases, query, status]);

  const openCase = (item: ReconciliationCase) => {
    const actions = availableActions(item);
    setSelected(item);
    setAction(actions[0] ?? 'review');
    setFinancialId(item.financials[0]?.id ?? item.financialId ?? '');
    setSaleId(item.saleId ?? '');
    setNote('');
    setActionError('');
    setStep('configure');
  };

  const closeModal = () => {
    if (!isSaving) setSelected(null);
  };

  const validateConfiguration = () => {
    if (note.trim().length < 5) return 'Registre um motivo com pelo menos 5 caracteres para manter a trilha de auditoria.';
    if (action === 'reverse_financial' && !financialId) return 'Selecione a receita que será estornada.';
    if (action === 'link_financial' && (!financialId || !saleId)) return 'Selecione a receita e informe a venda que receberá o vínculo.';
    return '';
  };

  const prepareConfirmation = () => {
    const validationError = validateConfiguration();
    setActionError(validationError);
    if (!validationError) setStep('confirm');
  };

  const confirmResolution = async () => {
    if (!selected) return;
    setIsSaving(true);
    setActionError('');
    try {
      await dbReconciliation.resolveCase(selected.caseKey, action, { financialId, saleId, note });
      await Promise.all([loadCases(), onDataChanged()]);
      setSuccess('Caso resolvido e registrado na trilha de auditoria.');
      setSelected(null);
      window.setTimeout(() => setSuccess(''), 4000);
    } catch (error: any) {
      setActionError(error.message || 'Não foi possível aplicar esta resolução. Nenhuma alteração foi confirmada.');
      setStep('configure');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedFinancial = selected?.financials.find(financial => financial.id === financialId);
  const selectedSale = sales.find(sale => sale.id === saleId);

  return (
    <div className="space-y-5 animate-in fade-in">
      <section className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Fila de revisão</p>
            <h3 className="text-xl font-black mt-1">Casos auditados de conciliação</h3>
            <p className="text-sm text-slate-300 mt-1">Cada correção exige uma prévia, confirmação e justificativa.</p>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-center">
            <p className="text-2xl font-black text-amber-300">{pendingCount}</p>
            <p className="text-[10px] uppercase font-bold text-slate-300">pendentes</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input aria-label="Buscar casos auditados" name="reconciliation-search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar venda, cliente, lançamento ou caso…" className="w-full h-10 pl-9 pr-3 border border-slate-200 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500" />
          </div>
          <div className="flex gap-2">
            <select aria-label="Filtrar casos por status" name="reconciliation-status" value={status} onChange={event => setStatus(event.target.value as ReconciliationCase['status'] | 'ALL')} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 bg-white focus-visible:ring-2 focus-visible:ring-orange-500">
              <option value="PENDING_REVIEW">Pendentes</option>
              <option value="RESOLVED">Resolvidos</option>
              <option value="APPLIED">Aplicados</option>
              <option value="ALL">Todos</option>
            </select>
            <button onClick={() => void loadCases()} disabled={isLoading} aria-label="Atualizar casos" className="h-10 w-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50 flex items-center justify-center">
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Carregando casos auditados...</div>
        ) : loadError ? (
          <div className="p-8 text-center"><CircleAlert className="mx-auto text-rose-500 mb-2" /><p className="text-sm text-rose-700">{loadError}</p><button onClick={() => void loadCases()} className="mt-3 text-sm font-bold text-blue-700">Tentar novamente</button></div>
        ) : filteredCases.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500"><CheckCircle className="mx-auto mb-2 text-emerald-500" />Nenhum caso encontrado para este filtro.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredCases.map(item => (
              <article key={item.caseKey} style={{ contentVisibility: 'auto', containIntrinsicSize: '112px' }} className="p-4 flex flex-col lg:flex-row lg:items-center gap-4 hover:bg-slate-50/70">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] uppercase font-black px-2 py-1 rounded ${statusStyle[item.status]}`}>{statusLabel[item.status]}</span>
                    <span className="text-xs font-bold text-slate-700">{caseLabels[item.caseType]}</span>
                    {item.sale?.branch && <span className="text-[10px] text-slate-500">{item.sale.branch}</span>}
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-800">{item.sale ? `${item.sale.customerName || 'Consumidor'} · ${item.sale.date}` : item.financials[0]?.description || 'Receita sem venda identificada'}</p>
                  <p className="mt-1 text-xs text-slate-500 font-mono truncate">Venda: {item.saleId || 'não vinculada'} · Caso: {item.caseKey}</p>
                </div>
                <div className="lg:text-right shrink-0">
                  <p className={`text-base font-black ${item.proposedAmount && item.proposedAmount < 0 ? 'text-rose-700' : 'text-slate-800'}`}>{formatCurrency(item.proposedAmount)}</p>
                  <p className="text-[11px] text-slate-500">{item.financials.length} lançamento(s) relacionado(s)</p>
                </div>
                <button onClick={() => openCase(item)} disabled={item.status !== 'PENDING_REVIEW'} className="min-h-10 px-4 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:bg-slate-100 disabled:text-slate-400 flex items-center justify-center gap-1">
                  {item.status === 'PENDING_REVIEW' ? <>Analisar <ChevronRight size={15} /></> : 'Ver registro'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {success && <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-bold flex gap-2"><CheckCircle size={18} />{success}</div>}

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 p-4 flex items-center justify-center overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="reconciliation-case-title">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
            <header className="p-5 border-b border-slate-100 flex justify-between gap-4">
              <div><p className="text-xs font-bold text-orange-700">{caseLabels[selected.caseType]}</p><h3 id="reconciliation-case-title" className="text-lg font-black text-slate-800">Revisar caso de conciliação</h3></div>
              <button onClick={closeModal} aria-label="Fechar" className="h-10 w-10 rounded-lg hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-orange-500 flex items-center justify-center"><X size={20} /></button>
            </header>

            <div className="p-5 space-y-5">
              <section className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><p className="text-xs text-slate-500">Venda</p><p className="font-bold text-slate-800 break-all">{selected.saleId || 'Não vinculada'}</p></div>
                  <div><p className="text-xs text-slate-500">Impacto identificado</p><p className="font-bold text-slate-800">{formatCurrency(selected.proposedAmount)}</p></div>
                </div>
                {selected.sale && <p className="mt-3 text-slate-600">{selected.sale.customerName || 'Consumidor'} · {selected.sale.date} · total {formatCurrency(selected.sale.total)}</p>}
              </section>

              {step === 'configure' ? <>
                <label htmlFor="reconciliation-action" className="block text-sm font-bold text-slate-700">Ação</label>
                <select id="reconciliation-action" name="reconciliation-action" value={action} onChange={event => setAction(event.target.value as ReconciliationAction)} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500">
                  {availableActions(selected).map(candidate => <option key={candidate} value={candidate}>{actionLabels[candidate]}</option>)}
                </select>

                {action === 'reverse_financial' && <label className="block"><span className="block text-sm font-bold text-slate-700 mb-1">Receita a estornar</span><select name="reconciliation-financial-reversal" value={financialId} onChange={event => setFinancialId(event.target.value)} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500"><option value="">Selecione</option>{selected.financials.map(financial => <option key={financial.id} value={financial.id}>{formatCurrency(financial.amount)} · {financial.date} · {financial.description}</option>)}</select></label>}

                {action === 'link_financial' && <>
                  <label className="block"><span className="block text-sm font-bold text-slate-700 mb-1">Receita órfã</span><select name="reconciliation-financial-link" value={financialId} onChange={event => setFinancialId(event.target.value)} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500"><option value="">Selecione</option>{selected.financials.map(financial => <option key={financial.id} value={financial.id}>{formatCurrency(financial.amount)} · {financial.description}</option>)}</select></label>
                  <label className="block"><span className="block text-sm font-bold text-slate-700 mb-1">Venda correta</span><input name="reconciliation-sale-link" autoComplete="off" list="reconciliation-sales" value={saleId} onChange={event => setSaleId(event.target.value)} placeholder="Busque pelo ID da venda…" className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500" /><datalist id="reconciliation-sales">{sales.map(sale => <option key={sale.id} value={sale.id}>{sale.customerName} · {sale.date} · {formatCurrency(sale.total)}</option>)}</datalist></label>
                </>}

                <label className="block"><span className="block text-sm font-bold text-slate-700 mb-1">Justificativa da decisão</span><textarea name="reconciliation-note" value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={500} placeholder="Ex.: confirmado no comprovante bancário de 26/07…" className="w-full rounded-lg border border-slate-300 p-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500" /></label>
                {actionError && <p role="alert" aria-live="polite" className="text-sm text-rose-700 flex gap-2"><AlertTriangle size={16} />{actionError}</p>}
                <button onClick={prepareConfirmation} className="min-h-11 w-full rounded-lg bg-orange-600 hover:bg-orange-500 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 text-white font-bold text-sm">Revisar impacto antes de confirmar</button>
              </> : <>
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertTriangle className="text-amber-700 shrink-0" /><div><h4 className="font-black text-amber-900">Confirme a correção</h4><p className="mt-1 text-sm text-amber-800">{action === 'create_missing_revenue' && `Será criada uma receita de ${formatCurrency(selected.sale?.total)} vinculada à venda.`}{action === 'reverse_financial' && `Será criado um estorno de ${formatCurrency(-(selectedFinancial?.amount || 0))}; o lançamento original será preservado.`}{action === 'link_financial' && `A receita será vinculada à venda ${selectedSale?.id || saleId}. Nenhum valor será alterado.`}{action === 'review' && 'O caso será marcado como revisado, sem qualquer lançamento financeiro.'}</p><p className="mt-2 text-xs text-amber-800">Justificativa: {note}</p></div></div></section>
                <div className="flex flex-col-reverse sm:flex-row gap-3"><button onClick={() => setStep('configure')} disabled={isSaving} className="min-h-11 flex-1 rounded-lg border border-slate-300 font-bold text-sm text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-500">Voltar</button><button onClick={() => void confirmResolution()} disabled={isSaving} className="min-h-11 flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-60 text-white font-bold text-sm flex justify-center items-center gap-2">{isSaving && <Loader2 size={16} className="animate-spin" />}Confirmar e registrar</button></div>
              </>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReconciliationCases;
