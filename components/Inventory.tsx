import React, { useState, useEffect } from 'react';
import { Product, Branch, Category, Sale, FinancialRecord, StockMovement, CategoryItem, User } from '../types';
import { Search, Plus, ArrowRightLeft, Filter, Save, X, Truck, AlertTriangle, Upload, FileText, ArrowLeft, AlertOctagon, Edit, Calculator, DollarSign, TrendingUp, Trash2, PieChart, BarChart3, ListPlus, ScrollText, Camera } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { dbStockMovements, dbCategories } from '../services/db';
import { getTodayDate, getCurrentDateTime } from '../services/utils';
import { supabase } from '../services/supabase';

interface InventoryProps {
  products: Product[];
  sales: Sale[];
  financials: FinancialRecord[];
  onUpdateProduct: (product: Product) => void;
  onAddProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onOpenPricing: (productId: string) => void;
  onAddFinancialRecord: (records: FinancialRecord[]) => void;
  onBack: () => void;
  currentUser: User;
}

const Inventory: React.FC<InventoryProps> = ({ products, sales, financials, onUpdateProduct, onAddProduct, onDeleteProduct, onOpenPricing, onAddFinancialRecord, onBack, currentUser }) => {
  const [filter, setFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState<'GERAL' | Branch.MATRIZ | Branch.FILIAL>('GERAL');

  // Modal States
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [importedProducts, setImportedProducts] = useState<Partial<Product>[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form States
  const [transferQty, setTransferQty] = useState(0);

  const [isEditing, setIsEditing] = useState(false);

  // Loss Registration State
  const [showLossModal, setShowLossModal] = useState(false);
  const [lossData, setLossData] = useState({
    branch: Branch.FILIAL,
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

  const filterByReportDate = (dateString: string) => {
    if (!dateString) return false;
    if (reportYear === 'ALL' && reportMonth === 'ALL') return true;

    // Attempt parsing ISO string or simple YYYY-MM-DD
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const y = d.getFullYear().toString();
      if (reportYear !== 'ALL' && reportYear !== y) return false;
      if (reportMonth !== 'ALL' && reportMonth !== m) return false;
      return true;
    }
    // Fallback comparison for YYYY-MM-DD strings directly
    const parts = dateString.split('T')[0].split('-');
    if (parts.length >= 3) {
      if (reportYear !== 'ALL' && reportYear !== parts[0]) return false;
      if (reportMonth !== 'ALL' && reportMonth !== parts[1]) return false;
    }
    return true;
  };


  useEffect(() => {
    if (showReportModal) {
      setLoadingMovements(true);
      dbStockMovements.getAll(currentUser.tenantId)
        .then(data => setStockMovements(data))
        .catch(err => console.error("Erro ao carregar movimentos", err))
        .finally(() => setLoadingMovements(false));
    }
  }, [showReportModal]);

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

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.category.toLowerCase().includes(filter.toLowerCase())
  );

  // --- ACTIONS ---

  const handleOpenTransfer = () => {
    if (products.length > 0) {
      setSelectedProduct(products[0]);
      setTransferQty(10);
      setShowTransferModal(true);
    }
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
      branch: Branch.FILIAL,
      quantity: 1,
      reason: 'Quebra/Dano'
    });
    setShowLossModal(true);
  };

  const executeTransfer = () => {
    if (!selectedProduct) return;

    // Simple validation
    const safeQty = Math.min(selectedProduct.stockMatrizIbotirama, transferQty);

    const updatedProduct = {
      ...selectedProduct,
      stockMatrizIbotirama: selectedProduct.stockMatrizIbotirama - safeQty,
      stockFilial: selectedProduct.stockFilial + safeQty
    };

    onUpdateProduct(updatedProduct);
    setShowTransferModal(false);
  };



  const executeLoss = () => {
    if (!selectedProduct) return;

    if (lossData.quantity <= 0) {
      alert("A quantidade deve ser maior que zero.");
      return;
    }

    const currentStock = lossData.branch === Branch.MATRIZ ? selectedProduct.stockMatrizIbotirama : selectedProduct.stockFilial;

    if (lossData.quantity > currentStock) {
      alert(`Quantidade de perda maior que o estoque atual na ${lossData.branch}.`);
      return;
    }

    const updatedProduct = {
      ...selectedProduct,
      stockMatrizIbotirama: lossData.branch === Branch.MATRIZ ? selectedProduct.stockMatrizIbotirama - lossData.quantity : selectedProduct.stockMatrizIbotirama,
      stockFilial: lossData.branch === Branch.FILIAL ? selectedProduct.stockFilial - lossData.quantity : selectedProduct.stockFilial
    };

    onUpdateProduct(updatedProduct);

    // Record Loss in DB
    try {
      dbStockMovements.add({
        id: `sm-${Date.now()}`,
        date: getTodayDate(),
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: lossData.quantity,
        type: 'LOSS',
        reason: lossData.reason,
        branch: lossData.branch
      }, currentUser.tenantId);

      // Create Financial Record for the Loss
      const lossValue = selectedProduct.cost * lossData.quantity;
      if (lossValue > 0) {
        const lossRecord: FinancialRecord = {
          id: `f-${Date.now()}`,
          date: getTodayDate(),
          description: `Perda de Estoque: ${selectedProduct.name} (${lossData.reason})`,
          amount: lossValue,
          type: 'Expense',
          category: 'Perdas e Quebras',
          branch: lossData.branch
        };
        onAddFinancialRecord([lossRecord]);
      }

    } catch (err: any) {
      console.error("Erro ao salvar perda no histórico", err);
      alert("Erro ao salvar histórico de perda: " + (err.message || err));
    }

    setShowLossModal(false);
    alert(`Perda de ${lossData.quantity} itens registrada com sucesso.`);
  };

  const executeNewProduct = () => {
    if (!newProductData.name || newProductData.priceFilial === undefined) {
      alert("Nome e Preço de Venda (Filial) são obrigatórios. Se for insumo, coloque 0.");
      return;
    }

    const productToSave: Product = {
      id: isEditing && selectedProduct ? selectedProduct.id : Date.now().toString(),
      name: newProductData.name,
      category: newProductData.category || 'Outros',
      priceMatriz: Number(newProductData.priceMatriz || 0),
      priceFilial: Number(newProductData.priceFilial),
      cost: Number(newProductData.cost || 0),
      stockMatrizIbotirama: Number(newProductData.stockMatrizIbotirama || 0),
      stockMatrizBarreiras: Number(newProductData.stockMatrizBarreiras || 0),
      stockFilial: Number(newProductData.stockFilial || 0),
      unit: newProductData.unit || 'un',
      minStock: Number(newProductData.minStock || 10),
      packSize: newProductData.packSize ? Number(newProductData.packSize) : undefined,
      pricePack: newProductData.pricePack ? Number(newProductData.pricePack) : undefined,
      isStockControlled: newProductData.isStockControlled !== false, // Default true

      comboItems: newProductData.comboItems && newProductData.comboItems.length > 0 ? newProductData.comboItems : undefined,
      options: newProductData.options && newProductData.options.length > 0 ? newProductData.options : undefined,
      image: newProductData.image || null,
      barcode: newProductData.barcode || undefined
    };

    if (isEditing) {
      // Check for stock additions before updating
      if (selectedProduct) {
        const diffIbotirama = productToSave.stockMatrizIbotirama - selectedProduct.stockMatrizIbotirama;
        if (diffIbotirama > 0) {
          dbStockMovements.add({ id: `sm-${Date.now()}-ibo`, date: getCurrentDateTime(), productId: productToSave.id, productName: productToSave.name, quantity: diffIbotirama, type: 'ENTRY', reason: 'Edição Manual', branch: Branch.MATRIZ, matrizDeposit: 'Ibotirama' }, currentUser.tenantId);
        }
        const diffBarreiras = productToSave.stockMatrizBarreiras - selectedProduct.stockMatrizBarreiras;
        if (diffBarreiras > 0) {
          dbStockMovements.add({ id: `sm-${Date.now()}-bar`, date: getCurrentDateTime(), productId: productToSave.id, productName: productToSave.name, quantity: diffBarreiras, type: 'ENTRY', reason: 'Edição Manual', branch: Branch.MATRIZ, matrizDeposit: 'Barreiras' }, currentUser.tenantId);
        }
        const diffFilial = productToSave.stockFilial - selectedProduct.stockFilial;
        if (diffFilial > 0) {
          dbStockMovements.add({ id: `sm-${Date.now()}-fil`, date: getCurrentDateTime(), productId: productToSave.id, productName: productToSave.name, quantity: diffFilial, type: 'ENTRY', reason: 'Edição Manual', branch: Branch.FILIAL }, currentUser.tenantId);
        }
      }
      onUpdateProduct(productToSave);
    } else {
      onAddProduct(productToSave);
      // Log initial stock creation as ENTRY
      if (productToSave.stockMatrizIbotirama > 0) dbStockMovements.add({ id: `entry-${Date.now()}-ibo`, date: getCurrentDateTime(), productId: productToSave.id, productName: productToSave.name, quantity: productToSave.stockMatrizIbotirama, type: 'ENTRY', reason: 'Cadastro Inicial', branch: Branch.MATRIZ, matrizDeposit: 'Ibotirama' }, currentUser.tenantId);
      if (productToSave.stockMatrizBarreiras > 0) dbStockMovements.add({ id: `entry-${Date.now()}-bar`, date: getCurrentDateTime(), productId: productToSave.id, productName: productToSave.name, quantity: productToSave.stockMatrizBarreiras, type: 'ENTRY', reason: 'Cadastro Inicial', branch: Branch.MATRIZ, matrizDeposit: 'Barreiras' }, currentUser.tenantId);
      if (productToSave.stockFilial > 0) dbStockMovements.add({ id: `entry-${Date.now()}-fil`, date: getCurrentDateTime(), productId: productToSave.id, productName: productToSave.name, quantity: productToSave.stockFilial, type: 'ENTRY', reason: 'Cadastro Inicial', branch: Branch.FILIAL }, currentUser.tenantId);
    }

    setShowNewProductModal(false);
    setNewProductData({ category: 'Gelo Cubo', unit: 'un' });
    setIsEditing(false);
    setSelectedProduct(null);
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

  // --- XML IMPORT FUNCTIONS ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseNFeXML(text);
    };
    reader.readAsText(file);
  };

  const parseNFeXML = (xmlText: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const detNodes = xmlDoc.getElementsByTagName("det");

      const newItems: Partial<Product>[] = [];

      for (let i = 0; i < detNodes.length; i++) {
        const prod = detNodes[i].getElementsByTagName("prod")[0];
        if (prod) {
          const name = prod.getElementsByTagName("xProd")[0]?.textContent || "Produto Sem Nome";
          const code = prod.getElementsByTagName("cProd")[0]?.textContent || Date.now().toString();
          const unit = prod.getElementsByTagName("uCom")[0]?.textContent || "un";
          const qty = parseFloat(prod.getElementsByTagName("qCom")[0]?.textContent || "0");
          const cost = parseFloat(prod.getElementsByTagName("vUnCom")[0]?.textContent || "0");

          newItems.push({
            id: code, // Use NFe code as ID initially
            name: name,
            category: 'Outros', // Default category
            priceMatriz: cost * 1.5, // Suggested Markup
            priceFilial: cost * 2.0, // Suggested Markup
            cost: cost,
            stockMatrizIbotirama: 0,
            stockFilial: qty, // Entry goes to Filial (Resale point)
            unit: unit.toLowerCase(),
            minStock: 10
          });
        }
      }

      if (newItems.length > 0) {
        setImportedProducts(newItems);
        setShowImportModal(true);
      } else {
        alert("Nenhum produto encontrado neste XML.");
      }
    } catch (error) {
      console.error("Erro ao ler XML", error);
      alert("Erro ao processar o arquivo XML. Verifique se é uma NFe válida.");
    }
  };

  const confirmImport = () => {
    importedProducts.forEach(p => {
      // Check if product already exists (by name or ID) to update stock instead?
      // For now, we assume simple bulk creation.
      const newProduct: Product = {
        id: p.id || Date.now().toString(),
        name: p.name || 'Novo Produto',
        category: p.category || 'Outros',
        priceMatriz: p.priceMatriz || 0,
        priceFilial: p.priceFilial || 0,
        cost: p.cost || 0,
        stockMatrizIbotirama: p.stockMatrizIbotirama || 0,
        stockMatrizBarreiras: p.stockMatrizBarreiras || 0,
        stockFilial: p.stockFilial || 0,
        unit: p.unit || 'un',
        minStock: p.minStock || 10
      };

      onAddProduct(newProduct);

      // Log entries for imported products
      if (newProduct.stockFilial > 0) dbStockMovements.add({ id: `import-${Date.now()}-fil-${newProduct.id}`, date: getCurrentDateTime(), productId: newProduct.id, productName: newProduct.name, quantity: newProduct.stockFilial, type: 'ENTRY', reason: 'Importação XML NFe', branch: Branch.FILIAL }, currentUser.tenantId);
      if (newProduct.stockMatrizIbotirama > 0) dbStockMovements.add({ id: `import-${Date.now()}-ibo-${newProduct.id}`, date: getCurrentDateTime(), productId: newProduct.id, productName: newProduct.name, quantity: newProduct.stockMatrizIbotirama, type: 'ENTRY', reason: 'Importação XML NFe', branch: Branch.MATRIZ, matrizDeposit: 'Ibotirama' }, currentUser.tenantId);
    });
    setShowImportModal(false);
    setImportedProducts([]);
    alert(`${importedProducts.length} produtos importados com sucesso!`);
  };

  const updateImportedItem = (index: number, field: keyof Product, value: any) => {
    const updated = [...importedProducts];
    updated[index] = { ...updated[index], [field]: value };
    setImportedProducts(updated);
  };

  return (
    <>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <ArrowLeft size={24} className="text-slate-600" />
            </button>
            <div>
              <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-orange-500 tracking-tight">Controle de Estoque</h2>
              <p className="text-slate-500 font-medium mt-1">Gerenciamento dinâmico de níveis e movimentações</p>
            </div>
          </div>
          <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
            <button
              onClick={() => setBranchFilter('GERAL')}
              className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center transition-all ${branchFilter === 'GERAL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Geral
            </button>
            <button
              onClick={() => setBranchFilter(Branch.MATRIZ)}
              className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center transition-all ${branchFilter === Branch.MATRIZ ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Matriz
            </button>
            <button
              onClick={() => setBranchFilter(Branch.FILIAL)}
              className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center transition-all ${branchFilter === Branch.FILIAL ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Filial
            </button>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handleOpenTransfer}
              className="bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md shadow-blue-900/10 hover:shadow-lg hover:-translate-y-0.5"
            >
              <ArrowRightLeft size={18} /> Transferir
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setNewProductData({ category: 'Gelo Cubo', unit: 'un' });
                setShowNewProductModal(true);
              }}
              className="bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-orange-900/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <Plus size={18} /> Novo Produto
            </button>
            <label className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 cursor-pointer transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
              <Upload size={18} /> Importar XML
              <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} />
            </label>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="bg-white border border-slate-200 hover:border-slate-300 text-slate-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm hover:shadow transition-all hover:-translate-y-0.5"
            >
              <Filter size={18} /> Categorias
            </button>
            <button
              onClick={() => setShowReportModal(true)}
              className="bg-white border border-slate-200 hover:border-purple-300 text-purple-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm hover:shadow transition-all hover:-translate-y-0.5 hover:bg-purple-50"
            >
              <PieChart size={18} /> Relatórios
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Toolbar */}
          <div className="p-5 border-b border-slate-100 flex gap-4 bg-slate-50/50 backdrop-blur-md">
            <div className="relative flex-1 max-w-2xl group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
              <input
                type="text"
                placeholder="Buscar produto por nome ou categoria..."
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 shadow-sm transition-all text-slate-900 font-medium"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <button
              onClick={() => filter ? setFilter('') : setShowCategoryModal(true)}
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
                  <th className="p-5 font-bold">Preço Varejo (Filial)</th>
                  <th className="p-5 font-bold">Preço Atacado</th>
                  {(branchFilter === 'GERAL' || branchFilter === Branch.MATRIZ) && (
                    <>
                      <th className="p-5 font-bold text-center bg-blue-50/30 border-l border-slate-200">Matriz (Ibotirama)</th>
                      <th className="p-5 font-bold text-center bg-blue-50/30 border-l border-slate-200">Matriz (Barreiras)</th>
                    </>
                  )}
                  {(branchFilter === 'GERAL' || branchFilter === Branch.FILIAL) && (
                    <th className="p-5 font-bold text-center bg-orange-50/30 border-l border-slate-200">Estoque Filial</th>
                  )}
                  <th className="p-5 font-bold text-center">Status</th>
                  <th className="p-5 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const isLowMatriz = product.stockMatrizIbotirama < product.minStock || product.stockMatrizBarreiras < product.minStock;
                  const isLowFilial = product.stockFilial < product.minStock;
                  const isLow = branchFilter === 'GERAL' ? (isLowMatriz || isLowFilial) : (branchFilter === Branch.MATRIZ ? isLowMatriz : isLowFilial);

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
                      <td className="p-5 font-medium text-orange-700">{formatCurrency(product.priceFilial)}</td>
                      <td className="p-5 font-medium text-blue-700">{formatCurrency(product.priceMatriz)}</td>
                      {(branchFilter === 'GERAL' || branchFilter === Branch.MATRIZ) && (
                        <>
                          <td className="p-5 text-center bg-blue-50/20 border-l border-slate-200 font-medium text-slate-700">
                            {product.comboItems ? <span className="text-xs font-bold text-purple-600">COMBO</span> : product.isStockControlled === false ? <span className="text-xl">∞</span> : <span>{product.stockMatrizIbotirama} <span className="text-xs text-slate-400">{product.unit}</span></span>}
                          </td>
                          <td className="p-5 text-center bg-blue-50/20 border-l border-slate-200 font-medium text-slate-700">
                            {product.comboItems ? <span className="text-xs font-bold text-purple-600">COMBO</span> : product.isStockControlled === false ? <span className="text-xl">∞</span> : <span>{product.stockMatrizBarreiras} <span className="text-xs text-slate-400">{product.unit}</span></span>}
                          </td>
                        </>
                      )}
                      {(branchFilter === 'GERAL' || branchFilter === Branch.FILIAL) && (
                        <td className="p-5 text-center bg-orange-50/20 border-l border-slate-200 font-medium text-slate-700">
                          {product.comboItems ? <span className="text-xs font-bold text-purple-600">COMBO</span> : product.isStockControlled === false ? <span className="text-xl">∞</span> : <span>{product.stockFilial} <span className="text-xs text-slate-400">{product.unit}</span></span>}
                        </td>
                      )}
                      <td className="p-5 text-center">
                        {isLow ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center justify-center gap-1">
                            <AlertTriangle size={10} /> Baixo
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Normal</span>
                        )}
                      </td>
                      <td className="p-5 text-right flex justify-end gap-2 items-center">
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
                            if (confirm(`Tem certeza que deseja excluir o produto "${product.name}"?`)) {
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
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 text-center">
            Mostrando {filteredProducts.length} produtos
          </div>
        </div>

      </div>

      {/* --- MODAL DE TRANSFERÊNCIA --- */}
      {showTransferModal && selectedProduct && (
        <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <Truck size={20} className="text-orange-400" /> Transferência Interna
              </h3>
              <button onClick={() => setShowTransferModal(false)}><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Produto</label>
                <select
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                  value={selectedProduct?.id}
                  onChange={(e) => setSelectedProduct(products.find(p => p.id === e.target.value) || null)}
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex-1 text-center">
                  <p className="text-xs text-slate-500 uppercase font-bold">Origem: Matriz</p>
                  <p className="text-2xl font-bold text-blue-600">{selectedProduct.stockMatrizIbotirama}</p>
                </div>
                <ArrowRightLeft className="text-slate-300" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-slate-500 uppercase font-bold">Destino: Filial</p>
                  <p className="text-2xl font-bold text-orange-600">{selectedProduct.stockFilial}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantidade a Transferir</label>
                <input
                  type="number"
                  className="w-full px-4 py-3 text-lg font-bold border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-slate-900"
                  value={transferQty}
                  onChange={(e) => setTransferQty(Number(e.target.value))}
                  min={1}
                  max={selectedProduct.stockMatrizIbotirama}
                />
                <p className="text-xs text-slate-500 mt-1">Máximo disponível: {selectedProduct.stockMatrizIbotirama}</p>
              </div>

              <button
                onClick={executeTransfer}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
              >
                Confirmar Transferência
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DE REGISTRO DE PERDAS --- */}
      {showLossModal && selectedProduct && (
        <div className="fixed inset-0 bg-red-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <AlertOctagon size={20} /> Registrar Perda de Estoque
              </h3>
              <button onClick={() => setShowLossModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="mb-2">
                <p className="font-bold text-lg text-slate-800">{selectedProduct.name}</p>
                <p className="text-sm text-slate-500">O estoque será deduzido automaticamente.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Local da Perda</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLossData({ ...lossData, branch: Branch.MATRIZ })}
                    className={`flex-1 py-2 rounded-lg border font-medium transition-all ${lossData.branch === Branch.MATRIZ ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    Matriz
                  </button>
                  <button
                    onClick={() => setLossData({ ...lossData, branch: Branch.FILIAL })}
                    className={`flex-1 py-2 rounded-lg border font-medium transition-all ${lossData.branch === Branch.FILIAL ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    Filial
                  </button>
                </div>
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
                  {lossData.branch === Branch.MATRIZ ? selectedProduct.stockMatrizIbotirama : selectedProduct.stockFilial}
                </strong> para
                <strong className="ml-1">
                  {(lossData.branch === Branch.MATRIZ ? selectedProduct.stockMatrizIbotirama : selectedProduct.stockFilial) - lossData.quantity}
                </strong>.
              </div>

              <button
                onClick={executeLoss}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
              >
                Confirmar Perda
              </button>
            </div>
          </div>
        </div>
      )}



      {/* --- MODAL NOVO PRODUTO --- */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden mb-10">
            <div className="p-4 bg-orange-500 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                {isEditing ? <Edit size={20} /> : <Plus size={20} />}
                {isEditing ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h3>
              <button onClick={() => setShowNewProductModal(false)}><X size={20} /></button>
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
                <p className="text-xs text-purple-600 ml-2">(Ex: Drinks, Coquetéis)</p>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                  <select className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                    value={newProductData.category} onChange={e => setNewProductData({ ...newProductData, category: e.target.value })}
                  >
                    {categories.length > 0
                      ? categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                      : Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)
                    }
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
                      <span className="text-sm font-bold text-slate-600">Soma dos Produtos (Varejo):</span>
                      <span className="text-lg font-bold text-slate-800">
                        {formatCurrency(newProductData.comboItems.reduce((acc, item) => {
                          const p = products.find(prod => prod.id === item.productId);
                          return acc + ((p?.priceFilial || 0) * item.quantity);
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
                              return acc + ((p?.priceFilial || 0) * item.quantity);
                            }, 0) || 0;

                            const totalCost = newProductData.comboItems?.reduce((acc, item) => {
                              const p = products.find(prod => prod.id === item.productId);
                              return acc + ((p?.cost || 0) * item.quantity);
                            }, 0) || 0;

                            setNewProductData(prev => ({
                              ...prev,
                              priceFilial: Math.max(0, basePrice - discount),
                              cost: totalCost // Auto-update cost based on components
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{isEditing ? 'MAT. IBOTIRAMA' : 'INICIAL IBOTIRAMA'}</label>
                    <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold text-blue-700"
                      value={newProductData.stockMatrizIbotirama || 0} onChange={e => setNewProductData({ ...newProductData, stockMatrizIbotirama: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{isEditing ? 'MAT. BARREIRAS' : 'INICIAL BARREIRAS'}</label>
                    <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold text-blue-700"
                      value={newProductData.stockMatrizBarreiras || 0} onChange={e => setNewProductData({ ...newProductData, stockMatrizBarreiras: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{isEditing ? 'ESTOQUE FILIAL' : 'INICIAL FILIAL'}</label>
                    <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold text-orange-700"
                      value={newProductData.stockFilial || 0} onChange={e => setNewProductData({ ...newProductData, stockFilial: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}

              {/* --- PRICING (COMMON) --- */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2">
                    <Calculator size={16} className="text-blue-600" /> Precificação Inteligente
                  </h4>
                  <button
                    onClick={calculateFinancialMetrics}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors font-medium"
                    title="Basear em despesas lançadas (últimos 30 dias)"
                  >
                    Carregar Dados Financeiros
                  </button>
                </div>

                {/* Custo Base */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Custo do Produto (CMV)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                    <input type="number" className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newProductData.cost || ''} onChange={e => setNewProductData({ ...newProductData, cost: Number(e.target.value) })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

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
                      <span className="text-xs text-blue-800 font-medium">Preço Sugerido (Varejo):</span>
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
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Preço Varejo (Filial)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                      <input type="number" className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-bold text-lg"
                        value={newProductData.priceFilial || ''} onChange={e => setNewProductData({ ...newProductData, priceFilial: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Preço Atacado (Matriz)</label>
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
                className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20"
              >
                {isEditing ? 'Salvar Alterações' : 'Salvar Produto'}
              </button>
            </div>
          </div >
        </div >
      )
      }
      {/* --- MODAL DE IMPORTAÇÃO XML --- */}
      {
        showImportModal && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  <FileText size={20} className="text-green-400" /> Confirmar Importação de NFe
                </h3>
                <button onClick={() => setShowImportModal(false)}><X size={20} /></button>
              </div>

              <div className="p-4 bg-blue-50 border-b border-blue-100 text-sm text-blue-800">
                Confira os dados abaixo. Os produtos serão adicionados ao estoque da <strong>Filial</strong>.
              </div>

              <div className="flex-1 overflow-auto p-4">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="p-2 border">Nome do Produto</th>
                      <th className="p-2 border w-32">Categoria</th>
                      <th className="p-2 border w-20">Qtd</th>
                      <th className="p-2 border w-20">Custo</th>
                      <th className="p-2 border w-24">Venda (Matriz)</th>
                      <th className="p-2 border w-24">Venda (Filial)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedProducts.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateImportedItem(idx, 'name', e.target.value)}
                            className="w-full bg-transparent outline-none font-medium"
                          />
                        </td>
                        <td className="p-2 border">
                          <select
                            value={item.category}
                            onChange={(e) => updateImportedItem(idx, 'category', e.target.value)}
                            className="w-full bg-transparent outline-none"
                          >
                            {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="p-2 border text-center font-bold">{item.stockFilial}</td>
                        <td className="p-2 border text-slate-500">{formatCurrency(item.cost || 0)}</td>
                        <td className="p-2 border">
                          <input
                            type="number"
                            value={item.priceMatriz}
                            onChange={(e) => updateImportedItem(idx, 'priceMatriz', parseFloat(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded px-1 text-blue-700 font-bold"
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="number"
                            value={item.priceFilial}
                            onChange={(e) => updateImportedItem(idx, 'priceFilial', parseFloat(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded px-1 text-orange-700 font-bold"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancelar</button>
                <button onClick={confirmImport} className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg shadow-green-900/20">
                  Confirmar Importação
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* --- MODAL DE RELATÓRIOS --- */}
      {
        showReportModal && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-4 bg-purple-800 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  <BarChart3 size={20} className="text-purple-300" /> Relatório de Estoque e Vendas
                </h3>
                <div className="flex items-center gap-2">
                  <select
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
                    value={reportYear}
                    onChange={e => setReportYear(e.target.value)}
                    className="bg-purple-700 text-white rounded-lg px-3 py-1.5 text-sm font-bold border border-purple-600 outline-none hover:bg-purple-600 focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
                  >
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                    <option value="ALL">Todos os Anos</option>
                  </select>
                  <button onClick={() => setShowReportModal(false)} className="ml-2 p-1 hover:bg-purple-700 rounded-lg transition-colors"><X size={20} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 bg-slate-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  {/* Card 1: Valor em Estoque */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Valor Total em Estoque (Custo)</h4>
                    <div className="text-3xl font-bold text-slate-800">
                      {formatCurrency(products.reduce((acc, p) => acc + (p.cost * (p.stockMatrizIbotirama + p.stockFilial)), 0))}
                    </div>
                    <div className="mt-2 text-xs text-slate-400 flex justify-between">
                      <span>Matriz: {formatCurrency(products.reduce((acc, p) => acc + (p.cost * p.stockMatrizIbotirama), 0))}</span>
                      <span>Filial: {formatCurrency(products.reduce((acc, p) => acc + (p.cost * p.stockFilial), 0))}</span>
                    </div>
                  </div>

                  {/* Card 2: Valor de Venda Potencial */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Potencial de Venda (Estimado)</h4>
                    <div className="text-3xl font-bold text-emerald-600">
                      {formatCurrency(products.reduce((acc, p) => acc + (p.priceFilial * p.stockFilial) + (p.priceMatriz * p.stockMatrizIbotirama), 0))}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Baseado nos preços atuais de varejo e atacado.</p>
                  </div>

                  {/* Card 3: Itens Abaixo do Mínimo */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Alertas de Estoque</h4>
                    <div className="text-3xl font-bold text-red-600">
                      {products.filter(p => p.stockMatrizIbotirama < p.minStock || p.stockFilial < p.minStock).length}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Produtos precisando de reposição.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Tabela: Mais Vendidos (ABC) */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                      <h4 className="font-bold text-slate-700 flex items-center gap-2">
                        <TrendingUp size={18} className="text-blue-500" /> Produtos Mais Vendidos (Top 10)
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="p-3 font-semibold">Produto</th>
                            <th className="p-3 font-semibold text-right">Qtd. Vendida</th>
                            <th className="p-3 font-semibold text-right">Receita Gerada</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            // Calculate sales per product
                            const productSales: Record<string, { name: string, qty: number, revenue: number }> = {};
                            sales.filter(s => filterByReportDate(s.date)).forEach(sale => {
                              sale.items.forEach(item => {
                                if (!productSales[item.productId]) {
                                  productSales[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
                                }
                                productSales[item.productId].qty += item.quantity;
                                productSales[item.productId].revenue += (item.quantity * item.priceAtSale);
                              });
                            });

                            return Object.values(productSales)
                              .sort((a, b) => b.qty - a.qty)
                              .slice(0, 10)
                              .map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="p-3 font-medium text-slate-700">{item.name}</td>
                                  <td className="p-3 text-right font-bold text-blue-600">{item.qty}</td>
                                  <td className="p-3 text-right text-emerald-600">{formatCurrency(item.revenue)}</td>
                                </tr>
                              ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

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
                            <th className="p-3 font-semibold text-center">Matriz</th>
                            <th className="p-3 font-semibold text-center">Filial</th>
                            <th className="p-3 font-semibold text-center">Mínimo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {products
                            .filter(p => p.stockMatrizIbotirama < p.minStock || p.stockFilial < p.minStock)
                            .map((p) => (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-700">{p.name}</td>
                                <td className={`p-3 text-center font-bold ${p.stockMatrizIbotirama < p.minStock ? 'text-red-600' : 'text-slate-600'}`}>
                                  {p.stockMatrizIbotirama}
                                </td>
                                <td className={`p-3 text-center font-bold ${p.stockFilial < p.minStock ? 'text-red-600' : 'text-slate-600'}`}>
                                  {p.stockFilial}
                                </td>
                                <td className="p-3 text-center text-slate-400">{p.minStock}</td>
                              </tr>
                            ))}
                          {products.filter(p => p.stockMatrizIbotirama < p.minStock || p.stockFilial < p.minStock).length === 0 && (
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

                <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-red-50">
                    <h4 className="font-bold text-red-800 flex items-center gap-2">
                      <AlertOctagon size={18} /> Relatório de Perdas e Danos
                    </h4>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-left text-sm relative">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0 shadow-sm">
                        <tr>
                          <th className="p-3 font-semibold bg-slate-50">Data</th>
                          <th className="p-3 font-semibold bg-slate-50">Produto</th>
                          <th className="p-3 font-semibold text-center bg-slate-50">Qtd.</th>
                          <th className="p-3 font-semibold bg-slate-50">Motivo</th>
                          <th className="p-3 font-semibold bg-slate-50">Local</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loadingMovements ? (
                          <tr><td colSpan={5} className="p-4 text-center">Carregando...</td></tr>
                        ) : stockMovements.filter(m => m.type === 'LOSS' && filterByReportDate(m.date)).length === 0 ? (
                          <tr><td colSpan={5} className="p-4 text-center text-slate-400">Nenhuma perda no período selecionado.</td></tr>
                        ) : (
                          stockMovements.filter(m => m.type === 'LOSS' && filterByReportDate(m.date))
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map(m => (
                              <tr key={m.id} className="hover:bg-slate-50">
                                <td className="p-3 text-slate-600">{new Date(m.date).toLocaleString()}</td>
                                <td className="p-3 font-medium text-slate-800">{m.productName}</td>
                                <td className="p-3 text-center font-bold text-red-600">-{m.quantity}</td>
                                <td className="p-3 text-slate-600">{m.reason}</td>
                                <td className="p-3 text-slate-500 text-xs">{m.branch}</td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Histórico de Entradas */}
                <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-emerald-50">
                    <h4 className="font-bold text-emerald-800 flex items-center gap-2">
                      <ListPlus size={18} /> Histórico de Entradas (Estoque)
                    </h4>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-left text-sm relative">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0 shadow-sm">
                        <tr>
                          <th className="p-3 font-semibold bg-slate-50">Data e Hora</th>
                          <th className="p-3 font-semibold bg-slate-50">Produto</th>
                          <th className="p-3 font-semibold text-center bg-slate-50">Qtd. Adicionada</th>
                          <th className="p-3 font-semibold bg-slate-50">Motivo / Operação</th>
                          <th className="p-3 font-semibold bg-slate-50">Local</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loadingMovements ? (
                          <tr><td colSpan={5} className="p-4 text-center">Carregando...</td></tr>
                        ) : stockMovements.filter(m => m.type === 'ENTRY' && filterByReportDate(m.date)).length === 0 ? (
                          <tr><td colSpan={5} className="p-4 text-center text-slate-400">Nenhuma entrada no período selecionado.</td></tr>
                        ) : (
                          stockMovements.filter(m => m.type === 'ENTRY' && filterByReportDate(m.date))
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map(m => (
                              <tr key={m.id} className="hover:bg-slate-50">
                                <td className="p-3 text-slate-600 font-medium whitespace-nowrap">{new Date(m.date).toLocaleString()}</td>
                                <td className="p-3 font-medium text-slate-800">{m.productName}</td>
                                <td className="p-3 text-center font-bold text-emerald-600">+{m.quantity}</td>
                                <td className="p-3 text-slate-600">{m.reason}</td>
                                <td className="p-3 text-slate-500 text-xs">{m.branch} {m.matrizDeposit ? `(${m.matrizDeposit})` : ''}</td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }
      {/* --- MODAL GERENCIAR CATEGORIAS --- */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
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
                    {categories.map((cat) => (
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