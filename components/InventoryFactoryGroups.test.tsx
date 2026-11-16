import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Category, type Product, type User } from '../types';

const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const state = (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.cells[index], (value: unknown) => {
      hooks.cells[index] = typeof value === 'function' ? value(hooks.cells[index]) : value;
    }];
  };
  const overrides = { useState: state, useEffect: () => {}, useRef: (initial: unknown) => state({ current: initial })[0] };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});
vi.mock('../services/db', () => ({ dbStockMovements: {}, dbCategories: {} }));
vi.mock('../services/supabase', () => ({ supabase: {} }));
vi.mock('@zxing/library', () => ({ BrowserMultiFormatReader: vi.fn() }));

import Inventory from './Inventory';

const ice: Product = {
  id: 'ice', name: 'Gelo cubo 5kg', category: Category.ICE_CUBE, unit: 'sc', cost: 3,
  priceMatriz: 8, priceFilial: 11, stockMatrizIbotirama: 10, stockMatrizBarreiras: 4,
  stockFilial: -664, minStock: 0,
};
const bag: Product = { ...ice, id: 'bag', name: 'Embalagem 5kg', category: Category.RAW_MATERIAL, unit: 'un', cost: 0.5 };
const vodka: Product = { ...ice, id: 'vodka', name: 'Vodka legada', category: Category.VODKA };

type Element = React.ReactElement<Record<string, any>>;
function nodes(node: React.ReactNode): Element[] {
  if (!React.isValidElement(node)) return Array.isArray(node) ? node.flatMap(nodes) : [];
  const element = node as Element;
  return [element, ...nodes(element.props.children)];
}
function text(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text((node as Element).props.children) : '';
}
function setup(products = [ice, bag, vodka]) {
  const props = {
    products, sales: [], financials: [], currentUser: { tenantId: 'tenant' } as User,
    onUpdateProduct: vi.fn().mockResolvedValue(undefined), onAddProduct: vi.fn().mockResolvedValue(undefined),
    onStockChanged: vi.fn().mockResolvedValue(undefined), onDeleteProduct: vi.fn(), onOpenPricing: vi.fn(),
    onAddFinancialRecord: vi.fn(), onBack: vi.fn(),
  };
  let tree: React.ReactNode;
  const render = () => { hooks.cursor = 0; tree = Inventory(props); return renderToStaticMarkup(tree); };
  const button = (label: string) => nodes(tree).find(node => node.type === 'button' && text(node).trim() === label)!;
  return { props, render, button, elements: () => nodes(tree) };
}

beforeEach(() => { hooks.cells = []; hooks.cursor = 0; vi.stubGlobal('alert', vi.fn()); });

describe('estoque da fábrica por grupo', () => {
  it('abre no gelo com apenas os depósitos da fábrica e mantém bebidas fora dos insumos', () => {
    const screen = setup();
    let html = screen.render();
    expect(html).toContain('Gelo cubo 5kg');
    expect(html).not.toContain('Embalagem 5kg');
    expect(html).not.toContain('Vodka legada');
    expect(html).not.toContain('Filial');
    expect(html).not.toContain('664');
    screen.button('Estoque de insumos').props.onClick();
    html = screen.render();
    expect(html).toContain('Embalagem 5kg');
    expect(html).toContain('Custo unitário');
    expect(html).not.toContain('Gelo cubo 5kg');
    expect(html).not.toContain('Vodka legada');
    expect(html).not.toContain('Preço de venda');
    screen.button('Outros produtos').props.onClick();
    html = screen.render();
    expect(html).toContain('Vodka legada');
    expect(html).not.toContain('Embalagem 5kg');
  });

  it('omite Outros quando não há produtos e orienta cadastro do grupo vazio', () => {
    const screen = setup([ice]);
    expect(screen.render()).not.toContain('Outros produtos');
    screen.button('Estoque de insumos').props.onClick();
    expect(screen.render()).toContain('Cadastre embalagens e matérias-primas em Novo insumo.');
  });

  it('retira os campos da filial da edição e preserva os dados legados ao salvar', async () => {
    const screen = setup([ice]);
    screen.render(); screen.button('Editar').props.onClick();
    const html = screen.render();
    expect(html).toContain('MAT. IBOTIRAMA');
    expect(html).toContain('MAT. BARREIRAS');
    expect(html).not.toContain('<option value="Vodka">');
    expect(html).not.toContain('<option value="Gin">');
    expect(html).not.toContain('Drinks, Coquetéis');
    expect(html).toContain('<option value="Gelo Cubo"');
    expect(html).not.toContain('FILIAL');
    expect(html).not.toContain('Filial');
    await screen.button('Salvar Alterações').props.onClick();
    expect(screen.props.onUpdateProduct).toHaveBeenCalledWith(expect.objectContaining({ stockFilial: -664, priceFilial: 11 }));
  });

  it('cadastra insumo sem exigir preço da filial e inicia os campos legados em zero', async () => {
    const screen = setup();
    screen.render(); screen.button('Estoque de insumos').props.onClick(); screen.render();
    screen.button('Novo insumo').props.onClick();
    const html = screen.render();
    expect(html).toContain('<option value="Embalagens">Embalagens</option>');
    expect(html).not.toContain('<option value="Vodka">');
    expect(html).not.toContain('<option value="Gelo Cubo"');
    const name = screen.elements().find(node => node.type === 'input' && node.props.type === 'text' && node.props.placeholder === undefined && node.props.value === '')!;
    name.props.onChange({ target: { value: 'Saco novo' } }); screen.render();
    await screen.button('Salvar Produto').props.onClick();
    expect(screen.props.onAddProduct).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Saco novo', category: Category.RAW_MATERIAL, stockFilial: 0, priceFilial: 0,
    }));
  });

  it('restringe totais e reposição do relatório ao grupo ativo', () => {
    const screen = setup();
    screen.render(); screen.button('Estoque de insumos').props.onClick(); screen.render();
    screen.button('Movimentações e relatório').props.onClick();
    const html = screen.render();
    expect(html).toContain('Relatório de estoque · Insumos');
    expect(html).toContain('7,00');
    expect(html).not.toContain('Potencial de Venda');
    expect(html).not.toContain('Produtos Expedidos');
    expect(html).not.toContain('Filial');
  });

  it('preserva categoria personalizada atual ao editar gelo', () => {
    const screen = setup([{ ...ice, category: 'Gelo artesanal' }, vodka]);
    screen.render(); screen.button('Editar').props.onClick();
    expect(screen.render()).toContain('<option value="Gelo artesanal" selected="">Gelo artesanal</option>');
  });
});
