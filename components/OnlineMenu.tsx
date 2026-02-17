import React, { useState, useEffect, useRef } from 'react';
import { Product, Order, Branch, StoreSettings } from '../types';
import { ShoppingBag, Minus, Plus, X, Search, MapPin, CreditCard, Send, CheckCircle, ChevronLeft, Store } from 'lucide-react';
import { dbProducts, dbSettings, dbOrders } from '../services/db';
import { getTodayDate } from '../services/utils';

interface CartItem {
    id: string; // Unique Cart ID
    product: Product;
    quantity: number;
    selectedOptions: { optionName: string; choiceName: string; priceChange: number }[];
    notes: string;
}

interface OnlineMenuProps {
    onBack?: () => void;
}

const OnlineMenu: React.FC<OnlineMenuProps> = ({ onBack }) => {
    // --- STATE ---
    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
    const [isLoading, setIsLoading] = useState(true);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [settings, setSettings] = useState<StoreSettings | null>(null);

    // Customization Modal State
    const [customizationProduct, setCustomizationProduct] = useState<Product | null>(null);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, { choiceName: string, priceChange: number, isCheckbox?: boolean, optionGroup?: string }>>({});
    const [customizationNotes, setCustomizationNotes] = useState('');
    const [customizationQty, setCustomizationQty] = useState(1);

    // Checkout State
    const [step, setStep] = useState<'MENU' | 'CART' | 'CHECKOUT' | 'SUCCESS'>('MENU');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
    const [address, setAddress] = useState('');
    const [referencePoint, setReferencePoint] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CARD' | 'CASH'>('PIX');
    const [changeFor, setChangeFor] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const [deliveryFee, setDeliveryFee] = useState(0);
    const [isCalculatingFee, setIsCalculatingFee] = useState(false);

    // Map State
    const [showMap, setShowMap] = useState(false);
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const [houseNumber, setHouseNumber] = useState('');

    // Refs for scrolling
    const categoryScrollRef = useRef<HTMLDivElement>(null);
    const addressTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // --- EFFECT: MAP INITIALIZATION ---
    useEffect(() => {
        if (!showMap) return;

        // Cleanup previous map instance if exists (safety)
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }

        const timeout = setTimeout(() => {
            const L = (window as any).L;
            if (!L) {
                console.error("Leaflet not loaded");
                return;
            }

            // Default Store Location (Barreiras - BA)
            const storeLat = -12.146337;
            const storeLon = -44.995872;

            // Create Map
            mapRef.current = L.map('map-container').setView([storeLat, storeLon], 14);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(mapRef.current);

            // Add Store Marker
            const storeIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: blue; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            L.marker([storeLat, storeLon], { icon: storeIcon }).addTo(mapRef.current)
                .bindPopup(`<b>${settings?.storeName || 'Loja'}</b><br>Nós estamos aqui!`).openPopup();

            // Click Handler for Customer Pin
            mapRef.current.on('click', async (e: any) => {
                const { lat, lng } = e.latlng;

                // Remove old marker
                if (markerRef.current) {
                    mapRef.current.removeLayer(markerRef.current);
                }

                // Add new marker
                // Using a simple red icon
                const redIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color: red; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5); animation: bounce 0.5s;"></div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });

                markerRef.current = L.marker([lat, lng], { icon: redIcon }).addTo(mapRef.current)
                    .bindPopup("Sua Entrega").openPopup();

                // 1. Calculate Distance & Fee
                const R = 6371; // Earth radius in km
                const dLat = (lat - storeLat) * Math.PI / 180;
                const dLon = (lng - storeLon) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(storeLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const d = R * c; // Distance in km
                const distKm = Math.max(0.1, d); // Min distance

                const fee = (settings?.deliveryBaseFee || 0) + (distKm * (settings?.deliveryPerKm || 0));
                const roundedFee = Math.ceil(fee * 2) / 2;

                setDeliveryFee(roundedFee);
                setIsCalculatingFee(false);

                // 2. Reverse Geocode (Get Address Text)
                setAddress("Buscando endereço...");
                setHouseNumber(''); // Reset house number on new pin
                try {
                    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                    const data = await resp.json();
                    if (data && data.display_name) {
                        // Cleanup address string a bit
                        const cleanAddr = data.display_name.split(',').slice(0, 4).join(',');
                        setAddress(cleanAddr);
                    } else {
                        setAddress(`Localização selecionada no mapa (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
                    }
                } catch (err) {
                    console.error("Geocoding error", err);
                    setAddress(`Localização Latitude: ${lat.toFixed(5)}, Longitude: ${lng.toFixed(5)}`);
                }
            });

            // Invalidate size to ensure it renders correctly
            setTimeout(() => {
                mapRef.current.invalidateSize();
            }, 200);

        }, 100);

        return () => clearTimeout(timeout);
    }, [showMap]);

    // --- EFFECT: LOAD DATA ---
    useEffect(() => {
        loadData();
    }, []);

    // --- EFFECT: Debounce Address Calculation ---
    useEffect(() => {
        if (deliveryMethod === 'DELIVERY' && address.length > 5 && settings?.deliveryPerKm) {
            if (addressTypingTimeoutRef.current) clearTimeout(addressTypingTimeoutRef.current);
            setIsCalculatingFee(true);
            addressTypingTimeoutRef.current = setTimeout(() => {
                calculateDeliveryFee(address);
            }, 1500);
        } else {
            setDeliveryFee(settings?.deliveryBaseFee || 0);
            setIsCalculatingFee(false);
        }
    }, [address, deliveryMethod, settings]);

    const calculateDeliveryFee = async (inputAddress: string) => {
        if (!settings?.deliveryPerKm) {
            setDeliveryFee(settings?.deliveryBaseFee || 0);
            setIsCalculatingFee(false);
            return;
        }

        try {
            // 1. Get Store Coordinates (Hardcoded for now based on user input, or geocode store address)
            // Store: Rua Professor José Seabra, 701 - Centro, Barreiras - BA
            // Lat/Lon approx: -12.148, -44.996 (Example, ideally geocode store too once)
            // Using a fixed point for "Centro, Barreiras" as fallback if geocoding fails or use specific coords if known.
            const storeLat = -12.146337;
            const storeLon = -44.995872;

            // 2. Geocode Customer Address (OpenStreetMap Nominatim)
            // Append city/state to improve accuracy
            const safeAddress = `${inputAddress}, Barreiras, Bahia, Brasil`;
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(safeAddress)}`);
            const data = await response.json();

            if (data && data.length > 0) {
                const customerLat = parseFloat(data[0].lat);
                const customerLon = parseFloat(data[0].lon);

                // 3. Calculate Distance
                const { calculateDistance } = await import('../services/utils');
                const distanceKm = calculateDistance(storeLat, storeLon, customerLat, customerLon);

                // 4. Calculate Fee
                // Formula: Base + (Km * Rate)
                // Assuming minimum 1km
                const dist = Math.max(1, distanceKm);
                const fee = (settings.deliveryBaseFee || 0) + (dist * (settings.deliveryPerKm || 0));

                // Round to nearest 0.50
                const roundedFee = Math.ceil(fee * 2) / 2;

                setDeliveryFee(roundedFee);
                // console.log(`Distance: ${distanceKm}km, Fee: ${roundedFee}`);
            } else {
                // Determine fallback if address not found: maybe standard fee?
                setDeliveryFee(settings.deliveryBaseFee || 0);
            }

        } catch (error) {
            console.error("Error calculating fee:", error);
            setDeliveryFee(settings?.deliveryBaseFee || 0);
        } finally {
            setIsCalculatingFee(false);
        }
    };

    const loadData = async () => {
        const params = new URLSearchParams(window.location.search);
        const tenantId = params.get('tenantId') || '00000000-0000-0000-0000-000000000000';

        try {
            const [allProducts, storeSettings] = await Promise.all([
                dbProducts.getAll(tenantId),
                dbSettings.get(tenantId)
            ]);

            // Filter active products
            const availableProducts = allProducts.filter(p =>
                p.stockFilial > 0 ||
                p.isStockControlled === false ||
                (p.comboItems && p.comboItems.length > 0)
            );

            setProducts(availableProducts);
            setSettings(storeSettings);

            // Set initial base fee
            if (storeSettings?.deliveryBaseFee) {
                setDeliveryFee(storeSettings.deliveryBaseFee);
            }
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // --- EFFECT: TOAST ---
    useEffect(() => {
        if (toastMessage) {
            const timer = setTimeout(() => setToastMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toastMessage]);

    // --- EFFECT: PIXELS ---
    useEffect(() => {
        if (!settings) return;

        // 1. Meta Pixel (Facebook)
        // Hardcoded in index.html as requested
        // if (settings.facebookPixelId) { ... }

        // 2. Google Tag (gtag.js)
        if (settings.googleTagId) {
            const scriptId = 'google-analytics-script';
            if (!document.getElementById(scriptId)) {
                const script = document.createElement('script');
                script.id = scriptId;
                script.async = true;
                script.src = `https://www.googletagmanager.com/gtag/js?id=${settings.googleTagId}`;
                document.head.appendChild(script);

                (window as any).dataLayer = (window as any).dataLayer || [];
                function gtag(...args: any[]) { (window as any).dataLayer.push(args); }
                (window as any).gtag = gtag;
                gtag('js', new Date());
                gtag('config', settings.googleTagId);
            }
        }
    }, [settings]);

    // --- HELPERS ---
    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const getCartQuantity = (productId: string) => {
        return cart.filter(item => item.product.id === productId).reduce((acc, item) => acc + item.quantity, 0);
    };

    const cartTotal = cart.reduce((acc, item) => {
        const optionsPrice = item.selectedOptions.reduce((sum, opt) => sum + opt.priceChange, 0);
        return acc + ((item.product.priceFilial + optionsPrice) * item.quantity);
    }, 0);

    const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

    // --- ACTIONS ---
    const handleProductClick = (product: Product) => {
        if (product.options && product.options.length > 0) {
            // Open Customization Modal
            setCustomizationProduct(product);
            setSelectedOptions({});
            setCustomizationNotes('');
            setCustomizationQty(1);
        } else {
            // Add directly
            addToCart(product, 1, [], '');
        }
    };

    const addToCart = (product: Product, quantity: number, options: any[], notes: string) => {
        // Stock Check
        if (product.comboItems && product.comboItems.length > 0) {
            // Simplified check: assumes enough stock for now, deep check complex
        } else if (product.isStockControlled !== false) {
            const currentInCart = getCartQuantity(product.id);
            if (currentInCart + quantity > product.stockFilial) {
                setToastMessage(`Estoque insuficiente. Apenas ${product.stockFilial} disponíveis.`);
                return;
            }
        }

        const newItem: CartItem = {
            id: crypto.randomUUID(),
            product,
            quantity,
            selectedOptions: options,
            notes
        };

        setCart(prev => [...prev, newItem]);
        setToastMessage("Item adicionado!");
        setCustomizationProduct(null); // Close modal if open

        // TRACKING: AddToCart
        try {
            if ((window as any).fbq) {
                (window as any).fbq('track', 'AddToCart', {
                    content_name: product.name,
                    content_ids: [product.id],
                    content_type: 'product',
                    value: product.priceFilial,
                    currency: 'BRL'
                });
            }
            if ((window as any).gtag) {
                (window as any).gtag('event', 'add_to_cart', {
                    currency: 'BRL',
                    value: product.priceFilial,
                    items: [{
                        item_id: product.id,
                        item_name: product.name,
                        price: product.priceFilial,
                        quantity: quantity
                    }]
                });
            }
        } catch (e) { console.error("Tracking Error", e); }
    };

    const removeFromCart = (cartId: string) => {
        setCart(prev => prev.filter(item => item.id !== cartId));
    };

    const updateCartItemQuantity = (cartId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === cartId) {
                const newQty = item.quantity + delta;
                if (newQty <= 0) return item; // Handled by remove usually, generally prevent going to 0 here unless we want to delete
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const updateQuantity = (product: Product, delta: number) => {
        if (delta > 0) {
            handleProductClick(product);
        } else {
            // Remove last added instance
            const item = [...cart].reverse().find(i => i.product.id === product.id);
            if (item) {
                if (item.quantity > 1) {
                    updateCartItemQuantity(item.id, -1);
                } else {
                    removeFromCart(item.id);
                }
            }
        }
    };

    // Customization Logic
    const toggleOption = (optionName: string, choiceName: string, priceChange: number, type: 'radio' | 'checkbox') => {
        if (type === 'radio') {
            setSelectedOptions(prev => ({
                ...prev,
                [optionName]: { choiceName, priceChange }
            }));
        } else {
            // Checkbox logic - allowing multiple selections for same optionName is tricky with current structure
            // For now, let's treat checkbox as single select or adapt structure?
            // User requirement: "opções de adicionais" (plural).
            // Let's assume checkbox appends to a list. But my selectedOptions state is Record<string, ...>.
            // Need to change selectedOptions state structure for checkbox support.
            // Simplified: Treat all as list in final cart.
            // But state needs to track.
            // Actually, for checkbox, `optionName` isn't unique key if multiple choices are allowed.
            // Let's use `choiceName` as key for checkboxes?
            // Refactor: selectedOptions state -> Record<string, boolean> for checkboxes?
            // Let's restart this helper inside render.
        }
    };

    // Improved Customization State Management
    // We will use a list of selected choices
    const handleOptionSelect = (optionName: string, choice: { name: string, priceChange?: number }, type: 'radio' | 'checkbox' | 'text') => {
        if (type === 'radio') {
            setSelectedOptions(prev => ({
                ...prev,
                [optionName]: { choiceName: choice.name, priceChange: choice.priceChange || 0 }
            }));
        } else {
            // Checkbox: toggle
            const key = `${optionName}:${choice.name}`;
            setSelectedOptions(prev => {
                const newState = { ...prev };
                if (newState[key]) {
                    delete newState[key];
                } else {
                    newState[key] = { choiceName: choice.name, priceChange: choice.priceChange || 0, isCheckbox: true, optionGroup: optionName };
                }
                return newState;
            });
        }
    };

    const confirmCustomization = () => {
        // Collect options
        const optionsList = Object.entries(selectedOptions).map(([key, val]: any) => ({
            optionName: val.optionGroup || key, // For checkbox, use group name
            choiceName: val.choiceName,
            priceChange: val.priceChange
        }));

        // Validate required options
        const missingOptions = customizationProduct!.options?.filter(opt => {
            if (!opt.required) return false;

            if (opt.type === 'radio') {
                return !selectedOptions[opt.name];
            } else if (opt.type === 'checkbox') {
                // Check if any selected option belongs to this group
                return !Object.values(selectedOptions).some((val: any) => val.optionGroup === opt.name);
            }
            return false;
        });

        if (missingOptions && missingOptions.length > 0) {
            setToastMessage(`Selecione ${missingOptions[0].name} para continuar.`);
            return;
        }

        addToCart(customizationProduct!, customizationQty, optionsList, customizationNotes);
    };

    const handleFinishOrder = async () => {
        if (!customerName.trim()) return alert("Por favor, digite seu nome.");
        if (!customerPhone.trim()) return alert("Por favor, digite seu WhatsApp.");
        if (deliveryMethod === 'DELIVERY' && !address.trim()) return alert("Por favor, digite o endereço de entrega.");

        setIsProcessing(true);

        try {
            const fullAddress = deliveryMethod === 'DELIVERY'
                ? `${address}${referencePoint ? ` (Ref: ${referencePoint})` : ''}`
                : undefined;

            const newOrder: Order = {
                id: crypto.randomUUID(),
                date: getTodayDate(),
                customerName,
                customerPhone,
                address: fullAddress,
                deliveryMethod,
                paymentMethod,
                items: cart.map(item => ({
                    productId: item.product.id,
                    productName: item.product.name,
                    quantity: item.quantity,
                    priceAtSale: item.product.priceFilial + item.selectedOptions.reduce((s, o) => s + o.priceChange, 0),
                    selectedOptions: item.selectedOptions,
                    notes: item.notes
                })),
                total: cartTotal,
                status: 'PENDING',
                branch: Branch.FILIAL,
                createdAt: Date.now()
            };

            const params = new URLSearchParams(window.location.search);
            const tenantId = params.get('tenantId') || '00000000-0000-0000-0000-000000000000';
            await dbOrders.add(newOrder, tenantId);

            setStep('SUCCESS');
            setCart([]);

            // WhatsApp formatting
            const itemsList = cart.map(i => {
                const notes = i.notes ? `\n   📝 Obs: ${i.notes}` : '';
                const opts = i.selectedOptions.length > 0 ? `\n   + ${i.selectedOptions.map(o => `${o.choiceName}`).join(', ')}` : '';
                return `• ${i.quantity}x ${i.product.name}${opts}${notes}`;
            }).join('%0A');

            const methodText = deliveryMethod === 'DELIVERY' ? `Entrega 🛵` : 'Retirada 🏪';
            const addressText = deliveryMethod === 'DELIVERY' ? `%0A📍 *Endereço:* ${fullAddress}` : '';

            let paymentText = paymentMethod === 'PIX' ? 'Pix' : paymentMethod === 'CARD' ? 'Cartão' : 'Dinheiro';
            if (paymentMethod === 'CASH' && changeFor) paymentText += ` (Troco para R$ ${changeFor})`;

            const message = `👋 Olá! Gostaria de fazer um pedido:%0A%0A*👤 Cliente:* ${customerName}%0A*📱 Tel:* ${customerPhone}%0A%0A*🛒 Itens:*%0A${itemsList}%0A%0A*📦 Entrega:* ${methodText} ${deliveryMethod === 'DELIVERY' && deliveryFee > 0 ? `(R$ ${deliveryFee.toFixed(2)})` : ''}${addressText}%0A%0A*💰 Total Geral:* ${formatCurrency(cartTotal + (deliveryMethod === 'DELIVERY' ? deliveryFee : 0))}%0A*💳 Pagamento:* ${paymentText}`;

            const phone = settings?.phone || "5577998129383";

            // TRACKING: Purchase / Lead
            try {
                if ((window as any).fbq) {
                    (window as any).fbq('track', 'Purchase', {
                        value: cartTotal,
                        currency: 'BRL',
                        content_ids: cart.map(i => i.product.id),
                        content_type: 'product',
                        num_items: cartCount
                    });
                }
                if ((window as any).gtag) {
                    (window as any).gtag('event', 'purchase', {
                        transaction_id: newOrder.id,
                        value: cartTotal,
                        currency: 'BRL',
                        items: cart.map(item => ({
                            item_id: item.product.id,
                            item_name: item.product.name, // Simplified
                            price: item.product.priceFilial, // Base price
                            quantity: item.quantity
                        }))
                    });
                }
            } catch (e) { console.error("Tracking Error", e); }

            window.open(`https://wa.me/${phone}?text=${message}`, '_blank');

        } catch (error) {
            console.error("Erro ao enviar:", error);
            alert("Erro ao enviar pedido. Tente novamente.");
        } finally {
            setIsProcessing(false);
        }
    };

    // --- RENDER COMPONENT ---

    // --- RENDER COMPONENT ---

    // 1. SUCCESS SCREEN
    if (step === 'SUCCESS') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
                <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <CheckCircle size={48} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Pedido Recebido!</h2>
                <p className="text-slate-600 mb-8 max-w-xs mx-auto">Seu pedido foi encaminhado para o nosso WhatsApp. Aguarde a confirmação.</p>
                <button
                    onClick={() => {
                        setStep('MENU');
                        setCustomerName('');
                        setAddress('');
                    }}
                    className="w-full max-w-xs bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all"
                >
                    Fazer Novo Pedido
                </button>
            </div>
        );
    }

    // 2. CHECKOUT SCREEN
    if (step === 'CHECKOUT') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="bg-white p-4 sticky top-0 z-30 shadow-sm border-b border-slate-100 flex items-center gap-3">
                    <button onClick={() => setStep('MENU')} className="p-2 -ml-2 hover:bg-slate-50 rounded-full text-slate-600">
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="font-bold text-lg text-slate-800">Finalizar Pedido</h1>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
                    {/* Order Summary */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <ShoppingBag size={18} className="text-blue-600" /> Resumo
                        </h3>
                        <div className="space-y-3">
                            {cart.map(item => (
                                <div key={item.id} className="flex justify-between items-start text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                                    <div className="text-slate-600 flex-1">
                                        <div className="font-bold text-slate-900 flex items-center gap-2">
                                            {item.quantity}x {item.product.name}
                                            <button onClick={() => removeFromCart(item.id)} className="text-red-400 p-1 hover:bg-red-50 rounded"><X size={12} /></button>
                                        </div>
                                        {item.selectedOptions.length > 0 && (
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {item.selectedOptions.map(o => `+ ${o.choiceName}`).join(', ')}
                                            </p>
                                        )}
                                        {item.notes && <p className="text-xs text-slate-400 italic mt-0.5">"{item.notes}"</p>}
                                    </div>
                                    <span className="font-medium text-slate-900 whitespace-nowrap ml-2">
                                        {formatCurrency((item.product.priceFilial + item.selectedOptions.reduce((s, o) => s + o.priceChange, 0)) * item.quantity)}
                                    </span>
                                </div>
                            ))}

                            {/* Delivery Fee Line */}
                            {deliveryMethod === 'DELIVERY' && (
                                <div className="flex justify-between items-center text-sm text-slate-600 pt-2 border-t border-slate-50">
                                    <span>Taxa de Entrega</span>
                                    {isCalculatingFee ? (
                                        <span className="animate-pulse text-xs bg-slate-100 px-2 py-0.5 rounded">Calculando...</span>
                                    ) : deliveryFee > 0 ? (
                                        <span>{formatCurrency(deliveryFee)}</span>
                                    ) : (
                                        <span className="text-green-600 font-bold">Grátis/A Calcular</span>
                                    )}
                                </div>
                            )}

                            <div className="border-t border-slate-100 pt-3 flex justify-between items-center font-bold text-lg text-slate-800 mt-2">
                                <span>Total</span>
                                <span>{formatCurrency(cartTotal + (deliveryMethod === 'DELIVERY' ? deliveryFee : 0))}</span>
                            </div>
                        </div>
                    </div>

                    {/* Customer Info & Delivery & Payment (Same as before) ... */}
                    {/* Simplified for brevity - injecting previous logic back */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Store size={18} className="text-blue-600" /> Seus Dados
                        </h3>
                        <div className="grid gap-3">
                            <input type="text" className="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Seu nome completo" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                            <input type="tel" className="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="WhatsApp (00) 00000-0000" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><MapPin size={18} className="text-blue-600" /> Entrega</h3>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button onClick={() => setDeliveryMethod('DELIVERY')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${deliveryMethod === 'DELIVERY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Entrega</button>
                            <button onClick={() => setDeliveryMethod('PICKUP')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${deliveryMethod === 'PICKUP' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Retirada</button>
                        </div>
                        {deliveryMethod === 'DELIVERY' && (
                            <div className="space-y-3">
                                <div className="space-y-3">
                                    <button
                                        onClick={() => setShowMap(true)}
                                        className="w-full py-4 bg-orange-50 border border-orange-200 text-orange-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-orange-100 transition-colors shadow-sm"
                                    >
                                        <MapPin size={22} className="fill-orange-500 text-white" />
                                        {address ? 'Alterar Localização no Mapa' : 'Selecionar Local de Entrega no Mapa'}
                                    </button>

                                    <textarea className="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20 text-sm" placeholder="Endereço completo (Confirmar detalhes)" value={address} onChange={e => setAddress(e.target.value)} />
                                    <input type="text" className="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ponto de Referência" value={referencePoint} onChange={e => setReferencePoint(e.target.value)} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard size={18} className="text-blue-600" /> Pagamento</h3>
                        <div className="grid grid-cols-3 gap-3">
                            {[{ id: 'PIX', icon: '💠', label: 'Pix' }, { id: 'CARD', icon: '💳', label: 'Cartão' }, { id: 'CASH', icon: '💵', label: 'Dinheiro' }].map(method => (
                                <button key={method.id} onClick={() => setPaymentMethod(method.id as any)} className={`py-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${paymentMethod === method.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                                    <span className="text-xl">{method.icon}</span><span className="text-xs font-bold">{method.label}</span>
                                </button>
                            ))}
                        </div>
                        {paymentMethod === 'CASH' && (
                            <input type="number" className="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Troco para quanto?" value={changeFor} onChange={e => setChangeFor(e.target.value)} />
                        )}
                    </div>
                </div>

                {/* Map Modal */}
                {showMap && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                        <div className="bg-white w-full max-w-lg h-[80vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
                            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="font-bold flex items-center gap-2 text-lg"><MapPin className="text-orange-500" /> Onde você está?</h3>
                                    <p className="text-xs text-slate-400">Toque no mapa para marcar sua entrega</p>
                                </div>
                                <button onClick={() => setShowMap(false)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"><X size={20} /></button>
                            </div>

                            <div className="flex-1 relative bg-slate-100">
                                <div id="map-container" className="absolute inset-0 z-10" />
                                {!mapRef.current && (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                        <p>Carregando mapa...</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                                <div className="mb-3">
                                    <p className="text-xs font-bold text-slate-500 uppercase">Endereço Selecionado</p>
                                    <p className="text-sm text-slate-800 font-medium truncate mb-2">{address || 'Toque no mapa para selecionar'}</p>

                                    {address && (
                                        <div className="flex gap-2 mb-2 animate-in slide-in-from-bottom-2">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Número</label>
                                                <input
                                                    type="number"
                                                    placeholder="Nº"
                                                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={houseNumber}
                                                    onChange={(e) => setHouseNumber(e.target.value)}
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="flex-[2]">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Complemento (opc)</label>
                                                <input
                                                    type="text"
                                                    placeholder="Apto, Bloco..."
                                                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={referencePoint}
                                                    onChange={(e) => setReferencePoint(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {deliveryFee > 0 && <p className="text-xs text-green-600 font-bold">Taxa de Entrega: {formatCurrency(deliveryFee)}</p>}
                                </div>
                                <button
                                    onClick={() => {
                                        if (houseNumber) {
                                            setAddress(`${address}, Nº ${houseNumber}`);
                                        }
                                        setShowMap(false);
                                    }}
                                    disabled={!address || !houseNumber}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Confirmar Localização
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Action */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                    <button
                        onClick={handleFinishOrder}
                        disabled={isProcessing}
                        className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg shadow-lg disabled:opacity-70 flex justify-center items-center gap-2 hover:bg-slate-800 active:scale-[0.98] transition-all"
                    >
                        {isProcessing ? 'Enviando...' : <>Confirmar Pedido <Send size={20} /></>}
                    </button>
                </div>
            </div>
        );
    }

    // 3. MAIN MENU SCREEN (Default)
    return (
        <div className="min-h-screen bg-slate-50 pb-28 md:pb-0 relative font-sans">
            {/* Toast */}
            {toastMessage && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800/90 backdrop-blur text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl animate-in fade-in slide-in-from-top-4">
                    {toastMessage}
                </div>
            )}

            {/* Customization Modal */}
            {customizationProduct && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-lg text-slate-800">Personalizar</h3>
                            <button onClick={() => setCustomizationProduct(null)} className="p-2 bg-slate-200 rounded-full hover:bg-slate-300"><X size={20} /></button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* Product Info */}
                            <div className="flex gap-4 items-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                                    {customizationProduct.image && <img src={customizationProduct.image} alt="" className="w-full h-full object-cover" />}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900">{customizationProduct.name}</h4>
                                    <p className="text-slate-500 text-sm">{formatCurrency(customizationProduct.priceFilial)}</p>
                                </div>
                            </div>

                            {/* Options */}
                            {customizationProduct.options?.map((option, idx) => (
                                <div key={idx} className="space-y-3">
                                    <h5 className="font-bold text-slate-700 text-sm uppercase tracking-wide flex justify-between">
                                        {option.name}
                                        {option.required && <span className="text-xs bg-slate-200 px-2 py-0.5 rounded text-slate-600 normal-case">Obrigatório</span>}
                                    </h5>
                                    <div className="space-y-2">
                                        {option.choices.map((choice, cIdx) => {
                                            const isSelected = option.type === 'radio'
                                                ? selectedOptions[option.name]?.choiceName === choice.name
                                                : selectedOptions[`${option.name}:${choice.name}`] !== undefined;

                                            return (
                                                <div
                                                    key={cIdx}
                                                    onClick={() => handleOptionSelect(option.name, choice as any, option.type)}
                                                    className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                                            {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                                        </div>
                                                        <span className={isSelected ? 'font-bold text-blue-900' : 'text-slate-700'}>{choice.name}</span>
                                                    </div>
                                                    {choice.priceChange ? (
                                                        <span className="text-sm font-medium text-slate-500">+{formatCurrency(choice.priceChange)}</span>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            {/* Notes */}
                            <div>
                                <label className="font-bold text-slate-700 text-sm uppercase tracking-wide block mb-2">Observações</label>
                                <textarea
                                    className="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24 placeholder:text-slate-400"
                                    placeholder="Ex: Sem açúcar, capricha no gelo..."
                                    value={customizationNotes}
                                    onChange={e => setCustomizationNotes(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-white shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                            <div className="flex justify-between items-center mb-4 text-sm font-medium text-slate-500">
                                <span>Quantidade</span>
                                <div className="flex items-center gap-3 bg-slate-100 rounded-lg p-1">
                                    <button onClick={() => setCustomizationQty(Math.max(1, customizationQty - 1))} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-slate-600"><Minus size={16} /></button>
                                    <span className="w-6 text-center font-bold text-slate-900">{customizationQty}</span>
                                    <button onClick={() => setCustomizationQty(customizationQty + 1)} className="w-8 h-8 flex items-center justify-center bg-slate-900 text-white rounded shadow-sm"><Plus size={16} /></button>
                                </div>
                            </div>
                            <button
                                onClick={confirmCustomization}
                                className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-slate-800 active:scale-[0.98] transition-all flex justify-between px-6"
                            >
                                <span>Adicionar</span>
                                <span>{formatCurrency(
                                    (customizationProduct.priceFilial + Object.values(selectedOptions).reduce((s: number, o: any) => s + (o.priceChange || 0), 0)) * customizationQty
                                )}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header / Hero */}
            <div className={`bg-white shadow-sm border-b border-slate-200 sticky top-0 z-20 transition-all duration-300`}>
                <div className="px-4 py-3 flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500">
                            <ChevronLeft size={24} />
                        </button>
                    )}
                    <h1 className="font-bold text-lg text-slate-800 truncate flex-1">
                        {settings?.storeName || 'Gelo do Sertão'}
                    </h1>
                    {settings?.openingHours && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Aberto
                        </div>
                    )}
                </div>

                {/* Categories Scroll */}
                <div className="px-4 pb-0 overflow-x-auto scrollbar-hide flex gap-2" ref={categoryScrollRef}>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => {
                                setSelectedCategory(cat);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={`pb-3 px-2 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${selectedCategory === cat
                                ? 'border-slate-900 text-slate-900'
                                : 'border-transparent text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Hero Banner (Optional) */}
            {settings?.coverImage && (
                <div className="relative h-48 md:h-64 w-full overflow-hidden">
                    <img src={settings.coverImage} className="w-full h-full object-cover" alt="Cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                        <div className="text-white">
                            <h2 className="text-2xl font-bold">{settings.storeName}</h2>
                            <p className="text-sm opacity-90 flex items-center gap-1"><MapPin size={14} /> {settings.address || 'Entrega Rápida'}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            <main className="max-w-3xl mx-auto p-4 space-y-6">

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar produtos..."
                        className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {isLoading ? (
                    <div className="py-20 text-center text-slate-400 animate-pulse">Carregando cardápio...</div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredProducts.map(product => {
                            const qty = getCartQuantity(product.id);

                            return (
                                <div key={product.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 animate-in slide-in-from-bottom-4 duration-500" onClick={() => handleProductClick(product)}>
                                    {/* Product Image */}
                                    <div className="w-24 h-24 bg-slate-100 rounded-xl shrink-0 overflow-hidden relative">
                                        {product.image ? (
                                            <img src={product.image} className="w-full h-full object-cover" alt={product.name} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <Store size={32} />
                                            </div>
                                        )}
                                        {qty > 0 && (
                                            <div className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm border-2 border-white">
                                                {qty}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info & Controls */}
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-base leading-tight">{product.name}</h3>
                                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{product.description || product.category}</p>
                                        </div>

                                        <div className="flex justify-between items-end mt-2">
                                            <span className="font-extrabold text-lg text-slate-900">{formatCurrency(product.priceFilial)}</span>

                                            <button
                                                className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-slate-800 active:scale-95 transition-all"
                                            >
                                                Adicionar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {filteredProducts.length === 0 && (
                            <div className="text-center py-10 text-slate-400">
                                <p>Nenhum produto encontrado nesta categoria.</p>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Floating Cart Bar */}
            {cart.length > 0 && (
                <div className="fixed bottom-4 left-4 right-4 z-40 max-w-3xl mx-auto">
                    <button
                        onClick={() => setStep('CHECKOUT')}
                        className="w-full bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center animate-in slide-in-from-bottom-4 active:scale-[0.98] transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 w-10 h-10 rounded-full flex items-center justify-center font-bold backdrop-blur-sm">
                                {cartCount}
                            </div>
                            <span className="font-bold">Ver Sacola</span>
                        </div>
                        <span className="font-bold text-lg">{formatCurrency(cartTotal)}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default OnlineMenu;