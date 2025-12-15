import React, { useState, useEffect } from 'react';
import { Product, Branch } from '../types';
import { ArrowLeft, Calculator, DollarSign, TrendingUp, AlertCircle, Save, Percent } from 'lucide-react';

interface PricingProps {
    products: Product[];
    onUpdateProduct: (product: Product) => void;
    onBack: () => void;
}

const Pricing: React.FC<PricingProps> = ({ products, onUpdateProduct, onBack }) => {
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [selectedBranch, setSelectedBranch] = useState<Branch>(Branch.MATRIZ);

    // Pricing Factors (Percentages)
    const [taxRate, setTaxRate] = useState<number>(4); // Simples Nacional approx
    const [cardFee, setCardFee] = useState<number>(2); // Avg card fee
    const [fixedCostRate, setFixedCostRate] = useState<number>(10); // Estimated fixed cost contribution
    const [desiredMargin, setDesiredMargin] = useState<number>(20); // Target Net Profit

    // Calculated Values
    const [costPrice, setCostPrice] = useState<number>(0);
    const [suggestedPrice, setSuggestedPrice] = useState<number>(0);
    const [currentPrice, setCurrentPrice] = useState<number>(0);

    const selectedProduct = products.find(p => p.id === selectedProductId);

    useEffect(() => {
        if (selectedProduct) {
            setCostPrice(selectedProduct.cost || 0);
            setCurrentPrice(selectedBranch === Branch.MATRIZ ? selectedProduct.priceMatriz : selectedProduct.priceFilial);
        }
    }, [selectedProduct, selectedBranch]);

    useEffect(() => {
        calculatePrice();
    }, [costPrice, taxRate, cardFee, fixedCostRate, desiredMargin]);

    const calculatePrice = () => {
        // Markup Calculation Method
        // Price = Cost / (1 - (Total Percentages / 100))

        const totalDeductions = taxRate + cardFee + fixedCostRate + desiredMargin;

        // Safety check to prevent division by zero or negative prices if deductions >= 100%
        if (totalDeductions >= 100) {
            setSuggestedPrice(0);
            return;
        }

        const divisor = 1 - (totalDeductions / 100);
        const calculated = costPrice / divisor;
        setSuggestedPrice(calculated);
    };

    const handleApplyPrice = () => {
        if (!selectedProduct) return;

        const updatedProduct = { ...selectedProduct };
        if (selectedBranch === Branch.MATRIZ) {
            updatedProduct.priceMatriz = Number(suggestedPrice.toFixed(2));
        } else {
            updatedProduct.priceFilial = Number(suggestedPrice.toFixed(2));
        }

        onUpdateProduct(updatedProduct);
        alert(`Preço atualizado com sucesso para ${selectedBranch}!`);
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
                        <h2 className="text-2xl font-bold text-slate-800">Precificação Inteligente</h2>
                        <p className="text-slate-500">Cálculo de preço baseado em custos e margem (Markup).</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* CONFIGURATION PANEL */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Product & Branch Selection */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <Calculator size={20} className="text-blue-600" /> 1. Seleção
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Produto</label>
                                <select
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                    value={selectedProductId}
                                    onChange={(e) => setSelectedProductId(e.target.value)}
                                >
                                    <option value="">Selecione um produto...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Unidade de Venda</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button
                                        onClick={() => setSelectedBranch(Branch.MATRIZ)}
                                        className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all ${selectedBranch === Branch.MATRIZ ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        Matriz (Atacado)
                                    </button>
                                    <button
                                        onClick={() => setSelectedBranch(Branch.FILIAL)}
                                        className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all ${selectedBranch === Branch.FILIAL ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        Filial (Varejo)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Costs & Variables */}
                    <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-opacity ${!selectedProduct ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <DollarSign size={20} className="text-emerald-600" /> 2. Custos e Despesas
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Custo do Produto (CMV)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                                    <input
                                        type="number"
                                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={costPrice}
                                        onChange={(e) => setCostPrice(Number(e.target.value))}
                                    />
                                </div>
                                <p className="text-xs text-slate-400 mt-1">Valor de compra ou produção.</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1 flex justify-between">
                                        <span>Impostos (Simples/ICMS)</span>
                                        <span className="text-blue-600">{taxRate}%</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="30"
                                        step="0.5"
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        value={taxRate}
                                        onChange={(e) => setTaxRate(Number(e.target.value))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1 flex justify-between">
                                        <span>Taxas (Cartão/Comissões)</span>
                                        <span className="text-blue-600">{cardFee}%</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="20"
                                        step="0.5"
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        value={cardFee}
                                        onChange={(e) => setCardFee(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Margin & Fixed Costs */}
                    <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-opacity ${!selectedProduct ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <TrendingUp size={20} className="text-purple-600" /> 3. Margem e Custos Fixos
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1 flex justify-between">
                                    <span>Rateio Custos Fixos</span>
                                    <span className="text-purple-600">{fixedCostRate}%</span>
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="50"
                                    step="1"
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    value={fixedCostRate}
                                    onChange={(e) => setFixedCostRate(Number(e.target.value))}
                                />
                                <p className="text-xs text-slate-400 mt-1">Aluguel, Energia, Salários, etc.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1 flex justify-between">
                                    <span>Margem de Lucro Líquida</span>
                                    <span className="text-emerald-600">{desiredMargin}%</span>
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                                    value={desiredMargin}
                                    onChange={(e) => setDesiredMargin(Number(e.target.value))}
                                />
                                <p className="text-xs text-slate-400 mt-1">O quanto você quer lucrar livre.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RESULTS PANEL */}
                <div className="lg:col-span-1">
                    <div className={`bg-slate-900 text-white p-6 rounded-2xl shadow-xl sticky top-6 ${!selectedProduct ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="font-bold text-xl mb-6 flex items-center gap-2">
                            <AlertCircle size={24} className="text-yellow-400" /> Resultado
                        </h3>

                        <div className="space-y-4 mb-8">
                            <div className="flex justify-between items-center text-slate-300 text-sm">
                                <span>Preço Atual</span>
                                <span className="font-medium line-through decoration-red-500 decoration-2">{formatCurrency(currentPrice)}</span>
                            </div>

                            <div className="border-t border-slate-700 my-2"></div>

                            <div className="flex justify-between items-center text-emerald-400">
                                <span>Custo (CMV)</span>
                                <span>{formatCurrency(costPrice)}</span>
                            </div>
                            <div className="flex justify-between items-center text-rose-400">
                                <span>Despesas Variáveis ({taxRate + cardFee}%)</span>
                                <span>{formatCurrency(suggestedPrice * ((taxRate + cardFee) / 100))}</span>
                            </div>
                            <div className="flex justify-between items-center text-purple-400">
                                <span>Custos Fixos ({fixedCostRate}%)</span>
                                <span>{formatCurrency(suggestedPrice * (fixedCostRate / 100))}</span>
                            </div>
                            <div className="flex justify-between items-center text-emerald-400 font-bold">
                                <span>Lucro Líquido ({desiredMargin}%)</span>
                                <span>{formatCurrency(suggestedPrice * (desiredMargin / 100))}</span>
                            </div>
                        </div>

                        <div className="bg-slate-800 p-4 rounded-xl text-center mb-6 border border-slate-700">
                            <p className="text-slate-400 text-sm mb-1">Preço Sugerido de Venda</p>
                            <h2 className="text-4xl font-bold text-white">{formatCurrency(suggestedPrice)}</h2>
                            {suggestedPrice > 0 && (
                                <p className={`text-xs mt-2 font-bold ${suggestedPrice > currentPrice ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                    {suggestedPrice > currentPrice
                                        ? `+${formatCurrency(suggestedPrice - currentPrice)} vs Atual`
                                        : `${formatCurrency(suggestedPrice - currentPrice)} vs Atual`}
                                </p>
                            )}
                        </div>

                        <button
                            onClick={handleApplyPrice}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Save size={20} /> Aplicar Preço
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Pricing;
