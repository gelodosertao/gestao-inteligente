import React, { useState, useMemo } from 'react';
import { Product, Sale, Customer, User, Branch, SaleItem } from '../types';
import { ShoppingCart, LogOut, User as UserIcon, Plus, Minus, Search, CheckCircle, ArrowLeft, History, Store, MapPin, Edit, Trash2, Save, X, Printer, Check } from 'lucide-react';
import html2canvas from 'html2canvas';
import { CUSTOMER_SEGMENTS } from '../constants';
import { hardwareBridge } from '../services/hardwareBridge';

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

const PriceInput: React.FC<{
    value: number | undefined;
    placeholder: string;
    onChange: (val: number) => void;
    className?: string;
}> = ({ value, placeholder, onChange, className }) => {
    const [localValue, setLocalValue] = React.useState(value !== undefined ? value.toString().replace('.', ',') : '');

    React.useEffect(() => {
        const currentLocalNum = parseFloat(localValue.replace(',', '.'));
        if (currentLocalNum !== value) {
            setLocalValue(value !== undefined ? value.toString().replace('.', ',') : '');
        }
    }, [value]);

    return (
        <input
            type="text"
            inputMode="decimal"
            value={localValue}
            placeholder={placeholder}
            onChange={(e) => {
                const raw = e.target.value;
                const normalized = raw.replace(',', '.');
                if (raw === '' || /^\d*[.,]?\d*$/.test(raw)) {
                    setLocalValue(raw);
                    const parsed = parseFloat(normalized);
                    if (!isNaN(parsed)) {
                        onChange(parsed);
                    } else if (raw === '') {
                        onChange(0);
                    }
                }
            }}
            onBlur={() => {
                setLocalValue(value !== undefined ? value.toString().replace('.', ',') : '');
            }}
            className={className}
        />
    );
};

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
    const isAdmin = currentUser.role === 'ADMIN';
    const [activeTab, setActiveTab] = useState<'CATALOG' | 'CART' | 'HISTORY'>('CATALOG');
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'Gelo Cubo' | 'Gelo Sabor'>('ALL');
    const [monthFilter, setMonthFilter] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM

    // Cart State
    const [cart, setCart] = useState<{ product: Product, quantity: number, customPrice?: number }[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerSearchQuery, setCustomerSearchQuery] = useState('');

    // Checkout State
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'Pix' | 'Credit' | 'Debit' | 'Cash' | 'Split'>('Pix');
    const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
    const [adminDiscount, setAdminDiscount] = useState<number>(0);
    // ADM can assign sale to a seller
    const [assignedSellerId, setAssignedSellerId] = useState<string>('');

    // Inline customer registration (inside checkout — no lost cart)
    const [showInlineCustomer, setShowInlineCustomer] = useState(false);

    // Edit Sale State
    const [showEditSaleModal, setShowEditSaleModal] = useState(false);
    const [editingSale, setEditingSale] = useState<Sale | null>(null);

    // Customer Management Mode (legacy modal kept for non-checkout contexts)
    const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
    const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
        name: '',
        establishmentName: '',
        responsibleName: '',
        cpfCnpj: '',
        phone: '',
        address: '',
        city: '',
        state: 'BA',
        zipCode: '',
        segment: ''
    });

    // Filter customers: Only Admin sees all. Sellers and Supervisors see only their own.
    const myCustomers = useMemo(() => {
        const isAdmin = currentUser.role === 'ADMIN';

        if (isAdmin) return customers;
        return customers.filter(c => c.creatorId === currentUser.id);
    }, [customers, currentUser]);

    // Filter products for Wholesale (only Gelo Cubo and Gelo Sabor)
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const isAdmin = currentUser.role === 'ADMIN';
            const isMarlisson = currentUser.name.toLowerCase().includes('marlisson');

            // Regra: Gelo Cubo só para Marlisson ou Admin
            if (p.category === 'Gelo Cubo' && !isAdmin && !isMarlisson) return false;

            const isWholesaleCategory = p.category === 'Gelo Cubo' || p.category === 'Gelo Sabor';
            const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());

            return isWholesaleCategory && matchesCategory && matchesSearch;
        }).sort((a, b) => a.category.localeCompare(b.category));
    }, [products, searchTerm, categoryFilter]);

    // Sales History (filtered per role)
    const mySales = useMemo(() => {
        let relevantSales = sales.filter(s => s.source === 'WHOLESALE_POS');
        if (monthFilter) {
            relevantSales = relevantSales.filter(s => (s.date || s.createdAt).startsWith(monthFilter));
        }
        if (isAdmin) return relevantSales.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (isAdmin) return relevantSales.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        // WHOLESALE_REPRESENTATIVE — only their own
        return relevantSales.filter(s => s.sellerId === currentUser.id)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }, [sales, currentUser, monthFilter, isAdmin]);

    // ADM: commission summary grouped by seller
    const sellerSummary = useMemo(() => {
        if (!isAdmin) return [];
        const map: Record<string, { name: string; role: string; total: number; commission: number; count: number }> = {};
        mySales.forEach(s => {
            const sid = s.sellerId || 'unknown';
            if (!map[sid]) map[sid] = { name: s.sellerName || 'Desconhecido', role: s.sellerRole || '', total: 0, commission: 0, count: 0 };
            const rate = 0.05; // Flat 5% for all wholesale sellers
            map[sid].total += s.total;
            map[sid].commission += s.commissionAmount ?? (s.total * rate);
            map[sid].count += 1;
        });
        return Object.entries(map).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
    }, [mySales, isAdmin]);

    // Unique seller list from sales (for ADM assignment dropdown)
    const sellerOptions = useMemo(() => {
        const seen = new Set<string>();
        const list: { id: string; name: string; role: string }[] = [];
        sales.filter(s => s.source === 'WHOLESALE_POS' && s.sellerId).forEach(s => {
            if (!seen.has(s.sellerId!)) {
                seen.add(s.sellerId!);
                list.push({ id: s.sellerId!, name: s.sellerName || s.sellerId!, role: s.sellerRole || '' });
            }
        });
        return list;
    }, [sales]);

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            if (existing) {
                return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            const initialQuantity = product.category === 'Gelo Sabor' ? 10 : 1;
            return [...prev, { product, quantity: initialQuantity }];
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

    const updatePrice = (productId: string, price: number) => {
        setCart(prev => prev.map(item => item.product.id === productId ? { ...item, customPrice: price } : item));
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

    const getProductPrice = (product: Product, customPrice?: number) => {
        if (customPrice !== undefined) return customPrice;
        return product.category === 'Gelo Sabor' ? currentFlavoredTierPrice : product.priceMatriz;
    };

    const cartTotal = cart.reduce((acc, item) => acc + (getProductPrice(item.product, item.customPrice) * item.quantity), 0);

    const handleRegisterCustomer = async () => {
        if (!newCustomer.name) return alert("O nome do cliente é obrigatório!");

        const customerToSave: Customer = {
            id: crypto.randomUUID(),
            name: newCustomer.name || '',
            cpfCnpj: newCustomer.cpfCnpj,
            phone: newCustomer.phone,
            address: newCustomer.address,
            city: newCustomer.city,
            state: newCustomer.state,
            segment: newCustomer.segment,
            creatorId: currentUser.id,
            creatorName: currentUser.name,
            branch: Branch.MATRIZ,
            establishmentName: newCustomer.establishmentName || '',
            responsibleName: newCustomer.responsibleName || '',
            zipCode: newCustomer.zipCode || ''
        };

        try {
            await onAddCustomer(customerToSave);
            setSelectedCustomer(customerToSave);
            setCustomerSearchQuery(customerToSave.name);
            setShowAddCustomerModal(false);
            setShowInlineCustomer(false); // close inline panel too
            setNewCustomer({ name: '', establishmentName: '', responsibleName: '', cpfCnpj: '', phone: '', address: '', city: '', state: 'BA', zipCode: '', segment: '' });
        } catch (e) {
            console.error(e);
            alert("Erro ao cadastrar cliente.");
        }
    };

    const handleFinishSale = async () => {
        if (cart.length === 0) return alert("Carrinho vazio!");
        if (!selectedCustomer) return alert("Selecione um cliente para o atacado.");

        const saleItems: SaleItem[] = cart.map(({ product, quantity, customPrice }) => ({
            productId: product.id,
            productName: product.name,
            quantity,
            priceAtSale: getProductPrice(product, customPrice),
        }));

        // ADM can assign the sale to a specific seller
        let effectiveSellerId = currentUser.id;
        let effectiveSellerName = currentUser.name;
        let effectiveSellerRole: string = currentUser.role;
        if (isAdmin && assignedSellerId) {
            const found = sellerOptions.find(s => s.id === assignedSellerId);
            if (found) { effectiveSellerId = found.id; effectiveSellerName = found.name; effectiveSellerRole = found.role; }
        }

        const commissionRate = 0.05; // Novo esquema: 5% flat para todos
        const finalTotal = Math.max(cartTotal - (adminDiscount || 0), 0);
        const commissionAmount = finalTotal * commissionRate;

        const newSale: Sale = {
            id: crypto.randomUUID(),
            date: saleDate,
            createdAt: new Date().toISOString(),
            customerName: selectedCustomer.name,
            total: finalTotal,
            items: saleItems,
            branch: Branch.MATRIZ,
            status: 'Pending',
            paymentMethod,
            hasInvoice: false,
            source: 'WHOLESALE_POS',
            amountPaid: 0,
            sellerId: effectiveSellerId,
            sellerName: effectiveSellerName,
            sellerRole: effectiveSellerRole,
            commissionAmount: commissionAmount,
        };

        try {
            await onAddSale(newSale);
            setLastCompletedSale(newSale);
            setCart([]);
            setSelectedCustomer(null);
            setCustomerSearchQuery('');
            setIsCheckingOut(false);
            setAdminDiscount(0);
            setShowSuccessModal(true);
        } catch (e) {
            console.error(e);
            alert("Erro ao lançar pedido.");
        }
    };

    const handlePrint = async (saleToPrint: Sale) => {
        setLastCompletedSale(saleToPrint);
        setIsPrinting(true);

        setTimeout(async () => {
            const receiptElement = document.getElementById('wholesale-receipt');
            if (!receiptElement) {
                setIsPrinting(false);
                return;
            }

            try {
                // Gerar imagem em ALTA QUALIDADE (Scale 3) para ser bonita no WhatsApp e na impressora
                const canvas = await html2canvas(receiptElement, {
                    scale: 3,
                    backgroundColor: '#ffffff',
                    width: 320,
                    logging: false,
                    useCORS: true
                });

                canvas.toBlob(async (blob) => {
                    if (!blob) return;

                    const fileName = `pedido-${saleToPrint.id.substring(0, 8)}.jpg`;
                    const file = new File([blob], fileName, { type: 'image/jpeg' });

                    const downloadFallback = () => {
                        const dataUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = dataUrl;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(dataUrl), 100);
                    };

                    // Compartilhamento nativa (maquininhas/celulares)
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        try {
                            await navigator.share({
                                files: [file],
                                title: 'Recibo Atacado',
                                text: 'Cupom de Pedido Gelo do Sertão',
                            });
                        } catch (err) {
                            console.log('Share cancelado ou falhou, tentando download...', err);
                            downloadFallback();
                        }
                    } else {
                        downloadFallback();
                    }
                }, 'image/jpeg', 1.0);

            } catch (e) {
                console.error('Erro na impressão', e);
            } finally {
                setIsPrinting(false);
            }
        }, 500);
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
        const commissionRate = 0.05; // 5% flat
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
                    {(isAdmin || currentUser.name.toLowerCase().includes('marlisson')) && (
                        <button
                            onClick={() => setCategoryFilter('Gelo Cubo')}
                            className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${categoryFilter === 'Gelo Cubo' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                        >
                            CUBO
                        </button>
                    )}
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
                                        <button onClick={() => updateQuantity(product.id, cartItem.quantity - (product.category === 'Gelo Sabor' ? 10 : 1))} className="w-9 h-9 flex items-center justify-center bg-white text-blue-600 rounded-lg shadow-sm font-black active:scale-90 transition-all border border-blue-100">-</button>
                                        <input
                                            type="number"
                                            value={cartItem.quantity || ''}
                                            onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 0)}
                                            onFocus={(e) => e.target.select()}
                                            className="w-12 text-center font-black text-blue-900 bg-transparent outline-none hide-arrows text-lg"
                                        />
                                        <button onClick={() => updateQuantity(product.id, cartItem.quantity + (product.category === 'Gelo Sabor' ? 10 : 1))} className="w-9 h-9 flex items-center justify-center bg-blue-600 text-white rounded-lg shadow-lg font-black active:scale-90 transition-all shadow-blue-200">+</button>
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
            // Determined commission for display
            const displayCommissionRate = 0.05;

            return (
                <div className="p-4 pb-28 animate-in fade-in slide-in-from-right-4 duration-300">
                    <button onClick={() => setIsCheckingOut(false)} className="flex items-center gap-2 text-slate-500 mb-6 font-medium">
                        <ArrowLeft size={18} /> Voltar ao Carrinho
                    </button>

                    <h2 className="text-2xl font-black text-slate-800 mb-4">Finalizar Pedido</h2>

                    <div className="space-y-4">
                        {/* Customer Selection */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-center mb-3">
                                <label className="block text-sm font-bold text-slate-700">Cliente</label>
                                <button
                                    onClick={() => setShowInlineCustomer(v => !v)}
                                    className="text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg font-black flex items-center gap-1 hover:bg-orange-100 transition-all border border-orange-200"
                                >
                                    <Plus size={12} /> {showInlineCustomer ? 'Cancelar' : 'Novo Cliente'}
                                </button>
                            </div>

                            {/* Inline customer registration — cart is preserved */}
                            {showInlineCustomer ? (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest">Cadastro Rápido de Cliente</p>
                                    <input type="text" placeholder="Nome Fantasia / Cliente *" className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                                    <input type="text" placeholder="Nome do Estabelecimento / Razão Social" className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400" value={newCustomer.establishmentName} onChange={e => setNewCustomer({ ...newCustomer, establishmentName: e.target.value })} />
                                    <input type="text" placeholder="Nome do Responsável" className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400" value={newCustomer.responsibleName} onChange={e => setNewCustomer({ ...newCustomer, responsibleName: e.target.value })} />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="text" placeholder="Telefone" className="px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                                        <input type="text" placeholder="CEP" className="px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" value={newCustomer.zipCode} onChange={e => setNewCustomer({ ...newCustomer, zipCode: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="text" placeholder="Cidade" className="px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" value={newCustomer.city} onChange={e => setNewCustomer({ ...newCustomer, city: e.target.value })} />
                                        <input type="text" placeholder="CPF / CNPJ" className="px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" value={newCustomer.cpfCnpj} onChange={e => setNewCustomer({ ...newCustomer, cpfCnpj: e.target.value })} />
                                    </div>
                                    <select className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" value={newCustomer.segment} onChange={e => setNewCustomer({ ...newCustomer, segment: e.target.value })}>
                                        <option value="">Segmento</option>
                                        {CUSTOMER_SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <button onClick={handleRegisterCustomer} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all text-sm">
                                        <Check size={16} /> Salvar e Selecionar Cliente
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="relative mb-2">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar cliente por nome..."
                                            className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-orange-500 font-medium text-slate-700"
                                            value={customerSearchQuery}
                                            onChange={(e) => {
                                                setCustomerSearchQuery(e.target.value);
                                                setSelectedCustomer(null); // Reset selection
                                            }}
                                        />
                                    </div>

                                    {customerSearchQuery.length > 0 && !selectedCustomer && (
                                        <div className="max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-sm mb-2 custom-scrollbar">
                                            {myCustomers.filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase())).length === 0 ? (
                                                <div className="p-3 text-sm text-slate-500 text-center">Nenhum cliente encontrado.</div>
                                            ) : (
                                                myCustomers.filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase())).map(c => (
                                                    <button
                                                        key={c.id}
                                                        onClick={() => {
                                                            setSelectedCustomer(c);
                                                            setCustomerSearchQuery(c.name);
                                                        }}
                                                        className="w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 flex flex-col last:border-0"
                                                    >
                                                        <span className="font-bold text-slate-800 text-sm">{c.name}</span>
                                                        <span className="text-xs text-slate-500">{c.city || c.phone ? `${c.city || ''} ${c.phone ? '• ' + c.phone : ''}` : 'Sem mais informações'}</span>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}

                                    {selectedCustomer && (
                                        <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100 flex items-center gap-2">
                                            <div className="bg-blue-600 text-white p-1.5 rounded-full"><UserIcon size={14} /></div>
                                            <div className="flex-1">
                                                <p className="text-xs font-bold text-blue-900">{selectedCustomer.name}</p>
                                                <p className="text-[10px] text-blue-600 font-medium">{selectedCustomer.city || 'Cidade não informada'} • {selectedCustomer.phone || 'Sem telefone'}</p>
                                            </div>
                                            <button onClick={() => { setSelectedCustomer(null); setCustomerSearchQuery(''); }} className="text-blue-400 hover:text-blue-600"><X size={16} /></button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* ADM: Assign to seller */}
                        {isAdmin && sellerOptions.length > 0 && (
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-yellow-200">
                                <label className="block text-sm font-bold text-yellow-700 mb-2">Atribuir ao Vendedor (ADM)</label>
                                <select className="w-full p-3 bg-yellow-50 border border-yellow-200 rounded-lg outline-none focus:border-yellow-400 font-medium text-slate-700" value={assignedSellerId} onChange={e => setAssignedSellerId(e.target.value)}>
                                    <option value="">-- Lançar como ADM --</option>
                                    {sellerOptions.map(s => <option key={s.id} value={s.id}>{s.name} (Representante)</option>)}
                                </select>
                            </div>
                        )}

                        {/* Sale Date Selector */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-4">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Data da Venda</label>
                            <input
                                type="date"
                                className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-orange-500 font-medium text-slate-700"
                                value={saleDate}
                                onChange={e => setSaleDate(e.target.value)}
                            />
                        </div>

                        {/* Discount (Admin only) */}
                        {isAdmin && (
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-4">
                                <label className="block text-sm font-bold text-slate-700 mb-2">Desconto (R$)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-orange-500 font-medium text-slate-700"
                                    value={adminDiscount || ''}
                                    onChange={e => setAdminDiscount(Number(e.target.value) || 0)}
                                    placeholder="Valor do desconto"
                                />
                            </div>
                        )}

                        {/* Payment Method */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                            <label className="block text-sm font-bold text-slate-700 mb-3">Forma de Pagamento</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(isAdmin ? ['Pix', 'Cash', 'Credit', 'Debit', 'Split'] : ['Pix', 'Cash', 'Credit', 'Debit']).map(method => (
                                    <button key={method} onClick={() => setPaymentMethod(method as 'Pix' | 'Credit' | 'Debit' | 'Cash' | 'Split')} className={`py-3 px-2 rounded-lg font-bold text-sm border-2 flex items-center justify-center transition-all ${paymentMethod === method ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-300'}`}>
                                        {method === 'Pix' && 'PIX'}{method === 'Cash' && 'Dinheiro'}{method === 'Credit' && 'Crédito'}{method === 'Debit' && 'Débito'}{method === 'Split' && 'Fiado / Prazo'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-slate-800 text-white p-5 rounded-2xl shadow-lg">
                            {isAdmin && adminDiscount > 0 && (
                                <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2 text-orange-300">
                                    <span className="font-medium text-sm">Desconto aplicado:</span>
                                    <span className="font-bold">- R$ {adminDiscount.toFixed(2)}</span>
                                </div>
                            )}
                            {displayCommissionRate > 0 && (
                                <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
                                    <span className="text-slate-300 font-medium text-sm">Comissão ({(displayCommissionRate * 100).toFixed(0)}%):</span>
                                    <span className="text-lg font-bold text-green-400">R$ {(Math.max(cartTotal - adminDiscount, 0) * displayCommissionRate).toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center mt-2">
                                <span className="text-slate-300 text-sm">Total do Pedido:</span>
                                <span className="text-2xl font-black text-orange-400">R$ {Math.max(cartTotal - adminDiscount, 0).toFixed(2)}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-2 text-right italic">* ADM confirma recebimento e estoque.</p>
                        </div>

                        <button onClick={handleFinishSale} className="w-full bg-green-500 hover:bg-green-600 active:scale-95 text-white py-4 rounded-xl font-black text-lg shadow-xl shadow-green-900/20 transition-all flex items-center justify-center gap-2">
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
                    {cart.map((item, idx) => {
                        const currentPrice = getProductPrice(item.product, item.customPrice);
                        return (
                            <div key={idx} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-800 leading-tight">{item.product.name}</h4>
                                    {isAdmin ? (
                                        <div className="flex items-center gap-1 mt-1">
                                            <span className="text-xs font-bold text-slate-400">R$</span>
                                            <PriceInput
                                                value={item.customPrice}
                                                placeholder={getProductPrice(item.product).toFixed(2)}
                                                onChange={(val) => updatePrice(item.product.id, val)}
                                                className="w-20 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded text-blue-700 font-black text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            {item.product.category === 'Gelo Sabor' && <span className="text-[10px] text-orange-500 font-bold italic">dinâmico</span>}
                                        </div>
                                    ) : (
                                        <p className="text-green-600 font-bold text-sm">
                                            R$ {currentPrice.toFixed(2)}
                                            {item.product.category === 'Gelo Sabor' && <span className="text-[10px] text-orange-500 ml-1">dinâmico</span>}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-100">
                                    <button onClick={() => updateQuantity(item.product.id, item.quantity - (item.product.category === 'Gelo Sabor' ? 10 : 1))} className="w-8 h-8 flex items-center justify-center text-slate-500 font-bold text-xl active:scale-95">-</button>
                                    <input
                                        type="number"
                                        value={item.quantity || ''}
                                        onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                                        onFocus={(e) => e.target.select()}
                                        className="w-10 text-center font-bold text-slate-800 bg-transparent outline-none hide-arrows"
                                    />
                                    <button onClick={() => updateQuantity(item.product.id, item.quantity + (item.product.category === 'Gelo Sabor' ? 10 : 1))} className="w-8 h-8 flex items-center justify-center text-orange-500 font-bold text-xl active:scale-95">+</button>
                                </div>
                            </div>
                        );
                    })}
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
        // ADM view: commission summary per seller + all sales
        if (isAdmin) {
            const grandTotal = mySales.reduce((a, s) => a + s.total, 0);
            const grandCommission = sellerSummary.reduce((a, s) => a + s.commission, 0);

            return (
                <div className="p-4 pb-24">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><History size={22} /> Vendas Atacado</h2>
                        <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                            className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>

                    {/* Grand totals */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-blue-900 text-white p-3 rounded-xl shadow">
                            <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Total Vendido</p>
                            <p className="text-2xl font-black text-white">R$ {grandTotal.toFixed(2)}</p>
                            <p className="text-[10px] text-blue-300">{mySales.length} pedidos</p>
                        </div>
                        <div className="bg-green-700 text-white p-3 rounded-xl shadow">
                            <p className="text-[10px] font-bold text-green-300 uppercase tracking-widest">Total Comissões</p>
                            <p className="text-2xl font-black text-white">R$ {grandCommission.toFixed(2)}</p>
                            <p className="text-[10px] text-green-300">{sellerSummary.length} vendedores</p>
                        </div>
                    </div>

                    {/* Seller commission breakdown */}
                    {sellerSummary.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 mb-4 overflow-hidden">
                            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Comissão por Vendedor</p>
                            </div>
                            {sellerSummary.map(s => {
                                const roleLabel = s.role === 'WHOLESALE_SUPERVISOR' ? 'Representante (5%)' : s.role === 'WHOLESALE_REPRESENTATIVE' ? 'Representante (3%)' : 'ADM';
                                return (
                                    <div key={s.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 last:border-0">
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{s.name}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">{roleLabel} · {s.count} pedidos · R$ {s.total.toFixed(2)}</p>
                                        </div>
                                        <span className="text-green-600 font-black text-sm">R$ {s.commission.toFixed(2)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* All sales list */}
                    {mySales.length === 0 ? (
                        <div className="text-center text-slate-400 py-10">Nenhuma venda de atacado neste período.</div>
                    ) : (
                        <div className="space-y-3">
                            {mySales.map(sale => {
                                const rate = sale.sellerRole === 'WHOLESALE_SUPERVISOR' ? 0.05 : sale.sellerRole === 'WHOLESALE_REPRESENTATIVE' ? 0.03 : 0;
                                const commission = sale.commissionAmount ?? (sale.total * rate);
                                return (
                                    <div key={sale.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                                        <div className="flex justify-between items-start mb-1">
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm">{sale.customerName}</h4>
                                                <p className="text-[10px] text-slate-400">{sale.sellerName || 'ADM'} · {new Date(sale.createdAt || sale.date).toLocaleString('pt-BR')}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-slate-800 text-sm">R$ {sale.total.toFixed(2)}</p>
                                                {commission > 0 && <p className="text-[10px] text-green-600 font-bold">Comissão: R$ {commission.toFixed(2)}</p>}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center mt-2">
                                            <div className="flex gap-1 flex-wrap">
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${sale.status === 'Pending' ? 'bg-orange-100 text-orange-700' : sale.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {sale.status === 'Pending' ? 'Pendente' : sale.status === 'Completed' ? 'Concluído' : sale.status}
                                                </span>
                                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium uppercase">
                                                    {sale.paymentMethod === 'Credit' ? 'Crédito' : sale.paymentMethod === 'Debit' ? 'Débito' : sale.paymentMethod === 'Cash' ? 'Dinheiro' : sale.paymentMethod === 'Split' ? 'Fiado / Prazo' : sale.paymentMethod}
                                                </span>
                                            </div>
                                            <div className="flex gap-1">
                                                {isAdmin && sale.status === 'Pending' && onUpdateSale && (
                                                    <button onClick={() => {
                                                        if (window.confirm("Confirmar pedido de " + sale.customerName + "? Status mudará para 'Concluído'.")) {
                                                            onUpdateSale({ ...sale, status: 'Completed', date: new Date().toISOString().split('T')[0] });
                                                        }
                                                    }} className="p-1 px-2 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded flex items-center gap-1 font-bold border border-emerald-200">
                                                        <CheckCircle size={11} /> Confirmar
                                                    </button>
                                                )}
                                                <button onClick={() => handlePrint(sale)} className="p-1 px-2 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded flex items-center gap-1 font-bold border border-blue-100">
                                                    <Printer size={11} />
                                                </button>
                                                {onUpdateSale && (
                                                    <button onClick={() => { setEditingSale({ ...sale }); setShowEditSaleModal(true); }} className="p-1 px-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded flex items-center gap-1 font-bold">
                                                        <Edit size={11} /> Editar
                                                    </button>
                                                )}
                                                {onDeleteSale && (
                                                    <button onClick={() => onDeleteSale(sale.id)} className="p-1 px-2 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded font-bold">
                                                        <Trash2 size={11} />
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
        }

        // Seller/Supervisor view: own summary + filtered sales
        let ownCommissionTotal = 0;
        let teamCommissionTotal = 0;
        mySales.forEach(s => {
            if (s.sellerId === currentUser.id) {
                ownCommissionTotal += s.total * 0.05;
            }
        });
        const totalCommission = ownCommissionTotal + teamCommissionTotal;

        return (
            <div className="p-4 pb-24">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><History /> Minhas Vendas</h2>
                    <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                        className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="bg-green-600 text-white p-4 rounded-xl shadow-lg mb-6">
                    <p className="text-sm font-medium text-green-100 uppercase tracking-widest mb-1">Total de Comissões</p>
                    <p className="text-3xl font-black">R$ {totalCommission.toFixed(2)}</p>
                </div>

                {mySales.length === 0 ? (
                    <div className="text-center text-slate-500 py-10">Nenhuma venda encontrada.</div>
                ) : (
                    <div className="space-y-4">
                        {mySales.map(sale => {
                            const isMySale = sale.sellerId === currentUser.id;
                            const saleName = isMySale ? 'Sua Venda' : `Vendedor: ${sale.sellerName?.split(' ')[0] || 'Vendedor'}`;
                            const saleCommission = sale.total * 0.05;
                            return (
                                <div key={sale.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-slate-800">{sale.customerName}</h4>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${sale.status === 'Pending' ? 'bg-orange-100 text-orange-700' : sale.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {sale.status === 'Pending' ? 'Pendente' : sale.status === 'Completed' ? 'Concluído' : sale.status === 'Finalizado pela Fábrica' ? 'Fin. Fábrica' : sale.status}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500">{new Date(sale.createdAt || sale.date).toLocaleString('pt-BR')}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs font-bold block mb-1">R$ {sale.total.toFixed(2)}</span>
                                            <span className="text-green-600 font-bold text-xs block">+ R$ {saleCommission.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3 items-center justify-between">
                                        <div className="flex gap-1 flex-wrap">
                                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md ${isMySale ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{saleName}</span>
                                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium uppercase">{sale.paymentMethod}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => handlePrint(sale)} className="p-1 px-2 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded flex items-center gap-1 font-bold border border-blue-100"><Printer size={12} /> Imprimir</button>
                                            {onUpdateSale && <button onClick={() => { setEditingSale({ ...sale }); setShowEditSaleModal(true); }} className="p-1 px-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded flex items-center gap-1 font-bold"><Edit size={12} /> Editar</button>}
                                            {onDeleteSale && <button onClick={() => onDeleteSale(sale.id)} className="p-1 px-2 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded flex items-center gap-1 font-bold"><Trash2 size={12} /></button>}
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

                            {isAdmin && (
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Meio de Pagamento</label>
                                    <select
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                                        value={editingSale.paymentMethod}
                                        onChange={(e) => setEditingSale({ ...editingSale, paymentMethod: e.target.value as any })}
                                    >
                                        <option value="Pix">PIX</option>
                                        <option value="Cash">Dinheiro</option>
                                        <option value="Credit">Cartão de Crédito</option>
                                        <option value="Debit">Cartão de Débito</option>
                                        <option value="Split">Fiado / Prazo</option>
                                    </select>
                                </div>
                            )}

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
                                                <PriceInput
                                                    value={item.priceAtSale}
                                                    placeholder="0,00"
                                                    onChange={(val) => updateEditingItem(index, 'priceAtSale', val)}
                                                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-orange-500 outline-none"
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

            {/* Modal de Cadastro de Cliente */}
            {showAddCustomerModal && (
                <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2">
                                <UserIcon size={20} /> Cadastrar Cliente
                            </h3>
                            <button onClick={() => setShowAddCustomerModal(false)}><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-xs font-black text-slate-500 uppercase mb-1">Nome / Razão Social</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                    placeholder="Ex: Mercadinho do João"
                                    value={newCustomer.name}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-1">CPF / CNPJ</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm"
                                        placeholder="000.000.000-00"
                                        value={newCustomer.cpfCnpj}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, cpfCnpj: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-1">Telefone</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm"
                                        placeholder="(77) 9..."
                                        value={newCustomer.phone}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-slate-500 uppercase mb-1">Endereço</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                    placeholder="Rua, Número, Bairro"
                                    value={newCustomer.address}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-1">Cidade</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                        placeholder="Cidade"
                                        value={newCustomer.city}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-1">Segmento</label>
                                    <select
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                        value={newCustomer.segment}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, segment: e.target.value })}
                                    >
                                        <option value="">Selecione...</option>
                                        {CUSTOMER_SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={handleRegisterCustomer}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-900/20 transition-all flex items-center justify-center gap-2 mt-2"
                            >
                                <Plus size={24} /> Concluir Cadastro
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden Receipt for Printing */}
            <div id="wholesale-receipt" className={`fixed -left-[2000px] top-0 ${isPrinting ? '' : 'hidden'}`}
                style={{ width: '320px', backgroundColor: '#ffffff', color: '#000000', fontFamily: 'Arial, sans-serif', padding: '25px 15px', boxSizing: 'border-box', textAlign: 'center' }}>

                {/* Header Section */}
                <div style={{ paddingBottom: '15px' }}>
                    <p style={{ fontSize: '24px', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>Gelo do Sertão</p>
                    <p style={{ fontSize: '11px', margin: '5px 0 0', fontWeight: 700, color: '#333' }}>CNPJ: 47.026.674/0001-29</p>
                    <p style={{ fontSize: '11px', margin: '2px 0 0', color: '#666' }}>Ibotirama - BA</p>
                </div>

                {/* Divider */}
                <div style={{ height: '2px', backgroundColor: '#000', margin: '5px 0 15px' }}></div>

                {/* Order Identification */}
                <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 800, color: '#666', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '1px' }}>*** Cupom não Fiscal ***</p>
                    <p style={{ fontSize: '13px', fontWeight: 900, color: '#555', margin: 0 }}>RECIBO DE PEDIDO</p>
                    <p style={{ fontSize: '16px', fontWeight: 900, margin: '5px 0' }}>#{lastCompletedSale?.id.substring(0, 8).toUpperCase()}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>{lastCompletedSale?.createdAt ? new Date(lastCompletedSale.createdAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}</p>
                </div>

                {/* Customer & Seller Block */}
                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase' }}>Cliente</p>
                    <p style={{ fontSize: '15px', fontWeight: 900, margin: '0 0 10px' }}>{lastCompletedSale?.customerName.toUpperCase()}</p>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                        <div>
                            <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>VENDEDOR</p>
                            <p style={{ fontSize: '12px', fontWeight: 800 }}>{lastCompletedSale?.sellerName?.split(' ')[0].toUpperCase() || 'ADM'}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>PAGAMENTO</p>
                            <p style={{ fontSize: '12px', fontWeight: 800 }}>{lastCompletedSale?.paymentMethod === 'Pix' ? 'PIX' : lastCompletedSale?.paymentMethod === 'Cash' ? 'DINHEIRO' : lastCompletedSale?.paymentMethod.toUpperCase()}</p>
                        </div>
                    </div>
                </div>

                {/* Itemized List */}
                <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 15px', color: '#334155' }}>Itens consumidos</p>

                    {lastCompletedSale?.items.map((item, idx) => (
                        <div key={idx} style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px dashed #e2e8f0' }}>
                            <p style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 4px' }}>{item.productName.toUpperCase()}</p>
                            <p style={{ fontSize: '13px', margin: 0, color: '#475569' }}>
                                {item.quantity} un x R$ {item.priceAtSale.toFixed(2)}
                            </p>
                            <p style={{ fontSize: '16px', fontWeight: 900, marginTop: '4px' }}>
                                R$ {(item.priceAtSale * item.quantity).toFixed(2)}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Order Summary */}
                <div style={{ backgroundColor: '#000', color: '#fff', padding: '20px 10px', borderRadius: '12px', marginBottom: '25px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 5px', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '1px' }}>Total do pedido</p>
                    <p style={{ fontSize: '40px', fontWeight: 900, margin: 0 }}>R$ {lastCompletedSale?.total.toFixed(2)}</p>
                </div>

                {/* Footer Section */}
                <div>
                    <p style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>Obrigado pela preferência!</p>
                    <p style={{ fontSize: '10px', margin: '6px 0 0', color: '#64748b', fontStyle: 'italic' }}>Gelo do Sertão · Gestão Inteligente</p>
                </div>
            </div>

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-3xl p-8 text-center animate-in zoom-in duration-300 shadow-2xl">
                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Check size={40} strokeWidth={3} />
                        </div>
                        <h2 className="text-2xl font-black text-slate-800 mb-2">Pedido Realizado!</h2>
                        <p className="text-slate-500 font-medium mb-8">O pedido foi enviado para conferência administrativa.</p>

                        <div className="space-y-3">
                            <button
                                onClick={() => lastCompletedSale && handlePrint(lastCompletedSale)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 active:scale-95 transition-all text-lg"
                            >
                                <Printer size={20} /> Imprimir Pedido
                            </button>
                            <button
                                onClick={() => { setShowSuccessModal(false); setActiveTab('CATALOG'); }}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 rounded-2xl font-black active:scale-95 transition-all"
                            >
                                Voltar para Início
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
