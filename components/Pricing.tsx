import React, { useState, useEffect } from 'react';
import { Product, Category } from '../types';
import { ArrowLeft, Save, Package, Plus, Trash2, DollarSign, Factory } from 'lucide-react';

interface PricingProps {
    products: Product[];
    onUpdateProduct: (product: Product) => void;
    onBack: () => void;
}

const Pricing: React.FC<PricingProps> = ({ products, onUpdateProduct, onBack }) => {
    const [selectedProductId, setSelectedProductId] = useState<string>('');

    // Recipe State
    const [recipeItems, setRecipeItems] = useState<{ ingredientId: string; quantity: number }[]>([]);
    const [operationalCost, setOperationalCost] = useState<number>(0);
    const [batchSize, setBatchSize] = useState<number>(1); // Default to 1 unit

    // Helper to get product details
    const getProduct = (id: string) => products.find(p => p.id === id);
    const selectedProduct = getProduct(selectedProductId);

    // Filter Raw Materials
    const rawMaterials = products.filter(p => p.category === Category.RAW_MATERIAL);
    const manufacturedProducts = products.filter(p => p.category.includes('Gelo'));

    // Load existing recipe when product is selected
    useEffect(() => {
        if (selectedProduct) {
            setRecipeItems(selectedProduct.recipe || []);
            setOperationalCost(selectedProduct.operationalCost || 0);
            setBatchSize(selectedProduct.recipeBatchSize || 1);
        } else {
            setRecipeItems([]);
            setOperationalCost(0);
            setBatchSize(1);
        }
    }, [selectedProductId, products]);

    const handleAddIngredient = () => {
        setRecipeItems([...recipeItems, { ingredientId: '', quantity: 0 }]);
    };

    const handleRemoveIngredient = (index: number) => {
        const newItems = [...recipeItems];
        newItems.splice(index, 1);
        setRecipeItems(newItems);
    };

    const updateIngredient = (index: number, field: 'ingredientId' | 'quantity', value: any) => {
        const newItems = [...recipeItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setRecipeItems(newItems);
    };

    const calculateTotalBatchCost = () => {
        return recipeItems.reduce((acc, item) => {
            const ingredient = getProduct(item.ingredientId);
            return acc + (ingredient ? (ingredient.cost * item.quantity) : 0);
        }, 0);
    };

    const calculateUnitCost = () => {
        const batchCost = calculateTotalBatchCost();
        return (batchCost / (batchSize || 1)) + operationalCost;
    };

    const handleSave = () => {
        if (!selectedProduct) return;

        // Validate recipe
        const validRecipe = recipeItems.filter(item => item.ingredientId && item.quantity > 0);

        const updatedProduct: Product = {
            ...selectedProduct,
            recipe: validRecipe,
            recipeBatchSize: batchSize,
            operationalCost: operationalCost,
            cost: calculateUnitCost() // Update the main cost field with the calculated unit cost
        };

        onUpdateProduct(updatedProduct);
        alert(`Custo de produção atualizado para ${selectedProduct.name}!`);
    };

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <ArrowLeft size={24} className="text-slate-600" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Custo de Produção</h2>
                        <p className="text-slate-500">Defina a receita e custos para produção na fábrica.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT PANEL: SELECTION & RECIPE */}
                <div className="lg:col-span-2 space-y-6">

                    {/* 1. Product Selection */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <Factory size={20} className="text-blue-600" /> 1. Produto Fabricado
                        </h3>
                        <select
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            value={selectedProductId}
                            onChange={(e) => setSelectedProductId(e.target.value)}
                        >
                            <option value="">Selecione um produto...</option>
                            {manufacturedProducts.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        {manufacturedProducts.length === 0 && (
                            <p className="text-sm text-orange-600 mt-2">Nenhum produto da categoria "Gelo" encontrado.</p>
                        )}
                    </div>

                    {/* 2. Recipe (Ingredients) */}
                    <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-opacity ${!selectedProduct ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <Package size={20} className="text-emerald-600" /> 2. Receita do Lote
                            </h3>
                            <button
                                onClick={handleAddIngredient}
                                className="text-sm bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg hover:bg-emerald-100 font-medium flex items-center gap-1"
                            >
                                <Plus size={16} /> Adicionar Insumo
                            </button>
                        </div>

                        <div className="mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <label className="block text-sm font-bold text-blue-800 mb-1">Tamanho do Lote de Referência</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    className="w-32 px-4 py-2 border border-blue-200 rounded-lg font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={batchSize}
                                    onChange={(e) => setBatchSize(Number(e.target.value))}
                                    min={1}
                                />
                                <span className="text-blue-600 font-medium">unidades produzidas</span>
                            </div>
                            <p className="text-xs text-blue-500 mt-1">
                                Ex: "Para produzir <b>{batchSize}</b> unidades, eu gasto..."
                            </p>
                        </div>

                        {recipeItems.length === 0 ? (
                            <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                <p className="text-slate-500 text-sm">Nenhum insumo adicionado à receita.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {recipeItems.map((item, index) => {
                                    const ingredient = getProduct(item.ingredientId);
                                    const cost = ingredient ? ingredient.cost * item.quantity : 0;

                                    return (
                                        <div key={index} className="flex flex-col md:flex-row gap-3 items-end bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <div className="flex-1 w-full">
                                                <label className="text-xs font-bold text-slate-500 mb-1 block">Insumo</label>
                                                <select
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                    value={item.ingredientId}
                                                    onChange={(e) => updateIngredient(index, 'ingredientId', e.target.value)}
                                                >
                                                    <option value="">Selecione...</option>
                                                    {rawMaterials.map(rm => (
                                                        <option key={rm.id} value={rm.id}>{rm.name} ({formatCurrency(rm.cost)}/{rm.unit})</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="w-full md:w-32">
                                                <label className="text-xs font-bold text-slate-500 mb-1 block">Qtd. Total</label>
                                                <input
                                                    type="number"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                    placeholder="0.00"
                                                    value={item.quantity}
                                                    onChange={(e) => updateIngredient(index, 'quantity', Number(e.target.value))}
                                                />
                                            </div>
                                            <div className="w-full md:w-32 bg-white px-3 py-2 rounded-lg border border-slate-200 text-right">
                                                <span className="text-xs text-slate-400 block">Custo Lote</span>
                                                <span className="font-bold text-slate-700">{formatCurrency(cost)}</span>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveIngredient(index)}
                                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 3. Operational Costs */}
                    <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-opacity ${!selectedProduct ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <DollarSign size={20} className="text-purple-600" /> 3. Custos Operacionais (Por Unidade)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Custo Extra Unitário</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                                    <input
                                        type="number"
                                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        value={operationalCost}
                                        onChange={(e) => setOperationalCost(Number(e.target.value))}
                                    />
                                </div>
                                <p className="text-xs text-slate-400 mt-1">Energia, Mão de obra, etc (por unidade produzida).</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: SUMMARY */}
                <div className="lg:col-span-1">
                    <div className={`bg-slate-900 text-white p-6 rounded-2xl shadow-xl sticky top-6 ${!selectedProduct ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="font-bold text-xl mb-6 flex items-center gap-2">
                            <DollarSign size={24} className="text-emerald-400" /> Resumo do Custo
                        </h3>

                        <div className="space-y-4 mb-8">
                            <div className="flex justify-between items-center text-slate-300 text-sm">
                                <span>Produto</span>
                                <span className="font-medium text-white">{selectedProduct?.name}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300 text-sm">
                                <span>Lote Referência</span>
                                <span className="font-medium text-white">{batchSize} un</span>
                            </div>

                            <div className="border-t border-slate-700 my-2"></div>

                            <div className="flex justify-between items-center text-emerald-400">
                                <span>Custo Insumos (Lote)</span>
                                <span>{formatCurrency(calculateTotalBatchCost())}</span>
                            </div>
                            <div className="flex justify-between items-center text-emerald-400">
                                <span>Custo Insumos (Unit.)</span>
                                <span>{formatCurrency(calculateTotalBatchCost() / (batchSize || 1))}</span>
                            </div>
                            <div className="flex justify-between items-center text-purple-400">
                                <span>Operacional (Unit.)</span>
                                <span>{formatCurrency(operationalCost)}</span>
                            </div>

                            <div className="border-t border-slate-700 my-2"></div>

                            <div className="flex justify-between items-center text-white font-bold text-lg">
                                <span>Custo Total Unitário</span>
                                <span>{formatCurrency(calculateUnitCost())}</span>
                            </div>
                        </div>

                        <div className="bg-slate-800 p-4 rounded-xl mb-6 border border-slate-700">
                            <p className="text-slate-400 text-xs mb-2">Impacto na Margem</p>
                            <div className="flex justify-between text-sm mb-1">
                                <span>Preço Venda (Matriz)</span>
                                <span className="text-white font-bold">{formatCurrency(selectedProduct?.priceMatriz || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span>Lucro Bruto</span>
                                <span className={`font-bold ${(selectedProduct?.priceMatriz || 0) - calculateUnitCost() > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatCurrency((selectedProduct?.priceMatriz || 0) - calculateUnitCost())}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={handleSave}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Save size={20} /> Salvar Configuração
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Pricing;
