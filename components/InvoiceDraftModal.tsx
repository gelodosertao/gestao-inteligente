import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Save, Send, X } from 'lucide-react';
import { Customer, FiscalContext, Sale } from '../types';
import { dbCustomers } from '../services/db';
import { invoiceService, InvoiceDraftState } from '../services/invoiceService';

interface Props {
    sale: Sale;
    customers: Customer[];
    isAdmin: boolean;
    onClose: () => void;
    onChanged?: () => Promise<void>;
}

const controlClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100';
const isFiscalSetupIssue = (field: string) => ['issuer', 'series', 'rule', 'rule.config'].includes(field) ||
    field.startsWith('issuer.') || field.startsWith('rule.') || field.startsWith('product.');
const customerFields: { key: keyof Customer; label: string; maxLength?: number }[] = [
    { key: 'cpfCnpj', label: 'CPF / CNPJ' }, { key: 'razaoSocial', label: 'Razão social' },
    { key: 'inscricaoEstadual', label: 'Inscrição estadual' }, { key: 'zipCode', label: 'CEP' },
    { key: 'logradouro', label: 'Logradouro' }, { key: 'numero', label: 'Número' },
    { key: 'bairro', label: 'Bairro' }, { key: 'city', label: 'Cidade' },
    { key: 'state', label: 'UF', maxLength: 2 }, { key: 'phone', label: 'Telefone (opcional)' },
];

export function FiscalContextFields({ value, onChange }: { value: FiscalContext; onChange: (value: FiscalContext) => void }) {
    const change = (patch: Partial<FiscalContext>) => onChange({ ...value, ...patch });
    return <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Destino da venda
            <select className={controlClass} value={value.operation} onChange={e => change({ operation: e.target.value as FiscalContext['operation'] })}>
                <option value="internal_b2b_own_production">Dentro da Bahia · CFOP 5101</option>
                <option value="interstate_b2b_own_production">Fora da Bahia · CFOP 6101 a confirmar</option>
            </select>
            {value.operation === 'interstate_b2b_own_production' && <span className="mt-1 block text-xs text-amber-800">O CFOP 6101 é referência para venda de produção própria a contribuinte. Esta emissão fica bloqueada até aprovação do tratamento fiscal interestadual.</span>}
        </label>
        <label className="text-sm font-medium">Data da operação
            <input className={controlClass} type="date" value={value.operationDate} onChange={e => change({ operationDate: e.target.value })} />
        </label>
        <label className="text-sm font-medium">Como a venda aconteceu?
            <select className={controlClass} value={value.buyerPresence ?? ''} onChange={e => onChange({ ...value, buyerPresence: e.target.value === '' ? undefined : Number(e.target.value) as FiscalContext['buyerPresence'], intermediary: e.target.value === '5' ? undefined : value.intermediary ?? 0 })}>
                <option value="">Selecione</option><option value="1">Presencial no estabelecimento</option><option value="2">Internet</option><option value="3">Teleatendimento</option><option value="5">Presencial fora do estabelecimento</option><option value="9">Não presencial / outros</option>
            </select>
        </label>
        {[1, 2, 3, 9].includes(value.buyerPresence ?? -1) && <label className="text-sm font-medium">Intermediador da venda
            <select className={controlClass} value={value.intermediary ?? ''} onChange={e => change({ intermediary: e.target.value === '' ? undefined : Number(e.target.value) as 0 | 1 })}>
                <option value="">Selecione</option><option value="0">Venda direta pela GDS</option><option value="1">Marketplace / intermediador</option>
            </select>
        </label>}
        <label className="text-sm font-medium">Responsabilidade pelo transporte
            <select className={controlClass} value={value.freightMode ?? ''} onChange={e => change({ freightMode: e.target.value === '' ? undefined : Number(e.target.value) as FiscalContext['freightMode'] })}>
                <option value="">Selecione</option><option value="0">Frete por conta do remetente</option><option value="1">Frete por conta do destinatário</option><option value="2">Frete por conta de terceiros</option><option value="3">Transporte próprio do remetente</option><option value="4">Transporte próprio do destinatário</option><option value="9">Sem ocorrência de transporte</option>
            </select>
        </label>
        <label className="text-sm font-medium">Destinação da compra
            <select className={controlClass} value={value.finalConsumer === undefined ? '' : String(value.finalConsumer)} onChange={e => change({ finalConsumer: e.target.value === '' ? undefined : e.target.value === 'true' })}>
                <option value="">Selecione</option><option value="false">Revenda / operação não final</option><option value="true">Consumo final, inclusive empresarial</option>
            </select>
        </label>
        <label className="text-sm font-medium">Condição negociada
            <select className={controlClass} value={value.paymentTiming ?? ''} onChange={e => change({ paymentTiming: e.target.value as FiscalContext['paymentTiming'] || undefined, dueDate: e.target.value === 'term' ? value.dueDate : undefined })}>
                <option value="">Selecione</option><option value="cash">À vista</option><option value="term">A prazo</option>
            </select>
        </label>
        {value.paymentTiming === 'term' && <label className="text-sm font-medium">Vencimento combinado
            <input className={controlClass} type="date" min={value.operationDate} value={value.dueDate || ''} onChange={e => change({ dueDate: e.target.value })} />
        </label>}
    </div>;
}

