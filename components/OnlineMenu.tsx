import React, { useState, useEffect } from 'react';
import { Product, Sale, Branch, StoreSettings, Order } from '../types';
import { ShoppingCart, Minus, Plus, X, Search, Clock, Store, CreditCard, Send, CheckCircle, Users, Truck, DollarSign } from 'lucide-react';
import { dbProducts, dbSales, dbSettings, dbOrders } from '../services/db';
import { getTodayDate } from '../services/utils';

interface CartItem {
    product: Product;
    quantity: number;
}

interface OnlineMenuProps {
    onBack?: () => void; // Optional, as it might be standalone
}

const OnlineMenu: React.FC<OnlineMenuProps> = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
    const [isLoading, setIsLoading] = useState(true);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Checkout State
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
    const [address, setAddress] = useState('');
    const [referencePoint, setReferencePoint] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CARD' | 'CASH'>('PIX');
    const [changeFor, setChangeFor] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);

    // Settings
    const [settings, setSettings] = useState<StoreSettings | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const params = new URLSearchParams(window.location.search);
        const tenantId = params.get('tenantId') || '00000000-0000-0000-0000-000000000000';

        try {
            const [allProducts, storeSettings] = await Promise.all([
                dbProducts.getAll(tenantId),
                dbSettings.get(tenantId)
            ]);

            const availableProducts = allProducts.filter(p => p.stockFilial > 0 || p.isStockControlled === false || (p.comboItems && p.comboItems.length > 0));
            setProducts(availableProducts);
            setSettings(storeSettings);
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (toastMessage) {
            const timer = setTimeout(() => setToastMessage(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [toastMessage]);



    const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const getCartQuantity = (productId: string) => {
        return cart.find(item => item.product.id === productId)?.quantity || 0;
    };

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            const totalQty = (existing ? existing.quantity : 0) + 1;

            // Check Combo Stock
            if (product.comboItems && product.comboItems.length > 0) {
                for (const component of product.comboItems) {
                    const compProd = products.find(p => p.id === component.productId);
                    if (compProd) {
                        const required = component.quantity * totalQty;
                        if (required > compProd.stockFilial) {
                            setToastMessage(`Estoque insuficiente: ${compProd.name}`);
                            return prev;
                        }
                    }
                }
            } else if (product.isStockControlled !== false && totalQty > product.stockFilial) {
                setToastMessage("Limite de estoque atingido!");
                return prev;
            }

            if (existing) {
                setToastMessage("Item adicionado!");
                return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            setToastMessage("Item adicionado à sacola!");
            return [...prev, { product, quantity: 1 }];
        });
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.product.id === productId) {
                const newQty = item.quantity + delta;

                if (delta > 0) { // Only check if increasing
                    if (item.product.comboItems && item.product.comboItems.length > 0) {
                        for (const component of item.product.comboItems) {
                            const compProd = products.find(p => p.id === component.productId);
                            if (compProd) {
                                const required = component.quantity * newQty;
                                if (required > compProd.stockFilial) {
                                    setToastMessage(`Estoque insuficiente: ${compProd.name}`);
                                    return item;
                                }
                            }
                        }
                    } else if (item.product.isStockControlled !== false && newQty > item.product.stockFilial) {
                        setToastMessage("Limite de estoque atingido!");
                        return item;
                    }
                }

                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(item => item.product.id !== productId));
    };

    const cartTotal = cart.reduce((acc, item) => acc + (item.product.priceFilial * item.quantity), 0);
    const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

    const handleFinishOrder = async () => {
        if (!customerName) {
            alert("Por favor, digite seu nome.");
            return;
        }
        if (!customerPhone) {
            alert("Por favor, digite seu telefone (WhatsApp).");
            return;
        }
        if (deliveryMethod === 'DELIVERY' && !address) {
            alert("Por favor, digite o endereço de entrega.");
            return;
        }

        setIsProcessing(true);

        try {
            const fullAddress = deliveryMethod === 'DELIVERY'
                ? `${address}${referencePoint ? ` (Ref: ${referencePoint})` : ''}`
                : undefined;

            const newOrder: Order = {
                id: `ord-${Date.now()}`,
                date: getTodayDate(),
                customerName: customerName,
                customerPhone: customerPhone,
                address: fullAddress,
                deliveryMethod: deliveryMethod,
                paymentMethod: paymentMethod,
                items: cart.map(item => ({
                    productId: item.product.id,
                    productName: item.product.name,
                    quantity: item.quantity,
                    priceAtSale: item.product.priceFilial
                })),
                total: cartTotal,
                status: 'PENDING',
                branch: Branch.FILIAL,
                createdAt: Date.now()
            };

            const params = new URLSearchParams(window.location.search);
            const tenantId = params.get('tenantId') || '00000000-0000-0000-0000-000000000000';
            await dbOrders.add(newOrder, tenantId);

            // Stock is now deducted in OrderCenter when status changes to PREPARING

            const itemsList = cart.map(i => `• ${i.quantity}x ${i.product.name} (R$ ${i.product.priceFilial.toFixed(2)})`).join('%0A');
            const totalFormatted = cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const methodText = deliveryMethod === 'DELIVERY' ? `Entrega em: ${fullAddress}` : 'Retirada no Balcão';

            let paymentText = paymentMethod === 'PIX' ? 'Pix' : paymentMethod === 'CARD' ? 'Cartão' : 'Dinheiro';
            if (paymentMethod === 'CASH' && changeFor) {
                paymentText += ` (Troco para R$ ${changeFor})`;
            }

            const message = `*NOVO PEDIDO ONLINE* 🛒%0A%0A*Cliente:* ${customerName}%0A*Tel:* ${customerPhone}%0A%0A*Itens:*%0A${itemsList}%0A%0A*Total:* ${totalFormatted}%0A%0A*Entrega:* ${methodText}%0A*Pagamento:* ${paymentText}%0A%0A_Pedido gerado automaticamente pelo App Gelo do Sertão_`;

            const phone = settings?.phone || "5577998129383";
            window.open(`https://wa.me/${phone}?text=${message}`, '_blank');

            setOrderSuccess(true);
            setCart([]);
        } catch (error) {
            console.error("Erro ao processar pedido:", error);
            alert("Houve um erro ao enviar o pedido. Tente novamente.");
        } finally {
            setIsProcessing(false);
        }
    };

    if (orderSuccess) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle size={40} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Pedido Enviado!</h2>
                <p className="text-slate-600 mb-8">Seu pedido foi registrado e encaminhado para o nosso WhatsApp. Aguarde a confirmação.</p>
                <button
                    onClick={() => {
                        setOrderSuccess(false);
                        setCustomerName('');
                        setCustomerPhone('');
                        setAddress('');
                        setReferencePoint('');
                        setChangeFor('');
                    }}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
                >
                    Fazer Novo Pedido
                </button>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-slate-50 pb-32 md:pb-0 relative font-sans bg-cover bg-center bg-fixed"
            style={{
                backgroundImage: settings?.backgroundImage ? `url(${settings.backgroundImage})` : 'none',
                backgroundColor: settings?.backgroundImage ? 'transparent' : '#f8fafc' // slate-50
            }}
        >
            {/* Overlay for readability if background exists */}
            {settings?.backgroundImage && <div className="absolute inset-0 bg-white/30 fixed z-0 pointer-events-none" />}

            <div className="relative z-10">
                {/* Toast Notification */}
                {toastMessage && (
                    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-in fade-in slide-in-from-top-4">
                        {toastMessage}
                    </div>
                )}

                {/* Header */}
                <header className="bg-white sticky top-0 z-30 shadow-sm border-b border-slate-100">
                    {settings?.coverImage && (
                        <div className="h-32 w-full overflow-hidden relative">
                            <img src={settings.coverImage} alt="Capa" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        </div>
                    )}
                    <div className="max-w-4xl mx-auto p-4 flex justify-between items-center relative">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg overflow-hidden border border-slate-100 relative z-10 -mt-2">
                                {settings?.logoImage ? (
                                    <img src={settings.logoImage} alt="Logo" className="w-full h-full object-contain" />
                                ) : (
                                    <Store size={24} className="text-blue-600" />
                                )}
                            </div>
                            <div>
                                <h1 className="font-bold text-slate-800 text-lg leading-tight">{settings?.storeName || 'Gelo do Sertão'}</h1>
                                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                    <span className="flex items-center gap-1 text-green-600">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                        Aberto
                                    </span>
                                    {settings?.openingHours && (
                                        <span className="flex items-center gap-1">
                                            • <Clock size={10} /> {settings.openingHours}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-4xl mx-auto p-4">
                    {/* Search */}
                    <div className="mb-6 relative">
                        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar itens..."
                            className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Categories */}
                    <div className="mb-8 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide flex gap-3">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Product List */}
                    {isLoading ? (
                        <div className="text-center py-12 text-slate-400">Carregando cardápio...</div>
                    ) : (
                        <div className="space-y-4">
                            <h2 className="font-bold text-lg text-slate-800 mb-4">{selectedCategory}</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredProducts.map(product => {
                                    const qty = getCartQuantity(product.id);
                                    return (
                                        <div key={product.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex gap-4 hover:border-blue-200 transition-colors">
                                            {/* Image Placeholder */}
                                            <div className="w-24 h-24 bg-white rounded-lg flex items-center justify-center shrink-0 self-center overflow-hidden border border-slate-100">
                                                {product.image ? (
                                                    <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                                                ) : (
                                                    <Store size={32} className="text-slate-300" />
                                                )}
                                            </div>

                                            <div className="flex-1 flex flex-col justify-between">
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-base mb-1">{product.name}</h3>
                                                    <p className="text-xs text-slate-500 mb-2 line-clamp-2">{product.category} • {product.unit}</p>
                                                    <p className="text-green-700 font-bold text-lg">
                                                        {product.priceFilial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </p>
                                                </div>

                                                <div className="flex justify-end mt-2">
                                                    {qty > 0 ? (
                                                        <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-1 border border-slate-200">
                                                            <button onClick={() => updateQuantity(product.id, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-red-500 font-bold transition-colors"><Minus size={16} /></button>
                                                            <span className="font-bold text-slate-800 w-4 text-center">{qty}</span>
                                                            <button onClick={() => updateQuantity(product.id, 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-blue-600 hover:bg-blue-50 font-bold transition-colors"><Plus size={16} /></button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => addToCart(product)}
                                                            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all"
                                                        >
                                                            Adicionar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </main>

                {/* Floating Cart Bar (iFood Style) */}
                {cart.length > 0 && !isCartOpen && (
                    <div className="fixed bottom-4 left-4 right-4 z-40 max-w-4xl mx-auto">
                        <button
                            onClick={() => setIsCartOpen(true)}
                            className="w-full bg-blue-600 text-white p-4 rounded-xl shadow-xl shadow-blue-900/20 flex justify-between items-center animate-in slide-in-from-bottom-4 active:scale-[0.98] transition-transform"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-800 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold">
                                    {cartCount}
                                </div>
                                <span className="font-medium">Ver Sacola</span>
                            </div>
                            <span className="font-bold text-lg">
                                {cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                        </button>
                    </div>
                )}

                {/* Cart Modal / Checkout */}
                {isCartOpen && (
                    <div className="fixed inset-0 z-50 flex justify-end">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />

                        <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                            <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center">
                                <h2 className="font-bold text-lg text-slate-800">Sacola</h2>
                                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-500"><X size={24} /></button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                                {cart.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                        <ShoppingCart size={64} className="mb-4" />
                                        <p>Sua sacola está vazia.</p>
                                        <button onClick={() => setIsCartOpen(false)} className="mt-4 text-blue-600 font-bold text-sm">Voltar ao Cardápio</button>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Cart Items Summary */}
                                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center gap-2">
                                                <ShoppingCart size={16} className="text-slate-400" />
                                                <h3 className="font-bold text-slate-600 text-sm uppercase tracking-wide">Resumo do Pedido</h3>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {cart.map(item => (
                                                    <div key={item.product.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
                                                        <div className="flex items-center gap-3 flex-1">
                                                            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1">
                                                                <button onClick={() => updateQuantity(item.product.id, -1)} className="text-slate-400 hover:text-red-500 transition-colors"><Minus size={12} /></button>
                                                                <span className="font-bold text-slate-800 text-sm w-4 text-center">{item.quantity}</span>
                                                                <button onClick={() => updateQuantity(item.product.id, 1)} className="text-slate-400 hover:text-blue-600 transition-colors"><Plus size={12} /></button>
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="text-sm font-medium text-slate-800 line-clamp-1">{item.product.name}</p>
                                                                <p className="text-xs text-slate-400">{item.product.unit}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right pl-2">
                                                            <p className="font-bold text-slate-800 text-sm">
                                                                {(item.product.priceFilial * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                            </p>
                                                            <button onClick={() => removeFromCart(item.product.id)} className="text-[10px] text-red-400 hover:text-red-600 font-medium">
                                                                Remover
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 flex justify-between items-center">
                                                <span className="text-sm font-bold text-slate-500">Subtotal</span>
                                                <span className="text-base font-bold text-slate-800">
                                                    {cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Checkout Form */}
                                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center gap-2">
                                                <Users size={16} className="text-slate-400" />
                                                <h3 className="font-bold text-slate-600 text-sm uppercase tracking-wide">Seus Dados</h3>
                                            </div>
                                            <div className="p-4 space-y-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Nome Completo</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Digite seu nome"
                                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium transition-all"
                                                        value={customerName}
                                                        onChange={(e) => setCustomerName(e.target.value)}
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Telefone (WhatsApp)</label>
                                                    <input
                                                        type="tel"
                                                        placeholder="(77) 99999-9999"
                                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium transition-all"
                                                        value={customerPhone}
                                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center gap-2">
                                                <Truck size={16} className="text-slate-400" />
                                                <h3 className="font-bold text-slate-600 text-sm uppercase tracking-wide">Entrega</h3>
                                            </div>
                                            <div className="p-4 space-y-4">
                                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                                    <button
                                                        onClick={() => setDeliveryMethod('DELIVERY')}
                                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${deliveryMethod === 'DELIVERY' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}
                                                    >
                                                        Entrega
                                                    </button>
                                                    <button
                                                        onClick={() => setDeliveryMethod('PICKUP')}
                                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${deliveryMethod === 'PICKUP' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}
                                                    >
                                                        Retirada
                                                    </button>
                                                </div>

                                                {deliveryMethod === 'DELIVERY' && (
                                                    <div className="animate-in fade-in slide-in-from-top-2 space-y-3">
                                                        <textarea
                                                            placeholder="Endereço completo (Rua, Número, Bairro)..."
                                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20 font-medium transition-all"
                                                            value={address}
                                                            onChange={(e) => setAddress(e.target.value)}
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Ponto de Referência (Opcional)"
                                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium transition-all"
                                                            value={referencePoint}
                                                            onChange={(e) => setReferencePoint(e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center gap-2">
                                                <DollarSign size={16} className="text-slate-400" />
                                                <h3 className="font-bold text-slate-600 text-sm uppercase tracking-wide">Pagamento</h3>
                                            </div>
                                            <div className="p-4 space-y-4">
                                                <div className="grid grid-cols-3 gap-2">
                                                    <button
                                                        onClick={() => setPaymentMethod('PIX')}
                                                        className={`py-3 text-xs font-bold rounded-xl border transition-all flex flex-col items-center gap-1 ${paymentMethod === 'PIX' ? 'bg-green-50 border-green-500 text-green-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                                    >
                                                        <span>💠</span> Pix
                                                    </button>
                                                    <button
                                                        onClick={() => setPaymentMethod('CARD')}
                                                        className={`py-3 text-xs font-bold rounded-xl border transition-all flex flex-col items-center gap-1 ${paymentMethod === 'CARD' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                                    >
                                                        <CreditCard size={16} /> Cartão
                                                    </button>
                                                    <button
                                                        onClick={() => setPaymentMethod('CASH')}
                                                        className={`py-3 text-xs font-bold rounded-xl border transition-all flex flex-col items-center gap-1 ${paymentMethod === 'CASH' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                                    >
                                                        <span>💵</span> Dinheiro
                                                    </button>
                                                </div>

                                                {paymentMethod === 'CASH' && (
                                                    <div className="animate-in fade-in slide-in-from-top-2">
                                                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Troco para quanto?</label>
                                                        <input
                                                            type="number"
                                                            placeholder="Ex: 50,00 (Deixe vazio se não precisar)"
                                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium transition-all"
                                                            value={changeFor}
                                                            onChange={(e) => setChangeFor(e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Spacer to ensure content isn't hidden behind footer */}
                                        <div className="h-4"></div>
                                    </div>
                                )}
                            </div>

                            {cart.length > 0 && (
                                <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-20">
                                    <div className="flex justify-between items-center mb-4">
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold uppercase">Total a Pagar</p>
                                            <p className="text-2xl font-bold text-slate-800">
                                                {cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleFinishOrder}
                                        disabled={isProcessing}
                                        className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]"
                                    >
                                        {isProcessing ? (
                                            <>Processando...</>
                                        ) : (
                                            <>
                                                Confirmar Pedido <Send size={20} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OnlineMenu;
