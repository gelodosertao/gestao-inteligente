import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Product } from '../types';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
import { dbProducts, dbStockMovements } from './db';

const product: Product = {
  id: 'ice', name: 'Gelo 5kg', category: 'Gelo Cubo', unit: 'un',
  cost: 3, priceMatriz: 6, priceFilial: 8, stockMatrizIbotirama: 100,
  stockMatrizBarreiras: 20, stockFilial: 10, minStock: 0
};
const tenantId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.from.mockReturnValue({ update: mocks.update });
});

describe('operações de estoque', () => {
  it('editar preço não envia saldos absolutos ao banco', async () => {
    await dbProducts.update({ ...product, priceMatriz: 7 });
    const payload = mocks.update.mock.calls[0][0];
    expect(payload.price_matriz).toBe(7);
    expect(payload).not.toHaveProperty('stock_matriz_ibotirama');
    expect(payload).not.toHaveProperty('stock_matriz_barreiras');
    expect(payload).not.toHaveProperty('stock_filial');
  });

  it('cria produto e saldos iniciais em uma única operação', async () => {
    await dbProducts.add(product, tenantId, operationId);
    expect(mocks.rpc).toHaveBeenCalledWith('create_inventory_product', {
      p_operation_id: operationId, p_product: product, p_tenant_id: tenantId
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('preserva identidade do cadastro entre tentativas sem UUID informado', async () => {
    await dbProducts.add(product, tenantId);
    await dbProducts.add(product, tenantId);
    const identities = mocks.rpc.mock.calls.map(([, args]) => args.p_operation_id);
    expect(identities[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(identities[0]).toBe(identities[1]);
  });

  it('envia perda e financeiro para uma única transação', async () => {
    const operation = { operationId, action: 'loss' as const, productId: 'ice', deposit: 'Barreiras' as const, quantity: 5, reason: 'Derretimento' };
    await dbStockMovements.mutate(operation);
    expect(mocks.rpc).toHaveBeenCalledWith('mutate_inventory_stock', { p_operation: operation });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('preserva identidade da nota e quantidades base conferidas no recebimento', async () => {
    const receipt = { operationId, invoiceKey: '1'.repeat(44), deposit: 'Ibotirama' as const, items: [{ productId: 'ice', quantity: 1.5, supplierCode: 'F123' }] };
    await dbStockMovements.receiveXml(receipt);
    expect(mocks.rpc).toHaveBeenCalledWith('receive_inventory_xml', {
      p_operation_id: operationId, p_invoice_key: receipt.invoiceKey, p_deposit: receipt.deposit, p_items: receipt.items
    });
  });

  it('propaga falha para preservar formulário e impedir sucesso prematuro', async () => {
    const failure = { message: 'Saldo insuficiente', code: '23514' };
    mocks.rpc.mockResolvedValue({ error: failure });
    await expect(dbStockMovements.mutate({ operationId, action: 'loss', productId: 'ice', deposit: 'Ibotirama', quantity: 999, reason: 'Avaria' })).rejects.toBe(failure);
    await expect(dbProducts.add(product, tenantId, operationId)).rejects.toBe(failure);
  });
});
