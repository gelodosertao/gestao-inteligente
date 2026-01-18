import React, { useState, useEffect } from 'react';
import { Order, Sale, Branch } from '../types';
import { dbOrders, dbSales, dbProducts } from '../services/db';
import { Clock, CheckCircle, Truck, XCircle, ChefHat, ArrowRight, RefreshCw, Store } from 'lucide-react';
import { getTodayDate } from '../services/utils';

interface OrderCenterProps {
    onBack: () => void;
}

const OrderCenter: React.FC<OrderCenterProps> = ({ onBack }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadOrders();
        // Poll for new orders every 30 seconds
        const interval = setInterval(loadOrders, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadOrders = async () => {
        try {
            const data = await dbOrders.getAll();
            // Filter for today's orders or active orders
            // For now, let's show all active orders (not cancelled/delivered) + today's delivered
            const today = getTodayDate();
            const filtered = data.filter(o =>
                o.status !== 'DELIVERED' || // Show all active (Pending, Preparing, Ready, Cancelled)
                o.date === today // Show delivered from today
            );
            setOrders(filtered);
        } catch (error) {
            console.error("Erro ao carregar pedidos:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualRestock = async (order: Order) => {
        if (!confirm("Tem certeza que deseja devolver os itens deste pedido ao estoque? Faça isso apenas se o estorno não tiver ocorrido automaticamente.")) return;

        try {
            const allProducts = await dbProducts.getAll();
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
        } catch (error) {
            console.error("Erro ao estornar estoque:", error);
            alert("Erro ao estornar estoque.");
        }
    };

    const updateStatus = async (order: Order, newStatus: Order['status']) => {
        try {
            // Stock Management Logic
            const stockDeductedStates = ['PREPARING', 'READY', 'DELIVERED'];
            const wasDeducted = stockDeductedStates.includes(order.status);
            const willBeDeducted = stockDeductedStates.includes(newStatus);

            if (!wasDeducted && willBeDeducted) {
                // Deduct Stock
                const allProducts = await dbProducts.getAll();
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
                const allProducts = await dbProducts.getAll();
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

            // WhatsApp Notifications
            if (order.customerPhone) {
                const phone = order.customerPhone.replace(/\D/g, '');
                const validPhone = phone.length <= 11 ? `55${phone}` : phone; // Add 55 if missing
                let message = '';

                if (newStatus === 'READY') {
                    const isDelivery = order.deliveryMethod === 'DELIVERY';
                    if (isDelivery) {
                        message = `Olá *${order.customerName}*!%0A%0ASeu pedido *saiu para entrega*! 🛵💨%0AEm breve chegaremos no endereço: _${order.address}_`;
                    } else {
                        message = `Olá *${order.customerName}*!%0A%0ASeu pedido está *pronto para retirada*! 🛍️✅%0APode vir buscar no balcão.`;
                    }
                } else if (newStatus === 'DELIVERED') {
                    message = `Olá *${order.customerName}*!%0A%0ASeu pedido foi *entregue/concluído*. ✅%0A%0AObrigado pela preferência! Volte sempre. ❄️`;
                }

                if (message) {
                    window.open(`https://wa.me/${validPhone}?text=${message}`, '_blank');
                }
            }

            // If Delivered, create a Sale record
            if (newStatus === 'DELIVERED' && order.status !== 'DELIVERED') {
                const newSale: Sale = {
                    id: `sale-${order.id.split('-')[1] || Date.now()}`,
                    date: getTodayDate(),
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
                await dbSales.add(newSale);
                alert("Venda registrada no financeiro!");
            }

            loadOrders();
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            alert("Erro ao atualizar status.");
        }
    };

    const columns = [
        { id: 'PENDING', label: 'Pendente', icon: <Clock size={20} />, color: 'bg-yellow-100 text-yellow-800', border: 'border-yellow-200' },
        { id: 'PREPARING', label: 'Em Preparo', icon: <ChefHat size={20} />, color: 'bg-blue-100 text-blue-800', border: 'border-blue-200' },
        { id: 'READY', label: 'Pronto / Saiu', icon: <Truck size={20} />, color: 'bg-orange-100 text-orange-800', border: 'border-orange-200' },
        { id: 'DELIVERED', label: 'Entregue', icon: <CheckCircle size={20} />, color: 'bg-green-100 text-green-800', border: 'border-green-200' },
        { id: 'CANCELLED', label: 'Cancelados', icon: <XCircle size={20} />, color: 'bg-red-100 text-red-800', border: 'border-red-200' }
    ];

    return (
        <div className="min-h-screen bg-slate-50 p-6 animate-in fade-in">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Truck className="text-blue-600" /> Central de Pedidos
                    </h1>
                    <p className="text-slate-500">Gerencie os pedidos do Delivery e Retirada</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadOrders} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                        <RefreshCw size={20} />
                    </button>
                    <button onClick={onBack} className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-bold">
                        Voltar
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-slate-400">Carregando pedidos...</div>
            ) : (
                <div className="flex gap-4 h-[calc(100vh-180px)] overflow-x-auto pb-4 items-start">
                    {columns.map(col => (
                        <div key={col.id} className="flex flex-col h-full min-w-[300px] max-w-[350px] shrink-0">
                            <div className={`p-3 rounded-t-xl font-bold flex items-center gap-2 ${col.color}`}>
                                {col.icon} {col.label}
                                <span className="ml-auto bg-white/50 px-2 py-0.5 rounded text-sm">
                                    {orders.filter(o => o.status === col.id).length}
                                </span>
                            </div>
                            <div className={`flex-1 bg-slate-100/50 border-x border-b ${col.border} rounded-b-xl p-3 space-y-3 overflow-y-auto`}>
                                {orders.filter(o => o.status === col.id).map(order => (
                                    <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-bold text-slate-800">#{order.id.slice(-4)}</span>
                                            <span className="text-xs text-slate-400">{order.date}</span>
                                        </div>
                                        <h4 className="font-bold text-slate-700 mb-1">{order.customerName}</h4>
                                        <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                                            {order.deliveryMethod === 'DELIVERY' ? <Truck size={12} /> : <Store size={12} />}
                                            {order.deliveryMethod === 'DELIVERY' ? 'Entrega' : 'Retirada'} • {order.paymentMethod}
                                        </p>

                                        <div className="bg-slate-50 p-2 rounded-lg mb-3 text-xs text-slate-600 space-y-1">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between">
                                                    <span>{item.quantity}x {item.productName}</span>
                                                </div>
                                            ))}
                                            <div className="border-t border-slate-200 pt-1 mt-1 font-bold flex justify-between">
                                                <span>Total</span>
                                                <span>{order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                            </div>
                                        </div>

                                        {order.address && (
                                            <p className="text-xs text-slate-500 mb-3 italic truncate">
                                                📍 {order.address}
                                            </p>
                                        )}

                                        <div className="flex gap-2 mt-2">
                                            {order.status === 'PENDING' && (
                                                <button onClick={() => updateStatus(order, 'PREPARING')} className="flex-1 bg-blue-100 text-blue-700 py-2 rounded-lg text-xs font-bold hover:bg-blue-200">
                                                    Aceitar / Preparar
                                                </button>
                                            )}
                                            {order.status === 'PREPARING' && (
                                                <button onClick={() => updateStatus(order, 'READY')} className="flex-1 bg-orange-100 text-orange-700 py-2 rounded-lg text-xs font-bold hover:bg-orange-200">
                                                    Pronto p/ Entrega
                                                </button>
                                            )}
                                            {order.status === 'READY' && (
                                                <button onClick={() => updateStatus(order, 'DELIVERED')} className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg text-xs font-bold hover:bg-green-200">
                                                    Concluir Entrega
                                                </button>
                                            )}
                                            {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                                                <button onClick={() => updateStatus(order, 'CANCELLED')} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                                                    <XCircle size={16} />
                                                </button>
                                            )}
                                            {order.status === 'CANCELLED' && (
                                                <button onClick={() => handleManualRestock(order)} className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg text-xs font-bold hover:bg-red-200 flex items-center justify-center gap-2">
                                                    <RefreshCw size={14} /> Estornar Estoque
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {orders.filter(o => o.status === col.id).length === 0 && (
                                    <div className="text-center py-8 text-slate-400 text-sm italic">
                                        Nenhum pedido
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default OrderCenter;
