import React, { useState, useEffect } from 'react';
import { Product, Branch, Category } from '../types';
import { Search, Plus, ArrowRightLeft, Filter, Save, X, Truck, AlertTriangle, Upload, FileText } from 'lucide-react';

interface InventoryProps {
  products: Product[];
  onUpdateProduct: (product: Product) => void;
  onAddProduct: (product: Product) => void;
}

const Inventory: React.FC<InventoryProps> = ({ products, onUpdateProduct, onAddProduct }) => {
  const [filter, setFilter] = useState('');

  // Modal States
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedProducts, setImportedProducts] = useState<Partial<Product>[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form States
  const [transferQty, setTransferQty] = useState(0);
  const [adjustQtyMatriz, setAdjustQtyMatriz] = useState(0);
  const [adjustQtyFilial, setAdjustQtyFilial] = useState(0);

  // New Product Form
  const [newProductData, setNewProductData] = useState<Partial<Product>>({
    category: Category.ICE_CUBE,
    unit: 'un'
  });

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

  const handleOpenAdjust = (product: Product) => {
    setSelectedProduct(product);
    setAdjustQtyMatriz(product.stockMatriz);
    setAdjustQtyFilial(product.stockFilial);
    setShowAdjustModal(true);
  };

  const executeTransfer = () => {
    if (!selectedProduct) return;

    // Simple validation
    const safeQty = Math.min(selectedProduct.stockMatriz, transferQty);

    const updatedProduct = {
      ...selectedProduct,
      stockMatriz: selectedProduct.stockMatriz - safeQty,
      stockFilial: selectedProduct.stockFilial + safeQty
    };

    onUpdateProduct(updatedProduct);
    setShowTransferModal(false);
  };

  const executeAdjust = () => {
    if (!selectedProduct) return;

    const updatedProduct = {
      ...selectedProduct,
      stockMatriz: Number(adjustQtyMatriz),
      stockFilial: Number(adjustQtyFilial)
    };

    onUpdateProduct(updatedProduct);
    setShowAdjustModal(false);
  };

  const executeNewProduct = () => {
    if (!newProductData.name || !newProductData.priceFilial) return;

    const newProduct: Product = {
      id: Date.now().toString(),
      name: newProductData.name,
      category: newProductData.category as Category,
      priceMatriz: Number(newProductData.priceMatriz || 0),
      priceFilial: Number(newProductData.priceFilial),
      cost: Number(newProductData.cost || 0),
      stockMatriz: Number(newProductData.stockMatriz || 0),
      stockFilial: Number(newProductData.stockFilial || 0),
      unit: newProductData.unit || 'un',
      minStock: Number(newProductData.minStock || 10)
    };

    onAddProduct(newProduct);
    setShowNewProductModal(false);
    setNewProductData({ category: Category.ICE_CUBE, unit: 'un' });
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
            category: Category.OTHER, // Default category
            priceMatriz: cost * 1.5, // Suggested Markup
            priceFilial: cost * 2.0, // Suggested Markup
            cost: cost,
            stockMatriz: 0,
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
        category: p.category as Category,
        priceMatriz: p.priceMatriz || 0,
        priceFilial: p.priceFilial || 0,
        cost: p.cost || 0,
        stockMatriz: p.stockMatriz || 0,
        stockFilial: p.stockFilial || 0,
        unit: p.unit || 'un',
        minStock: p.minStock || 10
      };
      onAddProduct(newProduct);
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Controle de Estoque</h2>
          <p className="text-slate-500">Gerencie níveis de gelo e bebidas entre Matriz e Filial.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleOpenTransfer}
            className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/10"
          >
            <ArrowRightLeft size={18} /> Transferir (Matriz {'->'} Filial)
          </button>
          <button
            onClick={() => setShowNewProductModal(true)}
            className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-orange-900/20 transition-colors"
          >
            <Plus size={18} /> Novo Produto
          </button>
          <label className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-slate-900/10">
            <Upload size={18} /> Importar XML
            <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar produto por nome ou categoria..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all text-slate-900"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200">
            <Filter size={18} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm">
                <th className="p-4 font-semibold">Produto</th>
                <th className="p-4 font-semibold">Categoria</th>
                <th className="p-4 font-semibold">Preço Varejo (Filial)</th>
                <th className="p-4 font-semibold">Preço Base Atacado</th>
                <th className="p-4 font-semibold text-center bg-blue-50/50 border-l border-slate-200">Estoque Matriz</th>
                <th className="p-4 font-semibold text-center bg-orange-50/50 border-l border-slate-200">Estoque Filial</th>
                <th className="p-4 font-semibold text-center">Status</th>
                <th className="p-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const isLow = product.stockMatriz < product.minStock || product.stockFilial < product.minStock;

                return (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-4">
                      <p className="font-semibold text-slate-800">{product.name}</p>
                      <span className="text-xs text-slate-400">ID: {product.id}</span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                        {product.category}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-orange-700">{formatCurrency(product.priceFilial)}</td>
                    <td className="p-4 font-medium text-blue-700">{formatCurrency(product.priceMatriz)}</td>
                    <td className="p-4 text-center bg-blue-50/20 border-l border-slate-200 font-medium text-slate-700">
                      {product.stockMatriz} <span className="text-xs text-slate-400">{product.unit}</span>
                    </td>
                    <td className="p-4 text-center bg-orange-50/20 border-l border-slate-200 font-medium text-slate-700">
                      {product.stockFilial} <span className="text-xs text-slate-400">{product.unit}</span>
                    </td>
                    <td className="p-4 text-center">
                      {isLow ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center justify-center gap-1">
                          <AlertTriangle size={10} /> Baixo
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Normal</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleOpenAdjust(product)}
                        className="text-slate-400 hover:text-blue-600 text-sm font-medium transition-colors"
                      >
                        Ajustar
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
                  <p className="text-2xl font-bold text-blue-600">{selectedProduct.stockMatriz}</p>
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
                  max={selectedProduct.stockMatriz}
                />
                <p className="text-xs text-slate-500 mt-1">Máximo disponível: {selectedProduct.stockMatriz}</p>
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

      {/* --- MODAL DE AJUSTE MANUAL --- */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Ajuste Manual de Estoque</h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="mb-4">
                <p className="font-bold text-lg text-slate-800">{selectedProduct.name}</p>
                <p className="text-sm text-slate-500">Correção de quebras ou contagem.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Matriz</label>
                  <input
                    type="number"
                    value={adjustQtyMatriz}
                    onChange={(e) => setAdjustQtyMatriz(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-lg font-bold text-blue-600 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Filial</label>
                  <input
                    type="number"
                    value={adjustQtyFilial}
                    onChange={(e) => setAdjustQtyFilial(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-lg font-bold text-orange-600 bg-white"
                  />
                </div>
              </div>

              <button
                onClick={executeAdjust}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 mt-2"
              >
                <Save size={18} /> Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL NOVO PRODUTO --- */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-orange-500 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <Plus size={20} /> Cadastrar Novo Produto
              </h3>
              <button onClick={() => setShowNewProductModal(false)}><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Produto</label>
                <input type="text" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                  value={newProductData.name || ''} onChange={e => setNewProductData({ ...newProductData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                  <select className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                    value={newProductData.category} onChange={e => setNewProductData({ ...newProductData, category: e.target.value as Category })}
                  >
                    {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
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
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase">Precificação</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Preço Varejo (Filial)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                      <input type="number" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold"
                        value={newProductData.priceFilial || ''} onChange={e => setNewProductData({ ...newProductData, priceFilial: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Preço Base (Atacado)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                      <input type="number" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold"
                        value={newProductData.priceMatriz || ''} onChange={e => setNewProductData({ ...newProductData, priceMatriz: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Custo de Produção/Compra</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">R$</span>
                    <input type="number" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                      value={newProductData.cost || ''} onChange={e => setNewProductData({ ...newProductData, cost: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ESTOQUE INICIAL MATRIZ</label>
                  <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold text-blue-700"
                    value={newProductData.stockMatriz || 0} onChange={e => setNewProductData({ ...newProductData, stockMatriz: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ESTOQUE INICIAL FILIAL</label>
                  <input type="number" className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-bold text-orange-700"
                    value={newProductData.stockFilial || 0} onChange={e => setNewProductData({ ...newProductData, stockFilial: Number(e.target.value) })}
                  />
                </div>
              </div>

              <button
                onClick={executeNewProduct}
                className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20"
              >
                Salvar Produto
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- MODAL DE IMPORTAÇÃO XML --- */}
      {showImportModal && (
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
                      <td className="p-2 border text-center font-bold">{item.stockMatriz}</td>
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
      )}
    </div>
  );
};

export default Inventory;