import React from 'react';
import { fiscalIntegration } from '../services/fiscalIntegration';

export default function FiscalIntegrationNotice() {
    const status = fiscalIntegration.getStatus();
    if (status.configured) return null;
    return <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">{status.message}</p>
        <p className="mt-1">Emissão, cancelamento, consulta fiscal, DANFE e exportações fiscais estão indisponíveis. Os dados já registrados permanecem no histórico.</p>
    </div>;
}
