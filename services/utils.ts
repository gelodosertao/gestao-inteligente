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
