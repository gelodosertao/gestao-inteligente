import React from 'react';
import { Sale, User } from '../types';
import FiscalIntegrationNotice from './FiscalIntegrationNotice';
import SaleFiscalDetails from './SaleFiscalDetails';

interface Props {
    currentUser: User;
    sales: Sale[];
    onLogout: () => void;
    standalone?: boolean;
}

export default function FiscalIntegrationPanel({ currentUser, sales, onLogout, standalone }: Props) {
    if (currentUser.role !== 'ADMIN') return <div className="p-8 text-center text-slate-700">Acesso restrito a administradores.</div>;
    const documents = sales.filter(sale => sale.hasInvoice || sale.nfeNumber || sale.nfeXml || (sale.nfeStatus && sale.nfeStatus !== 'nao_emitir'));
    return <div className="mx-auto max-w-4xl space-y-6 pb-12 text-slate-900">
        <header className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-bold">Integração fiscal</h1>
            {standalone && <div className="flex gap-3"><a href="/gestao" className="min-h-11 p-3 text-blue-700">Sistema</a><button onClick={onLogout} className="min-h-11 p-3">Sair</button></div>}
        </header>
        <FiscalIntegrationNotice />
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold">Histórico fiscal registrado</h2>
            <p className="text-sm text-slate-600">Documentos vinculados às vendas carregadas na gestão. Não substitui o acervo fiscal completo.</p>
            {documents.length === 0 && <p className="text-sm text-slate-500">Nenhum documento nas vendas carregadas.</p>}
            {documents.map(sale => <details key={sale.id} className="border-t border-slate-100 pt-3">
                <summary className="min-h-11 cursor-pointer py-3 font-semibold">{sale.customerName} · Venda #{sale.id.slice(0, 8)}</summary>
                <SaleFiscalDetails sale={sale} />
            </details>)}
        </section>
    </div>;
}
