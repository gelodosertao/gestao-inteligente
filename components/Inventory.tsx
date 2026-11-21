import React, { useState, useEffect, useRef } from 'react';
import { Product, Branch, Category, Sale, FinancialRecord, StockMovement, CategoryItem, User } from '../types';
import { Search, Plus, ArrowRightLeft, Filter, Save, X, Truck, AlertTriangle, Upload, FileText, ArrowLeft, AlertOctagon, Edit, Calculator, DollarSign, TrendingUp, Trash2, PieChart, BarChart3, ListPlus, ScrollText, Camera } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { dbStockMovements, dbCategories } from '../services/db';
import type { InventoryDeposit } from '../services/db';
import { DEPOSITS, getDepositStock, getStockCost, getSalePotential, shouldRestock, getInventoryGroup, getInventoryGroupProducts, type InventoryGroup } from '../services/inventory';
import { parseStockInvoice, type StockInvoice } from '../services/inventoryXml';
import InventoryXmlReceiptModal from './InventoryXmlReceiptModal';
import { supabase } from '../services/supabase';
import InventoryAdjustmentModal from './InventoryAdjustmentModal';
import StockMovementReport from './StockMovementReport';
import { getMovementLocalDate } from '../services/stockLedger';
import { getDispatchedProductRanking, getSaleDispatchDate } from '../services/dispatchedSalesReport';

interface InventoryProps {
  products: Product[];
  sales: Sale[];
  financials: FinancialRecord[];
  onUpdateProduct: (product: Product) => Promise<void>;
  onAddProduct: (product: Product) => Promise<void>;
  onStockChanged: () => Promise<void>;
  onDeleteProduct: (productId: string) => void;
  onOpenPricing: (productId: string) => void;
  onAddFinancialRecord: (records: FinancialRecord[]) => void;
  onBack: () => void;
  currentUser: User;
}

