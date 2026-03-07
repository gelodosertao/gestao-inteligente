import React, { useState, useEffect, useRef } from 'react';
import { Product, Order, Branch, StoreSettings } from '../types';
import { ShoppingBag, Minus, Plus, X, Search, MapPin, CreditCard, Send, CheckCircle, ChevronLeft, Store, ListOrdered, Package, Phone } from 'lucide-react';
import { dbProducts, dbSettings, dbOrders, dbCustomers } from '../services/db';
import { getTodayDate, getFixedFeeByNeighborhood } from '../services/utils';

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
    const [selectedOptions, setSelectedOptions] = useState<Record<string, { choiceName: string, priceChange: number, isCheckbox?: boolean, optionGroup?: string, quantity?: number }>>({});
    const [customizationNotes, setCustomizationNotes] = useState('');
    const [customizationQty, setCustomizationQty] = useState(1);

    // Checkout State
    const [step, setStep] = useState<'MENU' | 'CART' | 'CHECKOUT' | 'SUCCESS' | 'TRACKING'>('MENU');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
    const [address, setAddress] = useState('');
    const [referencePoint, setReferencePoint] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CARD' | 'CASH'>('PIX');
    const [changeFor, setChangeFor] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Tracking State
    const [myOrders, setMyOrders] = useState<Order[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);

    const [deliveryFee, setDeliveryFee] = useState(0);
    const [isCalculatingFee, setIsCalculatingFee] = useState(false);

    // Address State
    const [cep, setCep] = useState('');
    const [isSearchingCep, setIsSearchingCep] = useState(false);
    const [houseNumber, setHouseNumber] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');

    // Refs for scrolling
    const categoryScrollRef = useRef<HTMLDivElement>(null);
    const addressTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // --- LOAD MY ORDERS ---
    const loadMyOrders = async () => {
        const savedOrderIds = JSON.parse(localStorage.getItem('om_orderIds') || '[]');
        if (savedOrderIds.length === 0) {
            setMyOrders([]);
            return;
        }
        setIsLoadingOrders(true);
        try {
            const params = new URLSearchParams(window.location.search);
            const tenantId = params.get('tenantId') || '00000000-0000-0000-0000-000000000000';
            const allOrders = await dbOrders.getAll(tenantId);
            const filtered = allOrders.filter(o => savedOrderIds.includes(o.id));
            setMyOrders(filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10));
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingOrders(false);
        }
    };

    // --- SEARCH CEP ---
    const handleCepSearch = async (currentCep: string) => {
        const cleanCep = currentCep.replace(/\D/g, '');
        setCep(cleanCep);
        if (cleanCep.length !== 8) return;

        setIsSearchingCep(true);
        try {
            const resp = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await resp.json();
            if (!data.erro) {
                const newAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
                setAddress(newAddress);
                setCity(data.localidade);
                setState(data.uf);
            } else {
                alert("CEP não encontrado.");
            }
        } catch (error) {
            console.error("Erro ao buscar CEP", error);
            alert("Erro ao buscar CEP.");
        } finally {
            setIsSearchingCep(false);
        }
    };

    // --- EFFECT: LOAD DATA ---
    useEffect(() => {
        loadData();

        const savedName = localStorage.getItem('om_customerName');
        const savedPhone = localStorage.getItem('om_customerPhone');
        const savedCep = localStorage.getItem('om_cep');
        const savedAddress = localStorage.getItem('om_address');
        const savedHouseNumber = localStorage.getItem('om_houseNumber');
        const savedRef = localStorage.getItem('om_referencePoint');

        if (savedName) setCustomerName(savedName);
        if (savedPhone) setCustomerPhone(savedPhone);
        if (savedCep) setCep(savedCep);
        if (savedAddress) setAddress(savedAddress);
        if (savedHouseNumber) setHouseNumber(savedHouseNumber);
        if (savedRef) setReferencePoint(savedRef);
    }, []);

    // --- EFFECT: Debounce Address Calculation ---
    useEffect(() => {
        if (deliveryMethod === 'DELIVERY' && address.length > 5) {
            if (addressTypingTimeoutRef.current) clearTimeout(addressTypingTimeoutRef.current);
            setIsCalculatingFee(true);
            addressTypingTimeoutRef.current = setTimeout(() => {
                calculateDeliveryFee(address);
            }, 1500);
        } else {
            setDeliveryFee(deliveryMethod === 'DELIVERY' ? (settings?.deliveryBaseFee || 0) : 0);
            setIsCalculatingFee(false);
        }
    }, [address, deliveryMethod, settings]);

    const calculateDeliveryFee = async (inputAddress: string) => {
        // Prioritize Fixed Fees by Neighborhood
        const fixedFee = getFixedFeeByNeighborhood(inputAddress);
        if (fixedFee !== null) {
            setDeliveryFee(fixedFee);
            setIsCalculatingFee(false);
            return;
        }

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
        // Now handled in index.html to ensure global coverage
        /*
        if (settings.googleTagId) {
            const scriptId = 'google-analytics-script';
            if (!document.getElementById(scriptId)) {
                // ... logic removed ...
            }
        }
        */
    }, [settings]);

    // --- HELPERS ---
    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category))).sort((a, b) => a.localeCompare(b))];

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    }).sort((a, b) => {
        if (selectedCategory === 'Todos') {
            const getWeight = (cat: string) => {
                if (cat === 'Caipirinha') return 1;
                if (cat === 'Caipiroska Premium') return 2;
                return 99;
            };
            const wA = getWeight(a.category);
            const wB = getWeight(b.category);
            if (wA !== wB) return wA - wB;
            // Se tiverem o mesmo peso (ex: ambas são Caipirinhas), ordena por preço crescente
            return a.priceFilial - b.priceFilial;
        }
        // Se estiver dentro de uma categoria específica, pode ordenar apenas pelo preço ou nome
        return a.priceFilial - b.priceFilial || a.name.localeCompare(b.name);
    });

    const getCartQuantity = (productId: string) => {
        return cart.filter(item => item.product.id === productId).reduce((acc, item) => acc + item.quantity, 0);
    };

    const cartTotal = cart.reduce((acc, item) => {
        const optionsPrice = item.selectedOptions.reduce((sum, opt) => sum + opt.priceChange, 0);
        return acc + ((item.product.priceFilial + optionsPrice) * item.quantity);
    }, 0);

    const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

    const isStoreOpen = () => {
        if (!settings || !settings.businessHours || settings.businessHours.length === 0) return true;

        try {
            // Pegamos o horário e o dia atual no fuso de Brasília/Bahia
            const now = new Date();
            const bahiaTime = now.toLocaleTimeString("pt-BR", {
                timeZone: "America/Bahia",
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            const bahiaDay = now.toLocaleDateString("pt-BR", {
                timeZone: "America/Bahia",
                weekday: 'long'
            }).toLowerCase();

            const [currentH, currentM] = bahiaTime.split(':').map(Number);
            const currentTotalMin = currentH * 60 + currentM;

            // Mapeamos o dia da semana para o formato salvo no banco
            const dayMap: Record<string, string> = {
                'segunda-feira': 'Segunda-feira', 'terça-feira': 'Terça-feira', 'quarta-feira': 'Quarta-feira',
                'quinta-feira': 'Quinta-feira', 'sexta-feira': 'Sexta-feira', 'sábado': 'Sábado',
                'sabado': 'Sábado', 'domingo': 'Domingo'
            };

            // Tratamento especial para browsers ou locais diferentes
            let currentDayKey = bahiaDay;
            // Se o dia vier sem "-feira", removemos a feira do mapa também para comparação
            const matchedKey = Object.keys(dayMap).find(key =>
                bahiaDay.includes(key.split('-')[0])
            );

            const currentDayName = matchedKey ? dayMap[matchedKey] : '';
            const dayConfig = settings.businessHours.find(h => h.day === currentDayName);

            if (!dayConfig) return true; // Se não houver configuração, deixa aberto
            if (!dayConfig.isOpen) return false;

            const [openH, openM] = dayConfig.open.split(':').map(Number);
            const [closeH, closeM] = dayConfig.close.split(':').map(Number);
            const openTotalMin = openH * 60 + openM;
            const closeTotalMin = closeH * 60 + closeM;

            // Se o horário de fechamento for antes da abertura (ex: fechando às 02:00 da manhã do dia seguinte)
            if (closeTotalMin < openTotalMin) {
                return currentTotalMin >= openTotalMin || currentTotalMin <= closeTotalMin;
            }

            return currentTotalMin >= openTotalMin && currentTotalMin <= closeTotalMin;
        } catch (error) {
            console.error("Erro ao validar horário:", error);
            return true;
        }
    };

    const isOpen = isStoreOpen();

    // --- ACTIONS ---
    const handleProductClick = (product: Product) => {
        if (!isOpen) {
            setToastMessage("Desculpe, estamos fechados no momento.");
            return;
        }
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
        const isSemAlcool = choice.name === 'SEM ÁLCOOL' || optionName === 'SEM ÁLCOOL';
        const isAlcohol = optionName === 'FEITO COM' || optionName.toUpperCase().includes('LICOR') || choice.name.toUpperCase().includes('VODKA') || choice.name.toUpperCase().includes('CACHAÇA') || choice.name.toUpperCase().includes('ABSOLUT');

        if (type === 'radio') {
            setSelectedOptions(prev => {
                if (prev[optionName]?.choiceName === choice.name) {
                    const newState: any = { ...prev };
                    delete newState[optionName];
                    return newState;
                }

                const newState: any = {
                    ...prev,
                    [optionName]: { choiceName: choice.name, priceChange: choice.priceChange || 0, optionGroup: optionName }
                };

                if (isSemAlcool) {
                    Object.keys(newState).forEach(k => {
                        const val = newState[k];
                        const group = val.optionGroup?.toUpperCase() || k.toUpperCase();
                        const choiceN = val.choiceName?.toUpperCase() || '';
                        if (group === 'FEITO COM' || group.includes('LICOR') || choiceN.includes('VODKA') || choiceN.includes('CACHAÇA') || choiceN.includes('ABSOLUT')) {
                            delete newState[k];
                        }
                    });
                } else if (isAlcohol) {
                    const semAlcoolKey = 'SEM ÁLCOOL:SEM ÁLCOOL';
                    if (newState[semAlcoolKey]) delete newState[semAlcoolKey];
                    if (newState['SEM ÁLCOOL']) delete newState['SEM ÁLCOOL'];
                }

                return newState;
            });
        } else {
            // Checkbox: toggle
            const key = `${optionName}:${choice.name}`;

            const isSemAlcool = choice.name === 'SEM ÁLCOOL' || optionName === 'SEM ÁLCOOL';
            const isAlcohol = optionName === 'FEITO COM' || optionName.toUpperCase().includes('LICOR') || choice.name.toUpperCase().includes('VODKA') || choice.name.toUpperCase().includes('CACHAÇA') || choice.name.toUpperCase().includes('ABSOLUT');

            setSelectedOptions(prev => {
                const newState = { ...prev };
                if (newState[key]) {
                    delete newState[key];
                } else {
                    newState[key] = { choiceName: choice.name, priceChange: choice.priceChange || 0, isCheckbox: true, optionGroup: optionName, quantity: 1 };

                    if (isSemAlcool) {
                        // Remove alcohol options when Sem Álcool is selected
                        Object.keys(newState).forEach(k => {
                            const val = newState[k];
                            const group = val.optionGroup?.toUpperCase() || '';
                            const choiceN = val.choiceName?.toUpperCase() || '';
                            if (group === 'FEITO COM' || group.includes('LICOR') || choiceN.includes('VODKA') || choiceN.includes('CACHAÇA') || choiceN.includes('ABSOLUT')) {
                                delete newState[k];
                            }
                        });
                    } else if (isAlcohol) {
                        // Remove 'Sem Álcool' when alcohol is selected
                        const semAlcoolKey = 'SEM ÁLCOOL:SEM ÁLCOOL';
                        if (newState[semAlcoolKey]) delete newState[semAlcoolKey];
                        // If there's any other radio variation of SEM ÁLCOOL, remove them too
                        if (newState['SEM ÁLCOOL']) delete newState['SEM ÁLCOOL'];
                    }
                }
                return newState;
            });
        }
    };

    const handleOptionQuantity = (e: React.MouseEvent, optionName: string, choiceName: string, delta: number) => {
        e.stopPropagation();
        const key = `${optionName}:${choiceName}`;
        setSelectedOptions(prev => {
            const newState = { ...prev };
            if (newState[key]) {
                const currentQty = newState[key].quantity || 1;
                const newQty = currentQty + delta;

                if (newQty <= 0) {
                    delete newState[key]; // if quantity <= 0, deselect
                } else {
                    newState[key] = { ...newState[key], quantity: newQty };
                }
            }
            return newState;
        });
    };

    const confirmCustomization = () => {
        // Collect options and ensure no duplicates by using a unique combination key
        const optionsMap = new Map();

        Object.entries(selectedOptions).forEach(([key, val]: any) => {
            const qty = val.quantity && val.quantity >= 1 ? val.quantity : 1;
            const optionGroupName = val.optionGroup || key.split(':')[0] || key;
            const choiceName = val.choiceName;
            const uniqueKey = `${optionGroupName}:${choiceName}`;

            optionsMap.set(uniqueKey, {
                optionName: optionGroupName,
                choiceName: qty > 1 ? `${qty}x ${choiceName}` : choiceName,
                priceChange: (val.priceChange || 0) * qty
            });
        });

        const optionsList = Array.from(optionsMap.values());

        // Validate required options
        const missingOptions = customizationProduct!.options?.filter(opt => {
            if (!opt.required) return false;

            // Allow bypassing 'FEITO COM' if 'SEM ÁLCOOL' is selected
            const hasSemAlcool = selectedOptions['SEM ÁLCOOL:SEM ÁLCOOL'] || selectedOptions['SEM ÁLCOOL'];
            if (opt.name === 'FEITO COM' && hasSemAlcool) {
                return false;
            }

            if (opt.type === 'radio') {
                return !selectedOptions[opt.name];
            } else if (opt.type === 'checkbox') {
                // Check if any selected option belongs to this group
                return !Object.values(selectedOptions).some((val: any) => val.optionGroup === opt.name);
            }
            return false;
        });

        if (missingOptions && missingOptions.length > 0) {
            setToastMessage(`Atenção: Selecione a opção "${missingOptions[0].name}" para continuar.`);
            setTimeout(() => setToastMessage(null), 3500);
            return;
        }

        addToCart(customizationProduct!, customizationQty, optionsList, customizationNotes);
    };

    const handleFinishOrder = async () => {
        if (!customerName.trim()) return alert("Por favor, digite seu nome.");
        if (!customerPhone.trim()) return alert("Por favor, digite seu WhatsApp.");
        if (deliveryMethod === 'DELIVERY') {
            if (!address.trim()) return alert("Por favor, digite o endereço de entrega.");
            if (!houseNumber.trim()) return alert("Por favor, digite o número do endereço.");
        }

        // --- SISTEMA DE PROTEÇÃO CONTRA SPAM (RATE LIMITING) ---
        const lastOrderTimeStr = localStorage.getItem('om_lastOrderTime');
        const now = Date.now();
        if (lastOrderTimeStr) {
            const lastOrderTime = parseInt(lastOrderTimeStr, 10);
            const tempoPassado = now - lastOrderTime;
            const tempoMinimoEsperaMs = 3 * 60 * 1000; // 3 minutos de bloqueio preventivo (ajustável)

            if (tempoPassado < tempoMinimoEsperaMs) {
                const tempoRestanteSegundos = Math.ceil((tempoMinimoEsperaMs - tempoPassado) / 1000);
                alert(`Por questões de segurança, aguarde mais ${tempoRestanteSegundos} segundos antes de enviar um novo pedido.`);
                return;
            }
        }

        if (!isOpen) {
            alert("Desculpe, a loja acabou de fechar. Não é mais possível enviar pedidos no momento.");
            return;
        }

        setIsProcessing(true);

        try {
            const fullAddress = deliveryMethod === 'DELIVERY'
                ? `${address}, Nº ${houseNumber}${referencePoint ? ` (Ref: ${referencePoint})` : ''}`
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
                deliveryFee: deliveryMethod === 'DELIVERY' ? deliveryFee : 0,
                status: 'PENDING',
                branch: Branch.FILIAL,
                createdAt: Date.now()
            };

            const params = new URLSearchParams(window.location.search);
            const tenantId = params.get('tenantId') || '00000000-0000-0000-0000-000000000000';
            await dbOrders.add(newOrder, tenantId);

            const savedOrderIds = JSON.parse(localStorage.getItem('om_orderIds') || '[]');
            if (!savedOrderIds.includes(newOrder.id)) {
                savedOrderIds.push(newOrder.id);
                localStorage.setItem('om_orderIds', JSON.stringify(savedOrderIds));
            }

            localStorage.setItem('om_customerName', customerName);
            localStorage.setItem('om_customerPhone', customerPhone);
            // Salva o momento exato do envio do pedido
            localStorage.setItem('om_lastOrderTime', now.toString());

            if (deliveryMethod === 'DELIVERY') {
                localStorage.setItem('om_cep', cep);
                localStorage.setItem('om_address', address);
                localStorage.setItem('om_houseNumber', houseNumber);
                localStorage.setItem('om_referencePoint', referencePoint);
            }

            try {
                const params = new URLSearchParams(window.location.search);
                const tenantId = params.get('tenantId') || '00000000-0000-0000-0000-000000000000';
                const allCustomers = await dbCustomers.getAll(tenantId);
                const exists = allCustomers.find(c => c.phone === customerPhone);

                const customerData = {
                    id: exists ? exists.id : crypto.randomUUID(),
                    name: customerName,
                    phone: customerPhone,
                    address: fullAddress || exists?.address || '',
                    city: city || exists?.city || '',
                    state: state || exists?.state || '',
                    segment: 'Cardápio Digital',
                    branch: Branch.FILIAL
                };

                if (!exists) {
                    await dbCustomers.add(customerData, tenantId);
                } else {
                    await dbCustomers.update(customerData);
                }
            } catch (e) { console.error("Could not save customer", e); }

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
                <button
                    onClick={() => {
                        setStep('TRACKING');
                        loadMyOrders();
                    }}
                    className="w-full max-w-xs bg-slate-100 text-slate-800 py-4 rounded-xl font-bold shadow-sm hover:bg-slate-200 transition-all mt-3"
                >
                    Acompanhar Pedido
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
                                <div className="flex gap-2 relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border-0 rounded-xl pl-10 pr-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Digite seu CEP"
                                        value={cep}
                                        onChange={e => handleCepSearch(e.target.value)}
                                        maxLength={9}
                                    />
                                    {isSearchingCep && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>}
                                </div>

                                <textarea className="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20 text-sm" placeholder="Endereço completo (Rua, Bairro, Cidade)" value={address} onChange={e => setAddress(e.target.value)} />

                                <div className="flex gap-2">
                                    <input type="text" className="w-[100px] shrink-0 bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Número" value={houseNumber} onChange={e => setHouseNumber(e.target.value)} />
                                    <input type="text" className="flex-1 bg-slate-50 border-0 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ponto de Referência" value={referencePoint} onChange={e => setReferencePoint(e.target.value)} />
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

    // 4. TRACKING SCREEN
    if (step === 'TRACKING') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col md:max-w-md mx-auto animate-in slide-in-from-right duration-300 relative pb-10 shadow-xl">
                <div className="bg-white p-4 sticky top-0 z-30 shadow-sm border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setStep('MENU')} className="p-2 -ml-2 hover:bg-slate-50 rounded-full text-slate-600">
                            <ChevronLeft size={24} />
                        </button>
                        <h1 className="font-bold text-lg text-slate-800">Acompanhar Pedidos</h1>
                    </div>
                    <button onClick={loadMyOrders} className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95 transition-all outline-none">Atualizar</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {isLoadingOrders ? (
                        <div className="text-center py-10 text-slate-400 animate-pulse font-medium">Carregando pedidos...</div>
                    ) : myOrders.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 font-medium">
                            Você ainda não tem pedidos recentes.<br /><br />
                            <button onClick={() => setStep('MENU')} className="text-blue-600 font-bold underline">Voltar ao Cardápio</button>
                        </div>
                    ) : (
                        myOrders.map(order => (
                            <div key={order.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-xs font-black text-slate-400 tracking-wider">PEDIDO #{order.id.split('-')[0].toUpperCase()}</span>
                                        <p className="font-bold text-slate-800 mt-1">{new Date(order.createdAt).toLocaleDateString('pt-BR')} às {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${order.status === 'PENDING' ? 'bg-orange-100 text-orange-700' :
                                        order.status === 'PREPARING' ? 'bg-blue-100 text-blue-700' :
                                            order.status === 'READY' ? 'bg-emerald-100 text-emerald-700' :
                                                order.status === 'DELIVERED' ? 'bg-slate-200 text-slate-700' :
                                                    'bg-red-100 text-red-700'
                                        }`}>
                                        {order.status === 'PENDING' ? 'Aguardando' :
                                            order.status === 'PREPARING' ? 'Em Preparo' :
                                                order.status === 'READY' ? 'Pronto' :
                                                    order.status === 'DELIVERED' ? (order.deliveryMethod === 'DELIVERY' ? 'Saiu p/ Entrega' : 'Entregue') :
                                                        'Cancelado'}
                                    </div>
                                </div>
                                <div className="border-t border-slate-100 pt-3">
                                    {order.items.map((item, idx) => (
                                        <p key={idx} className="text-sm text-slate-600 mb-1"><span className="font-bold text-slate-800">{item.quantity}x</span> {item.productName}</p>
                                    ))}
                                </div>
                                <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium tracking-tight">Total do Pedido</span>
                                    <span className="font-black text-slate-900 text-lg">{formatCurrency(order.total)}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    // 3. MAIN MENU SCREEN (Default)
    return (
        <div
            className="min-h-screen pb-28 md:pb-0 relative font-sans transition-all duration-700 bg-slate-50"
            style={settings?.backgroundImage ? {
                backgroundImage: `url(${settings.backgroundImage})`,
                backgroundAttachment: 'fixed',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
            } : {}}
        >
            {/* Toast */}
            {toastMessage && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-red-600/95 backdrop-blur text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl animate-in fade-in slide-in-from-top-4 text-center">
                    {toastMessage}
                </div>
            )}

            {/* Customization Modal */}
            {customizationProduct && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in" style={{ overscrollBehavior: 'none' }}>
                    <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-3xl shadow-2xl max-h-[85vh] md:max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-lg text-slate-800">Personalizar</h3>
                            <button onClick={() => setCustomizationProduct(null)} className="p-2 bg-slate-200 rounded-full hover:bg-slate-300"><X size={20} /></button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-6 pb-12">
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

                                            const qty = isSelected && option.type === 'checkbox' ? (selectedOptions[`${option.name}:${choice.name}`]?.quantity || 1) : 1;
                                            const allowQuantity = option.type === 'checkbox' && ['GELO', 'CIGARRO', 'PALHEIRO'].some(kw => option.name.toUpperCase().includes(kw));

                                            return (
                                                <div
                                                    key={cIdx}
                                                    onClick={() => handleOptionSelect(option.name, choice as any, option.type)}
                                                    className={`p-3 rounded-xl border flex flex-col justify-center cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
                                                >
                                                    <div className="flex justify-between items-center w-full">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                                                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                                            </div>
                                                            <span className={isSelected ? 'font-bold text-blue-900' : 'text-slate-700'}>{choice.name}</span>
                                                        </div>
                                                        {choice.priceChange ? (
                                                            <span className="text-sm font-medium text-slate-500">+{formatCurrency(choice.priceChange * qty)}</span>
                                                        ) : null}
                                                    </div>

                                                    {isSelected && allowQuantity && (
                                                        <div className="mt-3 flex items-center justify-between pt-3 border-t border-blue-200/50" onClick={(e) => e.stopPropagation()}>
                                                            <span className="text-xs text-blue-800 font-semibold uppercase">Quantidade:</span>
                                                            <div className="flex items-center bg-white border border-blue-200 rounded-lg p-0.5 shadow-sm">
                                                                <button
                                                                    onClick={(e) => handleOptionQuantity(e, option.name, choice.name, -1)}
                                                                    className="w-8 h-8 flex items-center justify-center rounded text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                                                                ><Minus size={14} /></button>
                                                                <span className="w-8 text-center text-sm font-bold text-blue-900">{qty}</span>
                                                                <button
                                                                    onClick={(e) => handleOptionQuantity(e, option.name, choice.name, 1)}
                                                                    className="w-8 h-8 flex items-center justify-center rounded text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                                                                ><Plus size={14} /></button>
                                                            </div>
                                                        </div>
                                                    )}
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
                                style={{ backgroundColor: settings?.primaryColor || '#0f172a' }}
                                className="w-full text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:opacity-90 active:scale-[0.98] transition-all flex justify-between px-6"
                            >
                                <span>Adicionar</span>
                                <span>{formatCurrency(
                                    (customizationProduct.priceFilial + Object.values(selectedOptions).reduce((s: number, o: any) => s + ((o.priceChange * (o.quantity || 1)) || 0), 0)) * customizationQty
                                )}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Optimized White Header */}
            <header className="bg-white border-b border-slate-100 relative z-40">
                <div className="max-w-2xl mx-auto px-5 pt-8 pb-5 flex flex-col items-center gap-4">
                    {/* Centered Circular Profile with better framing */}
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-2xl bg-white flex items-center justify-center p-1.5">
                            <img
                                src="/menu_perfil.jpg"
                                className="w-full h-full object-cover rounded-full"
                                alt="Logo"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = settings?.logoImage || '';
                                }}
                            />
                        </div>
                        {/* Open/Closed Indicator Badge */}
                        <div className={`absolute bottom-2 right-2 w-7 h-7 rounded-full border-4 border-white shadow-md ${isOpen ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    </div>

                    <div className="flex flex-col items-center gap-1.5 mb-2">
                        <h1 className="font-extrabold text-2xl tracking-tight text-slate-900 drop-shadow-sm">
                            {settings?.storeName || 'Gelo do Sertão'}
                        </h1>

                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                            <MapPin size={11} className="text-orange-500/50" />
                            {settings?.address?.split(',')[0] || 'Barreiras, BA'}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full max-w-xs mt-6">
                        {isOpen ? (
                            <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-50 text-green-700 border border-green-100">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                <span className="text-[11px] font-black uppercase tracking-wider">Aberto Agora</span>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-100">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                <span className="text-[11px] font-black uppercase tracking-wider">Fechado</span>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                setStep('TRACKING');
                                loadMyOrders();
                            }}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 text-white shadow-lg shadow-slate-200 active:scale-95 transition-all"
                        >
                            <Package size={14} />
                            <span className="text-[11px] font-black uppercase tracking-wider">Pedidos</span>
                        </button>

                        <a
                            href={`https://wa.me/${settings?.phone || '557799914444'}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-12 h-11 flex items-center justify-center rounded-xl bg-green-500 text-white shadow-lg shadow-green-200 active:scale-95 transition-all"
                        >
                            <Phone size={20} />
                        </a>
                    </div>
                </div>

                {/* Sticky Categories */}
                <div className="sticky top-0 bg-white/95 backdrop-blur-md border-y border-slate-50 shadow-sm overflow-x-auto scrollbar-hide py-3">
                    <div className="px-5 flex gap-2 items-center max-w-3xl mx-auto" ref={categoryScrollRef}>
                        {categories.map(cat => {
                            const isActive = selectedCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => {
                                        setSelectedCategory(cat);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    style={isActive ? { backgroundColor: settings?.primaryColor || '#0f172a' } : {}}
                                    className={`px-5 py-2 text-[11px] font-black uppercase tracking-widest whitespace-nowrap rounded-full transition-all duration-300 ${isActive
                                        ? 'text-white shadow-lg scale-105'
                                        : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'
                                        }`}
                                >
                                    {cat}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-3xl mx-auto p-4 space-y-6">

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar produtos..."
                        className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-700 outline-none focus:ring-2 focus:border-transparent transition-all"
                        style={{ '--tw-ring-color': settings?.primaryColor || '#2563eb' } as any}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {isLoading ? (
                    <div className="py-20 text-center text-slate-400 animate-pulse">Carregando cardápio...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredProducts.map(product => {
                            const qty = getCartQuantity(product.id);

                            return (
                                <div
                                    key={product.id}
                                    style={qty > 0 ? { borderColor: `${settings?.primaryColor || '#2563eb'}40` } : {}}
                                    className={`bg-white p-3 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all flex gap-4 animate-in slide-in-from-bottom-4 duration-500 group cursor-pointer`}
                                    onClick={() => handleProductClick(product)}
                                >
                                    {/* Premium Product Image */}
                                    <div className="w-28 h-28 bg-slate-50 rounded-xl shrink-0 overflow-hidden relative shadow-inner">
                                        {product.image ? (
                                            <img src={product.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={product.name} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300 bg-gradient-to-br from-slate-50 to-slate-100">
                                                <Store size={32} />
                                            </div>
                                        )}
                                        {qty > 0 && (
                                            <div
                                                style={{ backgroundColor: settings?.primaryColor || '#2563eb' }}
                                                className="absolute -top-1 -right-1 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-md border-[3px] border-white"
                                            >
                                                {qty}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info & Controls */}
                                    <div className="flex-1 flex flex-col py-1 pr-1">
                                        <div className="mb-auto">
                                            <h3 className="font-extrabold text-slate-800 text-base leading-tight group-hover:opacity-80 transition-colors">{product.name}</h3>
                                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                                                {product.description || (product.category === 'Batidas' ? 'Feito com a fruta, leite condensado, destilado e gelo' : product.category === 'Caipiroska' ? 'Feito com a fruta, cachaça, açucar e gelo' : product.category === 'Caipiroska Premium' ? 'Feito com a fruta, Absolut e Licor 43, açucar e gelo' : product.category)}
                                            </p>
                                        </div>

                                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-50">
                                            <span className="font-black text-[17px] text-slate-900">
                                                {formatCurrency(product.priceFilial)}
                                            </span>

                                            <button
                                                style={isOpen ? { backgroundColor: settings?.primaryColor || '#0f172a' } : {}}
                                                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all shadow-sm ${isOpen
                                                    ? 'text-white hover:opacity-90 active:scale-95'
                                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                            >
                                                <Plus size={18} strokeWidth={3} />
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
                        style={{ backgroundColor: settings?.primaryColor || '#0f172a' }}
                        className="w-full text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center animate-in slide-in-from-bottom-4 active:scale-[0.98] transition-all"
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