import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function findPfxFile(): string {
  const certsDir = path.join(ROOT, 'certs');
  if (!fs.existsSync(certsDir)) {
    throw new Error('Pasta /certs não encontrada na raiz do projeto.');
  }
  const files = fs.readdirSync(certsDir).filter(f => f.endsWith('.pfx'));
  if (files.length === 0) {
    throw new Error('Nenhum ficheiro .pfx encontrado em /certs/.');
  }
  return path.join(certsDir, files[0]);
}

function readBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

function updateEnvFile(envPath: string, certBase64: string, password: string): void {
  let content = fs.readFileSync(envPath, 'utf-8');

  const b64Line = `CERTIFICADO_A1_BASE64=${certBase64}`;
  if (content.includes('CERTIFICADO_A1_BASE64=')) {
    content = content.replace(/^CERTIFICADO_A1_BASE64=.*$/m, b64Line);
  } else {
    content += `\n${b64Line}\n`;
  }

  const passLine = `CERTIFICADO_PASSWORD=${password}`;
  if (content.includes('CERTIFICADO_PASSWORD=')) {
    content = content.replace(/^CERTIFICADO_PASSWORD=.*$/m, passLine);
  } else {
    content += `\n${passLine}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf-8');
}

function getPassword(): string {
  const fromArg = process.argv[2];
  if (fromArg) return fromArg;

  const fromEnv = process.env.CERT_PASSWORD;
  if (fromEnv) return fromEnv;

  console.error('[ERRO] Forneça a senha como argumento: npx ts-node scripts/configure_nfe_env.ts <senha>');
  console.error('       Ou defina a variável de ambiente CERT_PASSWORD.');
  process.exit(1);
}

async function main() {
  const pfxPath = findPfxFile();
  console.log(`[INFO] Certificado encontrado: ${pfxPath}`);

  console.log('[INFO] A converter .pfx para Base64...');
  const base64 = readBase64(pfxPath);
  console.log(`[INFO] Base64 gerado (${base64.length} caracteres).`);

  const password = getPassword();
  if (!password) {
    console.error('[ERRO] Senha não pode estar vazia.');
    process.exit(1);
  }

  const envPath = path.join(ROOT, 'nfe_service', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('[ERRO] Ficheiro nfe_service/.env não encontrado.');
    process.exit(1);
  }

  updateEnvFile(envPath, base64, password);
  console.log(`[OK] nfe_service/.env atualizado com CERTIFICADO_A1_BASE64 e CERTIFICADO_PASSWORD.`);
  console.log('[INFO] .pfx está em /certs/ que já consta no .gitignore — seguro contra commit.');
}

main().catch(err => {
  console.error(`[ERRO] ${err.message}`);
  process.exit(1);
});