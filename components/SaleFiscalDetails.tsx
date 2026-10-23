import React from 'react';
import { Sale } from '../types';

export default function SaleFiscalDetails({ sale }: { sale: Sale }) {
    const downloadStoredXml = () => {
        if (!sale.nfeXml) return;
        const url = URL.createObjectURL(new Blob([sale.nfeXml], { type: 'application/xml;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `nota-${sale.id.slice(0, 8)}.xml`;
        link.click();
        URL.revokeObjectURL(url);
    };
    return <div className="space-y-3 text-sm">
        <p className="text-slate-500">Dados registrados na gestão. Esta visualização não consulta nem confirma a situação atual da nota.</p>
        <dl className="grid gap-2 break-all sm:grid-cols-2">
            <div><dt className="font-bold">Situação registrada</dt><dd>{sale.nfeStatus || (sale.hasInvoice ? 'Documento registrado' : 'Sem nota registrada')}</dd></div>
            <div><dt className="font-bold">Ambiente registrado</dt><dd>{sale.nfeEnvironment === 1 ? 'Produção' : sale.nfeEnvironment === 2 ? 'Homologação' : 'Não informado'}</dd></div>
            <div><dt className="font-bold">Número / Série</dt><dd>{sale.nfeNumber || '—'} / {sale.nfeSeries || '—'}</dd></div>
            <div><dt className="font-bold">Protocolo</dt><dd>{sale.nfeProtocol || '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="font-bold">Chave</dt><dd>{sale.invoiceKey || 'Não registrada'}</dd></div>
        </dl>
        {sale.nfeXml && <button type="button" onClick={downloadStoredXml} className="min-h-11 rounded-lg border border-blue-600 px-4 font-bold text-blue-700">Baixar XML já armazenado</button>}
    </div>;
}
