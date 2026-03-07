import React, { useState, useRef, useMemo } from 'react';
import { invoiceService } from '../services/invoiceService';
import { Sale, Branch, Product, Customer, User, PaymentEntry } from '../types';
import { hardwareBridge } from '../services/hardwareBridge';
import { ShoppingCart, FileText, CheckCircle, Clock, X, Printer, Send, ScanBarcode, Search, Trash2, Plus, Minus, CreditCard, Banknote, QrCode, Bluetooth, ArrowRight, Store, Factory, Calculator, User as UserIcon, UserPlus, Edit, Save, ArrowLeft, Download, Camera, Package } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { BrowserMultiFormatReader } from '@zxing/library';
import { getTodayDate } from '../services/utils';

interface SalesProps {
   sales: Sale[];
   products: Product[];
   customers: Customer[];
   onAddSale: (sale: Sale) => void;
   onAddCustomer: (customer: Customer) => void;
   currentUser: User;
   onUpdateSale: (sale: Sale) => void;
   onDeleteSale: (saleId: string) => void;
   onBack: () => void;
}

interface CartItem {
   product: Product;
   quantity: number;
   negotiatedPrice?: number; // Added for wholesale price override
   isPack?: boolean; // Indicates if the item is a pack (fardo)
}

type PaymentMethod = 'Pix' | 'Credit' | 'Debit' | 'Cash' | 'Split';