export default function InvoiceDraftModal({ sale, customers, isAdmin, onClose, onChanged }: Props) {
    const [draftState, setDraftState] = useState<InvoiceDraftState | null>(null);
    const [context, setContext] = useState<FiscalContext>(sale.fiscalContext || { operation: 'internal_b2b_own_production', operationDate: sale.date.slice(0, 10), intermediary: 0 });
    const [customerId, setCustomerId] = useState(sale.customerId || '');
    const [customer, setCustomer] = useState<Customer | null>(customers.find(c => c.id === sale.customerId) || null);
    const [customerEdited, setCustomerEdited] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState('Carregando nota');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const dialogRef = useRef<HTMLDivElement>(null);
    const resumable = draftState?.draft?.status === 'reserved' && draftState.canEmit;
    const priorHomologyReady = sale.nfeEnvironment === 2 && draftState?.environment === 1 && draftState.canEmit && draftState.draft?.status === 'draft';
    const locked = (Boolean(sale.nfeNumber) && !resumable && !priorHomologyReady) || Boolean(draftState?.draft && !['draft', 'ready', 'rascunho', 'stale', 'reserved'].includes(draftState.draft.status));
    const requiredComplete = Boolean(customer?.cpfCnpj && customer.razaoSocial && customer.logradouro && customer.numero && customer.bairro && customer.city && customer.state && customer.zipCode && context.operationDate && context.buyerPresence !== undefined && (context.buyerPresence === 5 || context.intermediary !== undefined) && context.freightMode !== undefined && context.finalConsumer !== undefined && context.paymentTiming && (context.paymentTiming !== 'term' || context.dueDate));
    const saleIssues = draftState?.issues.filter(issue => !isFiscalSetupIssue(issue.field)) || [];
    const fiscalSetupIssues = draftState?.issues.filter(issue => isFiscalSetupIssue(issue.field)) || [];
    const outstanding = Math.max(0, sale.total - (sale.amountPaid || 0));

    useEffect(() => {
        let active = true;
        invoiceService.getDraft(sale.id).then(result => {
            if (!active) return;
            setDraftState(result);
            setContext(result.context);
            setCustomerId(result.customerId || '');
            setCustomer(customers.find(c => c.id === result.customerId) || null);
        }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setBusy(''); });
        const previous = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();
        return () => { active = false; previous?.focus(); };
    }, [sale.id]);

    const persist = async () => {
        if (!customer || !customerId) throw new Error('Selecione o cliente cadastrado desta venda.');
        if (customerEdited) {
            await dbCustomers.updateFiscalForSale(sale.id, customer);
            setCustomerEdited(false);
        }
        const result = await invoiceService.saveDraft(sale.id, { customerId, context, revision: draftState?.draft?.revision });
        setDraftState(result);
        setContext(result.context);
        setDirty(false);
        return result;
    };

    const act = async (action: 'save' | 'emit' | 'consult') => {
        if (busy) return;
        setBusy(action === 'emit' ? 'Emitindo nota' : action === 'save' ? 'Salvando nota' : 'Consultando SEFAZ');
        setError(''); setMessage('');
        try {
            if (action === 'consult') {
                const result = await invoiceService.consultInvoice(sale.id);
                setMessage(result.message || result.motivo || `Consulta concluída. Situação SEFAZ: ${result.cStat || 'verifique as pendências'}.`);
                setDraftState(await invoiceService.getDraft(sale.id));
            } else {
                const saved = action === 'save' || dirty || !draftState?.draft ? await persist() : draftState;
                if (action === 'emit') {
                    if (!saved.canEmit || !saved.draft) throw new Error('Revise as pendências antes de emitir. A nota permanece salva.');
                    const result = await invoiceService.emitInvoice(sale.id, saved.draft.revision);
                    setMessage(result.message);
                    setDraftState(await invoiceService.getDraft(sale.id));
                } else setMessage('Nota salva. Você pode continuar a emissão pelo histórico de vendas.');
            }
            await onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
            if (action === 'emit') {
                try { setDraftState(await invoiceService.getDraft(sale.id)); } catch { /* Keep the error visible if the service is offline. */ }
            }
        } finally { setBusy(''); }
    };

    const close = () => { if (!busy && (!dirty || window.confirm('Há alterações ainda não salvas. Fechar a nota?'))) onClose(); };
    const trapFocus = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key !== 'Tab') return;
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') || []);
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };

    return createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-2 sm:p-6">
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="invoice-title" aria-busy={Boolean(busy)} tabIndex={-1} onKeyDown={trapFocus} className="flex max-h-[95dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl">
            <header className="flex items-center justify-between border-b p-4">
                <div><h2 id="invoice-title" className="flex items-center gap-2 text-lg font-bold"><FileText size={20} /> Nota fiscal da venda</h2><p className="text-sm text-slate-500">#{sale.id.slice(0, 8)} · {sale.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                <button type="button" aria-label="Fechar nota" disabled={Boolean(busy)} onClick={close} className="rounded-lg p-3 hover:bg-slate-100"><X size={20} /></button>
            </header>
            <div className="space-y-5 overflow-y-auto p-4 sm:p-6">
                <p className="text-sm text-slate-600">Prepare a nota com os dados da venda. Salvar não reserva numeração. A emissão deve ocorrer antes da saída da mercadoria, inclusive nas vendas a prazo.</p>
                {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
                <fieldset disabled={Boolean(busy) || locked || resumable || priorHomologyReady || !draftState} className="space-y-4 disabled:opacity-75">
                    <legend className="mb-2 font-bold">Cliente da nota</legend>
                    <label className="block text-sm font-medium">Cadastro vinculado
                        <select className={controlClass} value={customerId} onChange={e => { setCustomerId(e.target.value); setCustomer(customers.find(c => c.id === e.target.value) || null); setCustomerEdited(false); setDirty(true); }}>
                            <option value="">Selecione o cliente desta venda</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.cpfCnpj || `Cadastro ${c.id.slice(0, 8)}`}</option>)}
                        </select>
                    </label>
                    {!customerId && <p className="text-sm text-amber-800">Esta venda ainda não tem um cadastro vinculado. Selecione o cliente correto.</p>}
                    {customer && <details open={customerFields.some(f => f.key !== 'phone' && !customer[f.key]) || draftState?.issues.some(issue => issue.field.startsWith('customer.'))}>
                        <summary className="cursor-pointer text-sm font-semibold text-blue-700">Conferir ou completar cadastro fiscal</summary>
                        <p className="my-2 text-xs text-slate-500">As correções serão salvas no cadastro do cliente e usadas nas próximas notas.</p>
                        <div className="grid gap-3 sm:grid-cols-2">{customerFields.map(field => <label key={field.key} className="text-sm font-medium">{field.label}<input className={controlClass} maxLength={field.maxLength} value={String(customer[field.key] || '')} onChange={e => { setCustomer({ ...customer, [field.key]: field.key === 'state' ? e.target.value.toUpperCase() : e.target.value }); setCustomerEdited(true); setDirty(true); }} /></label>)}</div>
                    </details>}
                    <div className="border-t pt-4"><h3 className="mb-3 font-bold">Condições da venda</h3>
                        <p className="mb-3 text-sm text-slate-600">Pagamento registrado no PDV: {sale.paymentMethod || 'não informado'} · recebido {Number(sale.amountPaid || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · em aberto {outstanding.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.</p>
                        <FiscalContextFields value={context} onChange={value => { setContext(value); setDirty(true); }} />
                        {context.paymentTiming === 'cash' && outstanding > 0 && <p className="mt-2 text-sm text-amber-800">Para emitir como venda à vista, registre o recebimento no histórico de vendas. Se a condição real foi a prazo, selecione “A prazo” e informe o vencimento.</p>}
                    </div>
                </fieldset>
                <details><summary className="cursor-pointer text-sm font-semibold">{sale.items.length} produto(s) · resumo da venda</summary><ul className="mt-2 space-y-1 text-sm">{sale.items.map((item, index) => <li key={`${item.productId}-${index}`} className="flex justify-between gap-2"><span>{item.quantity} × {item.productName}</span><span>{(item.quantity * item.priceAtSale).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></li>)}</ul><p className="mt-2 text-sm">Desconto: R$ {(sale.discount || 0).toFixed(2)} · Frete: R$ {(sale.deliveryFee || 0).toFixed(2)}</p></details>
                {draftState && draftState.issues.length > 0 && <div className="space-y-3" aria-live="polite">
                    {dirty && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Estas pendências são da última revisão. Clique em “Salvar nota” para verificá-las com os dados que você acabou de preencher.</p>}
                    {saleIssues.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><h3 className="font-bold">Pendências desta venda</h3><ul className="mt-2 list-disc space-y-1 pl-5">{saleIssues.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul></div>}
                    {fiscalSetupIssues.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><h3 className="font-bold">Configuração fiscal pendente</h3><p className="mt-1 text-xs">Esses dados são configurados e aprovados para o emissor; não dependem dos campos desta venda.</p><ul className="mt-2 list-disc space-y-1 pl-5">{fiscalSetupIssues.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul></div>}
                </div>}
                {dirty && !draftState?.issues.length && <p className="text-sm text-slate-500">As alterações serão salvas e verificadas antes da emissão.</p>}
                {!isAdmin && <p className="text-sm text-slate-600">Após salvar, um administrador poderá emitir a nota.</p>}
                {locked && <p className="text-sm text-slate-600">Esta nota já iniciou o processamento fiscal. Consulte o resultado antes de qualquer nova tentativa.</p>}
            </div>
            <footer className="flex flex-wrap gap-3 border-t bg-slate-50 p-4">
                {!locked && !resumable && !priorHomologyReady && <button type="button" disabled={Boolean(busy) || !draftState || !customerId} onClick={() => act('save')} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-blue-600 px-4 py-3 font-bold text-blue-700 disabled:opacity-50"><Save size={18} /> Salvar nota</button>}
                {isAdmin && !locked && <button type="button" disabled={Boolean(busy) || !requiredComplete || (!dirty && !draftState?.canEmit)} onClick={() => act('emit')} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50"><Send size={18} /> Emitir nota</button>}
                {isAdmin && locked && <button type="button" disabled={Boolean(busy)} onClick={() => act('consult')} className="min-h-11 flex-1 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">Consultar resultado na SEFAZ</button>}
                {busy && <p role="status" className="w-full text-center text-sm text-slate-600">{busy}…</p>}
            </footer>
        </div>
    </div>, document.body);
}
