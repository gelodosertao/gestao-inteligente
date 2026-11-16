import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Category, type Product } from '../types';
import { dbStockMovements, type InventoryDeposit } from '../services/db';
import { DEPOSITS, getInventoryGroupProducts, INVENTORY_GROUPS, INVENTORY_GROUP_LABELS } from '../services/inventory';
import { buildReceiptItems, type StockInvoice } from '../services/inventoryXml';

interface Props {
  invoice: StockInvoice;
  products: Product[];
  onStockChanged: () => Promise<void>;
  onClose: () => void;
}

interface RowSelection {
  target: string;
  multiplier: string;
  newId: string;
  name: string;
  unit: string;
  category: string;
}

export default function InventoryXmlReceiptModal({ invoice, products, onStockChanged, onClose }: Props) {
  const [deposit, setDeposit] = useState<InventoryDeposit>('Ibotirama');
  const [rows, setRows] = useState<RowSelection[]>(() => invoice.items.map(item => ({
    target: '', multiplier: '1', newId: crypto.randomUUID(), name: item.name,
    unit: item.unit.toLowerCase(), category: Category.RAW_MATERIAL
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const operations = useRef(new Map<string, string>());
  const physicalProducts = products.filter(product => product.isStockControlled !== false && !product.comboItems?.length);
  const updateRow = (index: number, patch: Partial<RowSelection>) => {
    setRows(previous => previous.map((row, position) => position === index ? { ...row, ...patch } : row));
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setError('');
    try {
      const selections = rows.map((row, index) => {
        const item = invoice.items[index];
        const multiplier = Number(row.multiplier);
        const product: Product | undefined = row.target === 'NEW' ? {
          id: row.newId, name: row.name.trim(), category: row.category, unit: row.unit.trim(),
          cost: item.unitCost / multiplier, priceMatriz: 0, priceFilial: 0,
          stockMatrizIbotirama: 0, stockMatrizBarreiras: 0, stockFilial: 0,
          minStock: 0, isStockControlled: true
        } : undefined;
        return { item, multiplier, product, productId: product?.id ?? row.target };
      });
      const items = buildReceiptItems(invoice, selections, products);
      const payload = { invoiceKey: invoice.key, deposit, items };
      const key = JSON.stringify(payload);
      const operationId = operations.current.get(key) ?? crypto.randomUUID();
      operations.current.set(key, operationId);
      inFlight.current = true;
      setSaving(true);
      await dbStockMovements.receiveXml({ operationId, ...payload });
      try {
        await onStockChanged();
        alert('Recebimento confirmado. Estoque atualizado.');
      } catch {
        alert('Recebimento confirmado. Não repita a entrada: recarregue a página para consultar o estoque atualizado.');
      }
      onClose();
    } catch (failure) {
      setError((failure as { message?: string })?.message || 'Não foi possível confirmar o recebimento. Confira os dados e tente novamente.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 pt-safe-offset-4" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
      <form onSubmit={confirm} className="my-4 w-full max-w-4xl rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between gap-4 border-b p-5">
          <h3 id="receipt-title" className="text-lg font-bold text-slate-800">Receber compra por XML</h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar recebimento" className="rounded p-2 disabled:opacity-40"><X size={20} /></button>
        </header>
        <fieldset disabled={saving} className="space-y-5 p-5 disabled:opacity-70">
          <div className="space-y-1 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">{invoice.supplierName || 'Fornecedor'} · CNPJ {invoice.supplierCnpj}</p>
            <p className="break-all">Chave: {invoice.key}</p>
            <p>Vincule todos os itens e confira a conversão. Produtos existentes mantêm seus preços e custos cadastrados.</p>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Depósito de recebimento
            <select value={deposit} onChange={event => setDeposit(event.target.value as InventoryDeposit)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2">
              {DEPOSITS.map(location => <option key={location}>{location}</option>)}
            </select>
          </label>
          {invoice.items.map((item, index) => {
            const row = rows[index];
            const target = physicalProducts.find(product => product.id === row.target);
            const baseUnit = row.target === 'NEW' ? row.unit : target?.unit;
            const quantity = item.quantity * Number(row.multiplier);
            return (
              <section key={`${item.line}-${index}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-800">{item.line}. {item.name}</p>
                <p className="text-sm text-slate-600">Código do fornecedor: {item.supplierCode} · {item.quantity} {item.unit} · custo na nota R$ {item.unitCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}/{item.unit}</p>
                <label className="block text-sm font-semibold text-slate-700">
                  Produto do estoque — item {item.line}
                  <select required value={row.target} onChange={event => updateRow(index, { target: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2">
                    <option value="">Selecione o produto interno</option>
                    <option value="NEW">Cadastrar novo produto</option>
                    {INVENTORY_GROUPS.map(group => {
                      const items = getInventoryGroupProducts(physicalProducts, group);
                      return items.length > 0 && <optgroup key={group} label={INVENTORY_GROUP_LABELS[group]}>
                        {items.map(product => <option key={product.id} value={product.id}>{product.name} ({product.unit})</option>)}
                      </optgroup>;
                    })}
                  </select>
                </label>
                {row.target === 'NEW' && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm font-semibold text-slate-700">Nome do novo produto<input required value={row.name} onChange={event => updateRow(index, { name: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
                    <label className="text-sm font-semibold text-slate-700">Unidade de estoque<input required value={row.unit} onChange={event => updateRow(index, { unit: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
                    <label className="text-sm font-semibold text-slate-700">Categoria<select value={row.category} onChange={event => updateRow(index, { category: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2">{[Category.RAW_MATERIAL, 'Embalagens', Category.ICE_BAR, Category.ICE_CUBE, Category.ICE_FLAKE, Category.ICE_FLAVOR, Category.OTHER].map(category => <option key={category}>{category}</option>)}</select></label>
                    <p className="text-xs text-slate-500 sm:col-span-3">Novo cadastro com preço de venda zero. O custo por unidade considera a conversão informada.</p>
                  </div>
                )}
                <label className="block text-sm font-semibold text-slate-700">
                  Quantas unidades de estoque correspondem a 1 {item.unit} da nota?
                  <input required type="number" step="any" min="0.000000001" value={row.multiplier} onChange={event => updateRow(index, { multiplier: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
                </label>
                <p className="text-sm font-semibold text-emerald-700" aria-live="polite">Entrada: {Number.isFinite(quantity) && quantity > 0 ? quantity.toLocaleString('pt-BR', { maximumFractionDigits: 6 }) : '—'} {baseUnit || '(selecione a unidade do estoque)'}</p>
              </section>
            );
          })}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <footer className="flex flex-wrap justify-end gap-3 border-t pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600">Cancelar</button>
            <button type="submit" className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white">{saving ? 'Confirmando recebimento…' : 'Confirmar recebimento'}</button>
          </footer>
        </fieldset>
      </form>
    </div>
  );
}
