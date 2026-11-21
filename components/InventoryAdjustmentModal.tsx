import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Product } from '../types';
import { dbStockMovements, type InventoryDeposit } from '../services/db';
import { DEPOSITS, getDepositStock, getInventoryGroupProducts, INVENTORY_GROUPS, INVENTORY_GROUP_LABELS } from '../services/inventory';

interface InventoryAdjustmentModalProps {
  products: Product[];
  initialProduct?: Product | null;
  onClose: () => void;
  onStockChanged: () => Promise<void>;
}

export default function InventoryAdjustmentModal({ products, initialProduct, onClose, onStockChanged }: InventoryAdjustmentModalProps) {
  const physicalProducts = products.filter(product => product.isStockControlled !== false && !product.comboItems?.length);
  const [count, setCount] = useState(() => {
    const product = physicalProducts.find(item => item.id === initialProduct?.id) ?? physicalProducts[0];
    return { productId: product?.id ?? '', deposit: 'Ibotirama' as InventoryDeposit, expectedStock: product ? getDepositStock(product, 'Ibotirama') : 0 };
  });
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [message, setMessage] = useState('');
  const sending = useRef(false);
  const confirmed = useRef(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const product = physicalProducts.find(item => item.id === count.productId);
  const currentStock = product ? getDepositStock(product, count.deposit) : undefined;
  const conflict = currentStock !== count.expectedStock;
  const counted = Number(quantity);
  const valid = !!product && !conflict && quantity.trim() !== '' && Number.isFinite(counted) && counted >= 0 && reason.trim().length > 0;
  const locked = saving || committed;

  const selectCount = (productId: string, deposit: InventoryDeposit) => {
    const selected = physicalProducts.find(item => item.id === productId);
    setCount({ productId, deposit, expectedStock: selected ? getDepositStock(selected, deposit) : 0 });
    setQuantity('');
    setMessage('');
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current || confirmed.current || !valid) return;
    const payload = { action: 'adjust' as const, productId: count.productId, deposit: count.deposit, quantity: counted, expectedStock: count.expectedStock, reason: reason.trim() };
    const key = JSON.stringify(payload);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    sending.current = true;
    setSaving(true);
    setMessage('');
    try {
      await dbStockMovements.mutate({ operationId: pending.current.id, ...payload });
      confirmed.current = true;
      setCommitted(true);
      try {
        await onStockChanged();
        onClose();
      } catch {
        setMessage('Ajuste registrado. Recarregue a página para consultar o estoque atualizado. Não é necessário reenviar.');
      }
    } catch (error) {
      const detail = (error as { message?: string })?.message;
      setMessage(detail ? `Não foi possível confirmar o ajuste. ${detail}` : 'Não foi possível confirmar o ajuste. Tente novamente.');
    } finally {
      sending.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4">
      <section role="dialog" aria-modal="true" aria-labelledby="inventory-adjustment-title" className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90dvh] overflow-auto">
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
          <h3 id="inventory-adjustment-title" className="font-bold">Ajustar inventário físico</h3>
          <button type="button" aria-label="Fechar ajuste" onClick={onClose} disabled={saving} className="p-1 disabled:opacity-50"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Informe a quantidade contada no depósito. O ajuste registra a diferença e seu motivo no histórico.</p>
          <label className="block text-sm font-medium text-slate-700">Produto
            <select value={count.productId} onChange={event => selectCount(event.target.value, count.deposit)} disabled={locked} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {!physicalProducts.length && <option value="">Nenhum produto com estoque físico</option>}
              {INVENTORY_GROUPS.map(group => {
                const items = getInventoryGroupProducts(physicalProducts, group);
                return items.length > 0 && <optgroup key={group} label={INVENTORY_GROUP_LABELS[group]}>
                  {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </optgroup>;
              })}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Depósito
            <select value={count.deposit} onChange={event => selectCount(count.productId, event.target.value as InventoryDeposit)} disabled={locked} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {DEPOSITS.map(deposit => <option key={deposit} value={deposit}>{deposit}</option>)}
            </select>
          </label>
          {conflict && !committed && <div role="alert" className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            O saldo mudou desde a abertura da contagem. Confira o estoque novamente antes de ajustar.
            {product && <button type="button" disabled={saving} onClick={() => selectCount(count.productId, count.deposit)} className="block mt-2 font-bold underline">Reabrir contagem com saldo atual ({currentStock} {product.unit})</button>}
          </div>}
          <label className="block text-sm font-medium text-slate-700">Quantidade contada ({product?.unit ?? 'un'})
            <input type="number" min="0" step="any" required value={quantity} disabled={locked} onChange={event => setQuantity(event.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Motivo do ajuste
            <textarea required value={reason} disabled={locked} onChange={event => setReason(event.target.value)} placeholder="Descreva a divergência encontrada na contagem" className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" rows={3} />
          </label>
          <div aria-live="polite" className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 space-y-1">
            <p>Saldo na abertura: <strong>{count.expectedStock} {product?.unit}</strong></p>
            <p>Diferença: <strong>{quantity.trim() && Number.isFinite(counted) ? counted - count.expectedStock : '—'}</strong></p>
            <p>Saldo após o ajuste: <strong>{quantity.trim() && Number.isFinite(counted) ? counted : '—'} {product?.unit}</strong></p>
          </div>
          {message && <p role="alert" className={committed ? 'text-sm text-amber-800' : 'text-sm text-red-700'}>{message}</p>}
          {committed ? <button type="button" onClick={onClose} className="w-full bg-slate-700 text-white py-3 rounded-xl font-bold">Fechar</button> : <button type="submit" disabled={saving || !valid} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">{saving ? 'Confirmando ajuste…' : 'Confirmar ajuste'}</button>}
        </form>
      </section>
    </div>
  );
}
