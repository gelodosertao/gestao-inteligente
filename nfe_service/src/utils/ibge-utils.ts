/**
 * Utilitários para saneamento de dados e mapeamento IBGE de cidades
 */

const BAHIA_CITIES_IBGE: Record<string, number> = {
  IBOTIRAMA: 2927408,
  BARREIRAS: 2903201,
  'LUIS EDUARDO MAGALHAES': 2919553,
  'LUÍS EDUARDO MAGALHÃES': 2919553,
  LEM: 2919553,
  'BOM JESUS DA LAPA': 2903904,
  SEABRA: 2929909,
  GUANAMBI: 2917508,
  CAETITE: 2905206,
  CAETITÉ: 2905206,
  'SANTA MARIA DA VITORIA': 2928109,
  'SANTA MARIA DA VITÓRIA': 2928109,
  'FEIRA DE SANTANA': 2910800,
  SALVADOR: 2927408,
  'VITORIA DA CONQUISTA': 2933307,
  'VITÓRIA DA CONQUISTA': 2933307,
  ITABUNA: 2914802,
  ILHEUS: 2913606,
  ILHÉUS: 2913606,
  JUAZEIRO: 2918407,
  XIQUE_XIQUE: 2933604,
  'XIQUE-XIQUE': 2933604,
  MUQUEM_DO_SAO_FRANCISCO: 2922250,
  'MUQUÉM DO SÃO FRANCISCO': 2922250,
  PARATINGA: 2923704,
};

export function truncateString(str: string | undefined | null, maxLength: number, fallback = ''): string {
  if (!str) return fallback.slice(0, maxLength);
  const trimmed = str.trim();
  if (!trimmed) return fallback.slice(0, maxLength);
  return trimmed.slice(0, maxLength);
}

export interface CityIbgeInfo {
  cMun: number;
  xMun: string;
  UF: string;
}

export function resolveCityIbge(
  city?: string,
  state?: string,
  explicitCode?: string | number
): CityIbgeInfo {
  const defaultCity: CityIbgeInfo = {
    cMun: 2927408,
    xMun: 'IBOTIRAMA',
    UF: 'BA',
  };

  if (explicitCode) {
    const num = typeof explicitCode === 'number' ? explicitCode : parseInt(String(explicitCode).replace(/\D/g, ''), 10);
    if (!isNaN(num) && num > 1000000 && num < 9999999) {
      return {
        cMun: num,
        xMun: truncateString(city, 60, 'IBOTIRAMA').toUpperCase(),
        UF: truncateString(state, 2, 'BA').toUpperCase(),
      };
    }
  }

  if (!city) {
    return defaultCity;
  }

  const normalizedCity = city.trim().toUpperCase();
  const foundCode = BAHIA_CITIES_IBGE[normalizedCity];

  if (foundCode) {
    return {
      cMun: foundCode,
      xMun: truncateString(normalizedCity, 60, 'IBOTIRAMA'),
      UF: truncateString(state, 2, 'BA').toUpperCase(),
    };
  }

  return {
    cMun: defaultCity.cMun,
    xMun: truncateString(normalizedCity, 60, 'IBOTIRAMA'),
    UF: truncateString(state, 2, 'BA').toUpperCase(),
  };
}
