import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Package, Save, ShieldCheck, Ban } from 'lucide-react';
import type { User } from '../types';
import { fiscalConfigurationService, type FiscalConsoleData } from '../services/fiscalConfigurationService';
import { gdsInitialSimpleNotice, gdsIssuerDefaults } from '../services/gdsIssuerDefaults';

type Section = 'products' | 'issuer' | 'rules' | 'cancellation';
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const todayBahia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const digits = (value: string) => value.replace(/\D/g, '');
const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';

function Field({ label, value, onChange, type = 'text', hint, required = false }: {
  label: string; value: string | number; onChange: (value: string) => void;
  type?: string; hint?: string; required?: boolean;
}) {
  return <label className="block min-w-0"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">{label}</span>
    <input className={inputClass} type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} required={required} />
    {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}

export default function FiscalConfigurationConsole({ currentUser, onLogout, standalone = false }: {
  currentUser: User; onLogout: () => void; standalone?: boolean;
}) {
  const [section, setSection] = useState<Section>('products');
  const [data, setData] = useState<FiscalConsoleData | null>(null);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [environment, setEnvironment] = useState<1 | 2>(2);
  const [product, setProduct] = useState<Record<string, any>>({});
  const [issuer, setIssuer] = useState<Record<string, any>>({});
  const [rule, setRule] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNote, setSelectedNote] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [foundNotes, setFoundNotes] = useState<FiscalConsoleData['documents'] | null>(null);
  const [justification, setJustification] = useState('');
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (standalone) {
      const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex, nofollow';
      document.head.appendChild(meta);
      return () => { meta.remove(); };
    }
  }, [standalone]);
  useEffect(() => {
    if (currentUser.role !== 'ADMIN') { setLoading(false); return; }
    fiscalConfigurationService.load().then(result => { setData(result); setEnvironment(result.serviceEnvironment); })
      .catch(err => setError(err instanceof Error ? err.message : 'Não foi possível consultar as configurações.'))
      .finally(() => setLoading(false));
  }, [currentUser.role]);
  useEffect(() => { if (data?.products.length && !selectedProduct) setSelectedProduct(data.products[0].id); }, [data, selectedProduct]);
  useEffect(() => {
    if (!data || !selectedProduct) return;
    const today = new Date().toISOString().slice(0, 10);
    const current = data.profiles.find(row => row.product_id === selectedProduct && row.valid_from <= today && (!row.valid_until || row.valid_until >= today));
    setProduct({ ncm: current?.ncm || '', cest: current?.cest || '', origin: current?.origin ?? 0,
      unit: current?.unit || 'UN', validFrom: tomorrow(), approved: false, approvalReference: '' });
  }, [data, selectedProduct]);
  useEffect(() => {
    if (!data) return;
    const current = data.issuers.find(row => row.environment === environment);
    if (current) {
      const gds = current.issuer_cnpj === gdsIssuerDefaults.issuerCnpj;
      setIssuer({ series: current.series, seriesConfirmed: current.series_confirmed,
        seriesConfirmationReference: current.series_confirmation_reference || '',
        config: { ...structuredClone(current.config),
          xmlAuthorizedTaxId: current.config?.xmlAuthorizedTaxId || (gds ? gdsIssuerDefaults.xmlAuthorizedTaxId : ''),
          technicalResponsible: current.config?.technicalResponsible || (gds ? { ...gdsIssuerDefaults.technicalResponsible } : undefined),
        } });
    }
  }, [data, environment]);
  useEffect(() => {
    if (!data) return;
    const current = data.rules.find(row => row.operation === 'internal_b2b_own_production');
    setRule({ validFrom: current?.config?.additionalInfo ? tomorrow() : todayBahia(),
      validUntil: '2026-12-31', approved: false, approvalReference: '',
      config: { ...structuredClone(current?.config || { cfop: '5101', csosn: '102', nature: 'Venda de produção do estabelecimento',
        idDest: 1, indFinal: 0, pis: { group: 'PISOutr', cst: '49', rate: 0 },
        cofins: { group: 'COFINSOutr', cst: '49', rate: 0 }, ibsCbs: { mode: 'none' }, creditApproved: false }),
        additionalInfo: current?.config?.additionalInfo || gdsInitialSimpleNotice } });
  }, [data]);

  const changeIssuerConfig = (key: string, value: string | number) => setIssuer(old => ({ ...old, config: { ...old.config, [key]: value } }));
  const changeTechnical = (key: string, value: string) => setIssuer(old => ({ ...old,
    config: { ...old.config, technicalResponsible: { ...old.config.technicalResponsible, [key]: value } } }));
  const changeIssuerAddress = (key: string, value: string | number) => setIssuer(old => ({ ...old,
    config: { ...old.config, address: { ...old.config.address, [key]: value } } }));
  const changeRuleConfig = (key: string, value: unknown) => setRule(old => ({ ...old, config: { ...old.config, [key]: value } }));
  const changeTax = (tax: 'pis' | 'cofins', key: string, value: string | number) => setRule(old => ({ ...old,
    config: { ...old.config, [tax]: { ...old.config[tax], [key]: value } } }));
  const save = async (input: unknown) => {
    setSaving(true); setError(''); setMessage('');
    try {
      const updated = await fiscalConfigurationService.save(input);
      setData(updated);
      setMessage('Configuração salva. A nova vigência aparece no histórico abaixo.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  };
  const cancel = async () => {
    if (!selectedNote || justification.trim().length < 15 || justification.trim().length > 255) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await fiscalConfigurationService.cancel(selectedNote, justification.trim());
      setSelectedNote(''); setJustification(''); setConfirmCancellation(false);
      setMessage('Cancelamento confirmado pela SEFAZ. O documento permanece no histórico.');
      setFoundNotes(null); setNoteSearch('');
      try { setData(await fiscalConfigurationService.load()); }
      catch { setError('Cancelamento confirmado, mas a lista não foi atualizada. Recarregue o painel para consultar o histórico.'); }
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'Cancelamento não concluído.'} Consulte a SEFAZ antes de repetir a solicitação.`);
      setConfirmCancellation(false);
      try { setData(await fiscalConfigurationService.load()); } catch { /* preserve the original error */ }
    } finally { setSaving(false); }
  };
  const consult = async (saleId: string) => {
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await fiscalConfigurationService.consult(saleId);
      setData(await fiscalConfigurationService.load());
      setFoundNotes(null); setNoteSearch('');
      setMessage(result.message || `Situação consultada: ${result.statusLocal || 'verifique o documento'}.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Consulta indisponível.'); }
    finally { setSaving(false); }
  };
  const searchNotes = async () => {
    setError(''); setMessage('');
    if (!noteSearch.trim()) { setFoundNotes(null); return; }
    setSaving(true);
    try { setFoundNotes(await fiscalConfigurationService.searchDocuments(digits(noteSearch))); }
    catch (err) { setError(err instanceof Error ? err.message : 'Consulta de notas indisponível.'); }
    finally { setSaving(false); }
  };

  if (currentUser.role !== 'ADMIN') return <div className="p-8 text-center text-slate-700">Acesso restrito a administradores.</div>;
  if (loading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-sky-600" /></div>;
  const currentIssuer = data?.issuers.find(row => row.environment === environment);
  const history = data?.profiles.filter(row => row.product_id === selectedProduct) || [];
  return <div className="mx-auto max-w-6xl space-y-6 pb-12 text-slate-900">
    <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-300"><FileText size={16} /> Gelo do Sertão · NF-e</div>
          <h1 className="text-2xl font-black md:text-3xl">Configurações do emissor</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">Classificações dos produtos, dados do emitente e regras fiscais com vigência e aprovação.</p></div>
        <div className="flex flex-wrap gap-2">
          {standalone && <a href="https://www.gelodosertao.com.br/gestao" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-semibold hover:bg-white/10"><ArrowLeft size={16} /> Sistema</a>}
          {standalone && <button onClick={onLogout} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold hover:bg-white/10">Sair</button>}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-white/10 px-3 py-1.5">{currentUser.name}</span>
        <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-amber-200">Serviço: {data?.serviceEnvironment === 1 ? 'Produção' : 'Homologação'}</span></div>
    </div>

    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Configurações fiscais">
      {([['products', 'Produtos', Package], ['issuer', 'Emitente e série', ShieldCheck], ['rules', 'Regras tributárias', FileText], ['cancellation', 'Cancelar nota', Ban]] as const).map(([id, label, Icon]) =>
        <button key={id} role="tab" aria-selected={section === id} onClick={() => { setSection(id); setError(''); setMessage(''); }}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold ${section === id ? 'bg-sky-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-100'}`}><Icon size={17} />{label}</button>)}
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</div>}
    {message && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"><CheckCircle2 size={18} />{message}</div>}

    {section === 'products' && <div className="grid gap-6 lg:grid-cols-[270px_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 text-sm font-black">Produtos do PDV Atacado</h2>
        <div className="space-y-1">{data?.products.map(row => <button key={row.id} onClick={() => setSelectedProduct(row.id)}
          className={`w-full rounded-xl px-3 py-3 text-left text-sm font-semibold ${selectedProduct === row.id ? 'bg-sky-50 text-sky-800' : 'text-slate-600 hover:bg-slate-50'}`}>{row.name}</button>)}</div></div>
      <div className="space-y-5"><form onSubmit={event => { event.preventDefault(); void save({ kind: 'product', productId: selectedProduct, ...product,
        ncm: digits(product.ncm || ''), cest: digits(product.cest || ''), origin: Number(product.origin), unit: String(product.unit || '').toUpperCase() }); }}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-lg font-black">Nova classificação fiscal</h2><p className="mt-1 text-sm text-slate-500">A versão vigente continua no histórico. A nova entra na data informada.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="NCM" value={product.ncm || ''} onChange={value => setProduct(old => ({ ...old, ncm: value }))} hint="8 dígitos" required />
          <Field label="CEST" value={product.cest || ''} onChange={value => setProduct(old => ({ ...old, cest: value }))} hint="7 dígitos, se aplicável" />
          <Field label="Origem" value={product.origin ?? 0} type="number" onChange={value => setProduct(old => ({ ...old, origin: Number(value) }))} required />
          <Field label="Unidade comercial e tributável" value={product.unit || ''} onChange={value => setProduct(old => ({ ...old, unit: value }))} required />
          <Field label="Válido a partir de" value={product.validFrom || ''} type="date" onChange={value => setProduct(old => ({ ...old, validFrom: value }))} required />
        </div>
        <Approval value={product} onChange={setProduct} />
        <SaveButton saving={saving} />
      </form>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black">Histórico deste produto</h3>
        <div className="mt-3 space-y-2">{history.length ? history.map(row => <div key={row.valid_from} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span>{row.valid_from} até {row.valid_until || 'sem fim'} · NCM {row.ncm} · CEST {row.cest || '—'} · {row.unit}</span>
          <span className={row.approved ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{row.approved ? 'Aprovado' : 'Pendente'}</span></div>) : <p className="text-sm text-slate-500">Sem perfil fiscal cadastrado.</p>}</div></div></div></div>}

    {section === 'issuer' && <form onSubmit={event => { event.preventDefault(); if (!currentIssuer) return; void save({ kind: 'issuer', environment,
      issuerCnpj: currentIssuer.issuer_cnpj, series: Number(issuer.series), seriesConfirmed: Boolean(issuer.seriesConfirmed),
      seriesConfirmationReference: issuer.seriesConfirmationReference, config: issuer.config }); }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-lg font-black">Emitente e numeração</h2><p className="mt-1 text-sm text-slate-500">Confira os dados de cada ambiente antes de salvar. A série 1 é reservada ao emissor externo.</p>
      <div className="mt-5 max-w-xs"><label className="mb-1 block text-xs font-bold uppercase text-slate-600">Ambiente</label><select className={inputClass} value={environment} onChange={event => setEnvironment(Number(event.target.value) as 1 | 2)}>
        <option value={2}>Homologação</option><option value={1}>Produção</option></select></div>
      {currentIssuer ? <><p className="mt-4 text-sm font-bold text-slate-700">CNPJ: {currentIssuer.issuer_cnpj}</p>
        {currentIssuer.issuer_cnpj === gdsIssuerDefaults.issuerCnpj &&
          (!currentIssuer.config?.xmlAuthorizedTaxId || !currentIssuer.config?.technicalResponsible) &&
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Dados do contabilista e do suporte GDS pré-preenchidos. Confira e clique em Salvar configuração neste ambiente.
          </p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Razão social" value={issuer.config?.name || ''} onChange={value => changeIssuerConfig('name', value)} required />
          <Field label="Nome fantasia" value={issuer.config?.tradeName || ''} onChange={value => changeIssuerConfig('tradeName', value)} />
          <Field label="Inscrição estadual" value={issuer.config?.ie || ''} onChange={value => changeIssuerConfig('ie', digits(value))} required />
          <Field label="CRT" value={issuer.config?.crt || 1} type="number" onChange={value => changeIssuerConfig('crt', Number(value))} required />
          <Field label="CPF/CNPJ autorizado no XML" value={issuer.config?.xmlAuthorizedTaxId || ''}
            onChange={value => changeIssuerConfig('xmlAuthorizedTaxId', digits(value))}
            hint="Na Bahia, informe o documento do contabilista ou o CNPJ da SEFAZ BA quando não utilizar contabilista. Confira com o contador." required />
          <Field label="Série" value={issuer.series || 2} type="number" onChange={value => setIssuer(old => ({ ...old, series: Number(value), seriesConfirmed: false, seriesConfirmationReference: '' }))} required />
          <Field label="Logradouro" value={issuer.config?.address?.street || ''} onChange={value => changeIssuerAddress('street', value)} required />
          <Field label="Número" value={issuer.config?.address?.number || ''} onChange={value => changeIssuerAddress('number', value)} required />
          <Field label="Bairro" value={issuer.config?.address?.district || ''} onChange={value => changeIssuerAddress('district', value)} required />
          <Field label="Município" value={issuer.config?.address?.city || ''} onChange={value => changeIssuerAddress('city', value)} required />
          <Field label="Código IBGE" value={issuer.config?.address?.cityCode || ''} type="number" onChange={value => changeIssuerAddress('cityCode', Number(value))} required />
          <Field label="UF" value={issuer.config?.address?.state || ''} onChange={value => changeIssuerAddress('state', value.toUpperCase())} required />
          <Field label="CEP" value={issuer.config?.address?.zipCode || ''} onChange={value => changeIssuerAddress('zipCode', digits(value))} required />
          <Field label="Telefone" value={issuer.config?.address?.phone || ''} onChange={value => changeIssuerAddress('phone', digits(value))} />
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-bold">Responsável técnico pelo emissor</h3>
          <p className="mt-1 text-xs text-slate-600">Dados de contato da GDS no grupo infRespTec. São diferentes da autorização autXML do contabilista.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="CNPJ responsável técnico" value={issuer.config?.technicalResponsible?.cnpj || ''}
              onChange={value => changeTechnical('cnpj', digits(value))} required />
            <Field label="Contato técnico" value={issuer.config?.technicalResponsible?.contact || ''}
              onChange={value => changeTechnical('contact', value)} required />
            <Field label="E-mail de suporte" value={issuer.config?.technicalResponsible?.email || ''} type="email"
              onChange={value => changeTechnical('email', value.trim())} required />
            <Field label="Telefone de suporte" value={issuer.config?.technicalResponsible?.phone || ''}
              onChange={value => changeTechnical('phone', digits(value))} required />
          </div>
        </div>
        <label className="mt-5 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(issuer.seriesConfirmed)} onChange={event => setIssuer(old => ({ ...old, seriesConfirmed: event.target.checked }))} /> Série confirmada como disponível neste ambiente</label>
        {issuer.seriesConfirmed && <div className="mt-3 max-w-xl"><Field label="Referência da confirmação" value={issuer.seriesConfirmationReference || ''} onChange={value => setIssuer(old => ({ ...old, seriesConfirmationReference: value }))} required /></div>}
        <SaveButton saving={saving} />
      </> : <p className="mt-5 text-sm text-amber-700">Emitente não cadastrado neste ambiente.</p>}
    </form>}

    {section === 'rules' && <form onSubmit={event => { event.preventDefault(); void save({ kind: 'rule', operation: 'internal_b2b_own_production', ...rule }); }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-lg font-black">Venda interna B2B · produção própria</h2><p className="mt-1 text-sm text-slate-500">Esta é a única operação suportada hoje. Novas versões não alteram notas já emitidas.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Válida a partir de" value={rule.validFrom || ''} type="date" onChange={value => setRule(old => ({ ...old, validFrom: value }))} required />
        <Field label="Válida até" value={rule.validUntil || ''} type="date" onChange={value => setRule(old => ({ ...old, validUntil: value }))} required />
        <Field label="CFOP" value={rule.config?.cfop || ''} onChange={value => changeRuleConfig('cfop', digits(value))} required />
        <Field label="CSOSN" value={rule.config?.csosn || ''} onChange={value => changeRuleConfig('csosn', digits(value))} required />
        <Field label="Natureza da operação" value={rule.config?.nature || ''} onChange={value => changeRuleConfig('nature', value)} required />
        <Field label="idDest" value={rule.config?.idDest ?? 1} type="number" onChange={value => changeRuleConfig('idDest', Number(value))} required />
        <Field label="indFinal" value={rule.config?.indFinal ?? 0} type="number" onChange={value => changeRuleConfig('indFinal', Number(value))} required />
      </div>
      <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-600">Informações complementares da NF-e</label>
      <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} value={rule.config?.additionalInfo || ''}
        maxLength={5000} onChange={event => changeRuleConfig('additionalInfo', event.target.value)} required />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">{(['pis', 'cofins'] as const).map(tax => <div key={tax} className="rounded-xl bg-slate-50 p-4"><h3 className="mb-3 font-black uppercase">{tax}</h3><div className="grid gap-3 sm:grid-cols-3">
        <Field label="Grupo XML" value={rule.config?.[tax]?.group || ''} onChange={value => changeTax(tax, 'group', value)} required />
        <Field label="CST" value={rule.config?.[tax]?.cst || ''} onChange={value => changeTax(tax, 'cst', digits(value))} required />
        <Field label="Alíquota %" value={rule.config?.[tax]?.rate ?? 0} type="number" onChange={value => changeTax(tax, 'rate', Number(value))} required />
      </div></div>)}</div>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <h3 className="font-black">IBS/CBS</h3><p className="mt-1">O serviço bloqueia a emissão com IBS/CBS até homologarmos o leiaute. A regra sem IBS/CBS deve terminar até 31/12/2026.</p>
        <div className="mt-3 max-w-xs"><label className="mb-1 block text-xs font-bold uppercase">Tratamento</label>
          <select className={inputClass} value={rule.config?.ibsCbs?.mode || 'none'} onChange={event => changeRuleConfig('ibsCbs', { mode: event.target.value })}>
            <option value="none">Sem destaque nesta vigência</option><option value="simples">Simples Nacional</option><option value="regular">Regime regular</option>
          </select></div>
        {rule.config?.ibsCbs?.mode !== 'none' && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="CST" value={rule.config?.ibsCbs?.cst || ''} onChange={value => changeRuleConfig('ibsCbs', { ...rule.config.ibsCbs, cst: digits(value) })} required />
          <Field label="cClassTrib" value={rule.config?.ibsCbs?.cClassTrib || ''} onChange={value => changeRuleConfig('ibsCbs', { ...rule.config.ibsCbs, cClassTrib: digits(value) })} required />
          <Field label="IBS estadual %" type="number" value={rule.config?.ibsCbs?.ibsStateRate ?? 0} onChange={value => changeRuleConfig('ibsCbs', { ...rule.config.ibsCbs, ibsStateRate: Number(value) })} />
          <Field label="IBS municipal %" type="number" value={rule.config?.ibsCbs?.ibsCityRate ?? 0} onChange={value => changeRuleConfig('ibsCbs', { ...rule.config.ibsCbs, ibsCityRate: Number(value) })} />
          <Field label="CBS %" type="number" value={rule.config?.ibsCbs?.cbsRate ?? 0} onChange={value => changeRuleConfig('ibsCbs', { ...rule.config.ibsCbs, cbsRate: Number(value) })} />
        </div>}
      </div>
      <label className="mt-5 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(rule.config?.creditApproved)} onChange={event => changeRuleConfig('creditApproved', event.target.checked)} /> Venda a prazo aprovada nesta regra</label>
      <Approval value={rule} onChange={setRule} />
      <SaveButton saving={saving} />
      <div className="mt-7 border-t pt-5"><h3 className="font-black">Histórico das regras</h3><div className="mt-3 space-y-2">{data?.rules.map(row => <div key={`${row.operation}:${row.valid_from}`} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
        <span>{row.valid_from} até {row.valid_until} · CFOP {row.config?.cfop} · CSOSN {row.config?.csosn}</span><span className={row.approved ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{row.approved ? 'Aprovada' : 'Pendente'}</span></div>)}</div></div>
    </form>}

    {section === 'cancellation' && <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-lg font-black">Notas emitidas</h2><p className="mt-1 text-sm text-slate-500">Exibindo as 100 notas mais recentes do ambiente {data?.serviceEnvironment === 1 ? 'de produção' : 'de homologação'}.</p>
        <form onSubmit={event => { event.preventDefault(); void searchNotes(); }} className="mt-4 flex gap-2">
          <input className={inputClass} inputMode="numeric" value={noteSearch} onChange={event => setNoteSearch(event.target.value)}
            placeholder="Número da nota ou chave de acesso" aria-label="Número da nota ou chave de acesso" />
          <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white disabled:opacity-50">Buscar</button>
        </form>
        <div className="mt-4 max-h-[590px] space-y-2 overflow-y-auto">
          {(foundNotes ?? data?.documents)?.length ? (foundNotes ?? data?.documents)?.map(note => <button type="button" key={`${note.sale_id}:${note.environment}`}
            onClick={() => { setSelectedNote(note.sale_id); setJustification(''); setConfirmCancellation(false); }}
            className={`w-full rounded-xl border p-3 text-left text-sm ${selectedNote === note.sale_id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <span className="flex justify-between gap-2 font-bold"><span>NF-e {note.series}/{note.number}</span><span className={note.status === 'authorized' ? 'text-emerald-700' : 'text-amber-700'}>{note.status === 'authorized' ? 'Autorizada' : note.status === 'cancelled' ? 'Cancelada' : 'Consulta pendente'}</span></span>
            <span className="mt-1 block text-slate-600">{note.sale?.customer_name || 'Cliente não identificado'} · {note.sale?.date || ''}</span>
            <span className="mt-1 block break-all text-xs text-slate-500">Chave: {note.access_key || 'não disponível'}</span>
          </button>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma nota autorizada neste ambiente.</p>}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-lg font-black">Solicitação de cancelamento</h2>
        {(() => { const note = (foundNotes ?? data?.documents)?.find(row => row.sale_id === selectedNote);
          if (!note) return <p className="mt-4 text-sm text-slate-500">Selecione uma nota para conferir os dados e informar a justificativa.</p>;
          return <><div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p><strong>Nota:</strong> {note.series}/{note.number}</p>
            <p><strong>Cliente:</strong> {note.sale?.customer_name || '—'}</p><p><strong>Protocolo:</strong> {note.protocol || '—'}</p>
            <p className="break-all"><strong>Chave:</strong> {note.access_key || '—'}</p></div>
            {note.status === 'cancel_unknown' ? <><p className="mt-4 text-sm text-amber-800">O resultado do cancelamento está incerto. Consulte a SEFAZ antes de qualquer nova ação.</p>
              <button disabled={saving} onClick={() => void consult(note.sale_id)} className="mt-4 min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white disabled:opacity-50">Consultar SEFAZ</button></>
            : note.status === 'cancelled' ? <p className="mt-4 text-sm font-bold text-slate-600">Esta nota já está cancelada.</p>
            : <><label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-600">Justificativa obrigatória · 15 a 255 caracteres</label>
              <textarea className={`${inputClass} mt-1 min-h-32 resize-y`} value={justification} maxLength={255}
                onChange={event => { setJustification(event.target.value); setConfirmCancellation(false); }} placeholder="Descreva o motivo do cancelamento para o evento fiscal." />
              <p className="mt-1 text-right text-xs text-slate-500">{justification.trim().length}/255 caracteres</p>
              {!confirmCancellation ? <button type="button" disabled={saving || justification.trim().length < 15}
                onClick={() => setConfirmCancellation(true)} className="mt-4 min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white disabled:opacity-50">Revisar cancelamento</button>
              : <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-sm font-bold text-rose-900">Confirme o envio do evento de cancelamento à SEFAZ</p>
                  <p className="mt-2 text-sm text-rose-800">NF-e {note.series}/{note.number}: {justification.trim()}</p>
                  <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void cancel()}
                    className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Enviando...' : 'Confirmar e enviar à SEFAZ'}</button>
                    <button type="button" onClick={() => setConfirmCancellation(false)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold">Voltar</button></div></div>}</>}
          </>;
        })()}
      </div>
    </div>}
  </div>;
}

function Approval({ value, onChange }: { value: Record<string, any>; onChange: React.Dispatch<React.SetStateAction<Record<string, any>>> }) {
  return <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(value.approved)} onChange={event => onChange(old => ({ ...old, approved: event.target.checked }))} /> Classificação/regra aprovada pelo responsável fiscal</label>
    {value.approved && <div className="mt-3"><Field label="Referência da aprovação" value={value.approvalReference || ''} onChange={text => onChange(old => ({ ...old, approvalReference: text }))} hint="Informe documento, data e responsável pela aprovação." required /></div>}</div>;
}
function SaveButton({ saving }: { saving: boolean }) {
  return <button type="submit" disabled={saving} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">{saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}Salvar configuração</button>;
}
