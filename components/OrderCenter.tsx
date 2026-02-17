import React, { useState, useEffect } from 'react';
import { Order, Sale, Branch } from '../types';
import { dbOrders, dbSales, dbProducts } from '../services/db';
import { Clock, CheckCircle, Truck, XCircle, ChefHat, ArrowRight, RefreshCw, Store, MapPin, Phone, DollarSign, Calendar } from 'lucide-react';
import { getTodayDate } from '../services/utils';

interface OrderCenterProps {
    onBack: () => void;
    tenantId: string;
}

const OrderCenter: React.FC<OrderCenterProps> = ({ onBack, tenantId }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const lastOrderCountRef = React.useRef(0);
    const [currentTime, setCurrentTime] = useState(Date.now()); // For updating timers

    const playNotificationSound = () => {
        try {
            const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
            audio.play().catch(e => console.log('Audio play failed (user interaction needed first):', e));
        } catch (e) {
            console.error("Error playing sound", e);
        }
    };

    const loadOrders = async () => {
        try {
            const data = await dbOrders.getAll(tenantId);
            const today = getTodayDate();

            // Filter logic: Active orders + Today's delivered
            const filtered = data.filter(o =>
                o.status !== 'DELIVERED' ||
                o.date === today
            );

            // Check for new pending orders to play sound
            const pendingCount = filtered.filter(o => o.status === 'PENDING').length;

            // If count increased, play sound
            if (pendingCount > lastOrderCountRef.current && pendingCount > 0) {
                playNotificationSound();
            }
            lastOrderCountRef.current = pendingCount;

            setOrders(filtered);
        } catch (error) {
            console.error("Erro ao carregar pedidos:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial Load & Polling
    useEffect(() => {
        loadOrders();
        const interval = setInterval(loadOrders, 10000); // 10s poll
        const timerInterval = setInterval(() => setCurrentTime(Date.now()), 60000); // Update timers every min
        return () => {
            clearInterval(interval);
            clearInterval(timerInterval);
        };
    }, []);

    const formatElapsedTime = (timestamp: number) => {
        const diff = currentTime - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    };

    const handleManualRestock = async (order: Order) => {
        if (!confirm("Tem certeza que deseja devolver os itens deste pedido ao estoque? Faça isso apenas se o estorno não tiver ocorrido automaticamente.")) return;

        try {
            const allProducts = await dbProducts.getAll(tenantId);
            for (const item of order.items) {
                const product = allProducts.find(p => p.id === item.productId);
                if (product) {
                    if (product.comboItems && product.comboItems.length > 0) {
                        for (const component of product.comboItems) {
                            const compProd = allProducts.find(p => p.id === component.productId);
                            if (compProd && compProd.isStockControlled !== false) {
                                const qtyToAdd = component.quantity * item.quantity;
                                await dbProducts.update({
                                    ...compProd,
                                    stockFilial: Number(compProd.stockFilial) + qtyToAdd
                                });
                            }
                        }
                    } else if (product.isStockControlled !== false) {
                        await dbProducts.update({
                            ...product,
                            stockFilial: Number(product.stockFilial) + item.quantity
                        });
                    }
                }
            }
            alert("Estoque estornado com sucesso!");
            loadOrders(); // Refresh to ensure state consistency
        } catch (error) {
            console.error("Erro ao estornar estoque:", error);
            alert("Erro ao estornar estoque.");
        }
    };

    const updateStatus = async (order: Order, newStatus: Order['status']) => {
        try {
            // Stock Management Logic (Same as before)
            const stockDeductedStates = ['PREPARING', 'READY', 'DELIVERED'];
            const wasDeducted = stockDeductedStates.includes(order.status);
            const willBeDeducted = stockDeductedStates.includes(newStatus);

            if (!wasDeducted && willBeDeducted) {
                // Deduct Stock
                const allProducts = await dbProducts.getAll(tenantId);
                for (const item of order.items) {
                    const product = allProducts.find(p => p.id === item.productId);
                    if (product) {
                        if (product.comboItems && product.comboItems.length > 0) {
                            for (const component of product.comboItems) {
                                const compProd = allProducts.find(p => p.id === component.productId);
                                if (compProd && compProd.isStockControlled !== false) {
                                    const qtyToDeduct = component.quantity * item.quantity;
                                    await dbProducts.update({
                                        ...compProd,
                                        stockFilial: Math.max(0, compProd.stockFilial - qtyToDeduct)
                                    });
                                }
                            }
                        } else if (product.isStockControlled !== false) {
                            await dbProducts.update({
                                ...product,
                                stockFilial: Math.max(0, product.stockFilial - item.quantity)
                            });
                        }
                    }
                }
            } else if (wasDeducted && !willBeDeducted) {
                // Return Stock (Cancelled or moved back to Pending)
                const allProducts = await dbProducts.getAll(tenantId);
                for (const item of order.items) {
                    const product = allProducts.find(p => p.id === item.productId);
                    if (product) {
                        if (product.comboItems && product.comboItems.length > 0) {
                            for (const component of product.comboItems) {
                                const compProd = allProducts.find(p => p.id === component.productId);
                                if (compProd && compProd.isStockControlled !== false) {
                                    const qtyToAdd = component.quantity * item.quantity;
                                    await dbProducts.update({
                                        ...compProd,
                                        stockFilial: compProd.stockFilial + qtyToAdd
                                    });
                                }
                            }
                        } else if (product.isStockControlled !== false) {
                            await dbProducts.update({
                                ...product,
                                stockFilial: product.stockFilial + item.quantity
                            });
                        }
                    }
                }
            }

            await dbOrders.updateStatus(order.id, newStatus);

            // WhatsApp Notification Logic (Same as before)
            if (order.customerPhone) {
                const phone = order.customerPhone.replace(/\D/g, '');
                const validPhone = phone.length <= 11 ? `55${phone}` : phone;
                let message = '';
                if (newStatus === 'READY') {
                    const isDelivery = order.deliveryMethod === 'DELIVERY';
                    if (isDelivery) {
                        message = `Olá *${order.customerName}*!%0A%0ASeu pedido *saiu para entrega*! 🛵💨%0AEm breve chegaremos no endereço: _${order.address || 'Seu endereço'}_`;
                    } else {
                        message = `Olá *${order.customerName}*!%0A%0ASeu pedido está *pronto para retirada*! 🛍️✅%0APode vir buscar no balcão.`;
                    }
                } else if (newStatus === 'DELIVERED') {
                    message = `Olá *${order.customerName}*!%0A%0ASeu pedido foi *entregue/concluído*. ✅%0A%0AObrigado pela preferência! Volte sempre. ❄️`;
                } else if (newStatus === 'PREPARING') {
                    message = `Olá *${order.customerName}*!%0A%0ASeu pedido foi *aceito* e já está sendo preparado! 👩‍🍳👨‍🍳%0A%0AAvisaremos quando sair para entrega/retirada.`;
                }

                if (message) {
                    window.open(`https://wa.me/${validPhone}?text=${message}`, '_blank');
                }
            }

            // Register Sale on DELIVERED
            if (newStatus === 'DELIVERED' && order.status !== 'DELIVERED') {
                const newSale: Sale = {
                    id: `sale-${order.id.split('-')[1] || Date.now()}`,
                    date: getTodayDate(),
                    createdAt: new Date().toISOString(),
                    customerName: order.customerName,
                    total: order.total,
                    branch: order.branch,
                    status: 'Completed',
                    paymentMethod: order.paymentMethod === 'PIX' ? 'Pix' : order.paymentMethod === 'CARD' ? 'Credit' : 'Cash',
                    hasInvoice: false,
                    items: order.items,
                    cashReceived: undefined,
                    changeAmount: undefined
                };
                await dbSales.add(newSale, tenantId);
                // alert("Venda registrada no financeiro!"); // Less intrusive
            }

            loadOrders();
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            alert("Erro ao atualizar status.");
        }
    };

    const columns = [
        { id: 'PENDING', label: 'Pendente', icon: <Clock size={20} />, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-700' },
        { id: 'PREPARING', label: 'Preparando', icon: <ChefHat size={20} />, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
        { id: 'READY', label: 'Pronto / Saiu', icon: <Truck size={20} />, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700' },
        { id: 'DELIVERED', label: 'Concluído', icon: <CheckCircle size={20} />, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700' },
    ];

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col h-screen overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm shrink-0 z-10">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <div className="bg-blue-600 text-white p-2 rounded-lg"><Truck size={24} /></div>
                        Central de Pedidos
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Gerencie o fluxo de Delivery e Retirada em tempo real</p>
                </div>
                <div className="flex gap-3">
                    <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-500">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Atualização em tempo real
                    </div>
                    <button onClick={loadOrders} className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 text-slate-600 transition-colors" title="Atualizar">
                        <RefreshCw size={20} />
                    </button>
                    <button onClick={onBack} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 font-bold transition-colors shadow-sm">
                        Voltar
                    </button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                        <RefreshCw className="animate-spin text-blue-500" size={40} />
                        <p>Carregando pedidos...</p>
                    </div>
                ) : (
                    <div className="flex gap-6 h-full min-w-max">
                        {columns.map(col => {
                            const colOrders = orders.filter(o => o.status === col.id).sort((a, b) => b.createdAt - a.createdAt);
                            return (
                                <div key={col.id} className="flex flex-col w-[350px] shrink-0 h-full">
                                    {/* Column Header */}
                                    <div className={`p-4 rounded-t-2xl font-bold flex items-center justify-between border-t-4 ${col.bg} ${col.text} ${col.border.replace('border', 'border-t-')}`}>
                                        <div className="flex items-center gap-2">
                                            {col.icon}
                                            <span className="text-lg">{col.label}</span>
                                        </div>
                                        <span className={`px-2.5 py-0.5 rounded-full text-sm font-extrabold bg-white shadow-sm`}>
                                            {colOrders.length}
                                        </span>
                                    </div>

                                    {/* Column Body */}
                                    <div className={`flex-1 ${col.bg} bg-opacity-30 border-x border-b ${col.border} rounded-b-2xl p-3 space-y-3 overflow-y-auto custom-scrollbar`}>
                                        {colOrders.map(order => (
                                            <div key={order.id} className="bg-white p-0 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all group relative overflow-hidden">
                                                {/* Status Strip */}
                                                <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${col.text.replace('text', 'bg').replace('800', '500')}`}></div>

                                                <div className="p-4 pl-5">
                                                    {/* Top Row: ID & Timer */}
                                                    <div className="flex justify-between items-start mb-3">
                                                        <span className="font-mono font-bold text-slate-500 text-xs bg-slate-100 px-1.5 py-0.5 rounded">#{order.id.slice(-4)}</span>
                                                        <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
                                                            <Clock size={12} />
                                                            {formatElapsedTime(order.createdAt)}
                                                        </div>
                                                    </div>

                                                    {/* Customer Info */}
                                                    <div className="mb-3">
                                                        <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{order.customerName}</h3>
                                                        {order.customerPhone && (
                                                            <a href={`https://wa.me/${order.customerPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                                                                className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 bg-green-50 px-2 py-0.5 rounded-md transition-colors">
                                                                <Phone size={12} /> {order.customerPhone}
                                                            </a>
                                                        )}
                                                    </div>

                                                    {/* Badges */}
                                                    <div className="flex flex-wrap gap-2 mb-4">
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md flex items-center gap-1 ${order.deliveryMethod === 'DELIVERY' ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'}`}>
                                                            {order.deliveryMethod === 'DELIVERY' ? <Truck size={12} /> : <Store size={12} />}
                                                            {order.deliveryMethod === 'DELIVERY' ? 'Entrega' : 'Retirada'}
                                                        </span>
                                                        <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-md flex items-center gap-1 bg-slate-100 text-slate-600">
                                                            <DollarSign size={12} /> {order.paymentMethod}
                                                        </span>
                                                    </div>

                                                    {/* Items List (Collapsed visually) */}
                                                    <div className="bg-slate-50 rounded-lg p-2.5 mb-3 border border-slate-100">
                                                        <ul className="space-y-1.5">
                                                            {order.items.map((item, idx) => (
                                                                <li key={idx} className="text-sm text-slate-700 flex justify-between items-start border-b border-dashed border-slate-200 last:border-0 pb-1 last:pb-0">
                                                                    <span className="font-medium mr-2">{item.quantity}x</span>
                                                                    <span className="flex-1 leading-snug">{item.productName}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                                                            <span className="text-xs text-slate-500 font-medium">Total do Pedido</span>
                                                            <span className="font-bold text-slate-800 text-base">{order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                        </div>
                                                    </div>

                                                    {/* Address (if Delivery) */}
                                                    {order.deliveryMethod === 'DELIVERY' && order.address && (
                                                        <div className="mb-4 flex items-start gap-2 bg-yellow-50 p-2 rounded-md border border-yellow-100 text-xs text-yellow-800">
                                                            <MapPin size={14} className="shrink-0 mt-0.5" />
                                                            <span className="leading-snug">{order.address}</span>
                                                        </div>
                                                    )}

                                                    {/* Action Buttons */}
                                                    <div className="flex gap-2">
                                                        {order.status === 'PENDING' && (
                                                            <>
                                                                <button onClick={() => updateStatus(order, 'CANCELLED')} className="w-10 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-100 transition-colors" title="Cancelar">
                                                                    <XCircle size={18} />
                                                                </button>
                                                                <button onClick={() => updateStatus(order, 'PREPARING')} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-200 transition-all flex items-center justify-center gap-2">
                                                                    Aceitar Pedido <ArrowRight size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {order.status === 'PREPARING' && (
                                                            <button onClick={() => updateStatus(order, 'READY')} className="flex-1 bg-orange-500 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-orange-600 shadow-sm shadow-orange-200 transition-all flex items-center justify-center gap-2">
                                                                <CheckCircle size={16} /> Marcar Pronto
                                                            </button>
                                                        )}
                                                        {order.status === 'READY' && (
                                                            <button onClick={() => updateStatus(order, 'DELIVERED')} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm shadow-green-200 transition-all flex items-center justify-center gap-2">
                                                                <Truck size={16} /> Concluir Entrega
                                                            </button>
                                                        )}
                                                        {order.status === 'DELIVERED' && (
                                                            <div className="w-full text-center py-1 text-xs font-bold text-green-600 bg-green-50 rounded-lg border border-green-100 flex items-center justify-center gap-1">
                                                                <CheckCircle size={12} /> Entregue com Sucesso
                                                            </div>
                                                        )}
                                                        {order.status === 'CANCELLED' && (
                                                            <button onClick={() => handleManualRestock(order)} className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg text-xs font-bold hover:bg-red-200 flex items-center justify-center gap-2">
                                                                <RefreshCw size={14} /> Estornar Estoque
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {colOrders.length === 0 && (
                                            <div className="flex flex-col items-center justify-center h-40 text-slate-400 opacity-50">
                                                <div className="bg-slate-200 p-3 rounded-full mb-2">
                                                    {col.icon}
                                                </div>
                                                <span className="text-sm font-medium">Vazio</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrderCenter;
