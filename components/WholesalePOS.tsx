import React, { useState, useMemo } from 'react';
import { Product, Sale, Customer, User, Branch, SaleItem } from '../types';
import { ShoppingCart, LogOut, User as UserIcon, Plus, Minus, Search, CheckCircle, ArrowLeft, History, Store, MapPin, Edit, Trash2, Save, X } from 'lucide-react';

interface WholesalePOSProps {
    products: Product[];
    sales: Sale[];
    customers: Customer[];
    currentUser: User;
    onAddSale: (sale: Sale) => Promise<void>;
    onAddCustomer: (customer: Customer) => Promise<void>;
    onLogout: () => void;
    onUpdateSale?: (sale: Sale) => Promise<void>;
    onDeleteSale?: (saleId: string) => Promise<void>;
    onBack?: () => void;
}

const WholesalePOS: React.FC<WholesalePOSProps> = ({
    products,
    sales,
    customers,
    currentUser,
    onAddSale,
    onAddCustomer,
    onLogout,
    onUpdateSale,
    onDeleteSale,
    onBack
}) => {
    const [activeTab, setActiveTab] = useState<'CATALOG' | 'CART' | 'HISTORY'>('CATALOG');
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'Gelo Cubo' | 'Gelo Sabor'>('ALL');

    // Cart State
    const [cart, setCart] = useState<{ product: Product, quantity: number }[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    // Checkout State
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'Pix' | 'Credit' | 'Debit' | 'Cash' | 'Split'>('Pix');

    // Edit Sale State
    const [showEditSaleModal, setShowEditSaleModal] = useState(false);
    const [editingSale, setEditingSale] = useState<Sale | null>(null);

    // Filter products for Wholesale (only Gelo Cubo and Gelo Sabor)
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const isWholesaleCategory = p.category === 'Gelo Cubo' || p.category === 'Gelo Sabor';
            const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());

            return isWholesaleCategory && matchesCategory && matchesSearch;
        }).sort((a, b) => a.category.localeCompare(b.category));
    }, [products, searchTerm, categoryFilter]);

    // My Sales History
    const mySales = useMemo(() => {
        // Only consider Wholesale sales
        let relevantSales = sales.filter(s => s.source === 'WHOLESALE_POS');

        if (currentUser.role === 'WHOLESALE_SUPERVISOR') {
            // Supervisor sees their own and representative sales
            return relevantSales.filter(s => s.sellerId === currentUser.id || s.sellerRole === 'WHOLESALE_REPRESENTATIVE')
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        } else if (currentUser.role === 'WHOLESALE_REPRESENTATIVE') {
            // Representative sees only their own
            return relevantSales.filter(s => s.sellerId === currentUser.id)
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        }

        // Admins can see all if they somehow use the POS
        return relevantSales.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }, [sales, currentUser]);

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            if (existing) {
                return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { product, quantity: 1 }];
        });
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === productId);
            if (existing && existing.quantity > 1) {
                return prev.map(item => item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item);
            }
            return prev.filter(item => item.product.id !== productId);
        });
    };

    const updateQuantity = (productId: string, quantity: number) => {
        if (quantity < 1) {
            setCart(prev => prev.filter(item => item.product.id !== productId));
            return;
        }
        setCart(prev => prev.map(item => item.product.id === productId ? { ...item, quantity } : item));
    };

    // Calculate dynamic pricing for "Gelo Sabor" based on total volume
    const totalFlavoredIce = useMemo(() => {
        return cart.reduce((acc, item) => item.product.category === 'Gelo Sabor' ? acc + item.quantity : acc, 0);
    }, [cart]);

    const getTieredPrice = (volume: number) => {
        if (volume >= 5000) return 1.50;
        if (volume >= 2000) return 1.60;
        if (volume >= 1000) return 1.70;
        if (volume >= 200) return 1.80;
        return 2.00;
    };

    const currentFlavoredTierPrice = getTieredPrice(totalFlavoredIce);

    const getProductPrice = (product: Product) => {
        return product.category === 'Gelo Sabor' ? currentFlavoredTierPrice : product.priceMatriz;
    };

    const cartTotal = cart.reduce((acc, item) => acc + (getProductPrice(item.product) * item.quantity), 0);

    const handleFinishSale = async () => {
        if (cart.length === 0) return alert("Carrinho vazio!");
        if (!selectedCustomer) return alert("Selecione um cliente para o atacado.");

        const saleItems: SaleItem[] = cart.map(({ product, quantity }) => ({
            productId: product.id,
            productName: product.name,
            quantity,
            priceAtSale: getProductPrice(product),
        }));

        const isSupervisor = currentUser.role === 'WHOLESALE_SUPERVISOR';
        const isRepresentative = currentUser.role === 'WHOLESALE_REPRESENTATIVE';
        const commissionRate = isSupervisor ? 0.05 : isRepresentative ? 0.03 : 0;
        const commissionAmount = cartTotal * commissionRate;

        const newSale: Sale = {
            id: crypto.randomUUID(),
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            customerName: selectedCustomer.name,
            total: cartTotal,
            items: saleItems,
            branch: Branch.MATRIZ,
            status: 'Pending', // Envia como Pendente para o ADM conferir estoque e pagamento
            paymentMethod,
            hasInvoice: false,
            source: 'WHOLESALE_POS',
            amountPaid: 0, // Inicia como 0, pois o ADM confirma recebimento
            sellerId: currentUser.id,
            sellerName: currentUser.name,
            sellerRole: currentUser.role,
            commissionAmount: commissionAmount,
        };

        try {
            await onAddSale(newSale);
            alert("Pedido lançado com sucesso!");
            setCart([]);
            setSelectedCustomer(null);
            setIsCheckingOut(false);
            setActiveTab('CATALOG');
        } catch (e) {
            console.error(e);
            alert("Erro ao lançar pedido.");
        }
    };

    const updateEditingItem = (index: number, field: string, value: any) => {
        if (!editingSale) return;
        const items = [...editingSale.items];
        items[index] = { ...items[index], [field]: value || 0 };
        setEditingSale({ ...editingSale, items });
    };

    const removeEditingItem = (index: number) => {
        if (!editingSale) return;
        const items = editingSale.items.filter((_, i) => i !== index);
        setEditingSale({ ...editingSale, items });
    };

    const handleSaveEditedSale = async () => {
        if (!editingSale || !onUpdateSale) return;

        const total = editingSale.items.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0);
        const commissionRate = editingSale.sellerRole === 'WHOLESALE_SUPERVISOR' ? 0.05 : editingSale.sellerRole === 'WHOLESALE_REPRESENTATIVE' ? 0.03 : 0;
        const commissionAmount = total * commissionRate;

        try {
            await onUpdateSale({
                ...editingSale,
                total,
                commissionAmount
            });
            setShowEditSaleModal(false);
            setEditingSale(null);
            alert("Pedido atualizado com sucesso!");
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar alterações.");
        }
    };

    // ---------------- UI RENDERS ----------------

    const renderCatalog = () => (
        <div className="p-4 pb-24">
            <div className="relative mb-6">
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Filtrar por Categoria</label>
                <div className="flex bg-slate-100 rounded-2xl p-1 gap-1 border border-slate-200 shadow-inner mb-3">
                    <button
                        onClick={() => setCategoryFilter('ALL')}
                        className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${categoryFilter === 'ALL' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                        TODOS
                    </button>
                    <button
                        onClick={() => setCategoryFilter('Gelo Cubo')}
                        className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${categoryFilter === 'Gelo Cubo' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                        CUBO
                    </button>
                    <button
                        onClick={() => setCategoryFilter('Gelo Sabor')}
                        className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${categoryFilter === 'Gelo Sabor' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                        SABOR
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder={`Buscar em ${categoryFilter === 'ALL' ? 'Gelo Atacado' : categoryFilter}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* Display Current Tier Info for Gelo Sabor */}
            {totalFlavoredIce > 0 && (
                <div className="mb-6 bg-orange-100/50 border border-orange-200 rounded-xl p-3 shadow-inner">
                    <p className="text-xs font-bold text-orange-800 uppercase tracking-widest mb-1 flex justify-between">
                        <span>Lote de Gelo Sabor</span>
                        <span>{totalFlavoredIce} unid.</span>
                    </p>
                    <div className="relative h-2 bg-orange-200 rounded-full overflow-hidden mb-2">
                        <div className="absolute top-0 left-0 h-full bg-orange-500 transition-all" style={{ width: `${Math.min((totalFlavoredIce / 5000) * 100, 100)}%` }}></div>
                    </div>
                    <p className="text-sm font-black text-orange-900">Preço Atual: R$ {currentFlavoredTierPrice.toFixed(2)} /unid</p>
                    <p className="text-[10px] text-orange-700 font-medium">Até 190: R$2.00 | 200+: R$1.80 | 1k+: R$1.70 | 2k+: R$1.60 | 5k+: R$1.50</p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map(product => {
                    const cartItem = cart.find(c => c.product.id === product.id);
                    const totalStock = product.stockMatrizIbotirama + product.stockMatrizBarreiras;

                    return (
                        <div
                            key={product.id}
                            onClick={() => !cartItem && addToCart(product)}
                            className={`bg-white p-3 rounded-2xl shadow-sm border-2 transition-all group flex flex-col justify-between cursor-pointer ${cartItem ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100 hover:border-blue-300 hover:shadow-xl active:scale-95'}`}
                        >
                            <div>
                                <div className="flex justify-between items-start mb-1">
                                    <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest">{product.category}</p>
                                    {cartItem && (
                                        <div className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">
                                            {cartItem.quantity} No Carrinho
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-bold text-slate-800 leading-tight mb-1 text-sm group-hover:text-blue-700 transition-colors">{product.name}</h3>
                                <p className="text-lg font-black text-slate-900 mb-2 tracking-tighter">
                                    R$ {getProductPrice(product).toFixed(2)}
                                    {product.category === 'Gelo Sabor' && <span className="text-[10px] text-orange-500 ml-1 font-bold italic">dinâmico</span>}
                                </p>
                            </div>

                            {cartItem ? (
                                <div className="flex flex-col gap-1 mt-auto" onClick={(e) => e.stopPropagation()}>
                                    {product.category === 'Gelo Sabor' && (
                                        <div className="flex gap-1 mb-1">
                                            <button onClick={() => updateQuantity(product.id, cartItem.quantity + 10)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-1.5 rounded-lg transition-all">+10</button>
                                            <button onClick={() => updateQuantity(product.id, cartItem.quantity + 50)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-1.5 rounded-lg transition-all">+50</button>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between bg-blue-50 rounded-xl p-1.5 border border-blue-100 shadow-inner">
                                        <button onClick={() => updateQuantity(product.id, cartItem.quantity - 1)} className="w-9 h-9 flex items-center justify-center bg-white text-blue-600 rounded-lg shadow-sm font-black active:scale-90 transition-all border border-blue-100">-</button>
                                        <input
                                            type="number"
                                            value={cartItem.quantity || ''}
                                            onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 0)}
                                            onFocus={(e) => e.target.select()}
                                            className="w-12 text-center font-black text-blue-900 bg-transparent outline-none hide-arrows text-lg"
                                        />
                                        <button onClick={() => updateQuantity(product.id, cartItem.quantity + 1)} className="w-9 h-9 flex items-center justify-center bg-blue-600 text-white rounded-lg shadow-lg font-black active:scale-90 transition-all shadow-blue-200">+</button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 hover:bg-blue-600 hover:shadow-xl shadow-blue-200 active:scale-90 group-hover:bg-blue-600"
                                >
                                    <Plus size={16} strokeWidth={3} /> Adicionar
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );

    const renderCart = () => {
        if (cart.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 p-6 text-center">
                    <ShoppingCart size={64} className="mb-4 text-slate-300" />
                    <h2 className="text-xl font-bold mb-2">Carrinho Vazio</h2>
                    <p>Adicione produtos pelo catálogo para iniciar um pedido.</p>
                    <button onClick={() => setActiveTab('CATALOG')} className="mt-6 px-6 py-2 bg-orange-500 text-white font-bold rounded-lg shadow-lg">
                        Ir para Catálogo
                    </button>
                </div>
            );
        }

        if (isCheckingOut) {
            return (
                <div className="p-4 pb-24 animate-in fade-in slide-in-from-right-4 duration-300">
                    <button onClick={() => setIsCheckingOut(false)} className="flex items-center gap-2 text-slate-500 mb-6 font-medium">
                        <ArrowLeft size={18} /> Voltar ao Carrinho
                    </button>

                    <h2 className="text-2xl font-black text-slate-800 mb-6">Finalizar Pedido</h2>

                    <div className="space-y-6">
                        {/* Customer Selection */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                            <label className="block text-sm font-bold text-slate-700 mb-3">Cliente (Atacado)</label>
                            <select
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-orange-500 font-medium text-slate-700"
                                value={selectedCustomer?.id || ''}
                                onChange={(e) => {
                                    const c = customers.find(cus => cus.id === e.target.value);
                                    setSelectedCustomer(c || null);
                                }}
                            >
                                <option value="">-- Selecione o Cliente --</option>
                                {customers.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} {c.city ? `(${c.city})` : ''}</option>
                                ))}
                            </select>
                        </div>

                        {/* Payment Method */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                            <label className="block text-sm font-bold text-slate-700 mb-3">Forma de Pagamento</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['Pix', 'Cash', 'Credit', 'Split'].map(method => (
                                    <button
                                        key={method}
                                        onClick={() => setPaymentMethod(method as any)}
                                        className={`py-3 px-2 rounded-lg font-bold text-sm border-2 flex items-center justify-center transition-all ${paymentMethod === method ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-300'}`}
                                    >
                                        {method === 'Pix' && 'PIX'}
                                        {method === 'Cash' && 'Dinheiro'}
                                        {method === 'Credit' && 'Cartão'}
                                        {method === 'Split' && 'Fiado / Prazo'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg mt-8">
                            <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
                                <span className="text-slate-300 font-medium">Sua Comissão ({currentUser.role === 'WHOLESALE_SUPERVISOR' ? '5%' : '3%'}):</span>
                                <span className="text-xl font-bold text-green-400">R$ {(cartTotal * (currentUser.role === 'WHOLESALE_SUPERVISOR' ? 0.05 : currentUser.role === 'WHOLESALE_REPRESENTATIVE' ? 0.03 : 0)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center mt-3">
                                <span className="text-slate-300">Total do Pedido:</span>
                                <span className="text-2xl font-black text-orange-400">R$ {cartTotal.toFixed(2)}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-2 text-right italic">* O estoque e o recebimento serão conferidos pelo ADM.</p>
                        </div>

                        <button
                            onClick={handleFinishSale}
                            className="w-full bg-green-500 hover:bg-green-600 active:scale-95 text-white py-4 rounded-xl font-black text-lg shadow-xl shadow-green-900/20 transition-all flex items-center justify-center gap-2 mt-4"
                        >
                            <CheckCircle size={24} /> Confirmar Pedido
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="p-4 pb-24">
                <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
                    <ShoppingCart /> Carrinho
                </h2>

                <div className="space-y-3 mb-6">
                    {cart.map((item, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div className="flex-1">
                                <h4 className="font-bold text-slate-800 leading-tight">{item.product.name}</h4>
                                <p className="text-green-600 font-bold text-sm">
                                    R$ {getProductPrice(item.product).toFixed(2)}
                                    {item.product.category === 'Gelo Sabor' && <span className="text-[10px] text-orange-500 ml-1">dinâmico</span>}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-100">
                                <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-slate-500 font-bold text-xl active:scale-95">-</button>
                                <input
                                    type="number"
                                    value={item.quantity || ''}
                                    onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                                    onFocus={(e) => e.target.select()}
                                    className="w-10 text-center font-bold text-slate-800 bg-transparent outline-none hide-arrows"
                                />
                                <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-orange-500 font-bold text-xl active:scale-95">+</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="fixed bottom-20 left-4 right-4 z-10">
                    <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-200 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase">Total</p>
                            <p className="text-2xl font-black text-slate-800">R$ {cartTotal.toFixed(2)}</p>
                        </div>
                        <button
                            onClick={() => setIsCheckingOut(true)}
                            className="bg-orange-500 active:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-all"
                        >
                            Avançar <ArrowLeft size={18} className="rotate-180" />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderHistory = () => {
        // Calculate accrued totals for this user to display in the header of the history
        let ownSalesTotal = 0;
        let ownCommissionTotal = 0;
        let teamSalesTotal = 0;
        let teamCommissionTotal = 0;

        mySales.forEach(s => {
            if (s.sellerId === currentUser.id) {
                ownSalesTotal += s.total;
                ownCommissionTotal += s.total * (currentUser.role === 'WHOLESALE_SUPERVISOR' ? 0.05 : 0.03);
            } else if (currentUser.role === 'WHOLESALE_SUPERVISOR' && s.sellerRole === 'WHOLESALE_REPRESENTATIVE') {
                teamSalesTotal += s.total;
                teamCommissionTotal += s.total * 0.02; // Supervisor earns 2% on rep's sales
            }
        });

        const totalCommission = ownCommissionTotal + teamCommissionTotal;

        return (
            <div className="p-4 pb-24">
                <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
                    <History /> Minhas Vendas
                </h2>

                <div className="bg-green-600 text-white p-4 rounded-xl shadow-lg mb-6">
                    <p className="text-sm font-medium text-green-100 uppercase tracking-widest mb-1">Total de Comissões</p>
                    <p className="text-3xl font-black">R$ {totalCommission.toFixed(2)}</p>

                    {currentUser.role === 'WHOLESALE_SUPERVISOR' && teamCommissionTotal > 0 && (
                        <div className="mt-4 pt-3 border-t border-green-500/50 flex justify-between text-xs font-bold text-green-100">
                            <span>Próprias (5%): R$ {ownCommissionTotal.toFixed(2)}</span>
                            <span>Equipe (2%): R$ {teamCommissionTotal.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {mySales.length === 0 ? (
                    <div className="text-center text-slate-500 py-10">
                        Nenhuma venda encontrada.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {mySales.map(sale => {
                            const isMySale = sale.sellerId === currentUser.id;
                            const saleName = isMySale ? 'Sua Venda' : `Vendedor: ${sale.sellerName?.split(' ')[0] || 'Vendedor'}`;
                            const saleCommission = isMySale ? sale.total * (currentUser.role === 'WHOLESALE_SUPERVISOR' ? 0.05 : 0.03) : sale.total * 0.02;

                            return (
                                <div key={sale.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-bold text-slate-800">{sale.customerName}</h4>
                                            <p className="text-xs text-slate-500">{new Date(sale.createdAt || sale.date).toLocaleString('pt-BR')}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs font-bold block mb-1">R$ {sale.total.toFixed(2)}</span>
                                            <span className="text-green-600 font-bold text-xs block">+ R$ {saleCommission.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3 items-center justify-between">
                                        <div className="flex gap-2">
                                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md ${isMySale ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                {saleName}
                                            </span>
                                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium uppercase">{sale.paymentMethod}</span>
                                        </div>
                                        {/* Edit / Delete Buttons */}
                                        <div className="flex gap-2">
                                            {onUpdateSale && (
                                                <button
                                                    onClick={() => { setEditingSale({ ...sale }); setShowEditSaleModal(true); }}
                                                    className="p-1 px-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded flex items-center gap-1 font-bold transition-all"
                                                >
                                                    <Edit size={12} /> Editar
                                                </button>
                                            )}
                                            {onDeleteSale && (
                                                <button
                                                    onClick={() => onDeleteSale(sale.id)}
                                                    className="p-1 px-2 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded flex items-center gap-1 font-bold transition-all"
                                                >
                                                    <Trash2 size={12} /> Excluir
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Top Header */}
            <header className="bg-blue-900 text-white p-4 flex items-center justify-between shadow-md sticky top-0 z-20 w-full h-16">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button onClick={onBack} className="p-1 hover:bg-white/10 rounded-md transition-colors">
                            <ArrowLeft size={18} />
                        </button>
                    )}
                    <div className="bg-white p-1 rounded">
                        <img src="/logo.png" alt="Logo" className="h-6 w-auto object-contain" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="font-black leading-none text-md">Pedidos</h1>
                        <p className="text-[9px] text-blue-200 uppercase tracking-widest font-bold">Atacado</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-right">
                        <p className="text-sm font-bold truncate max-w-[80px]">{currentUser.name.split(' ')[0]}</p>
                        <p className="text-[10px] text-blue-300">Vendedor</p>
                    </div>
                    <button onClick={onLogout} className="p-2 hover:bg-red-500/20 text-red-200 hover:text-red-100 rounded-full transition-colors" aria-label="Sair">
                        <LogOut size={18} />
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto">
                {activeTab === 'CATALOG' && renderCatalog()}
                {activeTab === 'CART' && renderCart()}
                {activeTab === 'HISTORY' && renderHistory()}
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                <button
                    onClick={() => { setActiveTab('CATALOG'); setIsCheckingOut(false); }}
                    className={`flex flex-col items-center p-2 px-4 rounded-xl transition-all ${activeTab === 'CATALOG' ? 'text-orange-500 bg-orange-50' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <Store size={24} className="mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Produtos</span>
                </button>

                <button
                    onClick={() => setActiveTab('CART')}
                    className={`relative flex flex-col items-center p-2 px-4 rounded-xl transition-all ${activeTab === 'CART' ? 'text-orange-500 bg-orange-50' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <div className="relative">
                        <ShoppingCart size={24} className="mb-1" />
                        {cart.length > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                                {cart.reduce((a, b) => a + b.quantity, 0)}
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide">Carrinho</span>
                </button>

                <button
                    onClick={() => { setActiveTab('HISTORY'); setIsCheckingOut(false); }}
                    className={`flex flex-col items-center p-2 px-4 rounded-xl transition-all ${activeTab === 'HISTORY' ? 'text-orange-500 bg-orange-50' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <History size={24} className="mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">Vendas</span>
                </button>
            </nav>
            {/* Edit Sale Modal */}
            {showEditSaleModal && editingSale && (
                <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-10 pb-4 px-4 overflow-y-auto animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden mb-10">
                        <div className="p-4 bg-orange-600 text-white flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2">
                                <Edit size={20} /> Editar Pedido #{editingSale.id.substring(0, 6)}
                            </h3>
                            <button onClick={() => setShowEditSaleModal(false)} className="hover:text-orange-200 transition-colors"><X size={20} /></button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                                <select
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                                    value={editingSale.status}
                                    onChange={(e) => setEditingSale({ ...editingSale, status: e.target.value as any })}
                                >
                                    <option value="Completed">Concluído</option>
                                    <option value="Pending">Pendente</option>
                                    <option value="Cancelled">Cancelado</option>
                                </select>
                            </div>

                            <div className="border-t border-slate-200 pt-3">
                                <label className="block text-sm font-bold text-slate-700 mb-2">Itens do Pedido</label>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                    {editingSale.items.map((item, index) => (
                                        <div key={index} className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                                            <div className="flex-1">
                                                <p className="text-xs font-bold text-slate-700 truncate">{item.productName}</p>
                                            </div>
                                            <div className="w-20">
                                                <label className="text-[10px] text-slate-500 block">Qtd</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-orange-500 outline-none"
                                                    value={item.quantity}
                                                    onChange={(e) => updateEditingItem(index, 'quantity', parseFloat(e.target.value))}
                                                />
                                            </div>
                                            <div className="w-24">
                                                <label className="text-[10px] text-slate-500 block">Valor Un.</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-orange-500 outline-none"
                                                    value={item.priceAtSale}
                                                    onChange={(e) => updateEditingItem(index, 'priceAtSale', parseFloat(e.target.value))}
                                                />
                                            </div>
                                            <button
                                                onClick={() => removeEditingItem(index)}
                                                className="text-red-500 hover:bg-red-100 p-1.5 rounded transition-colors mt-3"
                                                title="Remover item"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between items-center mt-3 bg-slate-100 p-3 rounded-lg border border-slate-200">
                                    <span className="text-sm font-bold text-slate-700">Novo Total:</span>
                                    <span className="text-xl font-black text-orange-600">
                                        R$ {editingSale.items.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={handleSaveEditedSale}
                                className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-900/10 mt-2 active:scale-95 transition-all"
                            >
                                <Save size={20} /> Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Default Export
export default WholesalePOS;
