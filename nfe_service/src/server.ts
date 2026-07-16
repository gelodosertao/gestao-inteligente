import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { ZipArchive } from 'archiver';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { z } from 'zod';
import { SefazService } from './services/SefazService';
import { getSaleWithItems, getSaleNfeForCancel, getPaginatedNfeXmlsByMonth, getSalesReportByMonth, updateSaleNfeStatus } from './services/SupabaseService';
import { generateNfeXml } from './services/NfeGenerator';
import { generateDanfePdf } from './services/DanfeService';
import { cleanupTempFiles } from './utils/nfe-utils';

const app = express();
const PORT = 3001;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_REGEX = /^\d{11}$|^\d{14}$/;

const EmitirBodySchema = z.object({
  customerDoc: z.string().min(1).optional(),
}).strict();

const AUTH_TOKEN = env.apiAuthToken;

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { sucesso: false, erro: 'Muitas requisições. Tente novamente em 1 minuto.' },
});

app.use(helmet());
app.use(cors({
  origin: env.serverCorsOrigin === '*' ? '*' : env.serverCorsOrigin.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: env.serverCorsOrigin !== '*',
}));
app.use('/api', apiLimiter);
app.use(express.json({ limit: '10mb' }));

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_TOKEN) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ sucesso: false, erro: 'Token de autenticação ausente' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== AUTH_TOKEN) {
    res.status(403).json({ sucesso: false, erro: 'Token de autenticação inválido' });
    return;
  }

  next();
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'nfe-service' });
});

app.use('/api', authMiddleware);

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidDoc(value: string): boolean {
  return DOC_REGEX.test(value);
}

let sefazService: SefazService | null = null;

try {
  sefazService = new SefazService();
  console.log('[server] SefazService inicializado com sucesso');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[server] Falha ao inicializar SefazService: ${message}. Emissão indisponível.`);
}

app.get('/api/nfe/status', async (_req: Request, res: Response) => {
  console.log('[server] GET /api/nfe/status');

  try {
    if (!sefazService) throw new Error('Serviço SEFAZ indisponível no momento.');
    const status = await sefazService.checkStatus();
    res.json({
      sucesso: true,
      dados: status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[server] Erro no endpoint /api/nfe/status: ${message}`);

    res.status(502).json({
      sucesso: false,
      erro: message,
    });
  }
});

app.post('/api/nfe/emitir/:sale_id', async (req: Request, res: Response): Promise<any> => {
  try {
    const sale_id = String(req.params.sale_id);
    const { customerDoc } = req.body;

    if (!isValidUUID(sale_id)) {
      return res.status(400).json({ sucesso: false, erro: 'sale_id inválido: formato UUID esperado' });
    }

    if (customerDoc && !isValidDoc(String(customerDoc).replace(/\D/g, ''))) {
      return res.status(400).json({ sucesso: false, erro: 'customerDoc inválido: deve conter 11 (CPF) ou 14 (CNPJ) dígitos' });
    }

    const bodyParse = EmitirBodySchema.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ sucesso: false, erro: 'Corpo da requisição inválido', detalhes: bodyParse.error.flatten().fieldErrors });
    }

    console.log(`[API NF-e] Pedido recebido para sale_id: ${sale_id}`);

    if (!sefazService) {
      return res.status(503).json({ sucesso: false, erro: 'Serviço SEFAZ indisponível.' });
    }

    const resultado = await generateNfeXml(String(sale_id), customerDoc, sefazService);

    if (resultado.success) {
      return res.status(200).json({ sucesso: true, dados: resultado, mensagem: 'Rota conectada', sale_id });
    } else {
      return res.status(422).json({ sucesso: false, erro: resultado.message });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API NF-e] Erro:', message);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno no servidor' });
  }
});

