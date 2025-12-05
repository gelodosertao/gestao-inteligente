import React, { useState, useRef } from 'react';
import { Sale, Branch, Product, Customer, User } from '../types';
import { invoiceService } from '../services/invoiceService';
import { ShoppingCart, FileText, CheckCircle, Clock, X, Printer, Send, ScanBarcode, Search, Trash2, Plus, Minus, CreditCard, Banknote, QrCode, Bluetooth, ArrowRight, Store, Factory, Calculator, User as UserIcon, UserPlus, Edit, Save } from 'lucide-react';

interface SalesProps {
   sales: Sale[];
   products: Product[];
   customers: Customer[];
   onAddSale: (sale: Sale) => void;
   onAddCustomer: (customer: Customer) => void;
   currentUser: User;
   onUpdateSale: (sale: Sale) => void;
   onDeleteSale: (saleId: string) => void;
}

interface CartItem {
   product: Product;
   quantity: number;
   negotiatedPrice?: number; // Added for wholesale price override
}

type PaymentMethod = 'Pix' | 'Credit' | 'Debit' | 'Cash';

const Sales: React.FC<SalesProps> = ({ sales, products, customers, onAddSale, onAddCustomer, currentUser, onUpdateSale, onDeleteSale }) => {
   const [activeTab, setActiveTab] = useState<'History' | 'POS'>('History');

   // --- EDIT SALE STATE ---
   const [showEditSaleModal, setShowEditSaleModal] = useState(false);
   const [editingSale, setEditingSale] = useState<Sale | null>(null);

   const openEditSaleModal = (sale: Sale) => {
      setEditingSale({ ...sale });
      setShowEditSaleModal(true);
   };

   const handleSaveEditedSale = () => {
      if (!editingSale) return;
      onUpdateSale(editingSale);
      setShowEditSaleModal(false);
      setEditingSale(null);
   };

   // --- INVOICE MODAL STATE ---
   const [selectedSaleForInvoice, setSelectedSaleForInvoice] = useState<Sale | null>(null);
   const [invoiceStep, setInvoiceStep] = useState<'FORM' | 'PROCESSING' | 'SUCCESS'>('FORM');
   const [cpf, setCpf] = useState('');
   const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null); // For printing POS receipt

   // --- POS (PDV) STATE ---
   const [selectedBranch, setSelectedBranch] = useState<Branch>(Branch.FILIAL); // Default to Retail/Filial
   const [cart, setCart] = useState<CartItem[]>([]);
   const [scannerStatus, setScannerStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
   const [barcodeInput, setBarcodeInput] = useState('');
   const [posSearchTerm, setPosSearchTerm] = useState('');
   const barcodeInputRef = useRef<HTMLInputElement>(null);

   // Auto-focus scanner when entering POS
   React.useEffect(() => {
      if (activeTab === 'POS') {
         setTimeout(() => barcodeInputRef.current?.focus(), 100);
      }
   }, [activeTab]);

   // --- WHOLESALE PRICE NEGOTIATION STATE ---
   const [showPriceModal, setShowPriceModal] = useState(false);
   const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
   const [negotiatedPrice, setNegotiatedPrice] = useState<string>('');
   const [negotiatedQty, setNegotiatedQty] = useState<number>(1);

   // --- POS CHECKOUT STATE ---
   const [showPaymentModal, setShowPaymentModal] = useState(false);
   const [checkoutStep, setCheckoutStep] = useState<'METHOD' | 'PROCESSING' | 'RECEIPT'>('METHOD');
   const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
   const [cashReceived, setCashReceived] = useState<string>('');

   // Helper for currency
   const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
   };

   // Filter products for POS quick select
   // Logic: If Atacado (Matriz), SHOW ONLY ICE PRODUCTS.
   const filteredPosProducts = products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(posSearchTerm.toLowerCase()) || p.id.includes(posSearchTerm);

      if (selectedBranch === Branch.MATRIZ) {
         // Atacado Filter: Only Ice products
         const isIce = p.category.includes('Gelo');
         return matchesSearch && isIce;
      }

      return matchesSearch;
   });

   // Get correct price based on selected branch
   const getProductPrice = (item: CartItem) => {
      // If wholesale and has negotiated price, use it
      if (selectedBranch === Branch.MATRIZ && item.negotiatedPrice !== undefined) {
         return item.negotiatedPrice;
      }
      return selectedBranch === Branch.FILIAL ? item.product.priceFilial : item.product.priceMatriz;
   };

   const getProductStock = (product: Product) => {
      return selectedBranch === Branch.FILIAL ? product.stockFilial : product.stockMatriz;
   };

   const cartTotal = cart.reduce((acc, item) => acc + (getProductPrice(item) * item.quantity), 0);
   const changeAmount = selectedPaymentMethod === 'Cash' && cashReceived ? Math.max(0, parseFloat(cashReceived) - cartTotal) : 0;

   // --- POS FUNCTIONS ---

   const handlePairScanner = () => {
      setScannerStatus('CONNECTING');
      setTimeout(() => {
         setScannerStatus('CONNECTED');
         setTimeout(() => barcodeInputRef.current?.focus(), 100);
      }, 1500);
   };

   const handleProductClick = (product: Product) => {
      const isIce = product.category.includes('Gelo');

      // If Atacado (Matriz) and it is Ice, open negotiation modal
      if (selectedBranch === Branch.MATRIZ && isIce) {
         setPendingProduct(product);
         setNegotiatedPrice(''); // Force manual entry
         setNegotiatedQty(1);
         setShowPriceModal(true);
      } else {
         // Normal add to cart (Filial or Non-Ice)
         addToCart(product);
      }
   };

   const confirmCustomItem = () => {
      if (!pendingProduct) return;
      const price = parseFloat(negotiatedPrice);

      if (!price || price <= 0) {
         alert("Digite um valor válido.");
         return;
      }

      addToCart(pendingProduct, negotiatedQty, price);
      setShowPriceModal(false);
      setPendingProduct(null);
      setNegotiatedPrice('');
      setNegotiatedQty(1);
   };

   const addToCart = (product: Product, qty = 1, customPrice?: number) => {
      const currentStock = getProductStock(product);

      setCart(prev => {
         const existing = prev.find(item => item.product.id === product.id && item.negotiatedPrice === customPrice);

         // Check stock limit for existing item
         if (existing) {
            if (existing.quantity + qty > currentStock) {
               alert(`Estoque insuficiente na ${selectedBranch}!`);
               return prev;
            }
            return prev.map(item =>
               item.product.id === product.id && item.negotiatedPrice === customPrice
                  ? { ...item, quantity: item.quantity + qty }
                  : item
            );
         }

         // Check stock limit for new item
         if (currentStock < qty) {
            alert(`Produto sem estoque na ${selectedBranch}!`);
            return prev;
         }
         return [...prev, { product, quantity: qty, negotiatedPrice: customPrice }];
      });
      setBarcodeInput(''); // Clear scanner input
   };

   const removeFromCart = (productId: string, pricePoint?: number) => {
      setCart(prev => prev.filter(item => !(item.product.id === productId && item.negotiatedPrice === pricePoint)));
   };

   const updateQuantity = (productId: string, delta: number, pricePoint?: number) => {
      setCart(prev => prev.map(item => {
         if (item.product.id === productId && item.negotiatedPrice === pricePoint) {
            const newQty = item.quantity + delta;
            const product = item.product;
            const currentStock = getProductStock(product);

            if (newQty > currentStock) {
               alert("Limite de estoque atingido!");
               return item;
            }

            return newQty > 0 ? { ...item, quantity: newQty } : item;
         }
         return item;
      }));
   };

   const handleBarcodeSubmit = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
         const product = products.find(p => p.id === barcodeInput || p.name.toLowerCase() === barcodeInput.toLowerCase());
         if (product) {
            handleProductClick(product);
         } else {
            alert("Produto não encontrado.");
         }
      }
   };

   const initiateCheckout = () => {
      if (cart.length === 0) return;
      setCheckoutStep('METHOD');
      setSelectedPaymentMethod(null);
      setCashReceived('');
      setShowPaymentModal(true);
   };

   const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
   const [showCustomerModal, setShowCustomerModal] = useState(false);
   const [customerSearch, setCustomerSearch] = useState('');

   // Filter customers for selection
   const filteredCustomers = customers.filter(c =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.cpfCnpj?.includes(customerSearch)
   );

   const processPayment = () => {
      setCheckoutStep('PROCESSING');

      // Simulate transaction time
      setTimeout(() => {
         const newSale: Sale = {
            id: Math.floor(Math.random() * 10000).toString(),
            date: new Date().toISOString().split('T')[0],
            customerName: selectedCustomer ? selectedCustomer.name : (selectedBranch === Branch.MATRIZ ? 'Cliente Atacado' : 'Consumidor Final'),
            total: cartTotal,
            branch: selectedBranch,
            status: 'Completed',
            paymentMethod: selectedPaymentMethod || 'Cash',
            hasInvoice: true, // Auto emit NFC-e
            items: cart.map(c => ({
               productId: c.product.id,
               productName: c.product.name,
               quantity: c.quantity,
               priceAtSale: getProductPrice(c)
            }))
         };

         // Call Global Add Sale (updates Stock and Sales History)
         onAddSale(newSale);
         setLastCompletedSale(newSale);

         setCheckoutStep('RECEIPT');
      }, 1500);
   };

   const finishSale = () => {
      setShowPaymentModal(false);
      setCart([]);
      setActiveTab('History');
   };

   // --- INVOICE FUNCTIONS (For History Tab) ---

   const handleOpenInvoice = (sale: Sale) => {
      setSelectedSaleForInvoice(sale);
      setInvoiceStep('FORM');
      setCpf('');
   };



   const handleEmitInvoice = async () => {
      if (!selectedSaleForInvoice) return;
      setInvoiceStep('PROCESSING');

      try {
         // Chama o serviço de emissão (que está preparado para API real)
         const result = await invoiceService.emitNFCe(selectedSaleForInvoice, cpf);

         if (result.success) {
            setInvoiceStep('SUCCESS');
            // TODO: Atualizar a venda no banco de dados com a chave da nota
            // await dbSales.update({ ...selectedSaleForInvoice, hasInvoice: true, invoiceKey: result.invoiceKey });
         } else {
            alert("Erro ao emitir nota: " + result.message);
            setInvoiceStep('FORM');
         }
      } catch (e) {
         console.error(e);
         alert("Erro técnico ao tentar emitir nota.");
         setInvoiceStep('FORM');
      }
   };

   const closeInvoiceModal = () => {
      setSelectedSaleForInvoice(null);
   };

   return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative h-full">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
               <h2 className="text-2xl font-bold text-slate-800">Vendas & PDV</h2>
               <p className="text-slate-500">
                  {activeTab === 'History' ? 'Gerencie vendas e emita Notas Fiscais (NFC-e).' : 'Frente de Caixa - Operador: João Pedro'}
               </p>
            </div>
            <div className="bg-slate-200 p-1 rounded-lg flex text-sm font-medium">
               <button
                  className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'History' ? 'bg-white text-blue-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}
                  onClick={() => setActiveTab('History')}
               >
                  Histórico
               </button>
               <button
                  className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'POS' ? 'bg-white text-orange-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}
                  onClick={() => setActiveTab('POS')}
               >
                  Nova Venda (PDV)
               </button>
            </div>
         </div>

         {activeTab === 'History' ? (
            // --- HISTORY VIEW ---
            <div className="grid gap-4">
               {sales.map(sale => (
                  <div key={sale.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center hover:border-blue-200 transition-colors">
                     <div className="flex gap-4 items-center">
                        <div className={`p-3 rounded-full ${sale.branch === Branch.MATRIZ ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                           {sale.branch === Branch.MATRIZ ? <Factory size={20} /> : <Store size={20} />}
                        </div>
                        <div>
                           <h4 className="font-bold text-slate-800">{sale.customerName}</h4>
                           <p className="text-sm text-slate-500">{sale.date} • <span className={`font-bold ${sale.branch === Branch.MATRIZ ? 'text-blue-600' : 'text-orange-600'}`}>{sale.branch}</span></p>
                           <div className="text-xs text-slate-400 mt-1">
                              {sale.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                           </div>
                        </div>
                     </div>

                     <div className="mt-4 md:mt-0 flex flex-col items-end gap-2">
                        <span className="font-bold text-lg text-slate-800">{formatCurrency(sale.total)}</span>
                        <div className="flex gap-2">
                           <span className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 ${sale.hasInvoice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              {sale.hasInvoice ? <CheckCircle size={10} /> : <Clock size={10} />}
                              {sale.hasInvoice ? 'NF-e Emitida' : 'Sem NF-e'}
                           </span>
                           <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              {sale.paymentMethod}
                           </span>
                        </div>
                        {!sale.hasInvoice ? (
                           <button
                              onClick={() => handleOpenInvoice(sale)}
                              className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                           >
                              <FileText size={12} /> Emitir Nota
                           </button>
                        ) : (
                           <button className="text-xs text-slate-400 font-medium hover:text-slate-600 flex items-center gap-1 cursor-pointer">
                              <Printer size={12} /> Imprimir DANFE
                           </button>
                        )}
                        {currentUser.role === 'ADMIN' && (
                           <div className="flex gap-2">
                              <button
                                 onClick={() => openEditSaleModal(sale)}
                                 className="text-xs text-slate-400 font-medium hover:text-blue-600 flex items-center gap-1 cursor-pointer"
                              >
                                 <Edit size={12} /> Editar
                              </button>
                              <button
                                 onClick={() => onDeleteSale(sale.id)}
                                 className="text-xs text-slate-400 font-medium hover:text-red-600 flex items-center gap-1 cursor-pointer"
                              >
                                 <Trash2 size={12} /> Excluir
                              </button>
                           </div>
                        )}
                     </div>
                  </div>
               ))}
            </div>
         ) : (
            // --- POS (POINT OF SALE) VIEW ---
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)] min-h-[500px]">

               {/* Left Column: Product Selection */}
               <div className="lg:col-span-2 flex flex-col gap-4">

                  {/* Branch Toggle & Scanner */}
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4">
                     {/* Branch Switcher */}
                     <div className="flex bg-slate-100 p-1.5 rounded-xl">
                        <button
                           onClick={() => { setSelectedBranch(Branch.FILIAL); setCart([]); }}
                           className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold transition-all ${selectedBranch === Branch.FILIAL ? 'bg-white text-orange-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                           <Store size={18} /> Venda na FILIAL (Varejo)
                        </button>
                        <button
                           onClick={() => { setSelectedBranch(Branch.MATRIZ); setCart([]); }}
                           className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold transition-all ${selectedBranch === Branch.MATRIZ ? 'bg-white text-blue-700 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                           <Factory size={18} /> Venda na MATRIZ (Atacado)
                        </button>
                     </div>

                     <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="flex-1 w-full relative">
                           <ScanBarcode className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                           <input
                              ref={barcodeInputRef}
                              type="text"
                              value={barcodeInput}
                              onChange={(e) => setBarcodeInput(e.target.value)}
                              onKeyDown={handleBarcodeSubmit}
                              placeholder={scannerStatus === 'CONNECTED' ? "Escaneie o código de barras..." : "Digite o código do produto e enter..."}
                              className={`w-full pl-10 pr-4 py-3 rounded-xl border-2 transition-all outline-none ${scannerStatus === 'CONNECTED' ? 'border-green-500 bg-green-50/20' : 'border-slate-200 focus:border-orange-500'}`}
                           />
                        </div>
                        <button
                           onClick={handlePairScanner}
                           disabled={scannerStatus === 'CONNECTED'}
                           className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all w-full md:w-auto justify-center
                        ${scannerStatus === 'CONNECTED'
                                 ? 'bg-green-100 text-green-700 cursor-default'
                                 : scannerStatus === 'CONNECTING'
                                    ? 'bg-amber-100 text-amber-700 animate-pulse'
                                    : 'bg-blue-800 text-white hover:bg-blue-700'
                              }`}
                        >
                           <Bluetooth size={18} />
                           {scannerStatus === 'CONNECTED' ? 'Leitor Pareado' : scannerStatus === 'CONNECTING' ? 'Pareando...' : 'Parear Leitor'}
                        </button>
                     </div>
                  </div>

                  {/* Product Grid */}
                  <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-700">
                           {selectedBranch === Branch.MATRIZ ? 'Catálogo de Gelo (Atacado)' : 'Catálogo Completo (Varejo)'}
                        </h3>
                        <div className="relative">
                           <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                           <input
                              type="text"
                              placeholder="Filtrar por nome..."
                              value={posSearchTerm}
                              onChange={(e) => setPosSearchTerm(e.target.value)}
                              className="pl-7 pr-3 py-1 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-orange-500"
                           />
                        </div>
                     </div>

                     {filteredPosProducts.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                           <p>Nenhum produto encontrado para esta unidade.</p>
                           {selectedBranch === Branch.MATRIZ && <p className="text-xs mt-1">(Apenas Gelo é vendido no Atacado)</p>}
                        </div>
                     )}

                     <div className="overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pr-2">
                        {filteredPosProducts.map(product => {
                           const stock = getProductStock(product);
                           const isWholesaleIce = selectedBranch === Branch.MATRIZ && product.category.includes('Gelo');
                           const price = selectedBranch === Branch.FILIAL ? product.priceFilial : product.priceMatriz;

                           return (
                              <button
                                 key={product.id}
                                 onClick={() => handleProductClick(product)}
                                 className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 hover:border-orange-500 hover:bg-orange-50 transition-all text-center group bg-slate-50 active:scale-95 relative"
                                 disabled={stock <= 0}
                              >
                                 <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm mb-2 group-hover:scale-110 transition-transform text-orange-600 font-bold text-xs border border-slate-100">
                                    {product.unit}
                                 </div>
                                 <span className="font-semibold text-sm text-slate-800 leading-tight line-clamp-2">{product.name}</span>

                                 {isWholesaleIce ? (
                                    <span className="text-blue-700 font-bold mt-1 text-xs bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Definir Valor</span>
                                 ) : (
                                    <span className="text-blue-700 font-bold mt-1">{formatCurrency(price)}</span>
                                 )}

                                 {/* Stock Indicator */}
                                 <span className={`absolute top-2 right-2 text-[10px] font-bold px-1.5 rounded ${stock < product.minStock ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'}`}>
                                    {stock}
                                 </span>
                              </button>
                           );
                        })}
                     </div>
                  </div>
               </div>

               {/* Right Column: Cart & Checkout */}
               <div className="bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden h-full">
                  <div className={`p-4 text-white flex justify-between items-center gap-2 ${selectedBranch === Branch.MATRIZ ? 'bg-blue-800' : 'bg-orange-500'}`}>
                     <div className="flex items-center gap-2 shrink-0">
                        <ShoppingCart size={20} className="text-white" />
                        <span className="font-bold hidden md:inline">Caixa: {selectedBranch === Branch.MATRIZ ? 'ATACADO' : 'VAREJO'}</span>
                        <span className="font-bold md:hidden">{selectedBranch === Branch.MATRIZ ? 'ATACADO' : 'VAREJO'}</span>
                     </div>

                     {/* Customer Autocomplete */}
                     <div className="relative flex-1 max-w-[200px]">
                        <div className="flex items-center bg-white/20 hover:bg-white/30 transition-colors rounded-lg px-2 py-1.5 gap-2 border border-white/10 focus-within:bg-white/40 focus-within:border-white/30">
                           <UserIcon size={14} className="text-white/80 shrink-0" />
                           <input
                              type="text"
                              value={selectedCustomer ? selectedCustomer.name : customerSearch}
                              onChange={(e) => {
                                 setCustomerSearch(e.target.value);
                                 if (selectedCustomer) setSelectedCustomer(null);
                              }}
                              placeholder="Identificar Cliente..."
                              className="bg-transparent border-none outline-none text-white text-xs font-medium placeholder-white/60 w-full"
                           />
                           {selectedCustomer || customerSearch ? (
                              <button
                                 onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                                 className="text-white/70 hover:text-white"
                              >
                                 <X size={12} />
                              </button>
                           ) : null}
                        </div>

                        {/* Autocomplete Dropdown */}
                        {customerSearch && !selectedCustomer && (
                           <div className="absolute top-full right-0 w-64 bg-white text-slate-800 shadow-xl rounded-xl mt-2 z-50 max-h-60 overflow-y-auto border border-slate-100 animate-in fade-in slide-in-from-top-2">
                              {filteredCustomers.length > 0 ? (
                                 filteredCustomers.map(c => (
                                    <button
                                       key={c.id}
                                       onClick={() => {
                                          setSelectedCustomer(c);
                                          setCustomerSearch('');
                                       }}
                                       className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-none flex flex-col gap-0.5 group"
                                    >
                                       <span className="font-bold text-slate-700 group-hover:text-blue-700">{c.name}</span>
                                       <span className="text-xs text-slate-400 flex items-center gap-1">
                                          {c.cpfCnpj || 'Sem Documento'}
                                          {c.phone && <span>• {c.phone}</span>}
                                       </span>
                                    </button>
                                 ))
                              ) : (
                                 <div className="p-4 text-center">
                                    <p className="text-xs text-slate-500 mb-2">Nenhum cliente encontrado.</p>
                                    <button
                                       onClick={() => { setShowCustomerModal(true); setCustomerSearch(''); }}
                                       className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200 w-full"
                                    >
                                       + Cadastrar Novo
                                    </button>
                                 </div>
                              )}
                           </div>
                        )}
                     </div>
                  </div>

                  {/* Cart Items List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                     {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                           <ScanBarcode size={48} className="mb-2" />
                           <p className="text-sm">Escaneie um produto ou selecione ao lado.</p>
                        </div>
                     ) : (
                        cart.map((item) => (
                           <div key={`${item.product.id}-${item.negotiatedPrice}`} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                              <div>
                                 <p className="font-bold text-sm text-slate-800 line-clamp-1">{item.product.name}</p>
                                 <p className="text-xs text-slate-500">
                                    {item.quantity} x {formatCurrency(getProductPrice(item))}
                                    {item.negotiatedPrice && <span className="text-blue-600 font-bold ml-1">(Negociado)</span>}
                                 </p>
                              </div>
                              <div className="flex items-center gap-3">
                                 <span className="font-bold text-slate-700">{formatCurrency(item.quantity * getProductPrice(item))}</span>
                                 <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                                    <button onClick={() => updateQuantity(item.product.id, -1, item.negotiatedPrice)} className="p-1 hover:bg-white rounded text-slate-600"><Minus size={12} /></button>
                                    <button onClick={() => removeFromCart(item.product.id, item.negotiatedPrice)} className="p-1 hover:bg-rose-100 text-rose-500 rounded"><Trash2 size={12} /></button>
                                    <button onClick={() => updateQuantity(item.product.id, 1, item.negotiatedPrice)} className="p-1 hover:bg-white rounded text-slate-600"><Plus size={12} /></button>
                                 </div>
                              </div>
                           </div>
                        ))
                     )}
                  </div>

                  {/* Cart Totals & Checkout */}
                  <div className="p-5 bg-white border-t border-slate-200 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                     <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm text-slate-500">
                           <span>Subtotal</span>
                           <span>{formatCurrency(cartTotal)}</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold text-slate-800 pt-2 border-t border-slate-100">
                           <span>Total a Pagar</span>
                           <span className="text-blue-600">{formatCurrency(cartTotal)}</span>
                        </div>
                     </div>

                     <button
                        onClick={initiateCheckout}
                        disabled={cart.length === 0}
                        className={`w-full text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${selectedBranch === Branch.MATRIZ ? 'bg-blue-800 hover:bg-blue-700 shadow-blue-900/20' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-900/20'}`}
                     >
                        Finalizar Venda (F2)
                     </button>
                  </div>
               </div>
            </div>
         )
         }

         {/* --- WHOLESALE PRICE NEGOTIATION MODAL --- */}
         {
            showPriceModal && pendingProduct && (
               <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                  <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                     <div className="p-4 bg-blue-800 text-white flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                           <Calculator size={20} /> Negociar Atacado
                        </h3>
                        <button onClick={() => setShowPriceModal(false)}><X size={20} /></button>
                     </div>
                     <div className="p-6 space-y-4">
                        <div className="text-center">
                           <p className="text-sm text-slate-500">Adicionando ao carrinho:</p>
                           <h4 className="text-lg font-bold text-slate-800">{pendingProduct.name}</h4>
                           <p className="text-xs text-slate-400 mt-1">Preço Base Sugerido: {formatCurrency(pendingProduct.priceMatriz)}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Quantidade</label>
                              <input
                                 type="number"
                                 min="1"
                                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-lg font-bold text-center bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                                 value={negotiatedQty}
                                 onChange={(e) => setNegotiatedQty(Math.max(1, Number(e.target.value)))}
                              />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Valor Unitário</label>
                              <div className="relative">
                                 <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                                 <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0,00"
                                    className="w-full pl-8 pr-2 py-2 border border-slate-200 rounded-lg text-lg font-bold text-center bg-white text-blue-700 focus:ring-2 focus:ring-blue-500"
                                    value={negotiatedPrice}
                                    onChange={(e) => setNegotiatedPrice(e.target.value)}
                                    autoFocus
                                 />
                              </div>
                           </div>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-lg flex justify-between items-center border border-slate-100">
                           <span className="text-sm font-medium text-slate-600">Total do Item:</span>
                           <span className="text-lg font-bold text-slate-800">
                              {formatCurrency(negotiatedQty * (parseFloat(negotiatedPrice) || 0))}
                           </span>
                        </div>

                        <button
                           onClick={confirmCustomItem}
                           className="w-full bg-blue-700 hover:bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-900/10"
                        >
                           Confirmar Valor
                        </button>
                     </div>
                  </div>
               </div>
            )
         }

         {/* --- PAYMENT MODAL --- */}
         {
            showPaymentModal && (
               <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                  <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                     <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                           <CreditCard size={20} className="text-orange-400" /> Pagamento
                        </h3>
                        {checkoutStep !== 'RECEIPT' && <button onClick={() => setShowPaymentModal(false)}><X size={20} /></button>}
                     </div>

                     <div className="p-6">
                        {checkoutStep === 'METHOD' && (
                           <>
                              <div className="text-center mb-6">
                                 <p className="text-sm text-slate-500">Total a Pagar</p>
                                 <h2 className="text-4xl font-bold text-slate-900">{formatCurrency(cartTotal)}</h2>
                              </div>

                              <p className="text-sm font-bold text-slate-700 mb-3">Selecione a Forma de Pagamento:</p>
                              <div className="grid grid-cols-2 gap-3 mb-6">
                                 {['Pix', 'Credit', 'Debit', 'Cash'].map((method) => (
                                    <button
                                       key={method}
                                       onClick={() => setSelectedPaymentMethod(method as PaymentMethod)}
                                       className={`p-4 rounded-xl border-2 font-bold flex flex-col items-center gap-2 transition-all ${selectedPaymentMethod === method ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'}`}
                                    >
                                       {method === 'Pix' && <QrCode size={24} />}
                                       {method === 'Credit' && <CreditCard size={24} />}
                                       {method === 'Debit' && <CreditCard size={24} />}
                                       {method === 'Cash' && <Banknote size={24} />}
                                       {method === 'Cash' ? 'Dinheiro' : method === 'Credit' ? 'Crédito' : method === 'Debit' ? 'Débito' : method}
                                    </button>
                                 ))}
                              </div>

                              {selectedPaymentMethod === 'Cash' && (
                                 <div className="mb-6 animate-in slide-in-from-top-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Valor Recebido</label>
                                    <input
                                       type="number"
                                       autoFocus
                                       className="w-full px-4 py-3 text-lg border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-slate-900"
                                       placeholder="R$ 0,00"
                                       value={cashReceived}
                                       onChange={(e) => setCashReceived(e.target.value)}
                                       min={cartTotal}
                                    />

                                    {/* Quick Cash Buttons */}
                                    <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                       {[cartTotal, Math.ceil(cartTotal / 10) * 10, Math.ceil(cartTotal / 50) * 50].filter((v, i, a) => a.indexOf(v) === i).map(val => (
                                          <button
                                             key={val}
                                             onClick={() => setCashReceived(val.toString())}
                                             className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded hover:bg-slate-200 whitespace-nowrap"
                                          >
                                             {formatCurrency(val)}
                                          </button>
                                       ))}
                                    </div>

                                    {parseFloat(cashReceived) >= cartTotal && (
                                       <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                                          <span className="font-bold text-green-800">Troco a Devolver:</span>
                                          <span className="font-bold text-xl text-green-700">{formatCurrency(changeAmount)}</span>
                                       </div>
                                    )}
                                 </div>
                              )}

                              <button
                                 disabled={!selectedPaymentMethod || (selectedPaymentMethod === 'Cash' && (!cashReceived || parseFloat(cashReceived) < cartTotal))}
                                 onClick={processPayment}
                                 className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-900/20 transition-all"
                              >
                                 Confirmar Pagamento
                              </button>
                           </>
                        )}

                        {checkoutStep === 'PROCESSING' && (
                           <div className="flex flex-col items-center justify-center py-12">
                              <div className="w-16 h-16 border-4 border-blue-100 border-t-orange-500 rounded-full animate-spin mb-6"></div>
                              <h4 className="text-xl font-bold text-slate-800">Processando...</h4>
                              <p className="text-slate-500">Autorizando NFC-e junto à SEFAZ</p>
                           </div>
                        )}

                        {checkoutStep === 'RECEIPT' && (
                           <div className="flex flex-col h-full animate-in zoom-in-95 duration-300">
                              <div className="text-center mb-6">
                                 <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <CheckCircle size={32} />
                                 </div>
                                 <h3 className="text-2xl font-bold text-slate-800">Venda Concluída!</h3>
                                 <p className="text-slate-500">NFC-e autorizada com sucesso.</p>
                              </div>

                              {/* Simulated Thermal Receipt */}
                              <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-lg font-mono text-xs text-slate-600 mb-6 shadow-inner max-h-60 overflow-y-auto mx-4">
                                 <div className="text-center mb-2 border-b border-yellow-200 pb-2">
                                    <p className="font-bold uppercase">Gelo do Sertão Ltda</p>
                                    <p>CNPJ: 00.000.000/0001-00</p>
                                    <p>Unidade: {selectedBranch}</p>
                                 </div>
                                 <div className="space-y-1 mb-2">
                                    {cart.map((item) => (
                                       <div key={item.product.id} className="flex justify-between">
                                          <span>{item.quantity}x {item.product.name.substring(0, 15)}</span>
                                          <span>{formatCurrency(item.quantity * getProductPrice(item))}</span>
                                       </div>
                                    ))}
                                 </div>
                                 <div className="border-t border-yellow-200 pt-2 flex justify-between font-bold">
                                    <span>TOTAL R$</span>
                                    <span>{formatCurrency(cartTotal)}</span>
                                 </div>
                                 <div className="flex justify-between mt-1">
                                    <span>Pagamento: {selectedPaymentMethod}</span>
                                    <span>{selectedPaymentMethod === 'Cash' ? formatCurrency(parseFloat(cashReceived)) : formatCurrency(cartTotal)}</span>
                                 </div>
                                 {selectedPaymentMethod === 'Cash' && (
                                    <div className="flex justify-between">
                                       <span>Troco</span>
                                       <span>{formatCurrency(changeAmount)}</span>
                                    </div>
                                 )}
                                 <div className="text-center mt-4 pt-2 border-t border-yellow-200">
                                    <p>NFC-e Nº 00000123 Série 1</p>
                                    <p>Consulte pela Chave de Acesso em</p>
                                    <p>www.sefaz.gov.br</p>
                                    <div className="w-24 h-24 bg-black/10 mx-auto mt-2 flex items-center justify-center text-[8px] text-center p-1">
                                       [QR CODE SIMULADO]
                                    </div>
                                 </div>
                              </div>

                              <div className="flex gap-3">
                                 <button onClick={() => window.print()} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                    <Printer size={18} /> Imprimir
                                 </button>
                                 <button
                                    onClick={finishSale}
                                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                                 >
                                    Nova Venda <ArrowRight size={18} />
                                 </button>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            )
         }

         {/* Invoice Modal (Existing - For History) */}
         {
            selectedSaleForInvoice && (
               <div className="fixed inset-0 bg-blue-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                  <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                     <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                           <FileText size={18} className="text-blue-600" /> Emissão de NF-e
                        </h3>
                        <button onClick={closeInvoiceModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                     </div>

                     <div className="p-6">
                        {invoiceStep === 'FORM' && (
                           <>
                              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
                                 <p><strong>Venda #{selectedSaleForInvoice.id}</strong> - {selectedSaleForInvoice.customerName}</p>
                                 <p>Valor Total: {formatCurrency(selectedSaleForInvoice.total)}</p>
                              </div>

                              <div className="space-y-4">
                                 <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">CPF / CNPJ do Cliente</label>
                                    <input
                                       type="text"
                                       placeholder="000.000.000-00"
                                       className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                       value={cpf}
                                       onChange={(e) => setCpf(e.target.value)}
                                    />
                                 </div>
                                 <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Natureza da Operação</label>
                                    <select className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white">
                                       <option>5.102 - Venda de mercadoria</option>
                                       <option>5.405 - Venda subst. tributária</option>
                                    </select>
                                 </div>
                              </div>

                              <button
                                 onClick={handleEmitInvoice}
                                 className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition-all"
                              >
                                 <Send size={18} /> Transmitir para SEFAZ
                              </button>
                           </>
                        )}

                        {invoiceStep === 'PROCESSING' && (
                           <div className="flex flex-col items-center justify-center py-8">
                              <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                              <h4 className="font-bold text-slate-800">Autorizando Nota...</h4>
                              <p className="text-sm text-slate-500">Conectando aos servidores da SEFAZ</p>
                           </div>
                        )}

                        {invoiceStep === 'SUCCESS' && (
                           <div className="flex flex-col items-center justify-center py-4 text-center">
                              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                                 <CheckCircle size={32} />
                              </div>
                              <h4 className="text-xl font-bold text-slate-800 mb-1">Nota Autorizada!</h4>
                              <p className="text-sm text-slate-500 mb-6">Chave: 3523 1000 0000 0000 0000 5500 1000 0000 0100</p>

                              <div className="flex gap-3 w-full">
                                 <button onClick={() => window.print()} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-medium flex items-center justify-center gap-2">
                                    <Printer size={18} /> Imprimir
                                 </button>
                                 <button
                                    onClick={closeInvoiceModal}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium"
                                 >
                                    Fechar
                                 </button>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            )}

         {/* --- EDIT SALE MODAL --- */}
         {showEditSaleModal && editingSale && (
            <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                  <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
                     <h3 className="font-bold flex items-center gap-2">
                        <Edit size={20} className="text-orange-400" /> Editar Venda #{editingSale.id}
                     </h3>
                     <button onClick={() => setShowEditSaleModal(false)}><X size={20} /></button>
                  </div>

                  <div className="p-6 space-y-4">
                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Cliente</label>
                        <input
                           type="text"
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                           value={editingSale.customerName}
                           onChange={(e) => setEditingSale({ ...editingSale, customerName: e.target.value })}
                        />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Data</label>
                           <input
                              type="date"
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                              value={editingSale.date}
                              onChange={(e) => setEditingSale({ ...editingSale, date: e.target.value })}
                           />
                        </div>
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Método de Pagamento</label>
                           <select
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                              value={editingSale.paymentMethod}
                              onChange={(e) => setEditingSale({ ...editingSale, paymentMethod: e.target.value as PaymentMethod })}
                           >
                              <option value="Cash">Dinheiro</option>
                              <option value="Pix">Pix</option>
                              <option value="Credit">Crédito</option>
                              <option value="Debit">Débito</option>
                           </select>
                        </div>
                     </div>

                     <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                        <select
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                           value={editingSale.status}
                           onChange={(e) => setEditingSale({ ...editingSale, status: e.target.value as any })}
                        >
                           <option value="Completed">Concluída</option>
                           <option value="Pending">Pendente</option>
                           <option value="Cancelled">Cancelada</option>
                        </select>
                     </div>

                     <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-xs text-amber-800">
                        <strong>Atenção:</strong> Alterar os itens da venda não é permitido nesta versão para garantir a integridade do estoque. Para corrigir itens, cancele esta venda e lance uma nova.
                     </div>

                     <button
                        onClick={handleSaveEditedSale}
                        className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 mt-2"
                     >
                        <Save size={18} /> Salvar Alterações
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* --- CUSTOMER SELECTION MODAL --- */}
         {showCustomerModal && (
            <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
               <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                     <h3 className="font-bold flex items-center gap-2">
                        <UserIcon size={20} className="text-orange-400" /> Selecionar Cliente
                     </h3>
                     <button onClick={() => setShowCustomerModal(false)}><X size={20} /></button>
                  </div>

                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                     <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                           type="text"
                           placeholder="Buscar cliente..."
                           className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                           value={customerSearch}
                           onChange={(e) => setCustomerSearch(e.target.value)}
                           autoFocus
                        />
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2">
                     {filteredCustomers.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                           <p>Nenhum cliente encontrado.</p>
                        </div>
                     ) : (
                        <div className="space-y-1">
                           {filteredCustomers.map(customer => (
                              <button
                                 key={customer.id}
                                 onClick={() => {
                                    setSelectedCustomer(customer);
                                    setShowCustomerModal(false);
                                 }}
                                 className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-colors ${selectedCustomer?.id === customer.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}
                              >
                                 <div>
                                    <p className="font-bold text-slate-800">{customer.name}</p>
                                    <p className="text-xs text-slate-500">{customer.cpfCnpj || 'Sem Documento'}</p>
                                 </div>
                                 {selectedCustomer?.id === customer.id && <CheckCircle size={16} className="text-blue-600" />}
                              </button>
                           ))}
                        </div>
                     )}
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                     {selectedCustomer && (
                        <button
                           onClick={() => { setSelectedCustomer(null); setShowCustomerModal(false); }}
                           className="text-sm text-red-600 hover:underline font-medium"
                        >
                           Remover Seleção
                        </button>
                     )}
                     <button
                        onClick={() => {
                           // Quick add logic could go here, or redirect to Customers tab
                           alert("Para cadastrar um novo cliente, vá para a aba Clientes.");
                           setShowCustomerModal(false);
                        }}
                        className="ml-auto flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800"
                     >
                        <UserPlus size={16} /> Novo Cadastro
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* --- HIDDEN THERMAL RECEIPT (Visible only on Print) --- */}
         <div id="printable-receipt" className="hidden">
            {(lastCompletedSale || selectedSaleForInvoice) && (
               <div className="p-2 text-xs font-mono">
                  <div className="text-center mb-2 border-b border-black pb-2">
                     <h1 className="font-bold text-sm uppercase">Gelo do Sertão</h1>
                     <p>CNPJ: 00.000.000/0001-00</p>
                     <p>{(lastCompletedSale || selectedSaleForInvoice)?.branch}</p>
                     <p>{(lastCompletedSale || selectedSaleForInvoice)?.date}</p>
                  </div>
                  <div className="mb-2">
                     {(lastCompletedSale || selectedSaleForInvoice)?.items.map((item, i) => (
                        <div key={i} className="flex justify-between">
                           <span>{item.quantity}x {item.productName.substring(0, 15)}</span>
                           <span>{formatCurrency(item.quantity * item.priceAtSale)}</span>
                        </div>
                     ))}
                  </div>
                  <div className="border-t border-black pt-1 flex justify-between font-bold">
                     <span>TOTAL</span>
                     <span>{formatCurrency((lastCompletedSale || selectedSaleForInvoice)?.total || 0)}</span>
                  </div>
                  <div className="mt-4 text-center text-[10px]">
                     <p>Obrigado pela preferência!</p>
                     <p>Volte Sempre</p>
                  </div>
               </div>
            )}
         </div>
      </div>
   );
};

export default Sales;