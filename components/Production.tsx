import React, { useState, useEffect } from 'react';
import { Product, ProductionRecord, Shift, Branch, User } from '../types';
import { dbProduction, dbProducts, dbStockMovements } from '../services/db';
import { getTodayDate } from '../services/utils';
import { Plus, Save, Clock, User as UserIcon, Package, Calendar, ArrowLeft, Trash2 } from 'lucide-react';

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
    const [shift, setShift] = useState<Shift>('Manhã');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        loadRecords();
    }, []);

    const loadRecords = async () => {
        try {
            const data = await dbProduction.getAll();
            setRecords(data);
        } catch (error) {
            console.error("Erro ao carregar produção:", error);
            alert("Erro ao carregar histórico de produção.");
        } finally {
            setLoading(false);
        }
    };

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
            await dbProduction.add(newRecord);

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
            });

            // 4. Deduct Raw Materials (Recipe)
            if (product.recipe && product.recipe.length > 0) {
                for (const item of product.recipe) {
                    const ingredient = products.find(p => p.id === item.ingredientId);
                    if (ingredient) {
                        const totalRequired = item.quantity * Number(quantity);

                        // Update Ingredient Stock
                        const updatedIngredient = {
                            ...ingredient,
                            stockMatriz: ingredient.stockMatriz - totalRequired
                        };
                        await dbProducts.update(updatedIngredient);
                        onUpdateProduct(updatedIngredient); // Update local state if needed

                        // Register Ingredient Movement
                        await dbStockMovements.add({
                            id: Date.now().toString() + `-mov-out-${ingredient.id}`,
                            date: new Date().toISOString(),
                            productId: ingredient.id,
                            productName: ingredient.name,
                            quantity: totalRequired,
                            type: 'TRANSFER_OUT', // Saída por Uso/Produção
                            reason: `Insumo para Produção de ${product.name} (Lote: ${quantity})`,
                            branch: Branch.MATRIZ
                        });
                    }
                }
            }

            alert("Produção registrada com sucesso! Estoque atualizado.");
            setShowForm(false);
            setQuantity('');
            setNotes('');
            loadRecords(); // Refresh list
        } catch (error) {
            console.error("Erro ao salvar produção:", error);
            alert("Erro ao salvar registro.");
        }
    };

    // Filter only manufactured products (Ice)
    const manufacturedProducts = products.filter(p => p.category.includes('Gelo'));

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
                <button
                    onClick={() => setShowForm(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                    <Plus size={20} /> Nova Produção
                </button>
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-blue-100 animate-in zoom-in-95 duration-200">
                    <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                        <Package className="text-blue-600" /> Registrar Produção
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Produto</label>
                            <select
                                value={selectedProductId}
                                onChange={(e) => setSelectedProductId(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="">Selecione...</option>
                                {manufacturedProducts.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Quantidade Produzida</label>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Turno</label>
                            <select
                                value={shift}
                                onChange={(e) => setShift(e.target.value as Shift)}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="Manhã">Manhã</option>
                                <option value="Tarde">Tarde</option>
                                <option value="Noite">Noite</option>
                                <option value="Madrugada">Madrugada</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Observações (Opcional)</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: Máquina 2 parada..."
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold shadow-sm transition-colors flex items-center gap-2"
                        >
                            <Save size={18} /> Salvar Registro
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
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
        </div>
    );
};

export default Production;
