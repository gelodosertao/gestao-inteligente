import baMunicipios from '../data/ba-municipios.json';

function normalizedCity(value: string): string {
  return value.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const BAHIA_CITIES_IBGE = new Map(baMunicipios.map(city => [normalizedCity(city.nome), city]));

export function truncateString(str: string | undefined | null, maxLength: number, fallback = ''): string {
  return (str?.trim() || fallback).slice(0, maxLength);
}

export interface CityIbgeInfo { cMun: number; xMun: string; UF: string }

/** Official IBGE locality snapshot: https://servicodados.ibge.gov.br/api/v1/localidades/estados/29/municipios */
export function resolveCityIbge(city?: string, state?: string): CityIbgeInfo {
  if (!city || state?.trim().toUpperCase() !== 'BA') {
    throw new Error('Cidade e UF da Bahia são obrigatórias para a emissão fiscal.');
  }
  const match = BAHIA_CITIES_IBGE.get(normalizedCity(city));
  if (!match) throw new Error(`Município não encontrado na lista oficial do IBGE para a Bahia: ${city}.`);
  return { cMun: match.id, xMun: match.nome.toUpperCase(), UF: 'BA' };
}
