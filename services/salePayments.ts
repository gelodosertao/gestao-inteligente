import { FinancialRecord, PaymentEntry, Product, Sale } from '../types';

const cents = (value: number) => Math.round(value * 100);

function assertSaleSnapshot(sale: Sale, openedSale: Sale): void {
    if (sale.revision !== openedSale.revision || sale.total !== openedSale.total || sale.amountPaid !== openedSale.amountPaid || sale.status !== openedSale.status || sale.fulfillmentStatus !== openedSale.fulfillmentStatus || sale.matrizDeposit !== openedSale.matrizDeposit || JSON.stringify(sale.items) !== JSON.stringify(openedSale.items) || JSON.stringify(sale.paymentHistory) !== JSON.stringify(openedSale.paymentHistory)) {
        throw new Error('O recebimento desta venda foi atualizado. Feche e reabra o formulário antes de continuar.');
    }
}

export function registerSalePayment(sale: Sale, input: Omit<PaymentEntry, 'id' | 'amount'> & { amount: string }, openedSale: Sale = sale, paymentId: string = crypto.randomUUID()): Sale {
    assertSaleSnapshot(sale, openedSale);
    if (sale.status !== 'Pending') throw new Error('Esta venda não está pendente. Reabra o histórico antes de receber.');
    const value = input.amount.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || cents(Number(value)) <= 0) {
        throw new Error('Informe um valor válido, com no máximo duas casas decimais.');
    }
    const parsedDate = new Date(`${input.date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.date) {
        throw new Error('Informe uma data válida para o recebimento.');
    }
    const paid = cents(sale.amountPaid || 0);
    const total = cents(sale.total);
    const amount = cents(Number(value));
    if (amount > total - paid) throw new Error(`O valor não pode ser maior que o restante (R$ ${((total - paid) / 100).toFixed(2)})`);
    return {
        ...sale,
        amountPaid: (paid + amount) / 100,
        paymentHistory: [...(sale.paymentHistory || []), { ...input, id: paymentId, amount: amount / 100 }],
        status: paid + amount === total ? 'Completed' : 'Pending',
    };
}

export function wholesaleStock(product: Product, deposit: Sale['matrizDeposit']): number {
    return deposit === 'Ibotirama' ? product.stockMatrizIbotirama : deposit === 'Barreiras' ? product.stockMatrizBarreiras : 0;
}

export function isSaleDispatched(sale: Sale): boolean {
    return sale.fulfillmentStatus === 'dispatched' || (sale.fulfillmentStatus === undefined && (sale.status === 'Completed' || sale.status === 'Finalizado pela Fábrica'));
}

export function wholesaleEditTotal(sale: Sale): number {
    const total = sale.items.reduce((sum, item) => sum + item.quantity * item.priceAtSale, 0) + (sale.deliveryFee || 0) - (sale.discount || 0);
    if (!Number.isFinite(total) || total < 0 || (sale.deliveryFee || 0) < 0 || (sale.discount || 0) < 0 || sale.items.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.priceAtSale) || item.priceAtSale < 0)) {
        throw new Error('Confira as quantidades, os preços, o frete e o desconto do pedido.');
    }
    return cents(total) / 100;
}

export function prepareWholesaleDispatch(sale: Sale, products: Product[], deposit: Sale['matrizDeposit']): Sale {
    if (sale.source !== 'ATACADO' || sale.status === 'Cancelled' || isSaleDispatched(sale) || !sale.items.length) throw new Error('Este pedido não está disponível para expedição.');
    if (!Number.isFinite(sale.amountPaid) || (sale.amountPaid || 0) <= 0) throw new Error('Registre um pagamento positivo para confirmar o pedido.');
    if (deposit !== 'Ibotirama' && deposit !== 'Barreiras') throw new Error('Selecione o depósito de origem.');
    const needed = new Map<string, number>();
    for (const item of sale.items) {
        const product = products.find(product => product.id === item.productId);
        if (!product || !Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('Confira os produtos e as quantidades do pedido.');
        const components = product.comboItems?.length ? product.comboItems : [{ productId: product.id, quantity: 1 }];
        for (const component of components) {
            const stockProduct = products.find(product => product.id === component.productId);
            if (!stockProduct || !Number.isFinite(component.quantity) || component.quantity <= 0) throw new Error('Composição de produto indisponível.');
            if (stockProduct.isStockControlled === false) continue;
            needed.set(stockProduct.id, (needed.get(stockProduct.id) || 0) + item.quantity * component.quantity);
        }
    }
    for (const [id, quantity] of needed) {
        const product = products.find(product => product.id === id)!;
        if (quantity > wholesaleStock(product, deposit)) throw new Error(`Saldo insuficiente de ${product.name} em ${deposit}.`);
    }
    return { ...sale, matrizDeposit: deposit, fulfillmentStatus: 'dispatched' };
}

export function confirmWholesalePayment(sale: Sale, input: Omit<PaymentEntry, 'id' | 'amount'> & { amount: string }, products: Product[], deposit: Sale['matrizDeposit'], openedSale: Sale = sale, paymentId: string = crypto.randomUUID()): Sale {
    assertSaleSnapshot(sale, openedSale);
    if (sale.source !== 'ATACADO' || sale.status === 'Cancelled') throw new Error('Este pedido não está disponível para confirmação.');
    if (deposit !== 'Ibotirama' && deposit !== 'Barreiras') throw new Error('Selecione o depósito de origem.');
    const dispatched = isSaleDispatched(sale);
    if (dispatched && sale.matrizDeposit !== deposit) throw new Error('A origem da baixa já realizada não pode ser alterada no recebimento.');
    const value = input.amount.trim().replace(',', '.');
    const useExistingPayment = !dispatched && (sale.amountPaid || 0) > 0 && (value === '' || /^0+(\.0{1,2})?$/.test(value));
    const updated = useExistingPayment ? { ...sale } : registerSalePayment(sale, input, openedSale, paymentId);
    return dispatched ? updated : prepareWholesaleDispatch(updated, products, deposit);
}

// O fluxo de caixa usa os recebimentos; a receita persistida da venda não é somada novamente.
export function saleReceiptRecords(sales: Sale[]): FinancialRecord[] {
    return sales.flatMap(sale => {
        const managedWholesale = sale.source === 'ATACADO' && sale.fulfillmentStatus !== undefined;
        if (sale.status === 'Cancelled' && !managedWholesale) return [];
        const base = { type: 'Income' as const, category: 'Vendas', branch: sale.branch, saleId: sale.id };
        const description = `Venda #${sale.id.slice(0, 8)} - ${sale.customerName || 'Cliente'}`;
        const history = sale.paymentHistory || [];
        const receipts: FinancialRecord[] = history.map(entry => ({
            ...base, id: `sale-${sale.id}-payment-${entry.id}`, date: entry.date,
            description, amount: entry.amount, paymentMethod: entry.method,
        }));
        // Preserva entradas antigas sem histórico, sem repetir as parcelas já registradas.
        const received = managedWholesale || sale.status === 'Pending' ? (sale.amountPaid || 0) : sale.total;
        const remainder = cents(received) - history.reduce((sum, entry) => sum + cents(entry.amount), 0);
        if (remainder > 0) {
            const splits = sale.paymentSplits || [];
            const validSplits = !history.length && sale.paymentMethod === 'Split' && splits.length > 0
                && splits.every(split => Number.isFinite(split.amount) && split.amount > 0)
                && splits.reduce((sum, split) => sum + cents(split.amount), 0) === remainder;
            if (validSplits) {
                receipts.push(...splits.map((split, index) => ({
                    ...base, id: `sale-${sale.id}-split-${index}`, date: sale.date,
                    description: `${description} (${split.method})`, amount: split.amount, paymentMethod: split.method,
                })));
            } else {
                receipts.push({
                    ...base, id: `sale-${sale.id}`, date: sale.date, description,
                    amount: remainder / 100, paymentMethod: sale.paymentMethod === 'Split' ? undefined : sale.paymentMethod,
                });
            }
        }
        if (managedWholesale && sale.status === 'Cancelled' && sale.cancelledAt) {
            const byMethod = new Map<FinancialRecord['paymentMethod'], number>();
            for (const receipt of receipts) byMethod.set(receipt.paymentMethod, (byMethod.get(receipt.paymentMethod) || 0) + cents(receipt.amount));
            const date = new Date(sale.cancelledAt).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            return [...receipts, ...Array.from(byMethod, ([paymentMethod, amount]) => ({
                ...base, id: `sale-${sale.id}-reversal-${paymentMethod || 'unknown'}`, date,
                description: `Estorno ${description}`, amount: -amount / 100, paymentMethod,
            }))];
        }
        return receipts;
    });
}
