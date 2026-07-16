import fs from 'node:fs';
import path from 'node:path';
import { create } from 'xmlbuilder2';

export interface ChaveAcessoParams {
  cUF: string;
  aaMm: string;
  cnpj: string;
  mod: string;
  serie: string;
  nNF: string;
  tpEmis: string;
  cNF: string;
}

export function calcularDV(chave43: string): string {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  let idxPeso = 0;

  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += parseInt(chave43[i], 10) * pesos[idxPeso % 8];
    idxPeso++;
  }

  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;

  return String(dv);
}

export function montarChaveAcesso(params: ChaveAcessoParams): string {
  const semDV =
    params.cUF +
    params.aaMm +
    params.cnpj.padStart(14, '0') +
    params.mod.padStart(2, '0') +
    params.serie.padStart(3, '0') +
    params.nNF.padStart(9, '0') +
    params.tpEmis +
    params.cNF.padStart(8, '0');

  const dv = calcularDV(semDV);

  return semDV + dv;
}

export function gerarCNF(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

export function buildXmlFromJson(data: Record<string, any>): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' });

  function addNode(parent: any, key: string, value: any): void {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        const child = parent.ele(key);
        if (typeof item === 'object' && item !== null) {
          addAttributesAndChildren(child, item);
        } else {
          child.txt(String(item));
        }
      }
    } else if (typeof value === 'object') {
      const child = parent.ele(key);
      addAttributesAndChildren(child, value);
    } else {
      parent.ele(key).txt(String(value));
    }
  }

  function addAttributesAndChildren(element: any, obj: Record<string, any>): void {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@') && v !== null && v !== undefined) {
        element.att(k.slice(1), String(v));
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      if (!k.startsWith('@')) {
        addNode(element, k, v);
      }
    }
  }

  for (const [key, value] of Object.entries(data)) {
    addNode(root, key, value);
  }

  const xml = root.end({ prettyPrint: true, indent: '  ' });

  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

const TEMP_MAX_AGE_MS = 60 * 60 * 1000;

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number; isRetryable?: (error: unknown) => boolean }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const isRetryable = options?.isRetryable ?? ((err: unknown) => {
    if (err instanceof Error) {
      const msg = err.message;
      return /timeout|etimout|econnreset|econnrefused|socket hang up|network/i.test(msg) || /\b5\d{2}\b/.test(msg);
    }
    return false;
  });

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && isRetryable(error)) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`[retry] Tentativa ${attempt + 1}/${maxRetries} falhou. Aguardando ${delay}ms antes de retentar...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

export function cleanupTempFiles(tempDir: string): void {
  try {
    if (!fs.existsSync(tempDir)) return;

    const now = Date.now();
    const files = fs.readdirSync(tempDir);

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && now - stat.mtimeMs > TEMP_MAX_AGE_MS) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // ignore individual file errors
      }
    }
  } catch {
    console.warn('[cleanupTempFiles] Erro ao limpar diretório temp:', tempDir);
  }
}
