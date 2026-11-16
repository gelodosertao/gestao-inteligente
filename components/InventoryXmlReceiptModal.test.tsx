import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Product } from '../types';
import type { StockInvoice } from '../services/inventoryXml';

vi.mock('../services/db', () => ({ dbStockMovements: { receiveXml: vi.fn() } }));

import InventoryXmlReceiptModal from './InventoryXmlReceiptModal';

describe('seleção de estoque no recebimento XML', () => {
  it('mantém somente depósitos da fábrica e agrupa produtos sem classificar bebidas como insumo', () => {
    const base: Product = { id: 'ice', name: 'Gelo Cubo 5kg', category: 'Gelo Cubo', unit: 'un',
      stockMatrizIbotirama: 100, stockMatrizBarreiras: 40, stockFilial: 664,
      cost: 3, priceMatriz: 6, priceFilial: 8, minStock: 0 };
    const invoice: StockInvoice = { key: '1'.repeat(44), supplierCnpj: '1'.repeat(14), supplierName: 'Fornecedor',
      items: [{ line: '1', supplierCode: 'bags', name: 'Sacos para gelo', unit: 'pct', quantity: 1, unitCost: 10 }] };
    const html = renderToStaticMarkup(<InventoryXmlReceiptModal invoice={invoice} products={[
      base, { ...base, id: 'bags', name: 'Sacos', category: 'Embalagens' },
      { ...base, id: 'beer', name: 'Cerveja', category: 'Cerveja' },
    ]} onClose={vi.fn()} onStockChanged={vi.fn()} />);
    expect(html).toContain('<option selected="">Ibotirama</option>');
    expect(html).toContain('<option>Barreiras</option>');
    expect(html).not.toContain('Filial');
    expect(html).toMatch(/<optgroup label="Gelo">[\s\S]*?Gelo Cubo 5kg[\s\S]*?<\/optgroup>/);
    expect(html).toMatch(/<optgroup label="Insumos">[\s\S]*?Sacos[\s\S]*?<\/optgroup>/);
    expect(html).toMatch(/<optgroup label="Outros">[\s\S]*?Cerveja[\s\S]*?<\/optgroup>/);
  });
});
