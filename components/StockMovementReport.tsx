import React, { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import type { StockMovement } from '../types';
import { formatStockMovementDate, getStockMovementDeposit, getStockMovementDetails, matchesStockLedgerFilters, STOCK_NATURE_LABELS, type StockNature } from '../services/stockLedger';

interface StockMovementReportProps {
  movements: StockMovement[];
  loading: boolean;
  error?: string;
  month?: string;
  year?: string;
}

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6, signDisplay: 'exceptZero' });
const balanceFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

export default function StockMovementReport({ movements, loading, error, month = 'ALL', year = 'ALL' }: StockMovementReportProps) {
  const [productId, setProductId] = useState('');
  const [deposit, setDeposit] = useState('');
  const [nature, setNature] = useState<StockNature | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const products = useMemo(() => [...new Map(movements.map(movement => [movement.productId, movement.productName])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], 'pt-BR')), [movements]);
  const deposits = useMemo(() => [...new Set(movements.map(getStockMovementDeposit))].sort(), [movements]);
  const invalidRange = !!startDate && !!endDate && startDate > endDate;
  const filtered = useMemo(() => movements.filter(movement => matchesStockLedgerFilters(movement, { productId, deposit, nature, startDate, endDate, month, year }))
    .sort((left, right) => (Date.parse(right.date) || 0) - (Date.parse(left.date) || 0)), [movements, productId, deposit, nature, startDate, endDate, month, year]);
  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="stock-ledger-title">
      <div className="border-b border-slate-100 bg-slate-50 p-4">
        <h4 id="stock-ledger-title" className="flex items-center gap-2 font-bold text-slate-800"><ScrollText size={18} /> Extrato de movimentações</h4>
        <p className="mt-1 text-xs text-slate-600">Entradas e saídas por produto e depósito. O período também segue o mês e o ano selecionados acima.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold text-slate-700">Produto
          <select className={inputClass} value={productId} onChange={event => setProductId(event.target.value)}>
            <option value="">Todos os produtos</option>
            {products.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">Depósito
          <select className={inputClass} value={deposit} onChange={event => setDeposit(event.target.value)}>
            <option value="">Todos os depósitos</option>
            {deposits.map(value => <option key={value} value={value}>{value === 'Filial' ? 'Filial (histórico)' : value}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">Operação
          <select className={inputClass} value={nature} onChange={event => setNature(event.target.value as StockNature | '')}>
            <option value="">Todas as operações</option>
            {Object.entries(STOCK_NATURE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">Data inicial
          <input className={inputClass} type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
        </label>
        <label className="text-xs font-semibold text-slate-700">Data final
          <input className={inputClass} type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
        </label>
        <button type="button" className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setProductId(''); setDeposit(''); setNature(''); setStartDate(''); setEndDate(''); }}>Limpar filtros do extrato</button>
      </div>
      {error ? <p role="alert" className="p-4 text-sm text-red-700">{error}</p>
        : invalidRange ? <p role="alert" className="p-4 text-sm text-red-700">A data final deve ser igual ou posterior à data inicial.</p>
          : <div className="max-h-[32rem] overflow-auto" aria-busy={loading}>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>{['Data e hora', 'Produto / operação', 'Depósito', 'Movimentação', 'Saldo antes → depois', 'Responsável / referência'].map(label => <th key={label} scope="col" className="p-3 font-semibold">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={6} className="p-6 text-center text-slate-600">Carregando movimentações...</td></tr>
                  : !filtered.length ? <tr><td colSpan={6} className="p-6 text-center text-slate-600">Nenhuma movimentação no período e nos filtros selecionados.</td></tr>
                    : filtered.map(movement => {
                      const details = getStockMovementDetails(movement);
                      const hasBalances = Number.isFinite(movement.stockBefore) && Number.isFinite(movement.stockAfter);
                      return <tr key={movement.id} className="align-top hover:bg-slate-50">
                        <td className="whitespace-nowrap p-3 text-slate-600">{formatStockMovementDate(movement.date)}</td>
                        <td className="p-3"><p className="font-semibold text-slate-800">{movement.productName}</p><p className="text-slate-700">{details.label}</p><p className="text-xs text-slate-500">{movement.reason || 'Motivo não informado'}</p><p className="text-xs text-slate-500">Tipo original: {movement.type}</p></td>
                        <td className="p-3 text-slate-700">{getStockMovementDeposit(movement) === 'Filial' ? 'Filial (histórico)' : getStockMovementDeposit(movement)}</td>
                        <td className={`p-3 font-bold ${details.delta < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{Number.isFinite(details.delta) ? quantityFormat.format(details.delta) : 'Não informada'}</td>
                        <td className="whitespace-nowrap p-3 text-slate-600">{hasBalances ? `${balanceFormat.format(movement.stockBefore!)} → ${balanceFormat.format(movement.stockAfter!)}` : 'Não registrado'}</td>
                        <td className="max-w-[16rem] break-words p-3 text-slate-700"><p>{movement.responsible || 'Não registrado'}</p><p className="text-xs text-slate-500">Operação: {movement.operationId || movement.id}</p>{movement.saleId && <p className="text-xs text-slate-500">Venda: {movement.saleId}</p>}</td>
                      </tr>;
                    })}
              </tbody>
            </table>
          </div>}
      <p className="border-t border-slate-100 p-3 text-xs text-slate-500">Os saldos são os registrados em cada operação. Movimentações antigas podem não informar responsável ou saldo anterior e posterior.</p>
    </section>
  );
}
