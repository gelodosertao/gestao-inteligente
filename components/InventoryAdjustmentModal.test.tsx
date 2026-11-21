import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types';

const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, mutate: vi.fn() }));
vi.mock('../services/db', () => ({ dbStockMovements: { mutate: harness.mutate } }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [harness.slots[index], (value: unknown) => { harness.slots[index] = value; }];
    },
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index];
    },
  };
});

import InventoryAdjustmentModal from './InventoryAdjustmentModal';

const ice: Product = { id: 'ice', name: 'Gelo', category: 'Gelo Cubo', unit: 'un', stockMatrizIbotirama: 100, stockMatrizBarreiras: 40, stockFilial: 5, cost: 3, priceMatriz: 6, priceFilial: 8, minStock: 0 };
type Node = ReactElement<any>;
function nodes(node: unknown): Node[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const element = node as Node;
  return [element, ...nodes(element.props?.children)];
}
function setup() {
  const props = { products: [ice], initialProduct: ice, onClose: vi.fn(), onStockChanged: vi.fn().mockResolvedValue(undefined) };
  const render = () => { harness.cursor = 0; return InventoryAdjustmentModal(props); };
  const fill = (value = '90') => {
    nodes(render()).find(node => node.type === 'input')!.props.onChange({ target: { value } });
    nodes(render()).find(node => node.type === 'textarea')!.props.onChange({ target: { value: 'Conferência física' } });
  };
  const submit = () => nodes(render()).find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  return { props, render, fill, submit };
}

beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.mutate.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('stable-operation-id') });
});

describe('ajuste de inventário físico', () => {
  it('oferece somente depósitos ativos e separa gelo, insumos e outros sem ocultar cadastros', () => {
    const app = setup();
    app.props.products = [ice, { ...ice, id: 'bags', name: 'Sacos', category: 'Embalagens' }, { ...ice, id: 'beer', name: 'Cerveja', category: 'Cerveja' }];
    const tree = nodes(app.render());
    expect(tree.filter(node => node.type === 'optgroup').map(node => node.props.label)).toEqual(['Gelo', 'Insumos', 'Outros']);
    const deposits = nodes(tree.filter(node => node.type === 'select')[1]);
    expect(deposits.filter(node => node.type === 'option').map(node => node.props.value)).toEqual(['Ibotirama', 'Barreiras']);
    expect(tree.filter(node => node.type === 'option').map(node => node.props.value)).toEqual(expect.arrayContaining(['ice', 'bags', 'beer']));
  });

  it('envia saldo contado com snapshot e aceita contagem zero', async () => {
    const app = setup();
    app.fill('0');
    await app.submit();
    expect(harness.mutate).toHaveBeenCalledWith({ operationId: 'stable-operation-id', action: 'adjust', productId: 'ice', deposit: 'Ibotirama', expectedStock: 100, quantity: 0, reason: 'Conferência física' });
    expect(app.props.onStockChanged).toHaveBeenCalledOnce();
    expect(app.props.onClose).toHaveBeenCalledOnce();
  });

  it.each(['', '-1', 'Infinity', 'NaN'])('rejeita quantidade inválida %j', async value => {
    const app = setup();
    app.fill(value);
    await app.submit();
    expect(harness.mutate).not.toHaveBeenCalled();
  });

  it('exige motivo preenchido', async () => {
    const app = setup();
    app.fill();
    nodes(app.render()).find(node => node.type === 'textarea')!.props.onChange({ target: { value: '  ' } });
    await app.submit();
    expect(harness.mutate).not.toHaveBeenCalled();
  });

  it('bloqueia saldo alterado e só recaptura mediante reconferência explícita', async () => {
    const app = setup();
    app.fill();
    app.props.products = [{ ...ice, stockMatrizIbotirama: 95 }];
    await app.submit();
    expect(harness.mutate).not.toHaveBeenCalled();
    const reopen = nodes(app.render()).find(node => node.type === 'button' && String(node.props.children).includes('Reabrir contagem'))!;
    reopen.props.onClick();
    expect(nodes(app.render()).find(node => node.type === 'input')!.props.value).toBe('');
    app.fill('94');
    await app.submit();
    expect(harness.mutate).toHaveBeenCalledWith(expect.objectContaining({ expectedStock: 95, quantity: 94 }));
  });

  it('preserva formulário e identificador quando a confirmação falha', async () => {
    harness.mutate.mockRejectedValueOnce(new Error('Rede indisponível'));
    const app = setup();
    app.fill();
    await app.submit();
    expect(app.props.onClose).not.toHaveBeenCalled();
    expect(nodes(app.render()).find(node => node.type === 'input')!.props.value).toBe('90');
    await app.submit();
    expect(harness.mutate.mock.calls[0][0].operationId).toBe(harness.mutate.mock.calls[1][0].operationId);
    expect(crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it('trava envio concorrente e não fecha antes da confirmação', async () => {
    let resolve!: () => void;
    harness.mutate.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const app = setup();
    app.fill();
    const pending = app.submit();
    await app.submit();
    expect(harness.mutate).toHaveBeenCalledOnce();
    expect(app.props.onClose).not.toHaveBeenCalled();
    resolve();
    await pending;
    expect(app.props.onClose).toHaveBeenCalledOnce();
  });

  it('não permite reenviar ajuste gravado quando a recarga falha', async () => {
    const app = setup();
    app.props.onStockChanged.mockRejectedValue(new Error('Falha na recarga'));
    app.fill();
    await app.submit();
    await app.submit();
    expect(harness.mutate).toHaveBeenCalledOnce();
    expect(app.props.onClose).not.toHaveBeenCalled();
    expect(nodes(app.render()).some(node => node.props?.role === 'alert' && String(node.props.children).includes('Ajuste registrado'))).toBe(true);
  });
});