const Sales: React.FC<SalesProps> = ({ sales, products, customers, onAddSale, onAddCustomer, currentUser, onUpdateSale, onDeleteSale, onBack }) => {
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

      // Recalculate total based on items
      const newTotal = editingSale.items.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0);

      // Apply discount if any (assuming discount is stored somewhere or calculated difference)
      // For simplicity in this edit mode, we can just save the total as is or allow manual override if needed but auto-calc is safer.
      // However, if we want to allow "Discount" editing, we should probably add a discount field to Sale type or just manipulate total.
      // Let's assume we update total directly from items sum.

      const updatedSale = { ...editingSale, total: newTotal };

      onUpdateSale(updatedSale);
      setShowEditSaleModal(false);
      setEditingSale(null);
   };

   // Helper to update item in editing sale
   const updateEditingItem = (index: number, field: 'quantity' | 'priceAtSale', value: number) => {
      if (!editingSale) return;
      const newItems = [...editingSale.items];
      newItems[index] = { ...newItems[index], [field]: value };
      setEditingSale({ ...editingSale, items: newItems });
   };

   const removeEditingItem = (index: number) => {
      if (!editingSale) return;
      const newItems = editingSale.items.filter((_, i) => i !== index);
      setEditingSale({ ...editingSale, items: newItems });
   };

   // --- INVOICE MODAL STATE ---
   const [selectedSaleForInvoice, setSelectedSaleForInvoice] = useState<Sale | null>(null);
   const [invoiceStep, setInvoiceStep] = useState<'FORM' | 'PROCESSING' | 'SUCCESS'>('FORM');
   const [cpf, setCpf] = useState('');
   const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null); // For printing POS receipt
   const [saleToDownload, setSaleToDownload] = useState<Sale | null>(null); // For downloading history receipt

   // --- DEBT PAYMENT STATE ---
   const [showDebtModal, setShowDebtModal] = useState(false);
   const [selectedDebtSale, setSelectedDebtSale] = useState<Sale | null>(null);
   const [paymentAmountInput, setPaymentAmountInput] = useState('');
   const [paymentDateInput, setPaymentDateInput] = useState('');
   const [paymentMethodInput, setPaymentMethodInput] = useState<'Pix' | 'Credit' | 'Debit' | 'Cash'>('Pix');
   const [paymentNotesInput, setPaymentNotesInput] = useState('');

   const openDebtPaymentModal = (sale: Sale) => {
      setSelectedDebtSale(sale);
      const remaining = sale.total - (sale.amountPaid || 0);
      setPaymentAmountInput(remaining.toFixed(2));
      setPaymentDateInput(getTodayDate());
      setPaymentMethodInput('Pix');
      setPaymentNotesInput('');
      setShowDebtModal(true);
   };

   const handleRegisterPayment = () => {
      if (!selectedDebtSale) return;

      const amount = parseFloat(paymentAmountInput.replace(',', '.'));
      if (isNaN(amount) || amount <= 0) {
         alert('Valor inválido');
         return;
      }

      const currentPaid = selectedDebtSale.amountPaid || 0;
      const remaining = selectedDebtSale.total - currentPaid;

      if (amount > remaining + 0.1) {
         alert(`O valor não pode ser maior que o restante (R$ ${remaining.toFixed(2)})`);
         return;
      }

      const newEntry: PaymentEntry = {
         id: crypto.randomUUID(),
         date: paymentDateInput,
         amount: amount,
         method: paymentMethodInput,
         notes: paymentNotesInput
      };

      const newPaid = currentPaid + amount;
      const history = selectedDebtSale.paymentHistory || [];
      const newHistory = [...history, newEntry];

      // Tolerance for float comparison
      const isFullyPaid = newPaid >= selectedDebtSale.total - 0.05;

      const updatedSale: Sale = {
         ...selectedDebtSale,
         amountPaid: newPaid,
         paymentHistory: newHistory,
         status: isFullyPaid ? 'Completed' : 'Pending',
         // If fully paid, we keep hasInvoice as is (usually false for Fiado), 
         // user can emit later or we could auto-emit? Keeping manual for flexibility.
      };

      onUpdateSale(updatedSale);
      setShowDebtModal(false);
      setSelectedDebtSale(null);
   };

   // --- POS (PDV) STATE ---
   const [selectedBranch, setSelectedBranch] = useState<Branch>(Branch.FILIAL); // Default to Retail/Filial
   const [selectedDeposit, setSelectedDeposit] = useState<'Ibotirama' | 'Barreiras'>('Ibotirama');
   const [isWholesale, setIsWholesale] = useState(false); // Toggle for Wholesale prices in Filial
   const [cart, setCart] = useState<CartItem[]>([]);
   const [scannerStatus, setScannerStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
   const [barcodeInput, setBarcodeInput] = useState('');
   const [posSearchTerm, setPosSearchTerm] = useState('');
   const [posCategoryFilter, setPosCategoryFilter] = useState('ALL');
   const barcodeInputRef = useRef<HTMLInputElement>(null);

   // --- CAMERA SCANNER STATE ---
   const [showCameraModal, setShowCameraModal] = useState(false);
   const videoRef = useRef<HTMLVideoElement>(null);
   const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

   // --- HISTORY SEARCH STATE ---
   const [historySearchTerm, setHistorySearchTerm] = useState('');
   const [statusFilter, setStatusFilter] = useState<'ALL' | 'Completed' | 'Pending' | 'Cancelled'>('ALL');

   // --- MOBILE RESPONSIVE STATE ---
   const [showMobileCart, setShowMobileCart] = useState(false);

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

   // --- PACK SELECTION STATE ---
   const [showPackSelectionModal, setShowPackSelectionModal] = useState(false);

   // --- POS CHECKOUT STATE ---
   const [showPaymentModal, setShowPaymentModal] = useState(false);
   const [checkoutStep, setCheckoutStep] = useState<'METHOD' | 'PROCESSING' | 'RECEIPT'>('METHOD');
   const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);

   const [cashReceived, setCashReceived] = useState<string>('');
   const [saleDate, setSaleDate] = useState<string>(getTodayDate());
   const [discount, setDiscount] = useState<string>(''); // Discount in R$
   const [isPendingSale, setIsPendingSale] = useState(false);

   // --- SPLIT PAYMENT STATE ---
   const [splitMethod1, setSplitMethod1] = useState<Exclude<PaymentMethod, 'Split'>>('Cash');
   const [splitValue1, setSplitValue1] = useState<string>('');
   const [splitMethod2, setSplitMethod2] = useState<Exclude<PaymentMethod, 'Split'>>('Pix');
   const [splitValue2, setSplitValue2] = useState<string>('');

   // Helper for currency
   const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
   };



   // Get available categories for filtering
   const availableCategories = Array.from(new Set(products.map(p => p.category))).sort((a, b) => a.localeCompare(b));

   // Filter products for POS quick select
   // Logic: If Atacado (Matriz), SHOW ONLY ICE PRODUCTS.
   const filteredPosProducts = products.filter(p => {
      const normalizedSearchTerm = posSearchTerm.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const normalizedProductName = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

      const matchesSearch = normalizedProductName.includes(normalizedSearchTerm) || p.id.includes(posSearchTerm);
      const matchesCategory = posCategoryFilter === 'ALL' || p.category === posCategoryFilter;

      if (selectedBranch === Branch.MATRIZ) {
         // Atacado Filter: Only Ice products
         const isIce = p.category.includes('Gelo');
         return matchesSearch && isIce && matchesCategory;
      }

      return matchesSearch && matchesCategory;
   });

   // Get correct price based on selected branch
   const getProductPrice = (item: CartItem) => {
      // If has negotiated price, use it (regardless of branch)
      if (item.negotiatedPrice !== undefined) {
         return item.negotiatedPrice;
      }
      // If is Pack, use Pack Price
      if (item.isPack && item.product.pricePack) {
         return item.product.pricePack;
      }
      // If Matriz OR Wholesale Mode enabled in Filial -> Use Wholesale Price
      if (selectedBranch === Branch.MATRIZ || isWholesale) {
         return item.product.priceMatriz;
      }
      return item.product.priceFilial;
   };

   const getProductStock = (product: Product) => {
      if (selectedBranch === Branch.FILIAL) return product.stockFilial;
      return selectedDeposit === 'Barreiras' ? product.stockMatrizBarreiras : product.stockMatrizIbotirama;
   };

   const subtotal = cart.reduce((acc, item) => acc + (getProductPrice(item) * item.quantity), 0);
   const discountValue = parseFloat(discount) || 0;
   const cartTotal = Math.max(0, subtotal - discountValue);
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

      // If Ice product, open negotiation modal (allows setting quantity and price)
      // We keep this for Ice because it often involves bulk negotiation
      if (isIce) {
         setPendingProduct(product);
         // Default to Wholesale price if in Wholesale mode or Matriz
         if (selectedBranch === Branch.MATRIZ || isWholesale) {
            setNegotiatedPrice('');
            setNegotiatedQty(0);
         } else {
            setNegotiatedPrice(product.priceFilial.toString());
            setNegotiatedQty(1);
         }
         setShowPriceModal(true);
      } else if (product.packSize && product.pricePack) {
         setPendingProduct(product);
         setShowPackSelectionModal(true);
      } else {
         // Normal add to cart (Non-Ice products)
         addToCart(product);
      }
   };

   const confirmCustomItem = () => {
      if (!pendingProduct) return;
      const price = parseFloat(negotiatedPrice);

      if (!negotiatedQty || negotiatedQty <= 0) {
         alert("Digite uma quantidade válida.");
         return;
      }

      if (!price || price <= 0) {
         alert("Digite um valor válido.");
         return;
      }

      addToCart(pendingProduct, negotiatedQty, price);
      setShowPriceModal(false);
      setPendingProduct(null);
      setNegotiatedPrice('');
      setNegotiatedQty(0);
   };

   const addToCart = (product: Product, qty = 1, customPrice?: number, isPack = false) => {
      const currentStock = getProductStock(product);
      const stockDeduction = isPack && product.packSize ? qty * product.packSize : qty;

      setCart(prev => {
         const existing = prev.find(item => item.product.id === product.id && item.negotiatedPrice === customPrice && item.isPack === isPack);
         const totalQty = (existing ? existing.quantity : 0) + qty;
         const totalDeduction = isPack && product.packSize ? totalQty * product.packSize : totalQty;

         // Check Combo Stock
         if (product.comboItems && product.comboItems.length > 0) {
            for (const component of product.comboItems) {
               const compProd = products.find(p => p.id === component.productId);
               if (compProd) {
                  const compStock = getProductStock(compProd);
                  const required = component.quantity * totalDeduction;
                  if (required > compStock) {
                     alert(`Estoque insuficiente do componente: ${compProd.name}(Necessário: ${required}, Disponível: ${compStock})`);
                     return prev;
                  }
               }
            }
         }
         // Check Simple Product Stock
         else if (product.isStockControlled !== false && currentStock < totalDeduction) {
            alert(`Produto sem estoque na ${selectedBranch} !`);
            return prev;
         }

         if (existing) {
            return prev.map(item =>
               item.product.id === product.id && item.negotiatedPrice === customPrice && item.isPack === isPack
                  ? { ...item, quantity: item.quantity + qty }
                  : item
            );
         }
         return [...prev, { product, quantity: qty, negotiatedPrice: customPrice, isPack }];
      });
      setBarcodeInput(''); // Clear scanner input
   };

   const removeFromCart = (productId: string, pricePoint?: number, isPack?: boolean) => {
      setCart(prev => prev.filter(item => !(item.product.id === productId && item.negotiatedPrice === pricePoint && item.isPack === isPack)));
   };

   const updateQuantity = (productId: string, delta: number, pricePoint?: number, isPack?: boolean) => {
      setCart(prev => prev.map(item => {
         if (item.product.id === productId && item.negotiatedPrice === pricePoint && item.isPack === isPack) {
            const newQty = item.quantity + delta;
            const product = item.product;
            const currentStock = getProductStock(product);
            const stockDeduction = isPack && product.packSize ? newQty * product.packSize : newQty;

            if (newQty > item.quantity) { // Only check if increasing
               if (product.comboItems && product.comboItems.length > 0) {
                  for (const component of product.comboItems) {
                     const compProd = products.find(p => p.id === component.productId);
                     if (compProd) {
                        const compStock = getProductStock(compProd);
                        const required = component.quantity * stockDeduction;
                        if (required > compStock) {
                           alert(`Estoque insuficiente do componente: ${compProd.name}`);
                           return item;
                        }
                     }
                  }
               } else if (product.isStockControlled !== false && stockDeduction > currentStock) {
                  alert("Limite de estoque atingido!");
                  return item;
               }
            }

            return newQty > 0 ? { ...item, quantity: newQty } : item;
         }
         return item;
      }));
   };

   // Merged Scanner & Text Search Handler
   const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
         const val = posSearchTerm.trim();
         if (val) {
            const normalizedInput = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const product = products.find(p => p.id === val || p.barcode === val || p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalizedInput);
            if (product) {
               handleProductClick(product);
               setPosSearchTerm('');
            } else {
               alert("Produto não encontrado.");
            }
         }
      }
   };

   const startCamera = async () => {
      setShowCameraModal(true);
      if (!codeReaderRef.current) {
         codeReaderRef.current = new BrowserMultiFormatReader();
      }

      try {
         const videoInputDevices = await codeReaderRef.current.listVideoInputDevices();
         if (videoInputDevices.length > 0) {
            const selectedDeviceId = videoInputDevices[0].deviceId;
            codeReaderRef.current.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
               if (result) {
                  const barcode = result.getText();
                  setBarcodeInput(barcode);
                  const normalizedInput = barcode.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                  const product = products.find(p => p.id === barcode || p.barcode === barcode || p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalizedInput);
                  if (product) {
                     handleProductClick(product);
                     stopCamera();
                  } else {
                     alert("Produto não encontrado.");
                  }
               }
            });
         }
      } catch (err) {
         console.error("Erro ao iniciar câmera", err);
      }
   };

   const stopCamera = () => {
      if (codeReaderRef.current) {
         codeReaderRef.current.reset();
      }
      setShowCameraModal(false);
   };


   const initiateCheckout = () => {
      if (cart.length === 0) return;
      setCheckoutStep('METHOD');
      setSelectedPaymentMethod(null);
      setCashReceived('');
      setIsPendingSale(false);
      setSaleDate(getTodayDate()); // Reset to today
      setSplitValue1('');
      setSplitValue2('');
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
      // Validation for Split
      if (selectedPaymentMethod === 'Split') {
         const v1 = parseFloat(splitValue1) || 0;
         const v2 = parseFloat(splitValue2) || 0;
         // Allow small floating point difference
         if (Math.abs(v1 + v2 - cartTotal) > 0.05) {
            alert(`A soma dos pagamentos (R$ ${(v1 + v2).toFixed(2)}) deve ser igual ao total (R$ ${cartTotal.toFixed(2)})`);
            return;
         }
      }

      setCheckoutStep('PROCESSING');

      // Simulate transaction time
      setTimeout(() => {
         // Generate a unique ID (check against existing sales to be 100% sure)
         let newId = crypto.randomUUID();
         let attempts = 0;
         while (sales.some(s => s.id === newId) && attempts < 3) {
            console.warn(`Generated ID collision: ${newId}. Retrying...`);
            newId = crypto.randomUUID();
            attempts++;
         }
         console.log(`Generating New Sale ID: ${newId}`);

         const newSale: Sale = {
            id: newId,
            date: saleDate, // Use user selected date
            createdAt: new Date().toISOString(),
            customerName: selectedCustomer ? selectedCustomer.name : (selectedBranch === Branch.MATRIZ ? 'Cliente Atacado' : 'Consumidor Final'),
            total: cartTotal,
            branch: selectedBranch,
            matrizDeposit: selectedBranch === Branch.MATRIZ ? selectedDeposit : undefined,
            status: isPendingSale ? 'Pending' : 'Completed',
            paymentMethod: selectedPaymentMethod || 'Cash',
            paymentSplits: selectedPaymentMethod === 'Split' ? [
               { method: splitMethod1, amount: parseFloat(splitValue1) },
               { method: splitMethod2, amount: parseFloat(splitValue2) }
            ] : undefined,
            hasInvoice: !isPendingSale, // Auto emit NFC-e only if completed
            items: cart.map(c => ({
               productId: c.product.id,
               productName: c.isPack ? `${c.product.name} (Fardo c / ${c.product.packSize})` : c.product.name,
               quantity: c.isPack && c.product.packSize ? c.quantity * c.product.packSize : c.quantity,
               priceAtSale: c.isPack && c.product.packSize ? (getProductPrice(c) / c.product.packSize) : getProductPrice(c)
            })),
            cashReceived: selectedPaymentMethod === 'Cash' && cashReceived ? parseFloat(cashReceived) : undefined,
            changeAmount: selectedPaymentMethod === 'Cash' ? changeAmount : undefined
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
      setDiscount('');
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
            // await dbSales.update({ ...selectedSaleForInvoice, hasInvoice:true, invoiceKey:result.invoiceKey });
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

   const handleDownloadReceipt = async () => {
      const receiptElement = document.getElementById('receipt-content');
      if (!receiptElement) return;

      try {
         const canvas = await html2canvas(receiptElement, {
            scale: 2, // Better quality
            backgroundColor: '#ffffff'
         });
         const image = canvas.toDataURL("image/jpeg", 0.9);

         // Tenta imprimir via Hardware (Maquininha) primeiro
         const printedNatively = hardwareBridge.printReceipt(image);

         if (printedNatively) {
            alert("Enviado para impressora da maquininha!");
            return;
         }

         const imgWidth = 58;
         const pageHeight = (canvas.height * imgWidth) / canvas.width;
         const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: [imgWidth, pageHeight]
         });
         pdf.addImage(image, 'JPEG', 0, 0, imgWidth, pageHeight);
         pdf.save(`Cupom-${lastCompletedSale?.id || 'venda'}.pdf`);
      } catch (e) {
         console.error("Erro ao gerar PDF do cupom", e);
         alert("Erro ao baixar o cupom.");
      }
   };

   // Effect to handle download when saleToDownload is set
   React.useEffect(() => {
      if (saleToDownload) {
         const download = async () => {
            // Wait for render
            await new Promise(resolve => setTimeout(resolve, 100));

            const receiptElement = document.getElementById('printable-receipt-content');
            if (!receiptElement) {
               setSaleToDownload(null);
               return;
            }

            try {
               const canvas = await html2canvas(receiptElement, {
                  scale: 2,
                  backgroundColor: '#ffffff'
               });
               const image = canvas.toDataURL("image/jpeg", 0.9);
               const printedNatively = hardwareBridge.printReceipt(image);

               if (printedNatively) {
                  alert("Enviado para impressora da maquininha!");
               } else {
                  const imgWidth = 58;
                  const pageHeight = (canvas.height * imgWidth) / canvas.width;
                  const pdf = new jsPDF({
                     orientation: "portrait",
                     unit: "mm",
                     format: [imgWidth, pageHeight]
                  });
                  pdf.addImage(image, 'JPEG', 0, 0, imgWidth, pageHeight);
                  pdf.save(`Cupom-${saleToDownload.id}.pdf`);
               }
            } catch (e) {
               console.error("Erro ao gerar PDF do cupom", e);
               alert("Erro ao baixar ou imprimir o cupom.");
            } finally {
               setSaleToDownload(null);
            }
         };
         download();
      }
   }, [saleToDownload]);

   return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative h-full">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex items-center gap-3 w-full md:w-auto">
               {currentUser.role !== 'OPERATOR' && (
                  <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors shrink-0">
                     <ArrowLeft size={24} className="text-slate-600" />
                  </button>
               )}
               <div>
                  <h2 className="text-2xl font-bold text-slate-800">Vendas & PDV</h2>
                  <p className="text-slate-500 text-xs md:text-sm">
                     {activeTab === 'History' ? 'Gerencie vendas e emita Notas.' : 'Frente de Caixa'}
                  </p>
               </div>
            </div>
            <div className="bg-slate-200 p-1 rounded-lg flex text-sm font-medium w-full md:w-auto">
               <button
                  className={`flex-1 md:flex-none px-4 py-2 rounded-md transition-all ${activeTab === 'History' ? 'bg-white text-blue-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'} `}
                  onClick={() => setActiveTab('History')}
               >
                  Histórico
               </button>
               <button
                  className={`flex-1 md:flex-none px-4 py-2 rounded-md transition-all ${activeTab === 'POS' ? 'bg-white text-orange-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'} `}
                  onClick={() => setActiveTab('POS')}
               >
                  Nova Venda (PDV)
               </button>
            </div>
         </div>

         {activeTab === 'History' ? (
            // --- HISTORY VIEW ---
            <div className="grid gap-4 pb-20 md:pb-0">
               {/* History Search Bar & Filters */}
               <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                     <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input
                        type="text"
                        placeholder="Pesquisar venda por cliente, ID ou valor..."
                        value={historySearchTerm}
                        onChange={(e) => setHistorySearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                     />
                  </div>
                  <select
                     value={statusFilter}
                     onChange={(e) => setStatusFilter(e.target.value as any)}
                     className="px-4 py-3 border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-slate-700"
                  >
                     <option value="ALL">Todos os Status</option>
                     <option value="Pending">Pendentes (Fiado)</option>
                     <option value="Completed">Concluídos</option>
                     <option value="Cancelled">Cancelados</option>
                  </select>
               </div>

               {sales.filter(sale => {
                  const matchesSearch = sale.customerName.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
                     sale.id.includes(historySearchTerm) ||
                     sale.total.toString().includes(historySearchTerm);

                  const matchesStatus = statusFilter === 'ALL' || sale.status === statusFilter;

                  return matchesSearch && matchesStatus;
               })
                  .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
                  .map(sale => (
                     <div key={sale.id} className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start hover:border-blue-200 transition-all gap-4">
                        <div className="flex gap-3 md:gap-4 items-start w-full md:w-auto">
                           <div className={`p-3 rounded-xl shrink-0 ${sale.branch === Branch.MATRIZ ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'} `}>
                              {sale.branch === Branch.MATRIZ ? <Factory size={22} /> : <Store size={22} />}
                           </div>
                           <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-slate-800 text-base md:text-lg mb-0.5">{sale.customerName}</h4>
                              <p className="text-xs md:text-sm text-slate-500 flex flex-wrap items-center gap-1.5">
                                 <span>{sale.date}</span>
                                 {sale.createdAt && <span className="hidden sm:inline">- {new Date(sale.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                                 <span className="hidden sm:inline">•</span>
                                 <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] sm:text-xs ${sale.branch === Branch.MATRIZ ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>{sale.branch}</span>
                              </p>
                              <div className="text-xs text-slate-400 mt-2 line-clamp-2 md:line-clamp-none leading-relaxed">
                                 {sale.items.map(i => `${i.quantity}x ${i.productName} `).join(', ')}
                              </div>
                           </div>
                        </div>

                        <div className="mt-2 md:mt-0 flex flex-col items-start md:items-end w-full md:w-auto pt-3 md:pt-0 border-t border-slate-100 md:border-0 border-dashed">
                           <div className="flex justify-between md:justify-end items-center w-full mb-3 md:mb-1">
                              <span className="font-black text-xl md:text-lg text-slate-800">{formatCurrency(sale.total)}</span>
                              {sale.status === 'Pending' && (
                                 <span className="text-xs font-bold text-red-600 ml-3 bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                                    Deve: {formatCurrency(sale.total - (sale.amountPaid || 0))}
                                 </span>
                              )}
                           </div>
                           <div className="flex gap-1.5 flex-wrap justify-start md:justify-end">
                              <span className={`px-2 py-1 rounded-md text-[10px] md:text-xs font-bold border flex items-center gap-1 ${sale.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : sale.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'} `}>
                                 {sale.status === 'Completed' ? 'Concluído' : sale.status === 'Pending' ? 'Pendente' : 'Cancelado'}
                              </span>
                              <span className={`px-2 py-1 rounded-md text-[10px] md:text-xs font-bold border flex items-center gap-1 ${sale.hasInvoice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'} `}>
                                 {sale.hasInvoice ? <CheckCircle size={10} /> : <Clock size={10} />}
                                 {sale.hasInvoice ? 'NF-e Emitida' : 'Sem NF-e'}
                              </span>
                              <span className="px-2 py-1 rounded-md text-[10px] md:text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200">
                                 {sale.paymentMethod}
                              </span>
                           </div>
                           <div className="flex flex-wrap gap-2 mt-3 md:justify-end w-full">
                              {sale.status === 'Pending' && (
                                 <button
                                    onClick={() => openDebtPaymentModal(sale)}
                                    className="flex-1 md:flex-none justify-center text-xs font-bold text-orange-700 flex items-center gap-1.5 cursor-pointer bg-orange-50 px-3 py-2 rounded-lg hover:bg-orange-100 transition-colors border border-orange-200 shadow-sm"
                                 >
                                    <Banknote size={14} /> Receber
                                 </button>
                              )}
                              {!sale.hasInvoice ? (
                                 <button
                                    onClick={() => handleOpenInvoice(sale)}
                                    className="flex-1 md:flex-none justify-center text-xs text-blue-700 font-bold flex items-center gap-1.5 cursor-pointer bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors shadow-sm"
                                 >
                                    <FileText size={14} /> Emitir NF
                                 </button>
                              ) : (
                                 <button
                                    onClick={() => setSaleToDownload(sale)}
                                    className="flex-1 md:flex-none justify-center text-xs text-slate-500 font-bold flex items-center gap-1.5 cursor-pointer bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                                 >
                                    <Download size={14} /> DANFE
                                 </button>
                              )}
                              {currentUser.role === 'ADMIN' && (
                                 <div className="flex gap-2 flex-1 md:flex-none min-w-full md:min-w-0 mt-1 md:mt-0">
                                    <button
                                       onClick={() => openEditSaleModal(sale)}
                                       className="flex-1 md:flex-none justify-center text-xs text-slate-600 font-bold flex items-center gap-1.5 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                    >
                                       <Edit size={14} /> Editar
                                    </button>
                                    <button
                                       onClick={() => onDeleteSale(sale.id)}
                                       className="flex-1 md:flex-none justify-center text-xs text-slate-600 font-bold flex items-center gap-1.5 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                                    >
                                       <Trash2 size={14} /> Excluir
                                    </button>
                                 </div>
                              )}
                           </div>
                        </div>
                     </div>
                  ))}
            </div>
         ) : (
            // --- POS (POINT OF SALE) VIEW ---
            <div className="relative h-[calc(100vh-140px)] md:h-[calc(100vh-12rem)] pb-4 md:pb-0 flex flex-col">
               {/* Unified Top Header: Branches, Search & Scanner */}
               <div className="bg-white p-3 md:p-4 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-slate-100 mb-4 shrink-0 relative z-[60]">
                  <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
                     <div className="flex bg-slate-100/80 p-1.5 rounded-2xl shadow-inner gap-1 shrink-0">
                        <button
                           onClick={() => { setSelectedBranch(Branch.FILIAL); setCart([]); setIsWholesale(false); setPosCategoryFilter('ALL'); setPosSearchTerm(''); }}
                           className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-black transition-all text-xs flex items-center justify-center gap-2 ${selectedBranch === Branch.FILIAL ? 'bg-orange-500 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]' : 'text-slate-500 hover:bg-white hover:text-slate-700'}`}
                        >
                           <Store size={18} /> VAREJO
                        </button>
                        <button
                           onClick={() => { setSelectedBranch(Branch.MATRIZ); setCart([]); setIsWholesale(true); setPosCategoryFilter('ALL'); setPosSearchTerm(''); }}
                           className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-black transition-all text-xs flex items-center justify-center gap-2 ${selectedBranch === Branch.MATRIZ ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]' : 'text-slate-500 hover:bg-white hover:text-slate-700'}`}
                        >
                           <Factory size={18} /> ATACADO
                        </button>
                     </div>

                     <div className="flex gap-3 w-full lg:flex-1 max-w-5xl relative">
                        <div className="relative flex-1 group z-[60]">
                           <Search size={24} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                           <input
                              ref={barcodeInputRef}
                              type="text"

                              value={posSearchTerm}
                              onChange={(e) => setPosSearchTerm(e.target.value)}
                              onKeyDown={handleSearchKeyDown}
                              placeholder="Pesquisar por NOME ou CÓDIGO (F2)..."
                              className="w-full pl-12 pr-4 py-4 text-xl font-black rounded-2xl border-2 border-slate-100 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none bg-slate-50/50 transition-all placeholder:text-slate-300"
                           />

                           {/* Quick Search Dropdown Overlay */}
                           {posSearchTerm.length >= 2 && (
                              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] max-h-96 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                 <div className="p-2 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/90 backdrop-blur-sm">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Resultados ({filteredPosProducts.length})</span>
                                    <button onClick={() => setPosSearchTerm('')} className="p-1 hover:bg-slate-100 rounded-full"><X size={14} /></button>
                                 </div>
                                 <div className="p-1.5 flex flex-col gap-1">
                                    {filteredPosProducts.length === 0 ? (
                                       <div className="p-8 text-center text-slate-400 font-bold">Nenhum produto encontrado.</div>
                                    ) : (
                                       filteredPosProducts.slice(0, 50).map(product => (
                                          <button
                                             key={product.id}
                                             onClick={() => { handleProductClick(product); setPosSearchTerm(''); }}
                                             className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-orange-50 hover:border-orange-200 border border-transparent transition-all group"
                                          >
                                             <div className="flex-1 text-left min-w-0 pr-4">
                                                <div className="flex items-center gap-2">
                                                   <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-black text-slate-500 uppercase">{product.category}</span>
                                                   {product.barcode && <span className="text-[10px] text-slate-400 font-mono">{product.barcode}</span>}
                                                </div>
                                                <p className="font-black text-slate-800 truncate text-base">{product.name}</p>
                                                <p className="text-xs text-slate-400 font-bold">Estoque: {getProductStock(product)} {product.unit}</p>
                                             </div>
                                             <div className="text-right shrink-0">
                                                <div className="text-xl font-black text-orange-600 tracking-tighter">
                                                   {formatCurrency(selectedBranch === Branch.FILIAL ? product.priceFilial : product.priceMatriz)}
                                                </div>
                                                <div className="text-[9px] font-black text-slate-400 uppercase">Clique para Adicionar</div>
                                             </div>
                                          </button>
                                       ))
                                    )}
                                 </div>
                              </div>
                           )}

                           <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:block">
                              <span className="bg-slate-200 text-slate-500 px-2 py-1 rounded text-[10px] font-black">F2</span>
                           </div>
                        </div>
                        <button onClick={startCamera} title="Abrir Câmera" className="p-4 rounded-2xl bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 transition-all active:scale-95 shadow-sm"><Camera size={24} /></button>
                        <button onClick={handlePairScanner} title="Conectar Scanner Bluetooth" className={`p-4 rounded-2xl border transition-all active:scale-95 shadow-sm ${scannerStatus === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-900 text-white border-slate-800'}`}><Bluetooth size={24} /></button>
                     </div>
                  </div>
               </div>

               {selectedBranch === Branch.MATRIZ ? (
                  /* --- MATRIZ VIEW: ULTRA-PROFESSIONAL --- */
                  <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 flex-1 min-h-0 overflow-hidden animate-in fade-in duration-500">
                     {/* Product Picker Left Side */}
                     <div className="lg:col-span-2 bg-white rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-slate-200 flex flex-col overflow-hidden">
                        <div className="p-3 bg-slate-100/50 border-b border-slate-200 flex gap-2 overflow-x-auto scrollbar-thin">
                           <button onClick={() => setPosCategoryFilter('ALL')} className={`px-5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${posCategoryFilter === 'ALL' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-500 hover:bg-slate-200'} `}>TODOS</button>
                           {availableCategories.map(cat => (<button key={cat} onClick={() => setPosCategoryFilter(cat)} className={`px-5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${posCategoryFilter === cat ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-500 hover:bg-slate-200'} `}>{cat.toUpperCase()}</button>))}
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50/20">
                           {filteredPosProducts.map(product => (
                              <button key={product.id} onClick={() => handleProductClick(product)} className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-500 hover:shadow-xl hover:-translate-y-0.5 text-left flex flex-col justify-between min-h-[140px] transition-all group relative overflow-hidden">
                                 <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                    <Plus size={20} className="text-blue-500" />
                                 </div>
                                 <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                       <div className={`w-2 h-2 rounded-full ${getProductStock(product) > 50 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                       <span className="text-[10px] font-black text-slate-400 uppercase">Estoque: {getProductStock(product)}</span>
                                    </div>
                                    <p className="font-black text-sm text-slate-800 leading-tight line-clamp-2">{product.name}</p>
                                 </div>
                                 <p className="font-black text-xl text-blue-700 mt-2 tracking-tighter">{formatCurrency(product.priceMatriz)}</p>
                              </button>
                           ))}
                        </div>
                     </div>

                     {/* Cart Right Side */}
                     <div className="lg:col-span-2 bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden h-full">
                        <div className="p-5 bg-blue-700 text-white flex justify-between items-center shadow-lg">
                           <div className="flex items-center gap-3">
                              <Factory size={24} />
                              <span className="font-black text-lg uppercase tracking-tighter">Pedido de Atacado</span>
                           </div>
                           <span className="px-4 py-1.5 bg-white/20 rounded-full text-xs font-black tracking-widest">{cart.length} ITENS</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-900/50 scrollbar-thin scrollbar-thumb-blue-800">
                           {cart.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50">
                                 <Package size={80} strokeWidth={0.5} className="mb-4" />
                                 <p className="text-xs font-black uppercase tracking-[0.3em]">Carrinho de Atacado Vazio</p>
                              </div>
                           ) : (
                              cart.map(item => (
                                 <div key={`${item.product.id}-${item.negotiatedPrice}`} className="bg-slate-800/80 backdrop-blur-md p-5 rounded-2xl border border-white/5 flex items-center gap-4 hover:border-blue-500/50 transition-all group">
                                    <div className="flex-1 min-w-0">
                                       <h4 className="font-black text-base text-white truncate">{item.product.name}</h4>
                                       <p className="text-xs text-blue-400 font-black uppercase tracking-widest">{formatCurrency(getProductPrice(item))} / un</p>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl">
                                       <button onClick={() => updateQuantity(item.product.id, -1, item.negotiatedPrice, item.isPack)} className="w-10 h-10 flex items-center justify-center bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"><Minus size={16} strokeWidth={3} /></button>
                                       <span className="w-10 text-center font-black text-xl text-white tabular-nums">{item.quantity}</span>
                                       <button onClick={() => updateQuantity(item.product.id, 1, item.negotiatedPrice, item.isPack)} className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-500 transition-colors"><Plus size={16} strokeWidth={3} /></button>
                                    </div>
                                    <div className="text-right min-w-[120px]">
                                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">Total Item</span>
                                       <span className="font-black text-2xl text-white tracking-tighter tabular-nums">{formatCurrency(item.quantity * getProductPrice(item))}</span>
                                    </div>
                                    <button onClick={() => removeFromCart(item.product.id, item.negotiatedPrice, item.isPack)} className="text-rose-400 p-2 hover:bg-rose-500/10 rounded-xl transition-all opacity-40 group-hover:opacity-100"><Trash2 size={24} /></button>
                                 </div>
                              ))
                           )}
                        </div>

                        {/* Totals Section */}
                        <div className="p-8 bg-slate-900 border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.3)]">
                           <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
                              <div className="flex gap-10">
                                 <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Subtotal</span>
                                    <span className="text-xl font-black text-slate-400 line-through opacity-50 tabular-nums">{formatCurrency(subtotal)}</span>
                                 </div>
                                 <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Desconto Aplicado</span>
                                    <div className="flex items-center gap-2 relative">
                                       <span className="absolute left-3 text-blue-500 font-black">R$</span>
                                       <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-28 bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xl font-black text-white outline-none focus:border-blue-500 transition-all tabular-nums" />
                                    </div>
                                 </div>
                              </div>
                              <div className="text-center md:text-right">
                                 <span className="text-xs font-black text-blue-500 uppercase tracking-[0.5em] block mb-2">TOTAL FINAL DO LOTE</span>
                                 <span className="text-7xl font-black text-white tracking-tighter leading-none tabular-nums drop-shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                                    {formatCurrency(cartTotal)}
                                 </span>
                              </div>
                           </div>
                           <button onClick={initiateCheckout} disabled={cart.length === 0} className="w-full py-8 bg-blue-600 text-white rounded-3xl font-black text-3xl shadow-2xl hover:bg-blue-500 hover:shadow-blue-200/20 hover:-translate-y-2 active:translate-y-0 active:scale-95 transition-all flex items-center justify-center gap-6 group disabled:opacity-20 disabled:hover:translate-y-0 text-center uppercase">CONCLUIR ATACADO <Send size={32} className="group-hover:translate-x-2 transition-transform" /></button>
                        </div>
                     </div>
                  </div>
               ) : (
                  /* --- VAREJO VIEW: FULL WIDTH & ULTRA-PREMIUM --- */
                  <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                     <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.08)] border-2 border-slate-100 flex flex-col overflow-hidden h-full relative">
                        {/* Header Banner */}
                        <div className="p-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white flex justify-between items-center shadow-lg relative z-10">
                           <div className="flex items-center gap-4">
                              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                 <ShoppingCart size={24} className="animate-pulse" />
                              </div>
                              <div>
                                 <span className="font-black text-xs uppercase tracking-[0.2em] opacity-80 block">Terminal de Vendas</span>
                                 <span className="font-black text-xl uppercase tracking-tighter">Caixa Varejo</span>
                              </div>
                           </div>
                           <div className="flex items-center gap-4">
                              <div className="hidden md:flex flex-col items-end">
                                 <span className="text-[10px] font-black opacity-70 uppercase">Operador</span>
                                 <span className="text-sm font-bold">{currentUser.name}</span>
                              </div>
                              <div className="h-10 w-[2px] bg-white/20"></div>
                              <div className="px-5 py-2 bg-white/20 rounded-2xl text-xs font-black tracking-widest border border-white/20 backdrop-blur-sm">
                                 {cart.length} {cart.length === 1 ? 'ITEM' : 'ITENS'}
                              </div>
                           </div>
                        </div>

                        {/* Cart Area */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 bg-slate-50/30 scrollbar-thin scrollbar-thumb-orange-200">
                           {cart.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                 <div className="relative mb-6">
                                    <ShoppingCart size={120} strokeWidth={0.5} className="opacity-10" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                       <div className="w-16 h-16 bg-orange-100 rounded-full animate-ping opacity-20"></div>
                                    </div>
                                 </div>
                                 <h3 className="text-2xl font-black text-slate-400 uppercase tracking-[0.2em]">O Caixa Está Vazio</h3>
                                 <p className="text-slate-400 font-bold mt-2">Use a barra superior para buscar produtos (F2)</p>
                              </div>
                           ) : (
                              <div className="max-w-7xl mx-auto w-full space-y-3">
                                 {cart.map(item => (
                                    <div key={`${item.product.id}-${item.negotiatedPrice}`} className="bg-white p-5 md:p-6 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-6 hover:border-orange-300 hover:shadow-xl hover:-translate-y-0.5 transition-all group relative overflow-hidden">
                                       {/* Decorative accent */}
                                       <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                       <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                             <span className="text-[10px] font-black text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full uppercase tracking-widest">{item.product.category}</span>
                                             {item.isPack && <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full uppercase tracking-widest">Fardo</span>}
                                          </div>
                                          <h4 className="font-black text-xl md:text-2xl text-slate-900 leading-tight truncate">{item.product.name}</h4>
                                          <p className="text-base text-slate-400 font-black tracking-tight">{formatCurrency(getProductPrice(item))} <span className="text-xs opacity-60">por {item.product.unit}</span></p>
                                       </div>

                                       <div className="flex items-center gap-4 bg-slate-100/50 p-2 rounded-2xl group-hover:bg-orange-50 transition-colors">
                                          <button
                                             onClick={() => updateQuantity(item.product.id, -1, item.negotiatedPrice, item.isPack)}
                                             className="w-12 h-12 flex items-center justify-center bg-white rounded-xl border border-slate-200 shadow-sm hover:text-orange-600 hover:border-orange-300 active:scale-90 transition-all font-black"
                                          >
                                             <Minus size={20} strokeWidth={3} />
                                          </button>
                                          <span className="w-14 text-center font-black text-3xl text-slate-900 tabular-nums">{item.quantity}</span>
                                          <button
                                             onClick={() => updateQuantity(item.product.id, 1, item.negotiatedPrice, item.isPack)}
                                             className="w-12 h-12 flex items-center justify-center bg-orange-500 text-white rounded-xl shadow-[0_4px_12px_rgba(249,115,22,0.3)] hover:bg-orange-600 active:scale-95 transition-all font-black"
                                          >
                                             <Plus size={20} strokeWidth={3} />
                                          </button>
                                       </div>

                                       <div className="text-right min-w-[200px]">
                                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Subtotal Item</span>
                                          <span className="font-black text-3xl md:text-4xl text-slate-900 tracking-tighter tabular-nums">
                                             {formatCurrency(item.quantity * getProductPrice(item))}
                                          </span>
                                       </div>

                                       <button
                                          onClick={() => removeFromCart(item.product.id, item.negotiatedPrice, item.isPack)}
                                          className="p-4 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100"
                                          title="Remover do Carrinho"
                                       >
                                          <Trash2 size={24} />
                                       </button>
                                    </div>
                                 ))}
                              </div>
                           )}
                        </div>

                        {/* Mega Checkout Section */}
                        <div className="p-6 md:p-8 bg-white border-t-4 border-slate-100 shadow-[0_-20px_50px_rgba(0,0,0,0.05)] flex flex-col xl:flex-row justify-between items-center gap-8 relative z-20">
                           <div className="flex flex-wrap justify-center md:justify-start gap-12 w-full xl:w-auto">
                              <div className="flex flex-col">
                                 <span className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Total Bruto</span>
                                 <span className="text-4xl font-black text-slate-500 tracking-tighter tabular-nums decoration-slate-300 line-through opacity-50">{formatCurrency(subtotal)}</span>
                              </div>

                              <div className="flex flex-col">
                                 <span className="text-[12px] font-black text-orange-500 uppercase tracking-[0.3em] mb-2">Desconto (R$)</span>
                                 <div className="relative group">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-orange-400">R$</span>
                                    <input
                                       type="number"
                                       value={discount}
                                       onChange={(e) => setDiscount(e.target.value)}
                                       className="w-44 bg-orange-50/50 border-2 border-orange-100 rounded-2xl pl-12 pr-4 py-4 text-3xl font-black text-orange-700 outline-none focus:ring-4 focus:ring-orange-100 focus:bg-white transition-all tabular-nums"
                                       placeholder="0,00"
                                    />
                                 </div>
                              </div>
                           </div>

                           <div className="flex flex-col items-center xl:items-end w-full xl:flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                 <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                 <span className="text-sm font-black text-slate-900 uppercase tracking-[0.5em]">VALOR TOTAL A PAGAR</span>
                              </div>
                              <span className="text-[8rem] xl:text-[10rem] font-black text-slate-900 tracking-tighter leading-[0.85] tabular-nums drop-shadow-sm">
                                 {formatCurrency(cartTotal).replace('R$', '').trim()}
                                 <span className="text-4xl font-black text-slate-400 ml-2 uppercase align-middle">BRL</span>
                              </span>
                           </div>

                           <button
                              onClick={initiateCheckout}
                              disabled={cart.length === 0}
                              className="w-full xl:w-auto px-16 py-10 bg-slate-900 text-white rounded-[2.5rem] font-black text-4xl shadow-[0_15px_40px_rgba(0,0,0,0.2)] hover:bg-orange-500 hover:shadow-orange-200 hover:-translate-y-3 active:translate-y-0 active:scale-95 transition-all flex items-center justify-center gap-6 group disabled:opacity-30 disabled:hover:scale-100 disabled:hover:bg-slate-900"
                           >
                              RECEBER <Send size={48} className="group-hover:translate-x-2 transition-transform" />
                           </button>
                        </div>
                     </div>
                  </div>
               )}

               {/* --- PACK SELECTION MODAL --- */}
               {showPackSelectionModal && pendingProduct && (
                  <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                     <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-4 bg-purple-600 text-white flex justify-between items-center">
                           <h3 className="font-bold flex items-center gap-2">
                              <Store size={20} /> Selecione a Unidade
                           </h3>
                           <button onClick={() => { setShowPackSelectionModal(false); setPendingProduct(null); }}><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                           <div className="text-center mb-4">
                              <h4 className="font-bold text-lg text-slate-800">{pendingProduct.name}</h4>
                              <p className="text-sm text-slate-500">Como deseja vender este item?</p>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                              <button
                                 onClick={() => {
                                    addToCart(pendingProduct, 1, undefined, false);
                                    setShowPackSelectionModal(false);
                                    setPendingProduct(null);
                                 }}
                                 className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                              >
                                 <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <span className="font-bold text-xs">{pendingProduct.unit}</span>
                                 </div>
                                 <span className="font-bold text-slate-700">Unidade</span>
                                 <span className="text-lg font-bold text-blue-600">{formatCurrency(selectedBranch === Branch.FILIAL ? pendingProduct.priceFilial : pendingProduct.priceMatriz)}</span>
                              </button>

                              <button
                                 onClick={() => {
                                    addToCart(pendingProduct, 1, undefined, true);
                                    setShowPackSelectionModal(false);
                                    setPendingProduct(null);
                                 }}
                                 className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-100 hover:border-purple-500 hover:bg-purple-50 transition-all group"
                              >
                                 <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Store size={20} />
                                 </div>
                                 <span className="font-bold text-slate-700">Fardo ({pendingProduct.packSize}un)</span>
                                 <span className="text-lg font-bold text-purple-600">{formatCurrency(pendingProduct.pricePack || 0)}</span>
                              </button>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

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
                                       min="0"
                                       className="w-full px-3 py-2 border border-slate-200 rounded-lg text-lg font-bold text-center bg-white text-slate-900 focus:ring-2 focus:ring-blue-500"
                                       value={negotiatedQty || ''}
                                       onChange={(e) => setNegotiatedQty(Number(e.target.value))}
                                       autoFocus
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

                           <div className="p-6 overflow-y-auto flex-1">
                              {checkoutStep === 'METHOD' && (
                                 <>
                                    <div className="text-center mb-6">
                                       <p className="text-sm text-slate-500">Total a Pagar</p>
                                       <h2 className="text-4xl font-bold text-slate-900">{formatCurrency(cartTotal)}</h2>
                                    </div>

                                    <div className="mb-6">
                                       <label className="block text-sm font-bold text-slate-700 mb-1">Data da Venda</label>
                                       <input
                                          type="date"
                                          value={saleDate}
                                          onChange={(e) => setSaleDate(e.target.value)}
                                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-slate-900"
                                       />
                                    </div>

                                    <p className="text-sm font-bold text-slate-700 mb-3">Selecione a Forma de Pagamento:</p>
                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                       {['Pix', 'Credit', 'Debit', 'Cash', 'Split'].map((method) => (
                                          <button
                                             key={method}
                                             onClick={() => {
                                                setSelectedPaymentMethod(method as PaymentMethod);
                                                if (method === 'Split') {
                                                   // Auto-fill first split with total
                                                   setSplitValue1(cartTotal.toString());
                                                   setSplitValue2('0');
                                                }
                                             }}
                                             className={`p-4 rounded-xl border-2 font-bold flex flex-col items-center gap-2 transition-all ${selectedPaymentMethod === method ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 hover:border-slate-300 text-slate-600'} `}
                                          >
                                             {method === 'Pix' && <QrCode size={24} />}
                                             {method === 'Credit' && <CreditCard size={24} />}
                                             {method === 'Debit' && <CreditCard size={24} />}
                                             {method === 'Cash' && <Banknote size={24} />}
                                             {method === 'Split' && <div className="flex"><CreditCard size={16} /><Banknote size={16} /></div>}
                                             {method === 'Cash' ? 'Dinheiro' : method === 'Credit' ? 'Crédito' : method === 'Debit' ? 'Débito' : method === 'Split' ? 'Dividir' : method}
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

                                    {selectedPaymentMethod === 'Split' && (
                                       <div className="mb-6 animate-in slide-in-from-top-2 space-y-4">
                                          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                                             Divida o pagamento em duas formas. A soma deve ser <strong>{formatCurrency(cartTotal)}</strong>.
                                          </div>

                                          {/* Split 1 */}
                                          <div className="flex gap-2">
                                             <select
                                                value={splitMethod1}
                                                onChange={(e) => setSplitMethod1(e.target.value as any)}
                                                className="w-1/3 px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-700"
                                             >
                                                <option value="Cash">Dinheiro</option>
                                                <option value="Pix">Pix</option>
                                                <option value="Credit">Crédito</option>
                                                <option value="Debit">Débito</option>
                                             </select>
                                             <div className="relative flex-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                                                <input
                                                   type="number"
                                                   className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                                                   value={splitValue1}
                                                   onChange={(e) => {
                                                      setSplitValue1(e.target.value);
                                                      // Auto calc remainder
                                                      const val = parseFloat(e.target.value) || 0;
                                                      if (val <= cartTotal) {
                                                         setSplitValue2((cartTotal - val).toFixed(2));
                                                      }
                                                   }}
                                                />
                                             </div>
                                          </div>

                                          {/* Split 2 */}
                                          <div className="flex gap-2">
                                             <select
                                                value={splitMethod2}
                                                onChange={(e) => setSplitMethod2(e.target.value as any)}
                                                className="w-1/3 px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-700"
                                             >
                                                <option value="Pix">Pix</option>
                                                <option value="Cash">Dinheiro</option>
                                                <option value="Credit">Crédito</option>
                                                <option value="Debit">Débito</option>
                                             </select>
                                             <div className="relative flex-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                                                <input
                                                   type="number"
                                                   className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                                                   value={splitValue2}
                                                   onChange={(e) => setSplitValue2(e.target.value)}
                                                />
                                             </div>
                                          </div>
                                       </div>
                                    )}

                                    <div className="mb-6 flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                                       <input
                                          type="checkbox"
                                          id="pendingPayment"
                                          className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 border-gray-300"
                                          checked={isPendingSale}
                                          onChange={(e) => setIsPendingSale(e.target.checked)}
                                       />
                                       <label htmlFor="pendingPayment" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                                          Marcar como Pendente (Fiado / A Receber)
                                       </label>
                                    </div>

                                    <button
                                       disabled={(!isPendingSale && !selectedPaymentMethod) || (selectedPaymentMethod === 'Cash' && !isPendingSale && cashReceived !== '' && parseFloat(cashReceived) < cartTotal) || (selectedPaymentMethod === 'Split' && Math.abs((parseFloat(splitValue1) || 0) + (parseFloat(splitValue2) || 0) - cartTotal) > 0.05)}
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
                                       <p className="text-slate-500">Venda registrada com sucesso.</p>
                                    </div>

                                    {/* Simulated Thermal Receipt */}
                                    <div id="receipt-content" className="bg-yellow-50 border border-yellow-100 p-2 rounded-none font-mono text-[10px] text-black mb-6 shadow-inner overflow-hidden mx-auto w-[58mm] shrink-0">
                                       <div className="text-center mb-4 border-b border-yellow-200 pb-4">
                                          <h2 className="font-bold text-[11px] uppercase leading-tight whitespace-pre-wrap">
                                             {selectedBranch === Branch.FILIAL ? 'Gelo do Sertão |\nAdega & Drinks' : 'Gelo do Sertão Ltda'}
                                          </h2>
                                          <p>CNPJ: 00.000.000/0001-00</p>
                                          <p>Unidade: {selectedBranch}</p>
                                          <p className="mt-2 font-bold">Cliente: {lastCompletedSale?.customerName || 'Consumidor Final'}</p>
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
                                          <span>{selectedPaymentMethod === 'Cash' ? formatCurrency(parseFloat(cashReceived)) : selectedPaymentMethod === 'Split' ? 'Misto' : formatCurrency(cartTotal)}</span>
                                       </div>
                                       {selectedPaymentMethod === 'Split' && (
                                          <div className="text-[10px] text-slate-500 mb-1">
                                             <div className="flex justify-between"><span>{splitMethod1}:</span><span>{formatCurrency(parseFloat(splitValue1))}</span></div>
                                             <div className="flex justify-between"><span>{splitMethod2}:</span><span>{formatCurrency(parseFloat(splitValue2))}</span></div>
                                          </div>
                                       )}
                                       {selectedPaymentMethod === 'Cash' && (
                                          <div className="flex justify-between">
                                             <span>Troco</span>
                                             <span>{formatCurrency(changeAmount)}</span>
                                          </div>
                                       )}
                                       <div className="text-center mt-4 pt-2 border-t border-yellow-200">
                                          <p className="font-bold text-sm">CUPOM FISCAL</p>
                                          <p>Nº {lastCompletedSale?.id.padStart(6, '0')}</p>
                                          <p className="text-[10px] mt-1">{new Date().toLocaleString()}</p>
                                          <div className="w-24 h-24 bg-white mx-auto mt-2 flex items-center justify-center text-[8px] text-center p-1 border border-slate-200">
                                             [QR CODE]
                                          </div>
                                       </div>
                                    </div>

                                    <div className="flex gap-3">
                                       <button onClick={handleDownloadReceipt} className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                          <Download size={18} /> Baixar / Imprimir PDF
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
                                    <p className="text-sm text-slate-500 mb-6">Chave:3523 1000 0000 0000 0000 5500 1000 0000 0100</p>

                                    <div className="flex gap-3 w-full">
                                       <button onClick={() => setSaleToDownload(selectedSaleForInvoice)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-medium flex items-center justify-center gap-2">
                                          <Printer size={18} /> Imprimir PDF
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
                  )
               }

               {/* --- EDIT SALE MODAL --- */}
               {
                  showEditSaleModal && editingSale && (
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
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                                    <select
                                       className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                       value={editingSale.status}
                                       onChange={(e) => setEditingSale({ ...editingSale, status: e.target.value as any })}
                                    >
                                       <option value="Completed">Concluído</option>
                                       <option value="Pending">Pendente</option>
                                       <option value="Cancelled">Cancelado</option>
                                    </select>
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

                              <div className="border-t border-slate-200 pt-4 mt-2">
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
                                             className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors mt-3"
                                             title="Remover item"
                                          >
                                             <Trash2 size={14} />
                                          </button>
                                       </div>
                                    ))}
                                 </div>
                                 <div className="flex justify-between items-center mt-3 bg-slate-100 p-2 rounded">
                                    <span className="text-sm font-bold text-slate-700">Novo Total:</span>
                                    <span className="text-lg font-bold text-blue-800">
                                       {formatCurrency(editingSale.items.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0))}
                                    </span>
                                 </div>
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
                  )
               }

               {/* --- CUSTOMER SELECTION MODAL --- */}
               {
                  showCustomerModal && (
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
                                          className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-colors ${selectedCustomer?.id === customer.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'} `}
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
                  )
               }

               {/* --- HIDDEN THERMAL RECEIPT (Visible only on Print or Download) --- */}
               <div id="printable-receipt" className={saleToDownload ? "fixed top-0 left-0 z-[-1] opacity-0" : "hidden"}>
                  {(lastCompletedSale || selectedSaleForInvoice || saleToDownload) && (
                     <div id="printable-receipt-content" className="p-2 bg-white w-[58mm] text-[10px] font-mono text-black">
                        <div className="text-center mb-2 border-b border-black pb-2">
                           <h2 className="font-bold text-[11px] uppercase leading-tight whitespace-pre-wrap">
                              {(lastCompletedSale || selectedSaleForInvoice || saleToDownload)?.branch === Branch.FILIAL ? 'Gelo do Sertão |\nAdega & Drinks' : 'Gelo do Sertão Ltda'}
                           </h2>
                           <p>CNPJ: 00.000.000/0001-00</p>
                           <p>{(lastCompletedSale || selectedSaleForInvoice || saleToDownload)?.branch}</p>
                           <p>Cliente: {(lastCompletedSale || selectedSaleForInvoice || saleToDownload)?.customerName}</p>
                           <p>{(lastCompletedSale || selectedSaleForInvoice || saleToDownload)?.date}</p>
                        </div>
                        <div className="mb-2">
                           {(lastCompletedSale || selectedSaleForInvoice || saleToDownload)?.items.map((item, i) => (
                              <div key={i} className="flex justify-between">
                                 <span>{item.quantity}x {item.productName.substring(0, 15)}</span>
                                 <span>{formatCurrency(item.quantity * item.priceAtSale)}</span>
                              </div>
                           ))}
                        </div>
                        <div className="border-t border-black pt-1 flex justify-between font-bold">
                           <span>TOTAL</span>
                           <span>{formatCurrency((lastCompletedSale || selectedSaleForInvoice || saleToDownload)?.total || 0)}</span>
                        </div>
                        <div className="text-center mt-4 pt-2 border-t border-black">
                           <p className="font-bold">CUPOM FISCAL</p>
                           <p>Nº {(lastCompletedSale || selectedSaleForInvoice || saleToDownload)?.id.padStart(6, '0')}</p>
                           <div className="w-20 h-20 bg-white border border-black mx-auto mt-2 flex items-center justify-center text-[8px]">
                              [QR CODE]
                           </div>
                        </div>
                        <div className="mt-4 text-center text-[10px]">
                           <p>Obrigado pela preferência!</p>
                        </div>
                     </div>
                  )}
               </div>

               {/* --- DEBT PAYMENT MODAL --- */}
               {
                  showDebtModal && selectedDebtSale && (
                     <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                           <div className="p-4 bg-orange-600 text-white flex justify-between items-center">
                              <h3 className="font-bold flex items-center gap-2">
                                 <Banknote size={20} /> Registrar Pagamento de Fiado
                              </h3>
                              <button onClick={() => setShowDebtModal(false)}><X size={20} /></button>
                           </div>

                           <div className="p-6 space-y-4">
                              <div>
                                 <p className="text-sm text-slate-500 mb-1">Cliente</p>
                                 <p className="font-bold text-lg text-slate-800">{selectedDebtSale.customerName}</p>
                              </div>

                              <div className="flex gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                 <div className="flex-1">
                                    <p className="text-xs text-slate-500">Total Venda</p>
                                    <p className="font-bold text-slate-800">{formatCurrency(selectedDebtSale.total)}</p>
                                 </div>
                                 <div className="flex-1">
                                    <p className="text-xs text-slate-500">Já Pago</p>
                                    <p className="font-bold text-green-600">{formatCurrency(selectedDebtSale.amountPaid || 0)}</p>
                                 </div>
                                 <div className="flex-1 border-l pl-4 border-slate-200">
                                    <p className="text-xs text-red-500 font-bold">Restante</p>
                                    <p className="font-bold text-red-600">{formatCurrency(selectedDebtSale.total - (selectedDebtSale.amountPaid || 0))}</p>
                                 </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Data Pagamento</label>
                                    <input
                                       type="date"
                                       className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                       value={paymentDateInput}
                                       onChange={(e) => setPaymentDateInput(e.target.value)}
                                    />
                                 </div>
                                 <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Valor (R$)</label>
                                    <input
                                       type="number"
                                       className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-bold text-lg"
                                       value={paymentAmountInput}
                                       onChange={(e) => setPaymentAmountInput(e.target.value)}
                                       placeholder="0.00"
                                       step="0.01"
                                       autoFocus
                                    />
                                 </div>
                              </div>

                              <div>
                                 <label className="block text-sm font-bold text-slate-700 mb-1">Forma de Pagamento</label>
                                 <div className="grid grid-cols-2 gap-2">
                                    {['Pix', 'Cash', 'Credit', 'Debit'].map((m) => (
                                       <button
                                          key={m}
                                          onClick={() => setPaymentMethodInput(m as any)}
                                          className={`py-2 rounded-lg text-sm font-bold border transition-colors ${paymentMethodInput === m ? 'bg-orange-100 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                       >
                                          {m === 'Cash' ? 'Dinheiro' : m === 'Credit' ? 'Crédito' : m === 'Debit' ? 'Débito' : m}
                                       </button>
                                    ))}
                                 </div>
                              </div>

                              <div>
                                 <label className="block text-sm font-bold text-slate-700 mb-1">Observações (Opcional)</label>
                                 <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={paymentNotesInput}
                                    onChange={(e) => setPaymentNotesInput(e.target.value)}
                                    placeholder="Ex: Pagamento parcial referente..."
                                 />
                              </div>

                              <button
                                 onClick={handleRegisterPayment}
                                 className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-orange-900/10 flex items-center justify-center gap-2 mt-2"
                              >
                                 <Save size={20} /> Confirmar Pagamento
                              </button>
                           </div>
                        </div>
                     </div>
                  )
               }
               {/* --- HIDDEN THERMAL RECEIPT (FOR PRINTING) --- */}
               {
                  lastCompletedSale && (
                     <div id="receipt-content" className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none bg-white p-2 text-black font-mono text-[10px] w-[300px]" style={{ fontFamily: '"Courier New", Courier, monospace' }}>
                        <div className="text-center border-b border-black pb-2 mb-2">
                           <h2 className="font-bold text-sm uppercase">Gelo do Sertão</h2>
                           <p>CNPJ: 00.000.000/0001-00</p>
                           <p>Rua Exemplo, 123 - Centro</p>
                           <p>Tel: (77) 99999-9999</p>
                        </div>

                        <div className="mb-2">
                           <p><strong>Venda:</strong> #{lastCompletedSale.id}</p>
                           <p><strong>Data:</strong> {lastCompletedSale.date} {new Date().toLocaleTimeString()}</p>
                           <p><strong>Cliente:</strong> {lastCompletedSale.customerName}</p>
                        </div>

                        <div className="border-b border-black pb-2 mb-2">
                           <table className="w-full text-left">
                              <thead>
                                 <tr>
                                    <th className="w-8">Qtd</th>
                                    <th>Item</th>
                                    <th className="text-right">Vl.Tot</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {lastCompletedSale.items.map((item, i) => (
                                    <tr key={i}>
                                       <td>{item.quantity}x</td>
                                       <td className="truncate max-w-[120px]">{item.productName}</td>
                                       <td className="text-right">{formatCurrency(item.quantity * item.priceAtSale)}</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>

                        <div className="text-right mb-4 space-y-1">
                           {lastCompletedSale.deliveryFee && lastCompletedSale.deliveryFee > 0 && (
                              <div className="flex justify-between items-center text-[10px]">
                                 <span>Itens:</span>
                                 <span>{formatCurrency(lastCompletedSale.total - lastCompletedSale.deliveryFee)}</span>
                              </div>
                           )}
                           {lastCompletedSale.deliveryFee && lastCompletedSale.deliveryFee > 0 && (
                              <div className="flex justify-between items-center text-[10px]">
                                 <span>Frete:</span>
                                 <span>{formatCurrency(lastCompletedSale.deliveryFee)}</span>
                              </div>
                           )}
                           <p><strong>Total: {formatCurrency(lastCompletedSale.total)}</strong></p>
                           <p className="text-[9px]">Pagamento: {lastCompletedSale.paymentMethod === 'Credit' ? 'Crédito' : lastCompletedSale.paymentMethod === 'Debit' ? 'Débito' : lastCompletedSale.paymentMethod === 'Pix' ? 'PIX' : 'Dinheiro'}</p>
                        </div>

                        <div className="text-center text-[9px] border-t border-black pt-2">
                           <p>*** RECIBO NÃO FISCAL ***</p>
                           <p>Obrigado pela preferência!</p>
                           <p>Volte Sempre.</p>
                        </div>
                     </div>
                  )
               }


               {/* --- CAMERA SCANNER MODAL --- */}
               {showCameraModal && (
                  <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
                     <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                           <h3 className="font-bold flex items-center gap-2">
                              <Camera size={20} className="text-blue-400" /> Leitor de Código de Barras
                           </h3>
                           <button onClick={stopCamera} className="text-slate-300 hover:text-white transition-colors">
                              <X size={24} />
                           </button>
                        </div>
                        <div className="p-4 flex flex-col items-center justify-center bg-black relative">
                           <video
                              ref={videoRef}
                              className="w-full rounded-lg"
                              style={{ maxHeight: '60vh', objectFit: 'cover' }}
                           ></video>
                           <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-3/4 h-32 border-2 border-red-500 rounded-lg opacity-50"></div>
                           </div>
                        </div>
                        <div className="p-4 text-center text-sm font-medium text-slate-500">
                           Aponte a câmera para o código de barras
                        </div>
                     </div>
                  </div>
               )}
            </div>
         )
         }
      </div>
   );
};

export default Sales;
