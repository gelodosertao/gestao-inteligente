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
