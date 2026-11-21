import type { Product } from '../types';
import type { InventoryReceiptItem } from './db';

export interface InvoiceStockItem {
  line: string;
  supplierCode: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

export interface StockInvoice {
  key: string;
  supplierCnpj: string;
  supplierName: string;
  items: InvoiceStockItem[];
}

export interface ReceiptSelection {
  item: InvoiceStockItem;
  productId: string;
  multiplier: number;
  product?: Product;
}

export function validateStockInvoice(invoice: StockInvoice): StockInvoice {
  if (!/^\d{44}$/.test(invoice.key)) throw new Error('A nota precisa ter uma chave de acesso com 44 dígitos.');
  if (!/^\d{14}$/.test(invoice.supplierCnpj) || invoice.key.slice(6, 20) !== invoice.supplierCnpj) {
    throw new Error('O CNPJ do fornecedor está ausente ou difere da chave da nota.');
  }
  if (!invoice.items.length) throw new Error('Nenhum item de compra encontrado na nota.');
  for (const item of invoice.items) {
    if (!item.name.trim() || !item.unit.trim() || !item.supplierCode.trim()
      || !Number.isFinite(item.quantity) || item.quantity <= 0
      || !Number.isFinite(item.unitCost) || item.unitCost < 0) {
      throw new Error(`Confira nome, código, unidade, quantidade e custo do item ${item.line}.`);
    }
  }
  return invoice;
}

export function parseStockInvoice(xml: string): StockInvoice {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('O arquivo XML está malformado.');
  const info = doc.getElementsByTagName('infNFe')[0];
  const issuer = info?.getElementsByTagName('emit')[0];
  if (!info || !issuer) throw new Error('O arquivo não contém uma NF-e com fornecedor identificado.');
  const read = (element: Element, tag: string) => element.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
  return validateStockInvoice({
    key: (info.getAttribute('Id') ?? '').replace(/^NFe/, ''),
    supplierCnpj: read(issuer, 'CNPJ'),
    supplierName: read(issuer, 'xNome'),
    items: Array.from(info.getElementsByTagName('det')).map((detail, index) => {
      const product = detail.getElementsByTagName('prod')[0];
      if (!product) throw new Error(`Item ${index + 1} sem dados do produto.`);
      return {
        line: detail.getAttribute('nItem') || String(index + 1),
        supplierCode: read(product, 'cProd'), name: read(product, 'xProd'), unit: read(product, 'uCom'),
        quantity: Number(read(product, 'qCom') || 'NaN'), unitCost: Number(read(product, 'vUnCom') || 'NaN')
      };
    })
  });
}

export function buildReceiptItems(invoice: StockInvoice, selections: ReceiptSelection[], products: Product[]): InventoryReceiptItem[] {
  validateStockInvoice(invoice);
  if (selections.length !== invoice.items.length) throw new Error('Confira todos os itens da nota antes de receber.');
  const grouped = new Map<string, InventoryReceiptItem>();
  const codes = new Map<string, Set<string>>();
  for (const selection of selections) {
    const { item, productId, multiplier, product } = selection;
    const target = product ?? products.find(candidate => candidate.id === productId);
    if (!target || target.id !== productId || target.isStockControlled === false || target.comboItems?.length) {
      throw new Error(`Vincule o item ${item.line} a um produto com estoque físico.`);
    }
    const quantity = item.quantity * multiplier;
    if (!Number.isFinite(multiplier) || multiplier <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Informe uma conversão maior que zero no item ${item.line}.`);
    }
    if (product && (!product.name.trim() || !product.unit.trim() || !Number.isFinite(product.cost) || product.cost < 0)) {
      throw new Error(`Confira o cadastro do novo produto no item ${item.line}.`);
    }
    const entry = grouped.get(productId) ?? { productId, quantity: 0, ...(product ? { product: { ...product, stockMatrizIbotirama: 0, stockMatrizBarreiras: 0, stockFilial: 0 } } : {}) };
    entry.quantity += quantity;
    if (!Number.isFinite(entry.quantity)) throw new Error('Quantidade total inválida.');
    grouped.set(productId, entry);
    if (!codes.has(productId)) codes.set(productId, new Set());
    codes.get(productId)!.add(item.supplierCode);
  }
  return Array.from(grouped.values(), entry => ({
    ...entry,
    supplierCode: JSON.stringify({ supplierCnpj: invoice.supplierCnpj, codes: [...codes.get(entry.productId)!].sort() })
  }));
}
