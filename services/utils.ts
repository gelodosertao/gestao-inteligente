export const getTodayDate = (): string => {
    // Retorna a data atual no formato YYYY-MM-DD considerando o fuso horário de Salvador (UTC-3)
    // Utiliza o locale 'sv-SE' que padroniza a saída como YYYY-MM-DD
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bahia' });
};

export const getCurrentDateTime = (): string => {
    // Retorna data e hora atual ISO com fuso ajustado (útil para logs ou IDs)
    const now = new Date();
    const offset = -3; // UTC-3
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const serverDate = new Date(utc + (3600000 * offset));
    return serverDate.toISOString();
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    // Haversine Formula for distance between two points on Earth
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return Number(d.toFixed(2));
};

// --- FIXED DELIVERY FEES FOR BARREIRAS ---
export const BARREIRAS_FIXED_FEES: Record<string, number> = {
    'Centro': 10,
    'Vila Rica': 15,
    'Vila Amorim': 15,
    'Vila Nova': 15,
    'Arboreto': 25,
    'Ouro Branco': 10,
    'Barreirinhas': 10,
    'Jardim Vitória': 20,
    'Cidade Nova': 20,
    'Morada da Lua': 8,
    'Vila Regina': 8,
    'Renato Gonçalves': 10,
    'São Francisco': 20,
    'Boa Sorte': 8,
    'Bandeirantes': 10,
    'Vila dos Funcionários': 15,
    'Vila dos Funcionarios': 15, // Alias without accent
    'Morada Nobre': 15,
    'Mimoso': 20,
    'Vila Brasil': 15,
    'Novo Horizonte': 15,
    'Serra do Mimo': 15,
    'Lot São Paulo': 8,
    'Lot. São Paulo': 8, // Variant
    'Loteamento São Paulo': 8, // Variant
    'Ribeirão': 15,
    'Ribeirao': 15, // Alias without accent
    'Nova Barreiras': 20,
    'São Miguel': 15,
    'Sao Miguel': 15, // Alias without accent
    'Santa Luzia': 15,
};

/**
 * Normaliza o método de pagamento para o formato canônico do sistema.
 * Resolve inconsistências entre 'Credit'/'CREDIT'/'Crédito' etc.
 * Retorna: 'Pix' | 'Credit' | 'Debit' | 'Cash' | 'Split' | o valor original.
 */
export const normalizePaymentMethod = (method: string | undefined | null): string => {
    if (!method) return 'Pix';
    const lower = method.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos
    if (lower === 'pix') return 'Pix';
    if (lower === 'credit' || lower === 'credito' || lower === 'cartao de credito') return 'Credit';
    if (lower === 'debit' || lower === 'debito' || lower === 'cartao de debito') return 'Debit';
    if (lower === 'cash' || lower === 'dinheiro') return 'Cash';
    if (lower === 'split' || lower === 'dividir' || lower === 'fiado' || lower === 'fiado / prazo') return 'Split';
    return method; // fallback: retorna o valor original
};

/**
 * Traduz o método de pagamento normalizado para o label em português.
 */
export const translatePaymentMethod = (method: string | undefined | null): string => {
    const normalized = normalizePaymentMethod(method || '');
    switch (normalized) {
        case 'Credit': return 'Crédito';
        case 'Debit': return 'Débito';
        case 'Cash': return 'Dinheiro';
        case 'Pix': return 'PIX';
        case 'Split': return 'Fiado / Prazo';
        default: return normalized;
    }
};

export const getFixedFeeByNeighborhood = (address: string): number | null => {
    if (!address) return null;
    const normalizedAddress = address.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    for (const [neighborhood, fee] of Object.entries(BARREIRAS_FIXED_FEES)) {
        const normalizedNeighborhood = neighborhood.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (normalizedAddress.includes(normalizedNeighborhood)) {
            return fee;
        }
    }
    return null;
};
