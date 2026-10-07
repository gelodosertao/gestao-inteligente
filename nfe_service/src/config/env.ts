import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Resolve .env path with fallback strategy:
// 1. process.cwd()/.env (works regardless of how the process is launched)
// 2. __dirname-relative (fallback for compiled dist/ or ts-node scenarios)
function resolveEnvPath(): string {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[env] .env encontrado em: ${candidate}`);
      return candidate;
    }
  }

  console.error(`[env] .env NÃO encontrado em nenhum caminho:`);
  console.error(`[env]   process.cwd() = ${process.cwd()}`);
  console.error(`[env]   __dirname     = ${__dirname}`);
  candidates.forEach(c => console.error(`[env]   tentado: ${c}`));
  throw new Error('[FAIL-FAST] Ficheiro .env não encontrado. Verifique se está executando a partir do diretório nfe_service/.');
}

dotenv.config({ path: resolveEnvPath() });

interface EnvConfig {
  sefazAmbiente: number;
  sefazUf: string;
  sefazTimeoutMs: number;
  certificadoA1Base64: string;
  certificadoPassword: string;
  cnpjEmitente: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseAnonKey: string;
  serverCorsOrigin: string;
  nfeTenantId: string;
  isProduction: boolean;
}

function validateEnv(): EnvConfig {
  const ambiente = process.env.SEFAZ_AMBIENTE;
  if (!ambiente || !['1', '2'].includes(ambiente)) {
    throw new Error(
      `[FAIL-FAST] SEFAZ_AMBIENTE ausente ou inválido. Use 1 (Produção) ou 2 (Homologação). Valor recebido: ${ambiente}`
    );
  }

  const uf = process.env.SEFAZ_UF;
  if (!uf || uf.trim().length !== 2) {
    throw new Error(
      `[FAIL-FAST] SEFAZ_UF ausente ou inválido. Deve ser a sigla de 2 caracteres (ex: BA). Valor recebido: ${uf}`
    );
  }

  const certBase64 = process.env.CERTIFICADO_A1_BASE64;
  if (!certBase64 || certBase64.trim().length === 0) {
    throw new Error(
      '[FAIL-FAST] CERTIFICADO_A1_BASE64 ausente. Forneça o certificado A1 codificado em Base64.'
    );
  }

  const certPassword = process.env.CERTIFICADO_PASSWORD;
  if (!certPassword) {
    throw new Error(
      '[FAIL-FAST] CERTIFICADO_PASSWORD ausente. Forneça a senha do certificado A1.'
    );
  }

  const cnpj = process.env.CNPJ_EMITENTE;
  if (!cnpj || !/^\d{14}$/.test(cnpj)) {
    throw new Error(
      `[FAIL-FAST] CNPJ_EMITENTE ausente ou inválido. Devem ser exatamente 14 dígitos numéricos. Valor recebido: ${cnpj}`
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('[FAIL-FAST] SUPABASE_URL ausente.');
  }

  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseServiceKey) {
    throw new Error('[FAIL-FAST] SUPABASE_SERVICE_KEY ausente.');
  }
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseAnonKey) {
    throw new Error('[FAIL-FAST] SUPABASE_ANON_KEY ausente.');
  }

  const timeoutRaw = process.env.SEFAZ_TIMEOUT_MS;
  const sefazTimeoutMs = timeoutRaw ? parseInt(timeoutRaw, 10) : 60000;
  if (isNaN(sefazTimeoutMs) || sefazTimeoutMs < 5000 || sefazTimeoutMs > 300000) {
    throw new Error(`[FAIL-FAST] SEFAZ_TIMEOUT_MS inválido: ${timeoutRaw}. Deve ser entre 5000 e 300000 ms.`);
  }

  const serverCorsOrigin = process.env.SERVER_CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000';

  const isProduction = parseInt(ambiente, 10) === 1;

  if (process.env.MOCK_LOCAL_ONLY === 'true') {
    throw new Error('[FAIL-FAST] O modo de emissão simulada foi desativado. Use testes unitários sem transmissão.');
  }

  if (serverCorsOrigin === '*') {
    if (isProduction) {
      throw new Error(
        '[FAIL-FAST] SERVER_CORS_ORIGIN não pode ser "*" em produção. Defina as origens permitidas explicitamente.'
      );
    } else {
      console.warn(
        '[WARN] SERVER_CORS_ORIGIN está configurado como "*". Para maior segurança, especifique as origens permitidas.'
      );
    }
  }

  const nfeTenantId = process.env.NFE_TENANT_ID || '';
  if (nfeTenantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nfeTenantId)) {
    throw new Error('[FAIL-FAST] NFE_TENANT_ID inválido: UUID esperado.');
  }
  if (!nfeTenantId) {
    throw new Error(
      '[FAIL-FAST] NFE_TENANT_ID é obrigatório para o serviço fiscal.'
    );
  }

  return {
    sefazAmbiente: parseInt(ambiente, 10),
    sefazUf: uf.trim().toUpperCase(),
    sefazTimeoutMs,
    certificadoA1Base64: certBase64,
    certificadoPassword: certPassword,
    cnpjEmitente: cnpj,
    supabaseUrl,
    supabaseServiceKey,
    supabaseAnonKey,
    serverCorsOrigin,
    nfeTenantId,
    isProduction,
  };
}

export const env: EnvConfig = validateEnv();
