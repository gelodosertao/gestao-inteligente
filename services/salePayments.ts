import { FinancialRecord, PaymentEntry, Sale } from '../types';

const cents = (value: number) => Math.round(value * 100);

export function registerSalePayment(sale: Sale, input: Omit<PaymentEntry, 'id' | 'amount'> & { amount: string }, openedSale: Sale = sale): Sale {
    if (sale.total !== openedSale.total || sale.amountPaid !== openedSale.amountPaid || sale.status !== openedSale.status || JSON.stringify(sale.paymentHistory) !== JSON.stringify(openedSale.paymentHistory)) {
        throw new Error('O recebimento desta venda foi atualizado. Feche e reabra o formulário antes de continuar.');
    }
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
        paymentHistory: [...(sale.paymentHistory || []), { ...input, id: crypto.randomUUID(), amount: amount / 100 }],
        status: paid + amount === total ? 'Completed' : 'Pending',
    };
}

// O fluxo de caixa usa os recebimentos; a receita persistida da venda não é somada novamente.
export function saleReceiptRecords(sales: Sale[]): FinancialRecord[] {
    return sales.flatMap(sale => {
        if (sale.status === 'Cancelled') return [];
        const base = { type: 'Income' as const, category: 'Vendas', branch: sale.branch, saleId: sale.id };
        const description = `Venda #${sale.id.slice(0, 8)} - ${sale.customerName || 'Cliente'}`;
        const history = sale.paymentHistory || [];
        const receipts: FinancialRecord[] = history.map(entry => ({
            ...base, id: `sale-${sale.id}-payment-${entry.id}`, date: entry.date,
            description, amount: entry.amount, paymentMethod: entry.method,
        }));
        // Preserva entradas antigas sem histórico, sem repetir as parcelas já registradas.
        const received = sale.status === 'Pending' ? (sale.amountPaid || 0) : sale.total;
        const remainder = cents(received) - history.reduce((sum, entry) => sum + cents(entry.amount), 0);
        if (remainder <= 0) return receipts;
        if (!history.length && sale.status !== 'Pending' && sale.paymentMethod === 'Split' && sale.paymentSplits?.length) {
            return sale.paymentSplits.map((split, index) => ({
                ...base, id: `sale-${sale.id}-split-${index}`, date: sale.date,
                description: `${description} (${split.method})`, amount: split.amount, paymentMethod: split.method,
            }));
        }
        return [...receipts, {
            ...base, id: `sale-${sale.id}`, date: sale.date, description,
            amount: remainder / 100, paymentMethod: sale.paymentMethod === 'Split' ? undefined : sale.paymentMethod,
        }];
    });
}
