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
    'Morada Nobre': 15,
    'Mimoso': 20,
    'Vila Brasil': 15,
    'Novo Horizonte': 15,
    'Serra do Mimo': 15,
    'Lot São Paulo': 8,
    'Ribeirão': 15,
    'Nova Barreiras': 20,
    'São Miguel': 15,
    'Santa Luzia': 15,
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
