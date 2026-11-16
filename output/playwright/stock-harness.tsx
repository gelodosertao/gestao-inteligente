import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Inventory from '../../components/Inventory';
import WholesalePOS from '../../components/WholesalePOS';
import Production from '../../components/Production';
import Financial from '../../components/Financial';
import { Branch, Category, type Product, type Sale, type User } from '../../types';
import { dbProducts, dbSales } from '../../services/db';
import '../../index.css';
import '../../brand-ui.css';

const tenantId = '11111111-1111-4111-8111-111111111111';
const user = { id: '22222222-2222-4222-8222-222222222222', tenantId, name: 'Operador de teste', role: 'ADMIN', isActive: true } as User;
const ice: Product = { id: 'ice', name: 'Gelo Cubo 5kg', category: Category.ICE_CUBE, unit: 'un', priceMatriz: 8, priceFilial: 10, cost: 3, minStock: 0, stockMatrizIbotirama: 100, stockMatrizBarreiras: 40, stockFilial: 664, recipe: [{ ingredientId: 'bag', quantity: 1 }], recipeBatchSize: 1 };
const bag: Product = { ...ice, id: 'bag', name: 'Embalagem 5kg', category: Category.RAW_MATERIAL, cost: 0.5, stockMatrizIbotirama: 20, stockMatrizBarreiras: 0, stockFilial: 0, recipe: [] };
const initialSale: Sale = { id: '33333333-3333-4333-8333-333333333333', date: new Date().toISOString().slice(0, 10), customerName: 'Cliente de teste', customerId: 'client', total: 80, items: [{ productId: 'ice', productName: ice.name, quantity: 10, priceAtSale: 8 }], branch: Branch.MATRIZ, source: 'ATACADO', matrizDeposit: 'Barreiras', status: 'Pending', amountPaid: 0, paymentHistory: [], fulfillmentStatus: 'pending', revision: 0, paymentMethod: 'Pix', hasInvoice: false };

function Harness() {
  const [products, setProducts] = useState([ice, bag]);
  const [sales, setSales] = useState([initialSale]);
  const [view, setView] = useState(new URLSearchParams(location.search).get('view') || 'inventory');
  const stockChanged = async () => setProducts(await dbProducts.getAll(tenantId));
  useEffect(() => { void stockChanged(); void dbSales.getAll(tenantId).then(setSales); }, []);
  const updateSale = async (sale: Sale) => { await dbSales.applyOperation('update', sale, crypto.randomUUID()); setSales(await dbSales.getAll(tenantId)); await stockChanged(); };
  const common = { products, sales, customers: [{ id: 'client', name: 'Cliente de teste', city: 'Ibotirama', state: 'BA' }], currentUser: user, onBack: () => {}, onAddCustomer: async () => {}, onAddSale: async (sale: Sale) => { await dbSales.applyOperation('create', sale, crypto.randomUUID()); setSales(await dbSales.getAll(tenantId)); }, onUpdateSale: updateSale, onDeleteSale: async () => {} };
  return <div className="p-4"><nav className="flex gap-4 mb-6">{['inventory', 'wholesale', 'production', 'financial'].map(name => <button key={name} onClick={() => setView(name)}>{name}</button>)}</nav>
    {view === 'inventory' && <Inventory {...common} financials={[]} onUpdateProduct={async product => { await dbProducts.update(product); await stockChanged(); }} onAddProduct={async product => { await dbProducts.add(product, tenantId); await stockChanged(); }} onDeleteProduct={async () => {}} onOpenPricing={() => {}} onAddFinancialRecord={async () => {}} onStockChanged={stockChanged} />}
    {view === 'wholesale' && <WholesalePOS {...common} onLogout={() => {}} />}
    {view === 'production' && <Production {...common} onUpdateProduct={async product => { await dbProducts.update(product); await stockChanged(); }} onAddProduct={async product => { await dbProducts.add(product, tenantId); await stockChanged(); }} onStockChanged={stockChanged} />}
    {view === 'financial' && <Financial {...common} records={[]} cashClosings={[]} onAddRecord={async () => {}} onUpdateRecord={async () => {}} onDeleteRecord={() => {}} onAddCashClosing={async () => {}} onDeleteCashClosing={() => {}} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
