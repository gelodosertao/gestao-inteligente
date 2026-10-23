import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Branch, type FinancialRecord, type Sale } from '../types';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('./supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import { dbFinancials, dbReconciliation, dbSales } from './db';

const TENANT_ID = 'd165165d-decf-44c7-9c2b-2e4625291397';

function sale(): Sale {
  return {
    id: '9e422039-9d15-4538-b934-7dcc27c16488',
    date: '2026-09-22',
    customerName: 'Consumidor Final',
    total: 12,
    items: [{ productId: 'product-1', productName: 'Gelo', quantity: 2, priceAtSale: 6 }],
    branch: Branch.FILIAL,
    status: 'Completed',
    paymentMethod: 'Cash',
    hasInvoice: false,
  };
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.rpc.mockReset();
});

describe('operação atômica de venda', () => {
  it('envia toda a venda para uma única RPC', async () => {
    const operationId = '2d75c622-e181-4987-a70a-a229ffdae52f';
    const result = { operationId, saleId: sale().id, action: 'create', status: 'Completed' };
    mocks.rpc.mockResolvedValue({ data: result, error: null });

    await expect(dbSales.applyOperation('create', sale(), operationId)).resolves.toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledWith('apply_sale_operation', {
      p_operation_id: operationId,
      p_sale_id: sale().id,
      p_action: 'create',
      p_payload: sale()
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('propaga a falha sem tentar gravações parciais', async () => {
    const failure = { code: '23514', message: 'Insufficient stock' };
    mocks.rpc.mockResolvedValue({ data: null, error: failure });

    await expect(dbSales.applyOperation(
      'create',
      sale(),
      '501675a3-f322-47bc-991f-a8c14c5e5dc3'
    )).rejects.toBe(failure);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('reutiliza a mesma chave em retries concorrentes', async () => {
    const operationId = 'c18ded8b-9911-4de8-85ff-728f86fd8e8c';
    mocks.rpc.mockResolvedValue({
      data: { operationId, saleId: sale().id, action: 'create', status: 'Completed' },
      error: null
    });

    await Promise.all([
      dbSales.applyOperation('create', sale(), operationId),
      dbSales.applyOperation('create', sale(), operationId)
    ]);

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls.map(([, args]) => args.p_operation_id)).toEqual([
      operationId,
      operationId
    ]);
  });

  it('não envia payload de venda no cancelamento', async () => {
    const operationId = '0cc360bf-b065-4f24-aa3b-e350ff02acff';
    mocks.rpc.mockResolvedValue({
      data: { operationId, saleId: sale().id, action: 'cancel', status: 'Cancelled' },
      error: null
    });

    await dbSales.applyOperation('cancel', sale(), operationId);

    expect(mocks.rpc).toHaveBeenCalledWith('apply_sale_operation', expect.objectContaining({
      p_action: 'cancel',
      p_payload: {}
    }));
  });
});

describe('contrato de persistência de vendas', () => {
  it('grava a venda e seus itens detalhados com o mesmo tenant', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => table === 'sales' ? { upsert } : { insert });

    const newSale = sale();
    await dbSales.add(newSale, TENANT_ID);

    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({
      id: newSale.id,
      tenant_id: TENANT_ID,
      items: newSale.items,
    })]);
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      sale_id: newSale.id,
      tenant_id: TENANT_ID,
      product_id: 'product-1',
      quantity: 2,
    })]);
  });

  it('devolve ao chamador um erro ao gravar itens', async () => {
    const failure = new Error('Falha ao gravar itens');
    mocks.from.mockImplementation((table: string) => table === 'sales'
      ? { upsert: vi.fn().mockResolvedValue({ error: null }) }
      : { insert: vi.fn().mockResolvedValue({ error: failure }) });

    await expect(dbSales.add(sale(), TENANT_ID)).rejects.toBe(failure);
  });
});

describe('contrato de persistência financeira', () => {
  it('grava o lançamento no tenant informado', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert });
    const record: FinancialRecord = {
      id: 'finance-1',
      date: '2026-09-22',
      description: 'Venda',
      amount: 12,
      type: 'Income',
      category: 'Vendas',
      branch: Branch.FILIAL,
      paymentMethod: 'Cash',
    };

    await dbFinancials.addBatch([record], TENANT_ID);

    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      id: record.id,
      amount: 12,
      tenant_id: TENANT_ID,
    })]);
  });
});

describe('casos auditados de conciliação', () => {
  it('busca os casos somente pela RPC administrativa', async () => {
    const cases = [{
      caseKey: 'missing-revenue:sale-1',
      caseType: 'missing_revenue',
      status: 'PENDING_REVIEW',
      evidence: {},
      createdAt: '2026-09-22T00:00:00Z',
      financials: [],
    }];
    mocks.rpc.mockResolvedValue({ data: cases, error: null });

    await expect(dbReconciliation.getCases()).resolves.toEqual(cases);
    expect(mocks.rpc).toHaveBeenCalledWith('get_financial_reconciliation_cases');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('envia a resolução com os dados necessários para uma única RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { caseKey: 'orphan-revenue:f-1', status: 'RESOLVED', idempotent: false }, error: null });

    await dbReconciliation.resolveCase('orphan-revenue:f-1', 'link_financial', {
      financialId: 'f-1',
      saleId: 'sale-1',
      note: 'Comprovante confirma a venda correta.',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('resolve_financial_reconciliation_case', {
      p_case_key: 'orphan-revenue:f-1',
      p_action: 'link_financial',
      p_financial_id: 'f-1',
      p_sale_id: 'sale-1',
      p_note: 'Comprovante confirma a venda correta.',
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('propaga a falha da correção sem tentar escrita direta', async () => {
    const failure = { code: '42501', message: 'Only active administrators can resolve reconciliation cases' };
    mocks.rpc.mockResolvedValue({ data: null, error: failure });

    await expect(dbReconciliation.resolveCase('case-1', 'review', { note: 'Revisado manualmente.' })).rejects.toBe(failure);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