const Inventory: React.FC<InventoryProps> = ({ products, sales, financials, onUpdateProduct, onAddProduct, onStockChanged, onDeleteProduct, onOpenPricing, onBack, currentUser }) => {
  const [filter, setFilter] = useState('');
  const [inventoryGroup, setInventoryGroup] = useState<InventoryGroup>('ice');

  // Modal States
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [stockInvoice, setStockInvoice] = useState<StockInvoice | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form States
  const [transferQty, setTransferQty] = useState(0);
  const [transferFrom, setTransferFrom] = useState<InventoryDeposit>('Ibotirama');
  const [transferTo, setTransferTo] = useState<InventoryDeposit>('Barreiras');
  const [transferReason, setTransferReason] = useState('Transferência interna');
  const [savingTransfer, setSavingTransfer] = useState(false);
  const transferInFlight = useRef(false);
  const pendingTransferOperations = useRef(new Map<string, string>());

  const [isEditing, setIsEditing] = useState(false);
  const [savingLoss, setSavingLoss] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const lossInFlight = useRef(false);
  const productInFlight = useRef(false);
  const newProductId = useRef<string | null>(null);
  const pendingLossOperations = useRef(new Map<string, string>());

  // Loss Registration State
  const [showLossModal, setShowLossModal] = useState(false);
  const [lossData, setLossData] = useState({
    deposit: 'Ibotirama' as InventoryDeposit,
    quantity: 1,
    reason: 'Quebra/Dano'
  });

  // New Product Form
  const [newProductData, setNewProductData] = useState<Partial<Product>>({
    category: 'Gelo Cubo',
    unit: 'un'
  });

  // Pricing Calculator State
  const [taxRate, setTaxRate] = useState(4);

  // Report State
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementsError, setMovementsError] = useState('');

  // --- CAMERA SCANNER STATE ---
  const [showCameraModal, setShowCameraModal] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const codeReaderRef = React.useRef<BrowserMultiFormatReader | null>(null);

  const startCamera = async () => {
    setShowCameraModal(true);
    if (!codeReaderRef.current) {
      codeReaderRef.current = new BrowserMultiFormatReader();
    }

    try {
      const videoInputDevices = await codeReaderRef.current.listVideoInputDevices();
      if (videoInputDevices.length > 0) {
        codeReaderRef.current.decodeFromVideoDevice(null, videoRef.current, (result) => {
          if (result) {
            const barcode = result.getText();
            setNewProductData((prev) => ({ ...prev, barcode }));
            stopCamera();
          }
        });
      }
    } catch (err) {
      console.error("Erro ao iniciar câmera", err);
    }
  };

  const stopCamera = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }
    setShowCameraModal(false);
  };

  const [reportMonth, setReportMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
  const [reportYear, setReportYear] = useState(new Date().getFullYear().toString());

  useEffect(() => {
    let active = true;
    if (showReportModal) {
      setLoadingMovements(true);
      setMovementsError('');
      setStockMovements([]);
      dbStockMovements.getAll(currentUser.tenantId)
        .then(data => { if (active) setStockMovements(data); })
        .catch(err => {
          console.error('Erro ao carregar movimentos', err);
          if (active) setMovementsError('Não foi possível carregar as movimentações. Feche e abra o relatório para tentar novamente.');
        })
        .finally(() => { if (active) setLoadingMovements(false); });
    }
    return () => { active = false; };
  }, [showReportModal, currentUser.tenantId]);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = () => {
    dbCategories.getAll(currentUser.tenantId, 'PRODUCT')
      .then(setCategories)
      .catch(err => console.error("Erro ao carregar categorias", err));
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await dbCategories.add({ name: newCategoryName, type: 'PRODUCT' }, currentUser.tenantId);
      setNewCategoryName('');
      loadCategories();
    } catch (error) {
      console.error("Erro ao adicionar categoria", error);
      alert("Erro ao adicionar categoria. Verifique se já existe.");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta categoria?")) return;
    try {
      await dbCategories.delete(id);
      loadCategories();
    } catch (error) {
      console.error("Erro ao excluir categoria", error);
    }
  };
  const [cardFee, setCardFee] = useState(2);
  const [fixedCostRate, setFixedCostRate] = useState(10);
  const [desiredMargin, setDesiredMargin] = useState(20);

  const calculateFinancialMetrics = () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSales = sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
    const recentFinancials = financials.filter(f => new Date(f.date) >= thirtyDaysAgo && f.type === 'Expense');

    const totalRevenue = recentSales.reduce((sum, s) => sum + s.total, 0);
    const totalExpenses = recentFinancials.reduce((sum, f) => sum + f.amount, 0);

    if (totalRevenue > 0) {
      // Assume expenses in DB are mostly Fixed Costs (Overhead)
      const expenseRate = (totalExpenses / totalRevenue) * 100;
      setFixedCostRate(Math.round(expenseRate));
      alert(`Dados carregados dos últimos 30 dias:\nReceita: R$ ${totalRevenue.toFixed(2)}\nDespesas: R$ ${totalExpenses.toFixed(2)}\n\nTaxa de Custos Fixos Sugerida: ${Math.round(expenseRate)}%`);
    } else {
      alert("Sem dados de vendas suficientes nos últimos 30 dias para calcular.");
    }
  };

  // Auto-calculate price when factors change
  useEffect(() => {
    if (newProductData.cost) {
      const totalDeductions = taxRate + cardFee + fixedCostRate + desiredMargin;
      if (totalDeductions < 100) {
        const divisor = 1 - (totalDeductions / 100);
        const suggestedPrice = newProductData.cost / divisor;

        // Update both prices for now, or maybe just suggest?
        // Let's NOT auto-update the fields, but show a suggestion or have a button "Aplicar Sugestão".
        // Or better, update the fields if they are empty?
        // The user wants to EDIT.
      }
    }
  }, [newProductData.cost, taxRate, cardFee, fixedCostRate, desiredMargin]);


  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const groupProducts = getInventoryGroupProducts(products, inventoryGroup);
  const groupProductIds = new Set(groupProducts.map(product => product.id));
  const groupMovements = stockMovements.filter(movement => groupProductIds.has(movement.productId));
  const groupSales = sales.map(sale => ({ ...sale, items: sale.items.filter(item => groupProductIds.has(item.productId)) }));
  const groupLabel = inventoryGroup === 'ice' ? 'Gelo' : inventoryGroup === 'inputs' ? 'Insumos' : 'Outros produtos';
  const newProductLabel = inventoryGroup === 'ice' ? 'Novo gelo' : inventoryGroup === 'inputs' ? 'Novo insumo' : 'Novo produto';
  const defaultCategory = inventoryGroup === 'inputs' ? Category.RAW_MATERIAL : inventoryGroup === 'ice' ? Category.ICE_CUBE : Category.OTHER;
  const modalGroup = isEditing && selectedProduct ? getInventoryGroup(selectedProduct) : inventoryGroup;
  const editingInput = modalGroup === 'inputs';
  const modalCategories = [...new Set([
    ...[...Object.values(Category), 'Embalagens', ...categories.map(category => category.name)]
      .filter(category => modalGroup === 'other' || getInventoryGroup({ category } as Product) === modalGroup),
    ...(newProductData.category ? [newProductData.category] : []),
  ])];
  const filteredProducts = groupProducts.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.category.toLowerCase().includes(filter.toLowerCase())
  );

  // --- ACTIONS ---

  const handleOpenTransfer = () => {
    const product = groupProducts.find(item => item.isStockControlled !== false && !item.comboItems?.length);
    if (!product) {
      alert('Não há produtos com estoque próprio para transferir.');
      return;
    }
    setSelectedProduct(product);
    setTransferQty(0);
    setTransferFrom('Ibotirama');
    setTransferTo('Barreiras');
    setTransferReason('Transferência interna');
    setShowTransferModal(true);
  };

  const handleOpenEdit = (product: Product) => {
    setSelectedProduct(product);
    setNewProductData({
      ...product
    });
    setIsEditing(true);
    setShowNewProductModal(true);
  };

  const handleOpenLoss = (product: Product) => {
    setSelectedProduct(product);
    setLossData({
      deposit: 'Ibotirama',
      quantity: 1,
      reason: 'Quebra/Dano'
    });
    setShowLossModal(true);
  };

  const executeTransfer = async () => {
    if (!selectedProduct || transferInFlight.current) return;
    const product = products.find(item => item.id === selectedProduct.id);
    if (!product || product.isStockControlled === false || product.comboItems?.length) {
      alert('Selecione um produto com estoque próprio.');
      return;
    }
    if (!DEPOSITS.some(deposit => deposit === transferFrom) || !DEPOSITS.some(deposit => deposit === transferTo) || transferFrom === transferTo) {
      alert('Selecione depósitos diferentes para origem e destino.');
      return;
    }
    if (!Number.isFinite(transferQty) || transferQty <= 0) {
      alert('Informe uma quantidade maior que zero.');
      return;
    }
    if (transferQty > getDepositStock(product, transferFrom)) {
      alert(`Saldo insuficiente em ${transferFrom}. Informe uma quantidade dentro do saldo disponível.`);
      return;
    }
    const reason = transferReason.trim();
    if (!reason) {
      alert('Informe o motivo da transferência.');
      return;
    }
    const payload = {
      action: 'transfer' as const,
      productId: product.id,
      quantity: transferQty,
      fromDeposit: transferFrom,
      toDeposit: transferTo,
      reason
    };
    const key = JSON.stringify(payload);
    const operationId = pendingTransferOperations.current.get(key) ?? crypto.randomUUID();
    pendingTransferOperations.current.set(key, operationId);
    transferInFlight.current = true;
    setSavingTransfer(true);
    try {
      await dbStockMovements.mutate({ ...payload, operationId });
      pendingTransferOperations.current.delete(key);
      setShowTransferModal(false);
      try {
        await onStockChanged();
        alert('Transferência registrada com sucesso. Estoque atualizado.');
      } catch (error) {
        console.error('Erro ao recarregar estoque', error);
        alert('Transferência registrada. Recarregue a página para consultar o saldo atualizado.');
      }
    } catch (error: any) {
      console.error('Erro ao confirmar transferência', error);
      alert('Não foi possível confirmar a transferência: ' + (error.message || error));
    } finally {
      transferInFlight.current = false;
      setSavingTransfer(false);
    }
  };



  const executeLoss = async () => {
    if (!selectedProduct || lossInFlight.current) return;

    if (!Number.isFinite(lossData.quantity) || lossData.quantity <= 0) {
      alert("A quantidade deve ser maior que zero.");
      return;
    }

    const currentStock = getDepositStock(selectedProduct, lossData.deposit);

    if (lossData.quantity > currentStock) {
      alert(`Quantidade de perda maior que o estoque atual em ${lossData.deposit}.`);
      return;
    }

    const payload = {
      action: 'loss' as const,
      productId: selectedProduct.id,
      quantity: lossData.quantity,
      deposit: lossData.deposit,
      reason: lossData.reason
    };
    const key = JSON.stringify(payload);
    const operationId = pendingLossOperations.current.get(key) ?? crypto.randomUUID();
    pendingLossOperations.current.set(key, operationId);
    lossInFlight.current = true;
    setSavingLoss(true);
    try {
      await dbStockMovements.mutate({ ...payload, operationId });
      pendingLossOperations.current.delete(key);
      setShowLossModal(false);
      try {
        await onStockChanged();
        alert(`Perda de ${lossData.quantity} itens registrada com sucesso.`);
      } catch (error) {
        console.error('Erro ao recarregar estoque', error);
        alert('Perda registrada. Recarregue a página para consultar o saldo atualizado.');
      }
    } catch (err: any) {
      console.error('Erro ao confirmar perda', err);
      alert('Não foi possível confirmar a perda: ' + (err.message || err));
    } finally {
      lossInFlight.current = false;
      setSavingLoss(false);
    }
  };

  const executeNewProduct = async () => {
    if (productInFlight.current) return;
    if (!newProductData.name?.trim()) {
      alert('Informe o nome do produto.');
      return;
    }

    const productToSave: Product = {
      ...(isEditing && selectedProduct ? selectedProduct : {}),
      id: isEditing && selectedProduct ? selectedProduct.id : (newProductId.current ??= crypto.randomUUID()),
      name: newProductData.name,
      category: newProductData.category || 'Outros',
      priceMatriz: Number(newProductData.priceMatriz || 0),
      priceFilial: isEditing && selectedProduct ? selectedProduct.priceFilial : 0,
      cost: Number(newProductData.cost || 0),
      stockMatrizIbotirama: Number(newProductData.stockMatrizIbotirama || 0),
      stockMatrizBarreiras: Number(newProductData.stockMatrizBarreiras || 0),
      stockFilial: isEditing && selectedProduct ? selectedProduct.stockFilial : 0,
      unit: newProductData.unit || 'un',
      minStock: Number(newProductData.minStock ?? 10),
      packSize: newProductData.packSize ? Number(newProductData.packSize) : undefined,
      pricePack: newProductData.pricePack ? Number(newProductData.pricePack) : undefined,
      expirationDate: newProductData.expirationDate || undefined,
      isStockControlled: newProductData.isStockControlled !== false, // Default true

      comboItems: newProductData.comboItems && newProductData.comboItems.length > 0 ? newProductData.comboItems : undefined,
      options: newProductData.options && newProductData.options.length > 0 ? newProductData.options : undefined,
      image: newProductData.image || undefined,
      barcode: newProductData.barcode || undefined
    };

    const nonNegativeFields = [productToSave.priceMatriz, productToSave.cost,
      productToSave.minStock, productToSave.stockMatrizIbotirama, productToSave.stockMatrizBarreiras];
    if (nonNegativeFields.some(value => !Number.isFinite(value) || value < 0)) {
      alert('Preços, custos e quantidades devem ser números válidos maiores ou iguais a zero.');
      return;
    }
    if (isEditing && selectedProduct) {
      productToSave.stockMatrizIbotirama = selectedProduct.stockMatrizIbotirama;
      productToSave.stockMatrizBarreiras = selectedProduct.stockMatrizBarreiras;
      productToSave.stockFilial = selectedProduct.stockFilial;
    }

    productInFlight.current = true;
    setSavingProduct(true);
    try {
      if (isEditing) await onUpdateProduct(productToSave);
      else await onAddProduct(productToSave);
      setShowNewProductModal(false);
      newProductId.current = null;
      setNewProductData({ category: defaultCategory, unit: 'un' });
      setIsEditing(false);
      setSelectedProduct(null);
    } catch (error: any) {
      console.error('Erro ao salvar produto', error);
      alert('Não foi possível salvar o produto: ' + (error.message || error));
    } finally {
      productInFlight.current = false;
      setSavingProduct(false);
    }
  };

  const handleProductImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `product-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('images').getPublicUrl(filePath);

      setNewProductData(prev => ({ ...prev, image: data.publicUrl }));
      alert("Imagem enviada com sucesso!");
    } catch (error: any) {
      console.error("Erro no upload:", error);
      alert("Erro ao enviar imagem. Verifique se o bucket 'images' existe no Supabase.");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setStockInvoice(parseStockInvoice(await file.text()));
    } catch (failure) {
      alert((failure as { message?: string })?.message || 'Não foi possível ler a nota XML.');
    }
  };

  return (
    <>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative pb-safe">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} aria-label="Voltar à gestão" className="p-2 hover:bg-slate-200 rounded-full transition-colors touch-target">
              <ArrowLeft size={24} className="text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight sm:text-3xl">Controle de Estoque</h1>
              <p className="text-slate-500 font-medium mt-1">{inventoryGroup === 'inputs' ? 'Embalagens e matérias-primas para a produção' : inventoryGroup === 'ice' ? 'Gelo pronto por produto e depósito' : 'Cadastros fora do estoque de gelo e insumos'}</p>
            </div>
          </div>
          <div role="tablist" aria-label="Tipo de estoque" className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
            {(['ice', 'inputs', ...(products.some(product => getInventoryGroup(product) === 'other') ? ['other'] : [])] as InventoryGroup[]).map(group => (
              <button key={group} type="button" role="tab" aria-selected={inventoryGroup === group}
                onClick={() => { setInventoryGroup(group); setFilter(''); }}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${inventoryGroup === group ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}>
                {group === 'ice' ? 'Estoque de gelo' : group === 'inputs' ? 'Estoque de insumos' : 'Outros produtos'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="flex-1 sm:flex-none bg-purple-700 active-scale text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md touch-target"
            >
              <ScrollText size={18} /> <span className="text-xs">Movimentações e relatório</span>
            </button>
            <button
              onClick={handleOpenTransfer}
              className="flex-1 sm:flex-none bg-gradient-to-r from-blue-700 to-blue-600 active-scale text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md touch-target"
            >
              <ArrowRightLeft size={18} /> <span className="text-xs">Transferir</span>
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                newProductId.current = crypto.randomUUID();
                setNewProductData({ category: defaultCategory, unit: 'un' });
                setShowNewProductModal(true);
              }}
              className="flex-1 sm:flex-none bg-gradient-to-r from-orange-500 to-orange-400 active-scale text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md touch-target"
            >
              <Plus size={18} /> <span className="text-xs">{newProductLabel}</span>
            </button>
            <label className="flex-1 sm:flex-none bg-slate-800 active-scale text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md touch-target focus-within:outline focus-within:outline-2 focus-within:outline-orange-500">
              <Upload size={18} /> <span className="text-xs">Receber XML</span>
              <input type="file" accept=".xml" aria-label="Receber compra por XML" className="sr-only" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 bg-slate-50/70 sm:p-5">
            <div className="relative flex-1 max-w-2xl group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
              <input
                type="text"
                aria-label="Buscar produto por nome ou categoria"
                placeholder="Buscar produto por nome ou categoria..."
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 shadow-sm transition-all text-slate-900 font-medium"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <button
              onClick={() => filter ? setFilter('') : setShowCategoryModal(true)}
              aria-label={filter ? 'Limpar busca de produtos' : 'Filtrar produtos por categoria'}
              className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200"
              title={filter ? "Limpar Filtro" : "Filtrar por Categoria"}
            >
              {filter ? <X size={18} /> : <Filter size={18} />}
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-5 font-bold">Produto</th>
                  <th className="p-5 font-bold">Categoria</th>
                  <th className="p-5 font-bold">{inventoryGroup === 'inputs' ? 'Custo unitário' : 'Preço de venda'}</th>
                  {DEPOSITS.map(deposit => <th key={deposit} className="p-5 font-bold text-center bg-blue-50/30 border-l border-slate-200">{deposit}</th>)}
                  <th className="p-5 font-bold text-center">Status</th>
                  <th className="p-5 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const isLow = shouldRestock(product);

                  const daysToExpiry = product.expirationDate ? (new Date(product.expirationDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24) : null;
                  const isExpired = daysToExpiry !== null && daysToExpiry < 0;
                  const isExpiringSoon = daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 30;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-5">
                        <p className="font-semibold text-slate-800">{product.name}</p>
                        <span className="text-xs text-slate-400">ID: {product.id}</span>
                      </td>
                      <td className="p-5">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                          {product.category}
                        </span>
                      </td>
                      <td className="p-5 font-medium text-blue-700">{formatCurrency(inventoryGroup === 'inputs' ? product.cost : product.priceMatriz)}</td>
                      {DEPOSITS.map(deposit => (
                        <td key={deposit} className="p-5 text-center bg-blue-50/20 border-l border-slate-200 font-medium text-slate-700">
                          {product.comboItems?.length ? <span className="text-xs font-bold text-purple-600">COMBO</span> : product.isStockControlled === false ? <span aria-label="Sem controle de estoque">∞</span> : <span>{getDepositStock(product, deposit)} <span className="text-xs text-slate-500">{product.unit}</span></span>}
                        </td>
                      ))}
                      <td className="p-5 text-center">
                        <div className="flex flex-col gap-1 items-center max-w-[80px] mx-auto">
                          {isLow ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold w-full text-center">Baixo</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold w-full text-center">OK</span>
                          )}
                          {isExpired && (
                            <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold w-full text-center">Vencido</span>
                          )}
                          {isExpiringSoon && (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold w-full text-center">Vence Logo</span>
                          )}
                          {product.expirationDate && !isExpired && !isExpiringSoon && (
                            <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">{new Date(product.expirationDate).toISOString().split('T')[0].split('-').reverse().join('/')}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-5 text-right flex justify-end gap-2 items-center">
                        {product.isStockControlled !== false && !product.comboItems?.length && (
                          <button
                            onClick={() => { setSelectedProduct(product); setShowAdjustModal(true); }}
                            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1"
                            title="Ajustar inventário físico"
                          >
                            <ListPlus size={16} /> Ajustar
                          </button>
                        )}
                        <button
                          onClick={() => onOpenPricing(product.id)}
                          className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1 shadow-sm"
                          title="Definir Receita"
                        >
                          <ScrollText size={16} /> Receita
                        </button>
                        <button
                          onClick={() => handleOpenLoss(product)}
                          className="bg-orange-50 text-orange-600 hover:bg-orange-100 p-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1 shadow-sm"
                          title="Registrar Perda"
                        >
                          <AlertOctagon size={16} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(product)}
                          className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <Edit size={16} /> Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Retirar o produto "${product.name}" do cadastro ativo? Ele deixará de aparecer no estoque e nas novas operações. Vendas, movimentações e registros fiscais serão preservados.`)) {
                              onDeleteProduct(product.id);
                            }
                          }}
                          className="bg-red-50 text-red-600 hover:bg-red-100 p-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1 ml-1 shadow-sm"
                          title="Excluir Produto"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-600">
                  {filter ? 'Nenhum item encontrado neste estoque. Limpe a busca para ver os demais.' : inventoryGroup === 'inputs' ? 'Cadastre embalagens e matérias-primas em Novo insumo.' : inventoryGroup === 'ice' ? 'Cadastre o gelo fabricado em Novo gelo.' : 'Nenhum produto neste grupo.'}
                </td></tr>}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 text-center">
            Mostrando {filteredProducts.length} {inventoryGroup === 'inputs' ? 'insumos' : inventoryGroup === 'ice' ? 'produtos de gelo' : 'produtos'}
          </div>
        </div>

      </div>

      {showAdjustModal && (
        <InventoryAdjustmentModal
          products={products}
          initialProduct={selectedProduct}
          onClose={() => setShowAdjustModal(false)}
          onStockChanged={onStockChanged}
        />
      )}

      {/* --- MODAL DE TRANSFERÊNCIA --- */}
      {showTransferModal && selectedProduct && (
        <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <Truck size={20} className="text-orange-400" /> Transferência Interna
              </h3>
              <button disabled={savingTransfer} onClick={() => setShowTransferModal(false)} aria-label="Fechar transferência"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="transfer-product" className="block text-sm font-medium text-slate-700 mb-1">Produto</label>
                <select
                  id="transfer-product"
                  disabled={savingTransfer}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                  value={selectedProduct?.id}
                  onChange={(e) => setSelectedProduct(products.find(p => p.id === e.target.value) || null)}
                >
                  {groupProducts.filter(p => p.isStockControlled !== false && !p.comboItems?.length).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex-1 text-center">
                  <label htmlFor="transfer-from" className="block text-xs text-slate-500 uppercase font-bold mb-2">Origem</label>
                  <select id="transfer-from" value={transferFrom} disabled={savingTransfer} onChange={e => setTransferFrom(e.target.value as InventoryDeposit)} className="w-full border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-900">
                    {DEPOSITS.map(deposit => <option key={deposit} value={deposit}>{deposit}</option>)}
                  </select>
                  <p className="text-2xl font-bold text-blue-600">{getDepositStock(products.find(p => p.id === selectedProduct.id) ?? selectedProduct, transferFrom)} <span className="text-xs">{selectedProduct.unit}</span></p>
                </div>
                <ArrowRightLeft className="text-slate-300" />
                <div className="flex-1 text-center">
                  <label htmlFor="transfer-to" className="block text-xs text-slate-500 uppercase font-bold mb-2">Destino</label>
                  <select id="transfer-to" value={transferTo} disabled={savingTransfer} onChange={e => setTransferTo(e.target.value as InventoryDeposit)} className="w-full border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-900">
                    {DEPOSITS.map(deposit => <option key={deposit} value={deposit}>{deposit}</option>)}
                  </select>
                  <p className="text-2xl font-bold text-orange-600">{getDepositStock(products.find(p => p.id === selectedProduct.id) ?? selectedProduct, transferTo)} <span className="text-xs">{selectedProduct.unit}</span></p>
                </div>
              </div>

              <div>
                <label htmlFor="transfer-quantity" className="block text-sm font-medium text-slate-700 mb-1">Quantidade a Transferir ({selectedProduct.unit})</label>
                <input
                  id="transfer-quantity"
                  disabled={savingTransfer}
                  type="number"
                  className="w-full px-4 py-3 text-lg font-bold border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-slate-900"
                  value={transferQty}
                  onChange={(e) => setTransferQty(Number(e.target.value))}
                  min={0}
                  step="any"
                  max={getDepositStock(products.find(p => p.id === selectedProduct.id) ?? selectedProduct, transferFrom)}
                />
                <p className="text-xs text-slate-500 mt-1">Máximo disponível: {getDepositStock(products.find(p => p.id === selectedProduct.id) ?? selectedProduct, transferFrom)} {selectedProduct.unit}</p>
              </div>

              <div>
                <label htmlFor="transfer-reason" className="block text-sm font-medium text-slate-700 mb-1">Motivo</label>
                <input id="transfer-reason" type="text" value={transferReason} disabled={savingTransfer} onChange={e => setTransferReason(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-slate-900" />
              </div>

              <button
                onClick={executeTransfer}
                disabled={savingTransfer}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
              >
                {savingTransfer ? 'Transferindo...' : 'Confirmar Transferência'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DE REGISTRO DE PERDAS --- */}
      {showLossModal && selectedProduct && (
        <div className="fixed inset-0 bg-red-900/40 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <AlertOctagon size={20} /> Registrar Perda de Estoque
              </h3>
              <button disabled={savingLoss} onClick={() => setShowLossModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="mb-2">
                <p className="font-bold text-lg text-slate-800">{selectedProduct.name}</p>
                <p className="text-sm text-slate-500">O estoque será deduzido automaticamente.</p>
              </div>

              <div>
                <label htmlFor="loss-deposit" className="block text-sm font-bold text-slate-700 mb-1">Depósito da Perda</label>
                <select
                  id="loss-deposit"
                  value={lossData.deposit}
                  disabled={savingLoss}
                  onChange={e => setLossData({ ...lossData, deposit: e.target.value as InventoryDeposit })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg bg-white text-slate-900"
                >
                  {DEPOSITS.map(deposit => <option key={deposit} value={deposit}>{deposit}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    value={lossData.quantity}
                    onChange={(e) => setLossData({ ...lossData, quantity: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg font-bold text-lg text-slate-900 focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Motivo</label>
                  <select
                    value={lossData.reason}
                    onChange={(e) => setLossData({ ...lossData, reason: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-red-500 outline-none"
                  >
                    <option>Quebra/Dano</option>
                    <option>Derretimento</option>
                    <option>Validade/Vencido</option>
                    <option>Roubo/Furto</option>
                    <option>Consumo Interno</option>
                    <option>Ajuste de Inventário</option>
                    <option>Outros</option>
                  </select>
                </div>
              </div>

              <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-xs text-red-800">
                <strong>Atenção:</strong> Esta ação reduzirá o estoque atual de
                <strong className="ml-1">
                  {getDepositStock(selectedProduct, lossData.deposit)}
                </strong> para
                <strong className="ml-1">
                  {getDepositStock(selectedProduct, lossData.deposit) - lossData.quantity}
                </strong>.
              </div>

              <button
                onClick={executeLoss}
                disabled={savingLoss}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
              >
                {savingLoss ? 'Registrando...' : 'Confirmar Perda'}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* --- MODAL NOVO PRODUTO --- */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ">
            <div className="p-4 bg-orange-500 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                {isEditing ? <Edit size={20} /> : <Plus size={20} />}
                {isEditing ? 'Editar Produto' : newProductLabel}
              </h3>
              <button disabled={savingProduct} onClick={() => setShowNewProductModal(false)}><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Checkbox for Stock Control */}
              <div className="flex items-center gap-2 bg-purple-50 p-3 rounded-lg border border-purple-100">
                <input
                  type="checkbox"
                  id="stockControl"
                  className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                  checked={newProductData.isStockControlled === false}
                  onChange={(e) => setNewProductData({ ...newProductData, isStockControlled: !e.target.checked })}
                />
                <label htmlFor="stockControl" className="text-sm font-bold text-purple-800 cursor-pointer">
                  Produto feito na hora (Não controlar estoque)
                </label>
                <p className="text-xs text-purple-600 ml-2">Item sem controle de quantidade</p>
              </div>

              {/* Product Type Selector (Simple vs Combo) */}
              <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setNewProductData({ ...newProductData, comboItems: undefined })}
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!newProductData.comboItems ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Produto Simples
                </button>
                <button
                  onClick={() => setNewProductData({ ...newProductData, comboItems: [] })}
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${newProductData.comboItems ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Combo Promocional
                </button>
              </div>

              {/* --- COMMON FIELDS --- */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Produto</label>
                  <input type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                    value={newProductData.name || ''} onChange={e => setNewProductData({ ...newProductData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cód. Barras (Opcional)</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Leitor ou número..." className="w-full flex-1 px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={newProductData.barcode || ''} onChange={e => setNewProductData({ ...newProductData, barcode: e.target.value })}
                    />
                    <button
                      onClick={startCamera}
                      className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-bold flex items-center gap-1 shrink-0 transition-colors"
                      title="Escanear com a câmera"
                    >
                      <Camera size={20} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vencimento (Opc.)</label>
                  <input type="date" className="w-full px-2 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                    value={newProductData.expirationDate || ''} onChange={e => setNewProductData({ ...newProductData, expirationDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                  <select className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                    value={newProductData.category} onChange={e => setNewProductData({ ...newProductData, category: e.target.value })}
                  >
                    {modalCategories.map(category => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unidade</label>
                  <select className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                    value={newProductData.unit} onChange={e => setNewProductData({ ...newProductData, unit: e.target.value })}
                  >
                    <option value="un">Unidade</option>
                    <option value="kg">Quilo (kg)</option>
                    <option value="sc">Saco (sc)</option>
                    <option value="lt">Litro (l)</option>
                    <option value="gf">Garrafa (gf)</option>
                    <option value="lt">Lata (lt)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Imagem do Produto (Opcional)</label>
                <div className="flex gap-2">
                  <input type="text" className="flex-1 px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={newProductData.image || ''} onChange={e => setNewProductData({ ...newProductData, image: e.target.value })}
                  />
                  <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 p-2 rounded-lg border border-slate-200 transition-colors flex items-center justify-center" title="Upload de Imagem">
                    <Upload size={20} className="text-slate-600" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleProductImageUpload} />
                  </label>
                </div>
                {newProductData.image && (
                  <div className="mt-2 h-24 w-24 rounded-lg bg-slate-100 overflow-hidden border border-slate-200">
                    <img src={newProductData.image} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
              </div>

              {newProductData.comboItems ? (
                // --- COMBO BUILDER ---
                <div className="space-y-4 bg-purple-50 p-4 rounded-xl border border-purple-100">
                  <h4 className="font-bold text-purple-800 flex items-center gap-2">
                    <Plus size={16} /> Composição do Combo
                  </h4>
                  <p className="text-xs text-purple-600">Adicione os produtos que compõem este combo. O estoque será descontado individualmente de cada item.</p>

                  <div className="space-y-2">
                    {newProductData.comboItems.map((item, index) => {
                      const prod = products.find(p => p.id === item.productId);
                      return (
                        <div key={index} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-purple-100">
                          <span className="flex-1 font-medium text-sm text-slate-700">{prod?.name || 'Produto Removido'}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Qtd:</span>
                            <input
                              type="number"
                              min="1"
                              className="w-16 px-2 py-1 border border-slate-200 rounded text-center font-bold"
                              value={item.quantity}
                              onChange={(e) => {
                                const newItems = [...(newProductData.comboItems || [])];
                                newItems[index].quantity = Number(e.target.value);
                                setNewProductData({ ...newProductData, comboItems: newItems });
                              }}
                            />
                          </div>
                          <button
                            onClick={() => {
                              const newItems = newProductData.comboItems?.filter((_, i) => i !== index);
                              setNewProductData({ ...newProductData, comboItems: newItems });
                            }}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <select
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      id="combo-product-select"
                    >
                      <option value="">Selecione um produto...</option>
                      {products.filter(p => !p.comboItems).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const select = document.getElementById('combo-product-select') as HTMLSelectElement;
                        const pid = select.value;
                        if (!pid) return;
                        const exists = newProductData.comboItems?.find(i => i.productId === pid);
                        if (exists) {
                          alert("Produto já adicionado ao combo.");
                          return;
                        }
                        setNewProductData({
                          ...newProductData,
                          comboItems: [...(newProductData.comboItems || []), { productId: pid, quantity: 1 }]
                        });
                        select.value = "";
                      }}
                      className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-purple-700"
                    >
                    </button>
                  </div>

                  {/* --- COMBO PRICING CALCULATOR --- */}
                  <div className="bg-white p-3 rounded-lg border border-purple-200 mt-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-600">Soma dos preços de venda:</span>
                      <span className="text-lg font-bold text-slate-800">
                        {formatCurrency(newProductData.comboItems.reduce((acc, item) => {
                          const p = products.find(prod => prod.id === item.productId);
                          return acc + ((p?.priceMatriz || 0) * item.quantity);
                        }, 0))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-600">Custo Total (CMV):</span>
                      <span className="text-sm font-bold text-slate-500">
                        {formatCurrency(newProductData.comboItems.reduce((acc, item) => {
                          const p = products.find(prod => prod.id === item.productId);
                          return acc + ((p?.cost || 0) * item.quantity);
                        }, 0))}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      <label className="text-sm font-bold text-red-500">Desconto do Combo:</label>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                        <input
                          type="number"
                          className="w-full pl-9 pr-4 py-2 border border-red-200 rounded-lg text-red-600 font-bold"
                          placeholder="0.00"
                          onChange={(e) => {
                            const discount = Number(e.target.value);
                            const basePrice = newProductData.comboItems?.reduce((acc, item) => {
                              const p = products.find(prod => prod.id === item.productId);
                              return acc + ((p?.priceMatriz || 0) * item.quantity);
                            }, 0) || 0;

                            const totalCost = newProductData.comboItems?.reduce((acc, item) => {
                              const p = products.find(prod => prod.id === item.productId);
                              return acc + ((p?.cost || 0) * item.quantity);
                            }, 0) || 0;

                            setNewProductData(prev => ({
                              ...prev,
                              priceMatriz: Math.max(0, basePrice - discount),
                              cost: totalCost // Auto-update cost based on components
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{isEditing ? 'MAT. IBOTIRAMA' : 'INICIAL IBOTIRAMA'}</label>
                    <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold text-blue-700"
                      readOnly={isEditing} min={0} value={newProductData.stockMatrizIbotirama || 0} onChange={e => setNewProductData({ ...newProductData, stockMatrizIbotirama: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{isEditing ? 'MAT. BARREIRAS' : 'INICIAL BARREIRAS'}</label>
                    <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold text-blue-700"
                      readOnly={isEditing} min={0} value={newProductData.stockMatrizBarreiras || 0} onChange={e => setNewProductData({ ...newProductData, stockMatrizBarreiras: Number(e.target.value) })}
                    />
                  </div>

                </div>
              )}

              {/* --- PRICING (COMMON) --- */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2">
                    <Calculator size={16} className="text-blue-600" /> {editingInput ? 'Custo do insumo' : 'Precificação'}
                  </h4>
                  <button
                    hidden={editingInput} onClick={calculateFinancialMetrics}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors font-medium"
                    title="Basear em despesas lançadas (últimos 30 dias)"
                  >
                    Carregar Dados Financeiros
                  </button>
                </div>

                {/* Custo Base */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">{editingInput ? 'Custo por unidade do insumo' : 'Custo do Produto (CMV)'}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                    <input type="number" className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newProductData.cost || ''} onChange={e => setNewProductData({ ...newProductData, cost: Number(e.target.value) })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {!editingInput && <>
                {/* Calculadora de Taxas */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 mb-1">Impostos + Taxas (%)</label>
                    <div className="flex gap-2">
                      <input type="number" className="w-full px-2 py-1 border border-slate-200 rounded"
                        value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} title="Impostos" placeholder="Imp." />
                      <input type="number" className="w-full px-2 py-1 border border-slate-200 rounded"
                        value={cardFee} onChange={e => setCardFee(Number(e.target.value))} title="Taxas Cartão" placeholder="Cartão" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Custos Fixos + Margem (%)</label>
                    <div className="flex gap-2">
                      <input type="number" className="w-full px-2 py-1 border border-slate-200 rounded text-purple-700 font-medium"
                        value={fixedCostRate} onChange={e => setFixedCostRate(Number(e.target.value))} title="Custos Fixos (Rateio)" placeholder="Fixo" />
                      <input type="number" className="w-full px-2 py-1 border border-slate-200 rounded text-emerald-700 font-bold"
                        value={desiredMargin} onChange={e => setDesiredMargin(Number(e.target.value))} title="Margem de Lucro" placeholder="Lucro" />
                    </div>
                  </div>
                </div>

                {/* Sugestão de Preço */}
                {(newProductData.cost || 0) > 0 && (
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-blue-800 font-medium">Preço de venda sugerido:</span>
                      <span className="text-lg font-bold text-blue-900">
                        {formatCurrency((newProductData.cost || 0) / (1 - ((taxRate + cardFee + fixedCostRate + desiredMargin) / 100)))}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden flex">
                      <div className="bg-slate-400 h-full" style={{ width: `${((newProductData.cost || 0) / ((newProductData.cost || 0) / (1 - ((taxRate + cardFee + fixedCostRate + desiredMargin) / 100)))) * 100}%` }} title="Custo"></div>
                      <div className="bg-red-400 h-full" style={{ width: `${taxRate + cardFee}%` }} title="Impostos/Taxas"></div>
                      <div className="bg-purple-400 h-full" style={{ width: `${fixedCostRate}%` }} title="Custos Fixos"></div>
                      <div className="bg-emerald-500 h-full flex-1" title="Lucro"></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
                      <span>Custo</span>
                      <span>Var.</span>
                      <span>Fixo</span>
                      <span>Lucro</span>
                    </div>
                  </div>
                )}

                {/* Preços Finais */}
                <div className="grid grid-cols-1 gap-4 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Preço de venda</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                      <input type="number" className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-bold"
                        value={newProductData.priceMatriz || ''} onChange={e => setNewProductData({ ...newProductData, priceMatriz: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                {/* Configuração de Fardo (Opcional) */}
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Venda em Fardo (Opcional)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Qtd. no Fardo</label>
                      <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                        placeholder="Ex: 12"
                        value={newProductData.packSize || ''} onChange={e => setNewProductData({ ...newProductData, packSize: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Preço do Fardo</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                        <input type="number" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold"
                          placeholder="0.00"
                          value={newProductData.pricePack || ''} onChange={e => setNewProductData({ ...newProductData, pricePack: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                </>}
              </div>

              {/* --- CUSTOMIZATION OPTIONS (OPCIONAL) --- */}
              <div className="space-y-4 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                <h4 className="font-bold text-yellow-800 flex items-center gap-2">
                  <ListPlus size={16} /> Personalização (Adicionais)
                </h4>

                <div className="space-y-4">
                  {(newProductData.options || []).map((option, optIdx) => (
                    <div key={optIdx} className="bg-white p-3 rounded-lg border border-yellow-200 shadow-sm relative group">
                      <button
                        onClick={() => {
                          const newOptions = (newProductData.options || []).filter((_, i) => i !== optIdx);
                          setNewProductData({ ...newProductData, options: newOptions });
                        }}
                        className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1 bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                        title="Remover Grupo"
                      >
                        <Trash2 size={14} />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 pr-8">
                        <input
                          type="text"
                          placeholder="Nome do Grupo (ex: Adicionar Fruta)"
                          className="px-3 py-2 border border-slate-200 rounded text-sm font-bold text-slate-800 w-full"
                          value={option.name}
                          onChange={e => {
                            const newOpts = [...(newProductData.options || [])];
                            newOpts[optIdx].name = e.target.value;
                            setNewProductData({ ...newProductData, options: newOpts });
                          }}
                        />
                        <div className="flex bg-slate-100 rounded p-1">
                          <button
                            onClick={() => {
                              const newOpts = [...(newProductData.options || [])];
                              newOpts[optIdx].type = 'radio';
                              setNewProductData({ ...newProductData, options: newOpts });
                            }}
                            className={`flex-1 text-xs font-bold rounded py-1 transition-all ${option.type === 'radio' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                          >
                            1 Escolha (Radio)
                          </button>
                          <button
                            onClick={() => {
                              const newOpts = [...(newProductData.options || [])];
                              newOpts[optIdx].type = 'checkbox';
                              setNewProductData({ ...newProductData, options: newOpts });
                            }}
                            className={`flex-1 text-xs font-bold rounded py-1 transition-all ${option.type === 'checkbox' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                          >
                            Múltiplas (Check)
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">Obrigatório?</span>
                        <input
                          type="checkbox"
                          checked={option.required || false}
                          onChange={e => {
                            const newOpts = [...(newProductData.options || [])];
                            newOpts[optIdx].required = e.target.checked;
                            setNewProductData({ ...newProductData, options: newOpts });
                          }}
                          className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                        />
                      </div>

                      <div className="space-y-2 pl-3 border-l-2 border-slate-100">
                        {option.choices.map((choice, choiceIdx) => (
                          <div key={choiceIdx} className="flex gap-2 items-center">
                            <input
                              type="text"
                              placeholder="Opção (ex: Morango)"
                              className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs sm:text-sm"
                              value={choice.name}
                              onChange={e => {
                                const newOpts = [...(newProductData.options || [])];
                                newOpts[optIdx].choices[choiceIdx].name = e.target.value;
                                setNewProductData({ ...newProductData, options: newOpts });
                              }}
                            />
                            <div className="relative w-20 sm:w-24">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">+</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                className="w-full pl-6 pr-2 py-1 border border-slate-200 rounded text-xs sm:text-sm font-medium text-slate-800"
                                value={choice.priceChange || ''}
                                onChange={e => {
                                  const newOpts = [...(newProductData.options || [])];
                                  newOpts[optIdx].choices[choiceIdx].priceChange = Number(e.target.value);
                                  setNewProductData({ ...newProductData, options: newOpts });
                                }}
                              />
                            </div>
                            <button
                              onClick={() => {
                                const newOpts = [...(newProductData.options || [])];
                                newOpts[optIdx].choices = newOpts[optIdx].choices.filter((_, i) => i !== choiceIdx);
                                setNewProductData({ ...newProductData, options: newOpts });
                              }}
                              className="text-red-300 hover:text-red-500 p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const newOpts = [...(newProductData.options || [])];
                            newOpts[optIdx].choices.push({ name: '', priceChange: 0 });
                            setNewProductData({ ...newProductData, options: newOpts });
                          }}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-2 bg-blue-50 px-2 py-1.5 rounded self-start"
                        >
                          <Plus size={12} /> Add Opção
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => {
                      setNewProductData({
                        ...newProductData,
                        options: [...(newProductData.options || []), { name: '', type: 'radio', choices: [{ name: 'Padrão', priceChange: 0 }] }]
                      });
                    }}
                    className="w-full py-3 border-2 border-dashed border-yellow-400 rounded-xl text-yellow-700 font-bold text-sm hover:bg-yellow-100 transition-colors flex justify-center items-center gap-2"
                  >
                    <Plus size={16} /> Adicionar Grupo de Opções
                  </button>
                </div>
              </div>

              <button
                onClick={executeNewProduct}
                disabled={savingProduct}
                className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20"
              >
                {isEditing ? 'Salvar Alterações' : 'Salvar Produto'}
              </button>
            </div>
          </div >
        </div >
      )
      }
      {stockInvoice && (
        <InventoryXmlReceiptModal
          invoice={stockInvoice}
          products={products}
          onStockChanged={onStockChanged}
          onClose={() => setStockInvoice(null)}
        />
      )}

      {/* --- MODAL DE RELATÓRIOS --- */}
      {
        showReportModal && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-4 bg-purple-800 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  <BarChart3 size={20} className="text-purple-300" /> Relatório de estoque · {groupLabel}
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Mês do relatório"
                    value={reportMonth}
                    onChange={e => setReportMonth(e.target.value)}
                    className="bg-purple-700 text-white rounded-lg px-3 py-1.5 text-sm font-bold border border-purple-600 outline-none hover:bg-purple-600 focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
                  >
                    <option value="01">Janeiro</option>
                    <option value="02">Fevereiro</option>
                    <option value="03">Março</option>
                    <option value="04">Abril</option>
                    <option value="05">Maio</option>
                    <option value="06">Junho</option>
                    <option value="07">Julho</option>
                    <option value="08">Agosto</option>
                    <option value="09">Setembro</option>
                    <option value="10">Outubro</option>
                    <option value="11">Novembro</option>
                    <option value="12">Dezembro</option>
                    <option value="ALL">Todos os Meses</option>
                  </select>
                  <select
                    aria-label="Ano do relatório"
                    value={reportYear}
                    onChange={e => setReportYear(e.target.value)}
                    className="bg-purple-700 text-white rounded-lg px-3 py-1.5 text-sm font-bold border border-purple-600 outline-none hover:bg-purple-600 focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
                  >
                    {[...new Set([new Date().getFullYear().toString(), ...stockMovements.map(movement => getMovementLocalDate(movement.date)?.slice(0, 4)).filter((year): year is string => !!year), ...sales.map(sale => getSaleDispatchDate(sale)?.slice(0, 4)).filter((year): year is string => !!year)])].sort().reverse().map(year => <option key={year} value={year}>{year}</option>)}
                    <option value="ALL">Todos os Anos</option>
                  </select>
                  <button aria-label="Fechar relatório" onClick={() => setShowReportModal(false)} className="ml-2 p-1 hover:bg-purple-700 rounded-lg transition-colors"><X size={20} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 bg-slate-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  {/* Card 1: Valor em Estoque */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Valor Total em Estoque (Custo)</h4>
                    <div className="text-3xl font-bold text-slate-800">
                      {formatCurrency(groupProducts.reduce((acc, p) => acc + getStockCost(p), 0))}
                    </div>
                    <div className="mt-2 text-xs text-slate-400 space-y-1">
                      {DEPOSITS.map(deposit => (
                        <div key={deposit} className="flex justify-between gap-2">
                          <span>{deposit}</span>
                          <span>{formatCurrency(groupProducts.reduce((acc, p) => acc + getStockCost(p, deposit), 0))}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {inventoryGroup !== 'inputs' && <>
                  {/* Card 2: Valor de Venda Potencial */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Potencial de Venda (Estimado)</h4>
                    <div className="text-3xl font-bold text-emerald-600">
                      {formatCurrency(groupProducts.reduce((acc, p) => acc + getSalePotential(p), 0))}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Baseado no preço de venda e nos depósitos da fábrica.</p>
                  </div>

                  </>}
                  {/* Card 3: Itens Abaixo do Mínimo */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Alertas de Estoque</h4>
                    <div className="text-3xl font-bold text-red-600">
                      {groupProducts.filter(p => shouldRestock(p)).length}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Produtos precisando de reposição.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {inventoryGroup !== 'inputs' && <>
                  {/* Tabela: Mais Vendidos (ABC) */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                      <h4 className="font-bold text-slate-700 flex items-center gap-2">
                        <TrendingUp size={18} className="text-blue-500" /> Produtos Expedidos (Top 10)
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">Valor comercial dos itens expedidos, antes de frete e descontos; os recebimentos são consultados no financeiro.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="p-3 font-semibold">Produto</th>
                            <th className="p-3 font-semibold text-right">Qtd. Expedida</th>
                            <th className="p-3 font-semibold text-right">Valor dos itens expedidos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {getDispatchedProductRanking(groupSales, reportMonth, reportYear).map(item => (
                                <tr key={item.productId} className="hover:bg-slate-50">
                                  <td className="p-3 font-medium text-slate-700">{item.name}</td>
                                  <td className="p-3 text-right font-bold text-blue-600">{item.qty}</td>
                                  <td className="p-3 text-right text-emerald-600">{formatCurrency(item.value)}</td>
                                </tr>
                              ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  </>}
                  {/* Tabela: Sugestão de Reposição */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                      <h4 className="font-bold text-slate-700 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-orange-500" /> Sugestão de Reposição
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="p-3 font-semibold">Produto</th>
                            {DEPOSITS.map(deposit => <th key={deposit} className="p-3 font-semibold text-center">{deposit}</th>)}
                            <th className="p-3 font-semibold text-center">Mínimo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {groupProducts
                            .filter(p => shouldRestock(p))
                            .map((p) => (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-700">{p.name}</td>
                                {DEPOSITS.map(deposit => (
                                  <td key={deposit} className={`p-3 text-center font-bold ${shouldRestock(p, deposit) ? 'text-red-600' : 'text-slate-600'}`}>
                                    {getDepositStock(p, deposit)}
                                  </td>
                                ))}
                                <td className="p-3 text-center text-slate-400">{p.minStock}</td>
                              </tr>
                            ))}
                          {groupProducts.filter(p => shouldRestock(p)).length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-6 text-center text-slate-400">
                                Nenhum produto com estoque baixo.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <StockMovementReport movements={groupMovements} loading={loadingMovements} error={movementsError} month={reportMonth} year={reportYear} />
              </div>
            </div>
          </div>
        )
      }
      {/* --- MODAL GERENCIAR CATEGORIAS --- */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <Filter size={20} className="text-orange-400" /> Filtrar / Gerenciar Categorias
              </h3>
              <button onClick={() => setShowCategoryModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nova Categoria..."
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <button
                  onClick={handleAddCategory}
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="max-h-[300px] overflow-y-auto border border-slate-100 rounded-lg">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    <tr
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => { setFilter(''); setShowCategoryModal(false); }}
                    >
                      <td className="p-3 text-slate-700 font-bold">Mostrar Todos</td>
                      <td className="p-3 text-right"></td>
                    </tr>
                    {categories.filter(category => getInventoryGroup({ category: category.name } as Product) === inventoryGroup).map((cat) => (
                      <tr key={cat.id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => { setFilter(cat.name); setShowCategoryModal(false); }}>
                        <td className="p-3 text-slate-700 font-medium">{cat.name}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                            className="text-slate-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CAMERA SCANNER MODAL --- */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex flex-col items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <Camera size={20} className="text-blue-400" /> Escanear Código
              </h3>
              <button onClick={stopCamera} className="text-slate-300 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 flex flex-col items-center justify-center bg-black relative">
              <video
                ref={videoRef}
                className="w-full rounded-lg"
                style={{ maxHeight: '60vh', objectFit: 'cover' }}
              ></video>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-32 border-2 border-red-500 rounded-lg opacity-50"></div>
              </div>
            </div>
            <div className="p-4 text-center text-sm font-medium text-slate-500">
              Aponte a câmera para o código de barras
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default Inventory;