app.get('/api/nfe/xml/:ano/:mes', async (req: Request, res: Response): Promise<any> => {
  try {
    const ano = parseInt(String(req.params.ano), 10);
    const mes = parseInt(String(req.params.mes), 10);

    if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ sucesso: false, erro: 'Período inválido. Use /api/nfe/xml/AAAA/MM' });
    }

    const generator = getPaginatedNfeXmlsByMonth(ano, mes);
    const firstBatch = await generator.next();

    if (firstBatch.done || !firstBatch.value || firstBatch.value.length === 0) {
      return res.status(404).json({ sucesso: false, erro: 'Nenhum XML encontrado no período' });
    }

    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('[API XML] Erro no archive:', err.message);
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="nfe-${String(ano)}-${String(mes).padStart(2, '0')}.zip"`);

    archive.pipe(res);

    const folderName = `${String(ano)}-${String(mes).padStart(2, '0')}`;

    for (const xml of firstBatch.value) {
      if (xml.nfe_xml) {
        const fileName = `${xml.nfe_number || xml.id}.xml`;
        archive.append(xml.nfe_xml, { name: `${folderName}/${fileName}` });
      }
    }

    for await (const batch of generator) {
      for (const xml of batch) {
        if (xml.nfe_xml) {
          const fileName = `${xml.nfe_number || xml.id}.xml`;
          archive.append(xml.nfe_xml, { name: `${folderName}/${fileName}` });
        }
      }
    }

    await archive.finalize();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API XML] Erro:', message);
    if (!res.headersSent) {
      return res.status(500).json({ sucesso: false, erro: 'Erro interno ao gerar ZIP' });
    }
  }
});

app.get('/api/nfe/relatorio/mensal/:ano/:mes', async (req: Request, res: Response): Promise<any> => {
  try {
    const ano = parseInt(String(req.params.ano), 10);
    const mes = parseInt(String(req.params.mes), 10);

    if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ sucesso: false, erro: 'Período inválido. Use /api/nfe/relatorio/mensal/AAAA/MM' });
    }

    const relatorio = await getSalesReportByMonth(ano, mes);
    return res.json({ sucesso: true, dados: relatorio });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API Relatório] Erro:', message);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao gerar relatório' });
  }
});

app.post('/api/nfe/cancelar/:sale_id', async (req: Request, res: Response): Promise<any> => {
  try {
    const sale_id = String(req.params.sale_id);

    if (!isValidUUID(sale_id)) {
      return res.status(400).json({ sucesso: false, erro: 'sale_id inválido: formato UUID esperado' });
    }

    const { justificativa } = req.body;
    if (!justificativa || typeof justificativa !== 'string' || justificativa.trim().length < 15) {
      return res.status(400).json({ sucesso: false, erro: 'justificativa inválida: mínimo 15 caracteres' });
    }

    console.log(`[API Cancelamento] Pedido recebido para sale_id: ${sale_id}`);

    if (!sefazService) {
      return res.status(503).json({ sucesso: false, erro: 'Serviço SEFAZ indisponível.' });
    }

    const nfeData = await getSaleNfeForCancel(sale_id);
    const resultado = await sefazService.cancelarNFe(nfeData.invoiceKey, nfeData.nfeNumber, justificativa.trim());

    if (resultado.success) {
      await updateSaleNfeStatus(sale_id, 'cancelada');
      return res.status(200).json({ sucesso: true, dados: resultado });
    }

    return res.status(422).json({ sucesso: false, erro: resultado.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API Cancelamento] Erro:', message);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao cancelar NF-e' });
  }
});

app.post('/api/nfe/danfe/:sale_id', async (req: Request, res: Response): Promise<any> => {
  try {
    const sale_id = String(req.params.sale_id);

    if (!isValidUUID(sale_id)) {
      return res.status(400).json({ sucesso: false, erro: 'sale_id inválido: formato UUID esperado' });
    }

    console.log(`[API DANFE] Pedido recebido para sale_id: ${sale_id}`);

    const resultado = await generateDanfePdf(String(sale_id));

    if (resultado.success) {
      return res.status(200).json({ sucesso: true, dados: resultado });
    }

    return res.status(422).json({ sucesso: false, erro: resultado.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API DANFE] Erro:', message);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao gerar DANFE' });
  }
});

app.use((req: Request, res: Response) => {
  console.log(`[server] 404 - Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).send('Rota não encontrada');
});

const TEMP_DIR = path.resolve(__dirname, '../temp');
cleanupTempFiles(TEMP_DIR);
setInterval(() => cleanupTempFiles(TEMP_DIR), 30 * 60 * 1000);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Microserviço NF-e rodando em 0.0.0.0:${PORT}`);
  console.log(`[server] GET /api/nfe/status`);
  console.log(`[server] POST /api/nfe/emitir/:sale_id`);
  console.log(`[server] POST /api/nfe/danfe/:sale_id`);
});

function gracefulShutdown(signal: string) {
  console.log(`[server] Recebido ${signal}. Encerrando servidor...`);

  if (sefazService) sefazService.dispose();

  server.close(() => {
    console.log('[server] Servidor encerrado.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[server] Forçando encerramento após timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
