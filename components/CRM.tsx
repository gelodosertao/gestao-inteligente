import React, { useState, useEffect, useMemo } from 'react';
import {
    Plus, Search, Phone, Mail, MessageCircle, X, Edit2, Trash2,
    CheckCircle, Clock, AlertCircle, ChevronRight, TrendingUp,
    Users, Target, Award, Filter, Calendar, FileText, PhoneCall,
    Loader2, Building2, MapPin, Tag, ArrowRight, CheckCheck,
    ClipboardList, BarChart2, Info, Megaphone
} from 'lucide-react';
import { CrmLead, CrmInteraction, CrmTask, CrmLeadStatus, CrmChannel, CrmInteractionType, CrmTaskStatus, User } from '../types';
import { dbCrm } from '../services/db';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const FUNNEL_COLUMNS: { status: CrmLeadStatus; label: string; color: string; bg: string }[] = [
    { status: 'NOVO', label: 'Novo Lead', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    { status: 'CONTATO', label: 'Em Contato', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
    { status: 'PROPOSTA', label: 'Proposta', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
    { status: 'FECHADO', label: 'Fechado 🎉', color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
    { status: 'PERDIDO', label: 'Perdido', color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
];

const CHANNELS: CrmChannel[] = ['WhatsApp', 'Instagram', 'Facebook', 'Indicação', 'Site', 'Outros'];

const CHANNEL_COLORS: Record<CrmChannel, string> = {
    'WhatsApp': 'bg-green-100 text-green-700',
    'Instagram': 'bg-pink-100 text-pink-700',
    'Facebook': 'bg-blue-100 text-blue-700',
    'Indicação': 'bg-orange-100 text-orange-700',
    'Site': 'bg-cyan-100 text-cyan-700',
    'Outros': 'bg-slate-100 text-slate-600',
};

const INTERACTION_ICONS: Record<CrmInteractionType, React.ReactNode> = {
    NOTA: <FileText size={14} />,
    WHATSAPP: <MessageCircle size={14} />,
    LIGACAO: <PhoneCall size={14} />,
    EMAIL: <Mail size={14} />,
    REUNIAO: <Users size={14} />,
};

const INTERACTION_LABELS: Record<CrmInteractionType, string> = {
    NOTA: 'Nota',
    WHATSAPP: 'WhatsApp',
    LIGACAO: 'Ligação',
    EMAIL: 'E-mail',
    REUNIAO: 'Reunião',
};

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface CRMProps {
    currentUser: User;
    onBack: () => void;
}

// ─── HELPER ───────────────────────────────────────────────────────────────────

const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate + 'T23:59:59') < new Date();
};

// ─── MODAL: LEAD FORM ─────────────────────────────────────────────────────────

interface LeadFormModalProps {
    initial?: CrmLead | null;
    currentUser: User;
    onSave: (lead: Omit<CrmLead, 'id' | 'createdAt' | 'updatedAt'>) => void;
    onClose: () => void;
}

const LeadFormModal: React.FC<LeadFormModalProps> = ({ initial, currentUser, onSave, onClose }) => {
    const [form, setForm] = useState({
        name: initial?.name || '',
        phone: initial?.phone || '',
        email: initial?.email || '',
        company: initial?.company || '',
        city: initial?.city || '',
        channel: (initial?.channel || 'Indicação') as CrmChannel,
        status: (initial?.status || 'NOVO') as CrmLeadStatus,
        estimatedValue: initial?.estimatedValue?.toString() || '0',
        notes: initial?.notes || '',
    });

    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) return alert('Nome é obrigatório.');
        onSave({
            tenantId: currentUser.tenantId,
            name: form.name.trim(),
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            company: form.company.trim() || undefined,
            city: form.city.trim() || undefined,
            channel: form.channel,
            status: form.status,
            estimatedValue: parseFloat(form.estimatedValue.replace(',', '.')) || 0,
            notes: form.notes.trim() || undefined,
            responsibleId: currentUser.id,
            responsibleName: currentUser.name,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-xl font-bold text-slate-800">{initial ? 'Editar Lead' : 'Novo Lead'}</h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nome *</label>
                            <input className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome do contato" required />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Telefone / WhatsApp</label>
                            <input className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(xx) 9xxxx-xxxx" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">E-mail</label>
                            <input type="email" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Empresa</label>
                            <input className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.company} onChange={e => set('company', e.target.value)} placeholder="Nome da empresa" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cidade</label>
                            <input className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.city} onChange={e => set('city', e.target.value)} placeholder="Cidade" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Canal de Origem</label>
                            <select className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                value={form.channel} onChange={e => set('channel', e.target.value)}>
                                {CHANNELS.map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status no Funil</label>
                            <select className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                value={form.status} onChange={e => set('status', e.target.value)}>
                                {FUNNEL_COLUMNS.map(c => <option key={c.status} value={c.status}>{c.label}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor Estimado (R$)</label>
                            <input type="number" min="0" step="0.01" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.estimatedValue} onChange={e => set('estimatedValue', e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Observações</label>
                            <textarea rows={3} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Informações relevantes sobre o lead..." />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl font-semibold hover:bg-slate-50 transition-colors">Cancelar</button>
                        <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                            {initial ? 'Salvar Alterações' : 'Criar Lead'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── MODAL: SEND EMAIL ────────────────────────────────────────────────────────
interface SendEmailModalProps {
    lead: CrmLead;
    onSend: (subject: string, body: string) => Promise<void>;
    onClose: () => void;
}

const SendEmailModal: React.FC<SendEmailModalProps> = ({ lead, onSend, onClose }) => {
    const [subject, setSubject] = useState(`Apresentação Gelo do Sertão para ${lead.name}`);
    const [body, setBody] = useState(`Olá ${lead.name},\n\nTudo bem?\n\nMeu nome é [Seu Nome], falo em nome da Gelo do Sertão...\n\nQualquer dúvida, estou à disposição!\n\nAtenciosamente,\nEquipe Gelo do Sertão`);
    const [sending, setSending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        try {
            await onSend(subject, body.replace(/\n/g, '<br/>'));
            onClose();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Mail size={18} /> Enviar E-mail</h2>
                    <button type="button" onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Para</label>
                        <input type="text" className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-500 cursor-not-allowed" readOnly value={`${lead.name} <${lead.email}>`} />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assunto</label>
                        <input type="text" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required
                            value={subject} onChange={e => setSubject(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mensagem</label>
                        <textarea rows={6} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" required
                            value={body} onChange={e => setBody(e.target.value)} />
                    </div>
                </div>
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
                    <button type="submit" disabled={sending} className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                        {sending ? 'Enviando...' : 'Enviar E-mail'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ─── MODAL: LEAD DETAIL ───────────────────────────────────────────────────────

interface LeadDetailModalProps {
    lead: CrmLead;
    interactions: CrmInteraction[];
    currentUser: User;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onAddInteraction: (type: CrmInteractionType, content: string) => void;
    onStatusChange: (status: CrmLeadStatus) => void;
    onOpenEmail: () => void;
    loadingInteractions: boolean;
}

const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
    lead, interactions, currentUser, onClose, onEdit, onDelete, onAddInteraction, onStatusChange, onOpenEmail, loadingInteractions
}) => {
    const [intType, setIntType] = useState<CrmInteractionType>('NOTA');
    const [intContent, setIntContent] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAddInteraction = async () => {
        if (!intContent.trim()) return;
        setSaving(true);
        await onAddInteraction(intType, intContent.trim());
        setIntContent('');
        setSaving(false);
    };

    const col = FUNNEL_COLUMNS.find(c => c.status === lead.status)!;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-slate-100">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.bg} ${col.color} border`}>{col.label}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CHANNEL_COLORS[lead.channel]}`}>{lead.channel}</span>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">{lead.name}</h2>
                        {lead.company && <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5"><Building2 size={12} /> {lead.company}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onEdit} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"><Edit2 size={18} /></button>
                        <button onClick={onDelete} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={18} /></button>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X size={20} /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Info grid */}
                    <div className="p-6 grid grid-cols-2 gap-3 border-b border-slate-100">
                        {lead.phone && (
                            <div className="flex items-center gap-2 text-sm">
                                <Phone size={14} className="text-slate-400" />
                                <span className="text-slate-700">{lead.phone}</span>
                                <a href={`https://wa.me/55${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                                    className="ml-auto bg-green-500 text-white text-xs px-2 py-0.5 rounded-full hover:bg-green-600 transition-colors flex items-center gap-1">
                                    <MessageCircle size={10} /> WhatsApp
                                </a>
                            </div>
                        )}
                        {lead.email && (
                            <div className="flex items-center justify-between text-sm col-span-2 md:col-span-1 border border-slate-100 bg-white p-2 rounded-lg">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <Mail size={14} className="text-slate-400 shrink-0" />
                                    <span className="text-slate-700 truncate min-w-0" title={lead.email}>{lead.email}</span>
                                </div>
                                <button onClick={onOpenEmail}
                                    className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-1 rounded hover:bg-blue-100 transition-colors shrink-0 ml-2">
                                    ENVIAR
                                </button>
                            </div>
                        )}
                        {lead.city && (
                            <div className="flex items-center gap-2 text-sm">
                                <MapPin size={14} className="text-slate-400" />
                                <span className="text-slate-700">{lead.city}</span>
                            </div>
                        )}
                        {lead.estimatedValue > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <TrendingUp size={14} className="text-slate-400" />
                                <span className="text-green-700 font-semibold">{formatCurrency(lead.estimatedValue)}</span>
                            </div>
                        )}
                        {lead.notes && (
                            <div className="col-span-2 bg-slate-50 rounded-xl p-3 text-sm text-slate-600 border border-slate-100">
                                <Info size={12} className="inline mr-1 text-slate-400" /> {lead.notes}
                            </div>
                        )}
                    </div>

                    {/* Move status */}
                    <div className="px-6 py-4 border-b border-slate-100">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Mover no Funil</p>
                        <div className="flex gap-2 flex-wrap">
                            {FUNNEL_COLUMNS.map(c => (
                                <button key={c.status} onClick={() => onStatusChange(c.status)}
                                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${lead.status === c.status ? `${c.bg} ${c.color} border-current shadow-sm` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Interactions */}
                    <div className="px-6 py-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Histórico de Interações</p>

                        {/* New interaction */}
                        <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
                            <div className="flex gap-2 mb-2">
                                {(['NOTA', 'WHATSAPP', 'LIGACAO', 'EMAIL', 'REUNIAO'] as CrmInteractionType[]).map(t => (
                                    <button key={t} onClick={() => setIntType(t)}
                                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${intType === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                                        {INTERACTION_LABELS[t]}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <textarea rows={2} className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                    placeholder="Registrar interação..." value={intContent} onChange={e => setIntContent(e.target.value)} />
                                <button onClick={handleAddInteraction} disabled={saving || !intContent.trim()}
                                    className="bg-blue-600 text-white px-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Timeline */}
                        {loadingInteractions ? (
                            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
                        ) : interactions.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">Nenhuma interação registrada ainda.</p>
                        ) : (
                            <div className="space-y-3">
                                {interactions.map(i => (
                                    <div key={i.id} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                                {INTERACTION_ICONS[i.type]}
                                            </div>
                                            <div className="flex-1 w-px bg-slate-100 mt-1" />
                                        </div>
                                        <div className="flex-1 pb-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold text-slate-600">{INTERACTION_LABELS[i.type]}</span>
                                                <span className="text-xs text-slate-400">{i.userName || 'Sistema'}</span>
                                                <span className="text-xs text-slate-400 ml-auto">{formatDate(i.createdAt)}</span>
                                            </div>
                                            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">{i.content}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── MODAL: TASK FORM ─────────────────────────────────────────────────────────

interface TaskFormModalProps {
    initial?: CrmTask | null;
    leads: CrmLead[];
    currentUser: User;
    onSave: (task: Omit<CrmTask, 'id' | 'createdAt' | 'updatedAt'>) => void;
    onClose: () => void;
}

const TaskFormModal: React.FC<TaskFormModalProps> = ({ initial, leads, currentUser, onSave, onClose }) => {
    const [form, setForm] = useState({
        title: initial?.title || '',
        description: initial?.description || '',
        leadId: initial?.leadId || '',
        dueDate: initial?.dueDate || '',
        status: (initial?.status || 'PENDENTE') as CrmTaskStatus,
    });

    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim()) return alert('Título é obrigatório.');
        onSave({
            tenantId: currentUser.tenantId,
            leadId: form.leadId || undefined,
            title: form.title.trim(),
            description: form.description.trim() || undefined,
            dueDate: form.dueDate || undefined,
            status: form.status,
            responsibleId: currentUser.id,
            responsibleName: currentUser.name,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-xl font-bold text-slate-800">{initial ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Título *</label>
                        <input className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Ligar para confirmar pedido" required />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lead Relacionado (opcional)</label>
                        <select className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            value={form.leadId} onChange={e => set('leadId', e.target.value)}>
                            <option value="">— Nenhum —</option>
                            {leads.map(l => <option key={l.id} value={l.id}>{l.name}{l.company ? ` (${l.company})` : ''}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Prazo</label>
                            <input type="date" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
                            <select className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                value={form.status} onChange={e => set('status', e.target.value)}>
                                <option value="PENDENTE">Pendente</option>
                                <option value="CONCLUIDA">Concluída</option>
                                <option value="CANCELADA">Cancelada</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Descrição</label>
                        <textarea rows={2} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            value={form.description} onChange={e => set('description', e.target.value)} placeholder="Detalhes da tarefa..." />
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl font-semibold hover:bg-slate-50">Cancelar</button>
                        <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700">
                            {initial ? 'Salvar' : 'Criar Tarefa'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── KANBAN CARD ─────────────────────────────────────────────────────────────

interface KanbanCardProps {
    lead: CrmLead;
    onClick: () => void;
    onMoveRight: (() => void) | null;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ lead, onClick, onMoveRight }) => (
    <div
        className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
        onClick={onClick}
    >
        <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{lead.name}</p>
                {lead.company && <p className="text-xs text-slate-400 truncate">{lead.company}</p>}
            </div>
            {onMoveRight && (
                <button
                    onClick={e => { e.stopPropagation(); onMoveRight(); }}
                    className="opacity-0 group-hover:opacity-100 ml-1 p-1 hover:bg-blue-50 rounded-lg text-blue-500 transition-all"
                    title="Avançar no funil"
                >
                    <ArrowRight size={14} />
                </button>
            )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CHANNEL_COLORS[lead.channel]}`}>{lead.channel}</span>
            {lead.phone && (
                <a href={`https://wa.me/55${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                    <MessageCircle size={9} className="inline mr-0.5" />WA
                </a>
            )}
        </div>
        {lead.estimatedValue > 0 && (
            <p className="text-xs text-green-700 font-bold mt-2">{formatCurrency(lead.estimatedValue)}</p>
        )}
    </div>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const CRM: React.FC<CRMProps> = ({ currentUser, onBack }) => {
    const tenantId = currentUser.tenantId;

    const [activeTab, setActiveTab] = useState<'KANBAN' | 'LEADS' | 'TAREFAS'>('KANBAN');
    const [leads, setLeads] = useState<CrmLead[]>([]);
    const [tasks, setTasks] = useState<CrmTask[]>([]);
    const [interactions, setInteractions] = useState<CrmInteraction[]>([]);
    const [loadingLeads, setLoadingLeads] = useState(true);
    const [loadingTasks, setLoadingTasks] = useState(true);
    const [loadingInteractions, setLoadingInteractions] = useState(false);

    // Modals
    const [showLeadForm, setShowLeadForm] = useState(false);
    const [editingLead, setEditingLead] = useState<CrmLead | null>(null);
    const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null);
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [editingTask, setEditingTask] = useState<CrmTask | null>(null);
    const [showEmailForm, setShowEmailForm] = useState(false);

    // Filters
    const [searchLeads, setSearchLeads] = useState('');
    const [filterChannel, setFilterChannel] = useState<CrmChannel | ''>('');
    const [filterStatus, setFilterStatus] = useState<CrmLeadStatus | ''>('');

    // Load data
    useEffect(() => {
        dbCrm.getLeads(tenantId).then(setLeads).catch(console.error).finally(() => setLoadingLeads(false));
        dbCrm.getTasks(tenantId).then(setTasks).catch(console.error).finally(() => setLoadingTasks(false));
    }, [tenantId]);

    const loadInteractions = async (lead: CrmLead) => {
        setSelectedLead(lead);
        setLoadingInteractions(true);
        try {
            const ints = await dbCrm.getInteractions(lead.id);
            setInteractions(ints);
        } catch (e) { console.error(e); }
        finally { setLoadingInteractions(false); }
    };

    // ── Lead CRUD ──
    const handleSaveLead = async (data: Omit<CrmLead, 'id' | 'createdAt' | 'updatedAt'>) => {
        try {
            if (editingLead) {
                const updated: CrmLead = { ...editingLead, ...data, updatedAt: new Date().toISOString() };
                await dbCrm.updateLead(updated);
                setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
                if (selectedLead?.id === updated.id) setSelectedLead(updated);
            } else {
                const created = await dbCrm.addLead(data, tenantId);
                setLeads(prev => [created, ...prev]);
            }
            setShowLeadForm(false);
            setEditingLead(null);
        } catch (e: any) { alert('Erro ao salvar lead: ' + e.message); }
    };

    const handleDeleteLead = async (lead: CrmLead) => {
        if (!confirm(`Excluir lead "${lead.name}"? As interações também serão removidas.`)) return;
        try {
            await dbCrm.deleteLead(lead.id);
            setLeads(prev => prev.filter(l => l.id !== lead.id));
            setSelectedLead(null);
        } catch (e: any) { alert('Erro ao excluir: ' + e.message); }
    };

    const handleStatusChange = async (lead: CrmLead, status: CrmLeadStatus) => {
        const updated = { ...lead, status, updatedAt: new Date().toISOString() };
        try {
            await dbCrm.updateLead(updated);
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
            setSelectedLead(prev => prev?.id === updated.id ? updated : prev);
        } catch (e: any) { alert('Erro: ' + e.message); }
    };

    const handleMoveRight = async (lead: CrmLead) => {
        const idx = FUNNEL_COLUMNS.findIndex(c => c.status === lead.status);
        if (idx < FUNNEL_COLUMNS.length - 1) {
            await handleStatusChange(lead, FUNNEL_COLUMNS[idx + 1].status);
        }
    };

    const handleSendEmail = async (subject: string, body: string) => {
        if (!selectedLead || !selectedLead.email) return;
        await dbCrm.sendEmail(selectedLead.email, subject, body);

        // Automatically log the interaction
        await handleAddInteraction('EMAIL', `Assunto: ${subject}\n\nEnviado via sistema.`);
        alert('E-mail enviado com sucesso!');
    };

    // ── Interaction CRUD ──
    const handleAddInteraction = async (type: CrmInteractionType, content: string) => {
        if (!selectedLead) return;
        try {
            const created = await dbCrm.addInteraction({
                tenantId, leadId: selectedLead.id, type, content,
                userId: currentUser.id, userName: currentUser.name,
            }, tenantId);
            setInteractions(prev => [created, ...prev]);
        } catch (e: any) { alert('Erro ao registrar interação: ' + e.message); }
    };

    // ── Task CRUD ──
    const handleSaveTask = async (data: Omit<CrmTask, 'id' | 'createdAt' | 'updatedAt'>) => {
        try {
            if (editingTask) {
                const updated: CrmTask = { ...editingTask, ...data, updatedAt: new Date().toISOString() };
                await dbCrm.updateTask(updated);
                setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
            } else {
                const created = await dbCrm.addTask(data, tenantId);
                setTasks(prev => [created, ...prev]);
            }
            setShowTaskForm(false);
            setEditingTask(null);
        } catch (e: any) { alert('Erro ao salvar tarefa: ' + e.message); }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm('Excluir esta tarefa?')) return;
        try {
            await dbCrm.deleteTask(id);
            setTasks(prev => prev.filter(t => t.id !== id));
        } catch (e: any) { alert('Erro ao excluir: ' + e.message); }
    };

    const handleToggleTaskStatus = async (task: CrmTask) => {
        const newStatus: CrmTaskStatus = task.status === 'PENDENTE' ? 'CONCLUIDA' : 'PENDENTE';
        const updated = { ...task, status: newStatus, updatedAt: new Date().toISOString() };
        await dbCrm.updateTask(updated);
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    };

    // ── Filtered leads ──
    const filteredLeads = useMemo(() => leads.filter(l => {
        const q = searchLeads.toLowerCase();
        const matchSearch = !q || l.name.toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q) || (l.city || '').toLowerCase().includes(q);
        const matchChannel = !filterChannel || l.channel === filterChannel;
        const matchStatus = !filterStatus || l.status === filterStatus;
        return matchSearch && matchChannel && matchStatus;
    }), [leads, searchLeads, filterChannel, filterStatus]);

    // ── Admin metrics ──
    const metrics = useMemo(() => {
        const total = leads.length;
        const closed = leads.filter(l => l.status === 'FECHADO').length;
        const thisMonth = leads.filter(l => new Date(l.createdAt).getMonth() === new Date().getMonth()).length;
        const overdueTasks = tasks.filter(t => t.status === 'PENDENTE' && isOverdue(t.dueDate)).length;
        const pipeline = leads.filter(l => l.status !== 'FECHADO' && l.status !== 'PERDIDO').reduce((s, l) => s + l.estimatedValue, 0);
        const conversion = total > 0 ? Math.round((closed / total) * 100) : 0;
        return { total, closed, thisMonth, overdueTasks, pipeline, conversion };
    }, [leads, tasks]);

    // ─── RENDER ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-full bg-slate-50">
            {/* HEADER */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Megaphone size={24} className="text-blue-600" /> CRM / Marketing
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">Gerencie leads, contatos e oportunidades de negócio</p>
                    </div>
                    <div className="flex gap-2">
                        {activeTab === 'TAREFAS' ? (
                            <button onClick={() => { setEditingTask(null); setShowTaskForm(true); }}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm">
                                <Plus size={16} /> Nova Tarefa
                            </button>
                        ) : (
                            <button onClick={() => { setEditingLead(null); setShowLeadForm(true); }}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm">
                                <Plus size={16} /> Novo Lead
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6">
                {/* ADMIN METRICS */}
                {currentUser.role === 'ADMIN' && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                        {[
                            { label: 'Total de Leads', value: metrics.total, icon: <Users size={18} />, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'Leads do Mês', value: metrics.thisMonth, icon: <Calendar size={18} />, color: 'text-purple-600', bg: 'bg-purple-50' },
                            { label: 'Fechados', value: metrics.closed, icon: <Award size={18} />, color: 'text-green-600', bg: 'bg-green-50' },
                            { label: 'Conversão', value: `${metrics.conversion}%`, icon: <Target size={18} />, color: 'text-orange-600', bg: 'bg-orange-50' },
                            { label: 'Pipeline', value: formatCurrency(metrics.pipeline), icon: <TrendingUp size={18} />, color: 'text-cyan-600', bg: 'bg-cyan-50', small: true },
                            { label: 'Tarefas Atrasadas', value: metrics.overdueTasks, icon: <AlertCircle size={18} />, color: metrics.overdueTasks > 0 ? 'text-red-600' : 'text-slate-400', bg: metrics.overdueTasks > 0 ? 'bg-red-50' : 'bg-slate-50' },
                        ].map((m, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                                <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center ${m.color} mb-2`}>{m.icon}</div>
                                <p className={`font-bold ${m.small ? 'text-base' : 'text-2xl'} text-slate-800`}>{m.value}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* TABS */}
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
                    {[
                        { id: 'KANBAN', label: 'Funil de Vendas', icon: <BarChart2 size={15} /> },
                        { id: 'LEADS', label: 'Lista de Leads', icon: <Users size={15} /> },
                        { id: 'TAREFAS', label: 'Tarefas', icon: <ClipboardList size={15} /> },
                    ].map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id as any)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {/* ── KANBAN TAB ── */}
                {activeTab === 'KANBAN' && (
                    loadingLeads ? (
                        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-blue-500" /></div>
                    ) : (
                        <div className="flex gap-4 overflow-x-auto pb-4">
                            {FUNNEL_COLUMNS.map((col, colIdx) => {
                                const colLeads = leads.filter(l => l.status === col.status);
                                return (
                                    <div key={col.status} className={`flex-shrink-0 w-72 rounded-2xl border ${col.bg} p-3`}>
                                        <div className={`flex items-center justify-between mb-3 ${col.color}`}>
                                            <span className="font-bold text-sm">{col.label}</span>
                                            <span className="text-xs font-bold bg-white/70 px-2 py-0.5 rounded-full">{colLeads.length}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {colLeads.length === 0 && (
                                                <div className="text-center py-8 text-slate-400 text-xs">Nenhum lead aqui</div>
                                            )}
                                            {colLeads.map(lead => (
                                                <KanbanCard
                                                    key={lead.id}
                                                    lead={lead}
                                                    onClick={() => loadInteractions(lead)}
                                                    onMoveRight={colIdx < FUNNEL_COLUMNS.length - 1 ? () => handleMoveRight(lead) : null}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}

                {/* ── LEADS TAB ── */}
                {activeTab === 'LEADS' && (
                    <div>
                        {/* Filters */}
                        <div className="flex flex-wrap gap-3 mb-4">
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-48">
                                <Search size={16} className="text-slate-400" />
                                <input className="flex-1 text-sm focus:outline-none" placeholder="Buscar por nome, empresa, cidade..."
                                    value={searchLeads} onChange={e => setSearchLeads(e.target.value)} />
                            </div>
                            <select className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={filterChannel} onChange={e => setFilterChannel(e.target.value as any)}>
                                <option value="">Todos os Canais</option>
                                {CHANNELS.map(c => <option key={c}>{c}</option>)}
                            </select>
                            <select className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
                                <option value="">Todos os Status</option>
                                {FUNNEL_COLUMNS.map(c => <option key={c.status} value={c.status}>{c.label}</option>)}
                            </select>
                        </div>

                        {loadingLeads ? (
                            <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-blue-500" /></div>
                        ) : filteredLeads.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                                <Users size={40} className="mx-auto text-slate-300 mb-3" />
                                <p className="text-slate-500 font-medium">Nenhum lead encontrado</p>
                                <p className="text-slate-400 text-sm mt-1">Crie o primeiro lead clicando em "Novo Lead"</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>
                                            {['Nome', 'Canal', 'Status', 'Valor Est.', 'Responsável', 'Ações'].map(h => (
                                                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredLeads.map(lead => {
                                            const col = FUNNEL_COLUMNS.find(c => c.status === lead.status)!;
                                            return (
                                                <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <p className="font-semibold text-slate-800">{lead.name}</p>
                                                        {lead.company && <p className="text-xs text-slate-400">{lead.company}</p>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CHANNEL_COLORS[lead.channel]}`}>{lead.channel}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${col.bg} ${col.color}`}>{col.label}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-green-700 font-semibold">
                                                        {lead.estimatedValue > 0 ? formatCurrency(lead.estimatedValue) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">{lead.responsibleName || '—'}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            {lead.phone && (
                                                                <a href={`https://wa.me/55${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                                                                    className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="WhatsApp">
                                                                    <MessageCircle size={14} />
                                                                </a>
                                                            )}
                                                            <button onClick={() => loadInteractions(lead)} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="Ver detalhes">
                                                                <ChevronRight size={14} />
                                                            </button>
                                                            <button onClick={() => { setEditingLead(lead); setShowLeadForm(true); }}
                                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors" title="Editar">
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button onClick={() => handleDeleteLead(lead)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Excluir">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAREFAS TAB ── */}
                {activeTab === 'TAREFAS' && (
                    <div>
                        {loadingTasks ? (
                            <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-blue-500" /></div>
                        ) : tasks.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                                <ClipboardList size={40} className="mx-auto text-slate-300 mb-3" />
                                <p className="text-slate-500 font-medium">Nenhuma tarefa cadastrada</p>
                                <p className="text-slate-400 text-sm mt-1">Crie tarefas de follow-up para não perder oportunidades</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {tasks.map(task => {
                                    const overdue = task.status === 'PENDENTE' && isOverdue(task.dueDate);
                                    const linkedLead = leads.find(l => l.id === task.leadId);
                                    return (
                                        <div key={task.id} className={`bg-white rounded-xl border shadow-sm p-4 flex items-start gap-3 transition-all ${task.status === 'CONCLUIDA' ? 'opacity-60' : ''} ${overdue ? 'border-red-200 bg-red-50/20' : 'border-slate-200'}`}>
                                            <button onClick={() => handleToggleTaskStatus(task)}
                                                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${task.status === 'CONCLUIDA' ? 'bg-green-500 border-green-500 text-white' : overdue ? 'border-red-400' : 'border-slate-300 hover:border-blue-400'}`}>
                                                {task.status === 'CONCLUIDA' && <CheckCheck size={12} />}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-semibold text-slate-800 ${task.status === 'CONCLUIDA' ? 'line-through text-slate-400' : ''}`}>{task.title}</p>
                                                {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
                                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                    {task.dueDate && (
                                                        <span className={`flex items-center gap-1 text-xs font-medium ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
                                                            <Calendar size={11} /> {formatDate(task.dueDate)} {overdue && '• ATRASADA'}
                                                        </span>
                                                    )}
                                                    {linkedLead && (
                                                        <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                                            <Tag size={10} /> {linkedLead.name}
                                                        </span>
                                                    )}
                                                    {task.responsibleName && (
                                                        <span className="text-xs text-slate-400">{task.responsibleName}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-1 ml-2">
                                                <button onClick={() => { setEditingTask(task); setShowTaskForm(true); }}
                                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => handleDeleteTask(task.id)}
                                                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* MODALS */}
            {showLeadForm && (
                <LeadFormModal
                    initial={editingLead}
                    currentUser={currentUser}
                    onSave={handleSaveLead}
                    onClose={() => { setShowLeadForm(false); setEditingLead(null); }}
                />
            )}

            {selectedLead && (
                <LeadDetailModal
                    lead={selectedLead}
                    interactions={interactions}
                    currentUser={currentUser}
                    loadingInteractions={loadingInteractions}
                    onClose={() => setSelectedLead(null)}
                    onEdit={() => { setEditingLead(selectedLead); setShowLeadForm(true); }}
                    onDelete={() => handleDeleteLead(selectedLead)}
                    onAddInteraction={handleAddInteraction}
                    onStatusChange={(status) => handleStatusChange(selectedLead, status)}
                    onOpenEmail={() => setShowEmailForm(true)}
                />
            )}

            {showEmailForm && selectedLead && (
                <SendEmailModal
                    lead={selectedLead}
                    onClose={() => setShowEmailForm(false)}
                    onSend={handleSendEmail}
                />
            )}

            {showTaskForm && (
                <TaskFormModal
                    initial={editingTask}
                    leads={leads}
                    currentUser={currentUser}
                    onSave={handleSaveTask}
                    onClose={() => { setShowTaskForm(false); setEditingTask(null); }}
                />
            )}
        </div>
    );
};

export default CRM;
