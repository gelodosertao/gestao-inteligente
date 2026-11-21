import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Branch, type Sale, type User } from '../types';
import { fiscalIntegration, FISCAL_NOT_CONFIGURED, FiscalIntegrationNotConfiguredError } from './fiscalIntegration';
import FiscalIntegrationNotice from '../components/FiscalIntegrationNotice';
import FiscalIntegrationPanel from '../components/FiscalIntegrationPanel';
import SaleFiscalDetails from '../components/SaleFiscalDetails';

const admin = { id: 'admin', role: 'ADMIN', name: 'Administrador' } as User;
const sale: Sale = {
    id: 'historical-sale', date: '2026-10-23', customerName: 'Cliente histórico',
    total: 12, items: [], branch: Branch.MATRIZ, status: 'Completed',
    paymentMethod: 'Cash', hasInvoice: true, nfeStatus: 'autorizada',
    nfeNumber: '123', nfeSeries: '2', nfeProtocol: 'protocol-123',
    invoiceKey: 'stored-access-key', nfeEnvironment: 2, nfeXml: '<nfe>stored</nfe>',
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('integração fiscal sem conexão', () => {
    it('permanece desativada e não interpreta configuração antiga', () => {
        vi.stubEnv('VITE_NFE_SERVICE_URL', 'http://127.0.0.1:3001');
        vi.stubEnv('VITE_INVOICE_API_URL', 'https://unused.invalid');
        expect(fiscalIntegration.getStatus()).toEqual({ configured: false, message: FISCAL_NOT_CONFIGURED });
    });

    it('recusa a operação antes de qualquer acesso à rede', () => {
        const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
        expect(() => fiscalIntegration.requireConfigured()).toThrow(FiscalIntegrationNotConfiguredError);
        expect(() => fiscalIntegration.requireConfigured()).toThrow('Integração fiscal não configurada');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('informa o estado e as operações indisponíveis', () => {
        const html = renderToStaticMarkup(<FiscalIntegrationNotice />);
        expect(html).toContain('role="status"');
        expect(html).toContain('Integração fiscal não configurada');
        expect(html).toContain('DANFE');
        expect(html).toContain('histórico');
    });

    it('mantém documentos e XML local visíveis sem consultar API', () => {
        const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
        const html = renderToStaticMarkup(<FiscalIntegrationPanel currentUser={admin} sales={[sale]} onLogout={() => {}} />);
        for (const value of ['autorizada', '123', 'protocol-123', 'stored-access-key', 'Homologação', 'Baixar XML já armazenado']) expect(html).toContain(value);
        expect(html).not.toContain('<input');
        expect(fetch).not.toHaveBeenCalled();
        expect(sale.nfeXml).toBe('<nfe>stored</nfe>');
    });

    it('preserva o cancelamento registrado no histórico', () => {
        const html = renderToStaticMarkup(<FiscalIntegrationPanel currentUser={admin} sales={[{ ...sale, nfeStatus: 'cancelada' }]} onLogout={() => {}} />);
        expect(html).toContain('cancelada');
        expect(html).not.toContain('Confirmar e enviar');
    });

    it('não oferece download quando não há XML armazenado', () => {
        const html = renderToStaticMarkup(<SaleFiscalDetails sale={{ ...sale, nfeXml: undefined }} />);
        expect(html).not.toContain('Baixar XML');
    });

    it('mantém o painel restrito ao administrador', () => {
        const html = renderToStaticMarkup(<FiscalIntegrationPanel currentUser={{ ...admin, role: 'OPERATOR' }} sales={[sale]} onLogout={() => {}} />);
        expect(html).toContain('Acesso restrito');
        expect(html).not.toContain('stored-access-key');
    });

    it('mostra vazio sem criar documentos de demonstração', () => {
        const html = renderToStaticMarkup(<FiscalIntegrationPanel currentUser={admin} sales={[]} onLogout={() => {}} />);
        expect(html).toContain('Nenhum documento');
        expect(html).not.toContain('NF-e autorizada');
    });
});
