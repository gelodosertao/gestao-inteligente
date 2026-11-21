import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Sale } from '../types';
import FiscalIntegrationNotice from './FiscalIntegrationNotice';
import SaleFiscalDetails from './SaleFiscalDetails';

export default function FiscalIntegrationModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
    const dialogRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();
        return () => previous?.focus();
    }, []);
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') || []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    return createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4">
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fiscal-details-title" tabIndex={-1} onKeyDown={handleKeyDown} className="max-h-[95dvh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-2xl bg-white p-5 text-slate-800 shadow-2xl">
            <header className="flex items-center justify-between gap-3">
                <h2 id="fiscal-details-title" className="text-lg font-bold">Nota fiscal da venda #{sale.id.slice(0, 8)}</h2>
                <button type="button" aria-label="Fechar nota" onClick={onClose} className="rounded-lg p-3 hover:bg-slate-100"><X size={20} /></button>
            </header>
            <FiscalIntegrationNotice />
            <SaleFiscalDetails sale={sale} />
        </div>
    </div>, document.body);
}
