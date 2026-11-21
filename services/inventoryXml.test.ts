import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { buildReceiptItems, validateStockInvoice, type StockInvoice } from './inventoryXml';

const product: Product = {
  id: 'internal-product', name: 'Embalagem', category: 'Insumo (Matéria-prima)', unit: 'un',
  cost: 0.2, priceMatriz: 0, priceFilial: 0, minStock: 0,
  stockMatrizIbotirama: 12, stockMatrizBarreiras: 0, stockFilial: 0
};
const invoice = (): StockInvoice => ({
  key: '29' + '2611' + '12345678000190' + '55' + '001' + '000000123' + '1' + '12345678' + '0',
  supplierCnpj: '12345678000190', supplierName: 'Fornecedor de embalagens',
  items: [{ line: '1', supplierCode: '001', name: 'Pacote de sacos', unit: 'pct', quantity: 2, unitCost: 10 }]
});

describe('recebimento de compras por XML', () => {
  it('converte unidades sem mudar o custo ou saldo do produto existente', () => {
    const note = invoice();
    const items = buildReceiptItems(note, [{ item: note.items[0], productId: product.id, multiplier: 100 }], [product]);
    expect(items).toEqual([{ productId: product.id, quantity: 200, supplierCode: JSON.stringify({ supplierCnpj: note.supplierCnpj, codes: ['001'] }) }]);
    expect(product.cost).toBe(0.2);
    expect(product.stockMatrizIbotirama).toBe(12);
  });

  it('agrupa linhas vinculadas ao mesmo produto sem perder os códigos do fornecedor', () => {
    const note = invoice();
    note.items.push({ ...note.items[0], line: '2', supplierCode: '002', quantity: 3 });
    const items = buildReceiptItems(note, note.items.map(item => ({ item, productId: product.id, multiplier: 100 })), [product]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(500);
    expect(JSON.parse(items[0].supplierCode!)).toEqual({ supplierCnpj: note.supplierCnpj, codes: ['001', '002'] });
  });

  it('preserva o identificador interno e zera saldos na criação junto ao recebimento', () => {
    const note = invoice();
    const created = { ...product, id: '3b85ecb3-e64f-4d4e-bafc-e9b13190487e' };
    const items = buildReceiptItems(note, [{ item: note.items[0], productId: created.id, multiplier: 1, product: created }], []);
    expect(items[0].productId).toBe(created.id);
    expect(items[0].productId).not.toBe(note.items[0].supplierCode);
    expect(items[0].product?.stockMatrizIbotirama).toBe(0);
    expect(created.stockMatrizIbotirama).toBe(12);
  });

  it.each([0, -1, NaN, Infinity])('rejeita conversão inválida %s', multiplier => {
    const note = invoice();
    expect(() => buildReceiptItems(note, [{ item: note.items[0], productId: product.id, multiplier }], [product])).toThrow('conversão');
  });

  it('exige vinculação de todas as linhas a produto físico', () => {
    const note = invoice();
    expect(() => buildReceiptItems(note, [], [product])).toThrow('todos os itens');
    expect(() => buildReceiptItems(note, [{ item: note.items[0], productId: '', multiplier: 1 }], [product])).toThrow('Vincule');
    expect(() => buildReceiptItems(note, [{ item: note.items[0], productId: product.id, multiplier: 1 }], [{ ...product, isStockControlled: false }])).toThrow('estoque físico');
  });

  it('rejeita nota sem chave completa ou CNPJ correspondente', () => {
    expect(() => validateStockInvoice({ ...invoice(), key: '123' })).toThrow('44 dígitos');
    expect(() => validateStockInvoice({ ...invoice(), supplierCnpj: '99999999000199' })).toThrow('CNPJ');
  });

  it.each([{ quantity: -1 }, { quantity: 0 }, { quantity: Infinity }, { unitCost: NaN }, { unitCost: -1 }, { unit: '' }])('rejeita item inválido: %j', patch => {
    const note = invoice();
    note.items[0] = { ...note.items[0], ...patch };
    expect(() => validateStockInvoice(note)).toThrow('Confira');
  });
});
