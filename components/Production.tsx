import React, { useState, useEffect, useRef } from 'react';
import { Product, ProductionRecord, Shift, Branch, User, Category, Sale } from '../types';
import { dbProduction, dbStockMovements } from '../services/db';
import { getTodayDate } from '../services/utils';
import { calculateProductionCosts } from '../services/productionCosts';
import { getProductionAvailability } from '../services/productionAvailability';
import { canAccessProductionManagement } from '../security/accessControl';
import { Plus, Save, Clock, User as UserIcon, Package, Calendar, ArrowLeft, Trash2, Layers, History, Boxes, AlertTriangle, ArrowRightLeft, Calculator, Edit2, Truck, CheckCircle } from 'lucide-react';

interface ProductionProps {
    products: Product[];
    currentUser: User;
    onUpdateProduct: (product: Product) => Promise<void>;
    onStockChanged: () => Promise<void>;
    onAddProduct?: (product: Product) => Promise<void>;
    onBack: () => void;
}

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 15 });

const Production: React.FC<ProductionProps> = ({ products, currentUser, onUpdateProduct, onStockChanged, onAddProduct, onBack }) => {
    const [records, setRecords] = useState<ProductionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingLoss, setSavingLoss] = useState(false);
    const pendingOperations = useRef(new Map<string, string>());

    // Form State
    const [selectedProductId, setSelectedProductId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [lossProductId, setLossProductId] = useState('');
    const [lossQuantity, setLossQuantity] = useState('');
    const [lossReason, setLossReason] = useState('');
    const produced = Number(quantity);
    const lost = Number(lossQuantity);
    const lossProduct = products.find(product => product.id === lossProductId);
    const lossStock = lossProduct?.stockMatrizIbotirama ?? 0;
    const validLoss = !!lossProduct && Number.isFinite(lost) && lost > 0 && lost <= lossStock;
    const [activeTab, setActiveTab] = useState<'production' | 'history' | 'stock' | 'recipes'>('production');
    const canManageProduction = canAccessProductionManagement(currentUser);
    const [shift, setShift] = useState<Shift>('Manhã');
    const [notes, setNotes] = useState('');

    const selectedProduct = products.find(product => product.id === selectedProductId);
    let usedIngredients: ReturnType<typeof getProductionAvailability> = [];
    let productionError = '';
    if (selectedProduct && Number.isFinite(produced) && produced > 0) {
        try {
            usedIngredients = getProductionAvailability(selectedProduct, products, produced, {});
            const shortages = usedIngredients.filter(item => item.shortage > 0);
            if (shortages.length) {
                productionError = `Saldo insuficiente de insumos em Ibotirama. Falta: ${shortages.map(item => `${quantityFormat.format(item.shortage)} ${item.unit} de ${item.name}`).join('; ')}. Reponha o estoque ou reduza a quantidade produzida.`;
            }
        } catch (error) {
            productionError = (error as Error).message;
        }
    }

    // New Input State
    const [showInputForm, setShowInputForm] = useState(false);
    const [newInput, setNewInput] = useState({ name: '', unit: '', cost: '', stock: '' });

    // Recipe Management State
    const [recipeProductId, setRecipeProductId] = useState('');
    const [recipeItems, setRecipeItems] = useState<{ ingredientId: string; quantity: string }[]>([]);
    const [recipeBatchSize, setRecipeBatchSize] = useState('1');
    const [operationalCost, setOperationalCost] = useState('0');
    const [savingRecipe, setSavingRecipe] = useState(false);
    const parsedRecipe = recipeItems.map(item => ({ ingredientId: item.ingredientId, quantity: Number(item.quantity) }));
    let recipeCosts: ReturnType<typeof calculateProductionCosts> | undefined;
    let recipeError = '';
    try {
        recipeCosts = calculateProductionCosts({ products, recipe: parsedRecipe,
            batchSize: Number(recipeBatchSize), operationalCost: Number(operationalCost), productId: recipeProductId });
    } catch (error) {
        recipeError = (error as Error).message;
    }

    useEffect(() => {
        loadRecords();
    }, []);

    useEffect(() => {
        if (!canManageProduction && activeTab !== 'production') setActiveTab('production');
    }, [canManageProduction, activeTab]);

    const loadRecords = async () => {
        if (!canManageProduction) {
            setLoading(false);
            return;
        }
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

    const handleSave = async () => {
        if (saving) return;

        if (!selectedProductId || !Number.isFinite(produced) || produced <= 0) {
            alert("Selecione um produto e informe uma quantidade produzida maior que zero.");
            return;
        }
        if (productionError) {
            alert(productionError);
            return;
        }

        const batch = {
            productId: selectedProductId,
            quantity: produced,
            shift,
            notes
        };
        const batchKey = JSON.stringify([batch, usedIngredients]);
        const operationId = pendingOperations.current.get(batchKey) ?? crypto.randomUUID();
        pendingOperations.current.set(batchKey, operationId);
        setSaving(true);

        try {
            await dbProduction.register(operationId, batch, usedIngredients);
            pendingOperations.current.delete(batchKey);
            setQuantity('');
            setNotes('');
            try {
                await onStockChanged();
                alert("Produção registrada com sucesso! Estoque atualizado.");
            } catch (error) {
                console.error("Erro ao recarregar estoque:", error);
                alert("Produção registrada. Recarregue a página para consultar o estoque atualizado.");
            }
            await loadRecords();
        } catch (error) {
            console.error("Erro ao salvar produção:", error);
            const message = (error as { message?: string })?.message;
            alert(message ? `Erro ao confirmar produção. ${message}` : "Erro ao confirmar produção.");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveLoss = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (savingLoss || !validLoss) return;

        const reason = lossReason.trim();
        const key = JSON.stringify([lossProductId, lost, reason]);
        const operationId = pendingOperations.current.get(key) ?? crypto.randomUUID();
        pendingOperations.current.set(key, operationId);
        setSavingLoss(true);

        try {
            await dbStockMovements.mutate({ operationId, action: 'loss', productId: lossProductId,
                quantity: lost, deposit: 'Ibotirama', reason: reason || 'Perda de estoque na produção' });
            pendingOperations.current.delete(key);
            setLossQuantity('');
            setLossReason('');
            try {
                await onStockChanged();
                alert("Perda registrada. Estoque atualizado.");
            } catch (error) {
                console.error("Erro ao recarregar estoque:", error);
                alert("Perda registrada. Recarregue a página para consultar o saldo atualizado.");
            }
        } catch (error) {
            console.error("Erro ao registrar perda:", error);
            const message = (error as { message?: string })?.message;
            alert(message ? `Erro ao registrar perda. ${message}` : "Erro ao registrar perda.");
        } finally {
            setSavingLoss(false);
        }
    };

    const handleAddInput = async () => {
        if (!newInput.name || !newInput.unit || !newInput.cost || !onAddProduct) {
            alert("Preencha todos os campos e certifique-se de que a inclusão é permitida.");
            return;
        }
        const parsedCost = parseFloat(newInput.cost);
        const parsedStock = newInput.stock.trim() === '' ? 0 : Number(newInput.stock);
        if (!Number.isFinite(parsedCost) || parsedCost < 0 || !Number.isFinite(parsedStock) || parsedStock < 0) {
            alert('Informe custo e saldo inicial válidos e não negativos.');
            return;
        }

        const newProduct: Product = {
            id: Date.now().toString(),
            name: newInput.name,
            category: Category.RAW_MATERIAL,
            priceMatriz: parsedCost,
            priceFilial: parsedCost,
            cost: parsedCost,
            stockMatrizIbotirama: parsedStock,
            stockMatrizBarreiras: 0,
            stockFilial: 0,
            unit: newInput.unit,
            minStock: 0
        };

        try {
            await onAddProduct(newProduct);

            alert("Insumo cadastrado com sucesso!");
            setNewInput({ name: '', unit: '', cost: '', stock: '' });
            setShowInputForm(false);
        } catch (e) {
            alert("Erro ao salvar insumo.");
        }
    };

    const handleSaveRecipe = async () => {
        const product = products.find(p => p.id === recipeProductId);
        if (!product || savingRecipe) return;
        if (!recipeCosts) {
            alert(recipeError);
            return;
        }

        const updatedProduct: Product = {
            ...product,
            recipeBatchSize: Number(recipeBatchSize),
            operationalCost: Number(operationalCost),
            recipe: parsedRecipe,
            cost: recipeCosts.unitCost
        };

        setSavingRecipe(true);
        try {
            await onUpdateProduct(updatedProduct);
            alert("Receita calculada e salva com sucesso! O custo unitário do produto principal foi atualizado.");
        } catch (e) {
            alert("Erro ao salvar receita.");
        } finally {
            setSavingRecipe(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'recipes' && recipeProductId) {
            const product = products.find(p => p.id === recipeProductId);
            if (product) {
                setRecipeBatchSize(product.recipeBatchSize?.toString() || '1');
                setOperationalCost(product.operationalCost?.toString() || '0');
                setRecipeItems((product.recipe || []).map(r => ({ ...r, quantity: r.quantity.toString() })));
            }
        }
    }, [recipeProductId, activeTab, products]);


    // Filter only manufactured products (Ice)
    const manufacturedProducts = products.filter(p => p.category.includes('Gelo'));
    // Filter raw materials
    const rawMaterials = products.filter(p => p.category === 'Insumo (Matéria-prima)' || p.category === 'Insumo (Matéria-Prima)');

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    {currentUser.role !== 'FACTORY' && (
                        <button onClick={onBack} aria-label="Voltar à gestão" className="p-2 hover:bg-slate-200 rounded-full transition-colors touch-target">
                            <ArrowLeft size={24} className="text-slate-600" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Controle de Produção</h1>
                        <p className="text-slate-500">Registre a produção diária e as perdas da fábrica.</p>
                    </div>
                </div>
                {/* --- TABS --- */}
                <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
                    <button
                        onClick={() => setActiveTab('production')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'production' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Layers size={16} /> Produção e Perdas
                    </button>
                    {canManageProduction && (
                        <>
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
                            <button
                                onClick={() => setActiveTab('recipes')}
                                className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'recipes' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Calculator size={16} /> Custo de Produção
                            </button>
                        </>
                    )}

                </div>
            </div>

            {activeTab === 'production' && (
                <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
                    <div className="min-w-0 bg-white p-6 rounded-2xl border border-blue-100 animate-in fade-in duration-300">
                        <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
                            <Package className="text-blue-600" /> Registrar Nova Produção
                        </h3>

                        <fieldset disabled={saving} className="mb-6 min-w-0">
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="production-product" className="block text-sm font-bold text-slate-700 mb-1">Produto Fabricado</label>
                                    <select
                                        id="production-product"
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
                                    <label htmlFor="production-quantity" className="block text-sm font-bold text-slate-700 mb-1">Quantidade Produzida</label>
                                    <input
                                        type="number"
                                        id="production-quantity"
                                        min="0"
                                        step="any"
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
                                        placeholder="0"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

                        </fieldset>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Observações (Opcional)</label>
                            <input
                                type="text"
                                value={notes}
                                disabled={saving}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: Máquina 2 parada, quebra de insumo extra..."
                            />
                        </div>

                        {productionError && <p role="alert" className="mb-4 text-sm font-bold text-red-700">{productionError}</p>}
                        <div className="flex justify-end pt-4 border-t border-slate-100">
                            <button
                                onClick={handleSave}
                                disabled={saving || !!productionError}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Save size={20} /> {saving ? 'Registrando…' : 'Confirmar Produção'}
                            </button>
                        </div>
                    </div>

                    <section aria-labelledby="production-loss-heading" className="min-w-0 rounded-2xl border border-amber-200 bg-white p-6">
                        <div className="mb-4">
                            <h3 id="production-loss-heading" className="flex items-center gap-2 text-lg font-bold text-slate-800">
                                <AlertTriangle size={20} className="text-amber-600" /> Registro de Perdas
                            </h3>
                            <p className="mt-1 text-sm text-slate-600">A perda é baixada do estoque da Matriz (Ibotirama).</p>
                        </div>
                        <form onSubmit={handleSaveLoss}>
                            <fieldset disabled={savingLoss} className="grid min-w-0 grid-cols-1 gap-4">
                                <label className="min-w-0 text-sm font-bold text-slate-700">
                                    Produto da Perda
                                    <select
                                        value={lossProductId}
                                        onChange={(e) => {
                                            setLossProductId(e.target.value);
                                            setLossQuantity('');
                                            setLossReason('');
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Selecione o produto...</option>
                                        {manufacturedProducts.map(product => (
                                            <option key={product.id} value={product.id}>{product.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="min-w-0 text-sm font-bold text-slate-700">
                                    Quantidade Perdida
                                    <input
                                        type="number"
                                        min="0"
                                        max={Math.max(lossStock, 0)}
                                        step="any"
                                        placeholder="0"
                                        value={lossQuantity}
                                        disabled={!lossProduct}
                                        onChange={(e) => setLossQuantity(e.target.value)}
                                        aria-invalid={!!lossQuantity && !validLoss}
                                        aria-describedby={lossProduct ? 'production-loss-stock' : undefined}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                                    />
                                </label>
                                <label className="min-w-0 text-sm font-bold text-slate-700">
                                    Motivo (Opcional)
                                    <input
                                        type="text"
                                        value={lossReason}
                                        onChange={(e) => setLossReason(e.target.value)}
                                        placeholder="Ex.: descarte por qualidade"
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </label>
                            </fieldset>
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p id="production-loss-stock" className="text-sm text-slate-600" aria-live="polite">
                                    {lossProduct && (
                                        <>
                                            Saldo atual <strong>{quantityFormat.format(lossStock)} {lossProduct.unit}</strong>
                                            {validLoss && <> · Após a baixa <strong>{quantityFormat.format(lossStock - lost)} {lossProduct.unit}</strong></>}
                                            {lost > lossStock && !!lossQuantity && <span className="block text-red-700">A perda excede o saldo disponível.</span>}
                                        </>
                                    )}
                                </p>
                                <button
                                    type="submit"
                                    disabled={savingLoss || !validLoss}
                                    className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 font-bold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Save size={18} /> {savingLoss ? 'Registrando…' : 'Confirmar Perda'}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {canManageProduction && activeTab === 'history' && (
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
                                            <td className="px-6 py-4 font-bold text-blue-600">+{quantityFormat.format(record.quantity)}</td>
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

            {canManageProduction && activeTab === 'stock' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">Estoque de Insumos</h3>
                            <p className="text-slate-500 text-sm">Gerencie a matéria-prima da fábrica.</p>
                        </div>
                        {onAddProduct && (
                            <button
                                onClick={() => setShowInputForm(!showInputForm)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2"
                            >
                                <Plus size={18} /> Novo Insumo
                            </button>
                        )}
                    </div>
                    {showInputForm && (
                        <div className="p-6 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Insumo</label>
                                <input type="text" value={newInput.name} onChange={e => setNewInput({ ...newInput, name: e.target.value })} placeholder="Ex: Energia (kWh)" className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Unidade</label>
                                <input type="text" value={newInput.unit} onChange={e => setNewInput({ ...newInput, unit: e.target.value })} placeholder="Ex: L, kWh, diária" className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Custo Un (R$)</label>
                                <input type="number" step="0.01" value={newInput.cost} onChange={e => setNewInput({ ...newInput, cost: e.target.value })} placeholder="0.00" className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Estoque</label>
                                <input type="number" value={newInput.stock} onChange={e => setNewInput({ ...newInput, stock: e.target.value })} placeholder="0" className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div className="md:col-span-5 flex justify-end gap-2 mt-2">
                                <button onClick={() => setShowInputForm(false)} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-200 font-bold">Cancelar</button>
                                <button onClick={handleAddInput} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 font-bold flex items-center gap-2"><Save size={16} /> Salvar Insumo</button>
                            </div>
                        </div>
                    )}
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
                                            <td className={`px-6 py-4 text-center font-bold text-lg ${item.stockMatrizIbotirama < item.minStock ? 'text-red-600' : 'text-slate-700'}`}>
                                                {item.stockMatrizIbotirama}
                                                {item.stockMatrizIbotirama < item.minStock && <AlertTriangle size={14} className="inline ml-2 text-red-500" />}
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

            {canManageProduction && activeTab === 'recipes' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300 p-6">
                    <h3 className="font-bold text-lg text-slate-800 mb-2 flex items-center gap-2">
                        <Calculator className="text-blue-600" /> Custos de Produção por Unidade
                    </h3>
                    <p className="text-slate-500 text-sm mb-6">Selecione um produto e defina o que é gasto para produzir um lote. O custo unitário será calculado automaticamente.</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Seletor e Configuração do Produto */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Produto Fabricado</label>
                                <select
                                    value={recipeProductId}
                                    onChange={(e) => setRecipeProductId(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 font-medium"
                                >
                                    <option value="">Selecione o produto...</option>
                                    {manufacturedProducts.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {recipeProductId && (
                                <>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Tamanho do Lote Inicial</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={recipeBatchSize}
                                                onChange={(e) => setRecipeBatchSize(e.target.value)}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
                                            />
                                            <span className="text-slate-500">Unidades</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Outros Custos Operacionais (Lote) R$</label>
                                        <input
                                            type="number"
                                            value={operationalCost}
                                            onChange={(e) => setOperationalCost(e.target.value)}
                                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700"
                                            placeholder="Ex: 50.00"
                                        />
                                        <p className="text-xs text-slate-400 mt-1">Custo extra somado ao lote.</p>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Insumos Gastos */}
                        {recipeProductId && (
                            <div className="md:col-span-2 bg-slate-50 p-6 rounded-xl border border-slate-200 h-full flex flex-col">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-slate-700 flex items-center gap-2">
                                        <Boxes size={18} className="text-orange-500" /> Insumos do Lote
                                    </h4>
                                    <button
                                        onClick={() => setRecipeItems([...recipeItems, { ingredientId: '', quantity: '1' }])}
                                        className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                        <Plus size={16} /> Adicionar Insumo
                                    </button>
                                </div>

                                <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] mb-4">
                                    {recipeItems.map((item, index) => (
                                        <div key={index} className="flex gap-2 items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                            <select
                                                value={item.ingredientId}
                                                onChange={(e) => {
                                                    const newI = [...recipeItems];
                                                    newI[index].ingredientId = e.target.value;
                                                    setRecipeItems(newI);
                                                }}
                                                className="flex-1 px-3 py-2 border border-slate-200 rounded-md outline-none text-sm font-medium focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="">Selecione...</option>
                                                {rawMaterials.map(rm => (
                                                    <option key={rm.id} value={rm.id}>{rm.name} ({rm.unit}) - R$ {rm.cost}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => {
                                                    const newI = [...recipeItems];
                                                    newI[index].quantity = e.target.value;
                                                    setRecipeItems(newI);
                                                }}
                                                className="w-24 px-3 py-2 border border-slate-200 rounded-md outline-none text-sm text-right focus:ring-2 focus:ring-blue-500"
                                                placeholder="Qtd"
                                            />
                                            <button
                                                onClick={() => setRecipeItems(recipeItems.filter((_, i) => i !== index))}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    {recipeItems.length === 0 && (
                                        <p className="text-slate-400 text-sm italic text-center py-4">Nenhum insumo configurado para este lote.</p>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-slate-200 mt-auto">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="font-bold text-slate-700">Custo Total do Lote:</span>
                                        <span className="font-bold text-lg text-slate-800">
                                            {recipeCosts ? `R$ ${recipeCosts.batchCost.toFixed(2)}` : '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                                        <span className="font-bold text-blue-900">Custo Unitário Calculado:</span>
                                        <span className="font-black text-2xl text-blue-700">
                                            {recipeCosts ? `R$ ${recipeCosts.unitCost.toFixed(4)}` : '—'}
                                        </span>
                                    </div>
                                    {recipeError && <p role="alert" className="mt-3 text-sm text-red-700">{recipeError}</p>}
                                    <button
                                        onClick={handleSaveRecipe}
                                        disabled={savingRecipe || !recipeCosts}
                                        className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
                                    >
                                        <Save size={18} /> {savingRecipe ? 'Salvando...' : 'Salvar e Atualizar Custo'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}


        </div>
    );
};

export default Production;
