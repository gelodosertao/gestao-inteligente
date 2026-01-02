import React, { useState, useEffect } from 'react';
import { Product, Sale, Branch } from '../types';
import { ShoppingCart, Plus, Minus, Trash2, Send, MapPin, CreditCard, User, Store, X, Search, CheckCircle } from 'lucide-react';
import { dbProducts, dbSales } from '../services/db';
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
    const [deliveryMethod, setDeliveryMethod] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
    const [address, setAddress] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CARD' | 'CASH'>('PIX');
    const [isProcessing, setIsProcessing] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);

    // Store Phone Number (Configure here)
    const STORE_PHONE = "5577998129383";

    useEffect(() => {
        loadProducts();
    }, []);

    useEffect(() => {
        if (toastMessage) {
            const timer = setTimeout(() => setToastMessage(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [toastMessage]);

    const loadProducts = async () => {
        try {
            const allProducts = await dbProducts.getAll();
            const availableProducts = allProducts.filter(p => p.stockFilial > 0);
            setProducts(availableProducts);
        } catch (error) {
            console.error("Erro ao carregar produtos:", error);
        } finally {
            setIsLoading(false);
        }
    };

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
            if (existing) {
                if (existing.quantity >= product.stockFilial) {
                    setToastMessage("Limite de estoque atingido!");
                    return prev;
                }
                setToastMessage("Item adicionado!");
                return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            setToastMessage("Item adicionado à sacola!");
            return [...prev, { product, quantity: 1 }];
        });
        // Removed setIsCartOpen(true) to prevent auto-opening
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.product.id === productId) {
                const newQty = item.quantity + delta;
                if (newQty > item.product.stockFilial) {
                    setToastMessage("Limite de estoque atingido!");
                    return item;
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
        if (deliveryMethod === 'DELIVERY' && !address) {
            alert("Por favor, digite o endereço de entrega.");
            return;
        }

        setIsProcessing(true);

        try {
            const newSale: Sale = {
                id: `ord-${Date.now()}`,
                date: getTodayDate(),
                customerName: `${customerName} (Online)`,
                total: cartTotal,
                branch: Branch.FILIAL,
                status: 'Pending',
                paymentMethod: paymentMethod === 'PIX' ? 'Pix' : paymentMethod === 'CARD' ? 'Credit' : 'Cash',
                hasInvoice: false,
                items: cart.map(item => ({
                    productId: item.product.id,
                    productName: item.product.name,
                    quantity: item.quantity,
                    priceAtSale: item.product.priceFilial
                }))
            };

            await dbSales.add(newSale);

            for (const item of cart) {
                const updatedProduct = {
                    ...item.product,
                    stockFilial: item.product.stockFilial - item.quantity
                };
                await dbProducts.update(updatedProduct);
            }

            const itemsList = cart.map(i => `• ${i.quantity}x ${i.product.name} (R$ ${i.product.priceFilial.toFixed(2)})`).join('%0A');
            const totalFormatted = cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const methodText = deliveryMethod === 'DELIVERY' ? `Entrega em: ${address}` : 'Retirada no Balcão';
            const paymentText = paymentMethod === 'PIX' ? 'Pix' : paymentMethod === 'CARD' ? 'Cartão' : 'Dinheiro';

            const message = `*NOVO PEDIDO ONLINE* 🛒%0A%0A*Cliente:* ${customerName}%0A%0A*Itens:*%0A${itemsList}%0A%0A*Total:* ${totalFormatted}%0A%0A*Entrega:* ${methodText}%0A*Pagamento:* ${paymentText}%0A%0A_Pedido gerado automaticamente pelo App Gelo do Sertão_`;

            window.open(`https://wa.me/${STORE_PHONE}?text=${message}`, '_blank');

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
                    onClick={() => { setOrderSuccess(false); setCustomerName(''); setAddress(''); }}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
                >
                    Fazer Novo Pedido
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-32 md:pb-0 relative font-sans">
            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-in fade-in slide-in-from-top-4">
                    {toastMessage}
                </div>
            )}

            {/* Header */}
            <header className="bg-white p-4 sticky top-0 z-30 shadow-sm border-b border-slate-100">
                <div className="max-w-4xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-blue-200 shadow-lg">
                            <Store size={20} className="text-white" />
                        </div>
                        <div>
                            <h1 className="font-bold text-slate-800 text-lg leading-tight">Gelo do Sertão</h1>
                            <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                Aberto agora • Filial (Adega)
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
                                        <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 self-center">
                                            <Store size={32} className="text-slate-300" />
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

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                            {cart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                    <ShoppingCart size={64} className="mb-4" />
                                    <p>Sua sacola está vazia.</p>
                                    <button onClick={() => setIsCartOpen(false)} className="mt-4 text-blue-600 font-bold text-sm">Voltar ao Cardápio</button>
                                </div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.product.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm line-clamp-2">{item.product.name}</h4>
                                                <p className="text-xs text-slate-400 mt-1">{item.product.unit}</p>
                                            </div>
                                            <p className="text-slate-800 font-bold text-sm">
                                                {(item.product.priceFilial * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <button onClick={() => removeFromCart(item.product.id)} className="text-xs text-red-500 font-medium hover:underline">
                                                Remover
                                            </button>
                                            <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-1 border border-slate-200">
                                                <button onClick={() => updateQuantity(item.product.id, -1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-red-500 font-bold transition-colors"><Minus size={14} /></button>
                                                <span className="font-bold text-slate-800 w-4 text-center text-sm">{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.product.id, 1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-blue-600 hover:bg-blue-50 font-bold transition-colors"><Plus size={14} /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {cart.length > 0 && (
                            <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] space-y-4">
                                {/* Checkout Form */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Seu Nome</label>
                                        <input
                                            type="text"
                                            placeholder="Nome completo"
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Entrega</label>
                                        <div className="flex bg-slate-100 p-1 rounded-xl mb-3">
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
                                            <div className="animate-in fade-in slide-in-from-top-2">
                                                <textarea
                                                    placeholder="Endereço completo (Rua, Número, Bairro, Referência)..."
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24 font-medium"
                                                    value={address}
                                                    onChange={(e) => setAddress(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Pagamento</label>
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
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-slate-500 font-medium">Total</span>
                                        <span className="text-2xl font-bold text-slate-800">
                                            {cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
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
                                                Enviar Pedido <Send size={20} />
                                            </>
                                        )}
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

export default OnlineMenu;
