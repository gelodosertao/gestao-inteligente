import React, { useState, useEffect } from 'react';
import { Product, ProductionRecord, Shift, Branch, User } from '../types';
import { dbProduction, dbProducts, dbStockMovements } from '../services/db';
import { getTodayDate } from '../services/utils';
import { Plus, Save, Clock, User as UserIcon, Package, Calendar, ArrowLeft, Trash2, Layers, History, Boxes, AlertTriangle, ArrowRightLeft } from 'lucide-react';

interface ProductionProps {
    products: Product[];
    currentUser: User;
    onUpdateProduct: (product: Product) => void;
    onBack: () => void;
}

const Production: React.FC<ProductionProps> = ({ products, currentUser, onUpdateProduct, onBack }) => {
    const [records, setRecords] = useState<ProductionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    // Form State
    const [selectedProductId, setSelectedProductId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [activeTab, setActiveTab] = useState<'production' | 'history' | 'stock'>('production');
    const [shift, setShift] = useState<Shift>('Manhã');
    const [notes, setNotes] = useState('');

    // Ingredient Usage State
    const [usedIngredients, setUsedIngredients] = useState<{ ingredientId: string; name: string; quantity: number; unit: string }[]>([]);

    useEffect(() => {
        loadRecords();
    }, []);

    const loadRecords = async () => {
        try {
            const data = await dbProduction.getAll(currentUser.tenantId);
            setRecords(data);
        } catch (error) {
            console.error("Erro ao carregar produção:", error);
            alert("Erro ao carregar histórico de produção.");
        } finally {
            setLoading(false);
        }
    };

    // Update ingredients when product or quantity changes
    useEffect(() => {
        if (selectedProductId && quantity && Number(quantity) > 0) {
            const product = products.find(p => p.id === selectedProductId);
            if (product && product.recipe) {
                const batchSize = product.recipeBatchSize || 1;
                const calculatedIngredients = product.recipe.map(item => {
                    const ingredient = products.find(p => p.id === item.ingredientId);
                    if (!ingredient) return null;

                    const totalRequired = (Number(quantity) / batchSize) * item.quantity;
                    return {
                        ingredientId: ingredient.id,
                        name: ingredient.name,
                        quantity: Number(totalRequired.toFixed(3)), // Round to 3 decimals
                        unit: ingredient.unit
                    };
                }).filter(Boolean) as { ingredientId: string; name: string; quantity: number; unit: string }[];

                setUsedIngredients(calculatedIngredients);
            } else {
                setUsedIngredients([]);
            }
        } else {
            setUsedIngredients([]);
        }
    }, [selectedProductId, quantity, products]);

    const handleSave = async () => {
        if (!selectedProductId || !quantity || Number(quantity) <= 0) {
            alert("Selecione um produto e uma quantidade válida.");
            return;
        }

        const product = products.find(p => p.id === selectedProductId);
        if (!product) return;

        const newRecord: ProductionRecord = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            productId: product.id,
            productName: product.name,
            quantity: Number(quantity),
            shift: shift,
            responsible: currentUser.name,
            notes: notes
        };

        try {
            // 1. Save Production Record
            await dbProduction.add(newRecord, currentUser.tenantId);

            // 2. Update Product Stock (Matriz) - Finished Good
            const updatedProduct = {
                ...product,
                stockMatriz: product.stockMatriz + Number(quantity)
            };
            await dbProducts.update(updatedProduct);
            onUpdateProduct(updatedProduct);

            // 3. Register Stock Movement (Finished Good)
            await dbStockMovements.add({
                id: Date.now().toString() + '-mov-in',
                date: new Date().toISOString(),
                productId: product.id,
                productName: product.name,
                quantity: Number(quantity),
                type: 'TRANSFER_IN', // Entrada por Produção
                reason: `Produção - Turno ${shift}`,
                branch: Branch.MATRIZ
            }, currentUser.tenantId);

            // 4. Deduct Raw Materials (Based on CONFIRMED usedIngredients)
            if (usedIngredients.length > 0) {
                for (const item of usedIngredients) {
                    const ingredient = products.find(p => p.id === item.ingredientId);
                    if (ingredient) {
                        // Update Ingredient Stock
                        const updatedIngredient = {
                            ...ingredient,
                            stockMatriz: ingredient.stockMatriz - item.quantity
                        };
                        await dbProducts.update(updatedIngredient);
                        onUpdateProduct(updatedIngredient);

                        // Register Ingredient Movement
                        await dbStockMovements.add({
                            id: Date.now().toString() + `-mov-out-${ingredient.id}`,
                            date: new Date().toISOString(),
                            productId: ingredient.id,
                            productName: ingredient.name,
                            quantity: item.quantity,
                            type: 'TRANSFER_OUT', // Saída por Uso/Produção
                            reason: `Insumo para Produção de ${product.name} (Lote: ${quantity})`,
                            branch: Branch.MATRIZ
                        }, currentUser.tenantId);
                    }
                }
            }

            alert("Produção registrada com sucesso! Estoque atualizado.");
            setShowForm(false);
            setQuantity('');
            setNotes('');
            setUsedIngredients([]);
            loadRecords(); // Refresh list
        } catch (error) {
            console.error("Erro ao salvar produção:", error);
            alert("Erro ao salvar registro.");
        }
    };

    // Filter only manufactured products (Ice)
    const manufacturedProducts = products.filter(p => p.category.includes('Gelo'));
    // Filter raw materials
    const rawMaterials = products.filter(p => p.category === 'Insumo (Matéria-prima)');

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    {currentUser.role !== 'FACTORY' && (
                        <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <ArrowLeft size={24} className="text-slate-600" />
                        </button>
                    )}
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Controle de Produção</h2>
                        <p className="text-slate-500">Registre a produção diária da fábrica.</p>
                    </div>
                </div>
                {/* --- TABS --- */}
                <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
                    <button
                        onClick={() => setActiveTab('production')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'production' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Layers size={16} /> Registrar Produção
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <History size={16} /> Histórico
                    </button>
                    <button
                        onClick={() => setActiveTab('stock')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'stock' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Boxes size={16} /> Estoque de Insumos
                    </button>
                </div>
            </div>

            {activeTab === 'production' && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-blue-100 animate-in fade-in duration-300">
                    <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
                        <Package className="text-blue-600" /> Registrar Nova Produção
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Produto Fabricado</label>
                                <select
                                    value={selectedProductId}
                                    onChange={(e) => setSelectedProductId(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 font-medium"
                                >
                                    <option value="">Selecione o produto...</option>
                                    {manufacturedProducts.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Quantidade Produzida</label>
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
                                    placeholder="0"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Turno</label>
                                    <select
                                        value={shift}
                                        onChange={(e) => setShift(e.target.value as Shift)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                    >
                                        <option value="Manhã">Manhã</option>
                                        <option value="Tarde">Tarde</option>
                                        <option value="Noite">Noite</option>
                                        <option value="Madrugada">Madrugada</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Responsável</label>
                                    <div className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-500 flex items-center gap-2">
                                        <UserIcon size={16} /> {currentUser.name}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-full">
                                <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <Boxes size={18} className="text-orange-500" /> Insumos Utilizados (Baixa no Estoque)
                                </h4>

                                {usedIngredients.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm italic">
                                        <AlertTriangle size={24} className="mb-2 opacity-50" />
                                        <p>Selecione um produto e quantidade</p>
                                        <p>para calcular os insumos.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 overflow-y-auto max-h-[300px] pr-2">
                                        {usedIngredients.map((item, index) => (
                                            <div key={item.ingredientId} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-bold text-slate-700 text-sm">{item.name}</span>
                                                    <span className="text-xs text-slate-400">{item.unit}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        className="flex-1 px-3 py-1 border border-slate-200 rounded-md font-bold text-slate-800 text-right focus:ring-2 focus:ring-orange-500 outline-none"
                                                        value={item.quantity}
                                                        onChange={(e) => {
                                                            const newIngredients = [...usedIngredients];
                                                            newIngredients[index].quantity = Number(e.target.value);
                                                            setUsedIngredients(newIngredients);
                                                        }}
                                                    />
                                                    <span className="text-sm font-medium text-slate-500 w-8">{item.unit}</span>
                                                </div>
                                            </div>
                                        ))}
                                        <p className="text-xs text-slate-400 text-center mt-2">
                                            * Verifique e ajuste as quantidades reais utilizadas.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Observações (Opcional)</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Ex: Máquina 2 parada, quebra de insumo extra..."
                        />
                    </div>

                    <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button
                            onClick={handleSave}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
                        >
                            <Save size={20} /> Confirmar Produção
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-slate-700">Data/Hora</th>
                                    <th className="px-6 py-4 font-bold text-slate-700">Produto</th>
                                    <th className="px-6 py-4 font-bold text-slate-700">Qtd.</th>
                                    <th className="px-6 py-4 font-bold text-slate-700">Turno</th>
                                    <th className="px-6 py-4 font-bold text-slate-700">Responsável</th>
                                    <th className="px-6 py-4 font-bold text-slate-700">Obs.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={6} className="p-6 text-center text-slate-500">Carregando...</td></tr>
                                ) : records.length === 0 ? (
                                    <tr><td colSpan={6} className="p-6 text-center text-slate-500">Nenhum registro de produção encontrado.</td></tr>
                                ) : (
                                    records.map(record => (
                                        <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 text-slate-600 flex items-center gap-2">
                                                <Calendar size={14} className="text-slate-400" />
                                                {new Date(record.date).toLocaleString('pt-BR')}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-800">{record.productName}</td>
                                            <td className="px-6 py-4 font-bold text-blue-600">+{record.quantity}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${record.shift === 'Manhã' ? 'bg-yellow-100 text-yellow-700' :
                                                    record.shift === 'Tarde' ? 'bg-orange-100 text-orange-700' :
                                                        'bg-indigo-100 text-indigo-700'
                                                    }`}>
                                                    {record.shift}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 flex items-center gap-2">
                                                <UserIcon size={14} className="text-slate-400" /> {record.responsible}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 italic">{record.notes || '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'stock' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">Estoque de Insumos</h3>
                            <p className="text-slate-500 text-sm">Gerencie a matéria-prima da fábrica.</p>
                        </div>
                        {/* Future: Add button to register purchase/entry of raw materials */}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-slate-700">Insumo</th>
                                    <th className="px-6 py-4 font-bold text-slate-700 text-center">Estoque Atual</th>
                                    <th className="px-6 py-4 font-bold text-slate-700 text-center">Unidade</th>
                                    <th className="px-6 py-4 font-bold text-slate-700 text-right">Custo Unit.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rawMaterials.length === 0 ? (
                                    <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhum insumo cadastrado. Vá em Estoque para cadastrar.</td></tr>
                                ) : (
                                    rawMaterials.map(item => (
                                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-800">{item.name}</td>
                                            <td className={`px-6 py-4 text-center font-bold text-lg ${item.stockMatriz < item.minStock ? 'text-red-600' : 'text-slate-700'}`}>
                                                {item.stockMatriz}
                                                {item.stockMatriz < item.minStock && <AlertTriangle size={14} className="inline ml-2 text-red-500" />}
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-500">{item.unit}</td>
                                            <td className="px-6 py-4 text-right text-slate-600">
                                                {item.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Production;
