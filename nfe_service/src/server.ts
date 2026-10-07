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
import { getSaleNfeForCancel, getNfeIssue, getPaginatedNfeXmlsByMonth, getSalesReportByMonth, completeNfeCancellation, prepareNfeCancellation } from './services/SupabaseService';
import { authenticateFiscalUser, AuthError, type FiscalActor } from './services/AuthService';
import { generateNfeXml } from './services/NfeGenerator';
import { getDraftReview, saveDraft } from './services/NfeDraftService';
import { FiscalContextSchema } from './services/FiscalRules';
import { recoverAuthorizedXml } from './services/XmlProtocol';
import { completeNfeIssue } from './services/NfeCounterService';
import { generateDanfePdf } from './services/DanfeService';
import { cleanupTempFiles } from './utils/nfe-utils';
import { getFiscalConsole, saveFiscalConfiguration, searchFiscalDocuments, FiscalConfigurationInput } from './services/FiscalConfigurationService';

const app = express();
const PORT = 3001;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EmitirBodySchema = z.object({ revision: z.number().int().positive() }).strict();
const RascunhoBodySchema = z.object({ customerId: z.string().min(1).max(100), context: FiscalContextSchema,
  revision: z.number().int().positive().optional() }).strict();

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
  authenticateFiscalUser(req.headers.authorization)
    .then(actor => {
      res.locals.actor = actor;
      res.locals.tenantId = actor.tenantId;
      next();
    })
    .catch((error: unknown) => {
      if (error instanceof AuthError) {
        res.status(error.status).json({ sucesso: false, erro: error.message });
      } else {
        console.error('[server] Falha na autenticação fiscal:', error);
        res.status(503).json({ sucesso: false, erro: 'Autenticação fiscal indisponível.' });
      }
    });
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'nfe-service' });
});

app.use('/api', authMiddleware);

function adminOnly(_req: Request, res: Response, next: NextFunction): void {
  if ((res.locals.actor as FiscalActor).role !== 'ADMIN') {
    res.status(403).json({ sucesso: false, erro: 'Ação restrita ao administrador.' }); return;
  }
  next();
}

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

let sefazService: SefazService | null = null;

try {
  sefazService = new SefazService();
  console.log('[server] SefazService inicializado com sucesso');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[server] Falha ao inicializar SefazService: ${message}. Emissão indisponível.`);
}

app.get('/api/nfe/rascunho/:sale_id', async (req: Request, res: Response) => {
  if (!isValidUUID(String(req.params.sale_id))) return res.status(400).json({ sucesso: false, erro: 'sale_id inválido.' });
  try { return res.json({ sucesso: true, dados: await getDraftReview(String(req.params.sale_id), res.locals.actor) }); }
  catch (error) { return res.status(error instanceof AuthError ? error.status : 503).json({ sucesso: false,
    erro: error instanceof Error ? error.message : 'Rascunho indisponível.' }); }
});

app.put('/api/nfe/rascunho/:sale_id', async (req: Request, res: Response) => {
  if (!isValidUUID(String(req.params.sale_id))) return res.status(400).json({ sucesso: false, erro: 'sale_id inválido.' });
  const input = RascunhoBodySchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ sucesso: false, erro: 'Dados do rascunho inválidos.', detalhes: input.error.flatten() });
  try { return res.json({ sucesso: true, dados: await saveDraft(String(req.params.sale_id), res.locals.actor, input.data) }); }
  catch (error) { return res.status(error instanceof AuthError ? error.status : 503).json({ sucesso: false,
    erro: error instanceof Error ? error.message : 'Falha ao salvar rascunho.' }); }
});

app.use('/api/nfe', adminOnly);

app.get('/api/nfe/configuracoes', async (_req: Request, res: Response) => {
  try { return res.json({ sucesso: true, dados: await getFiscalConsole(res.locals.actor) }); }
  catch (error) { return res.status(503).json({ sucesso: false, erro: error instanceof Error ? error.message : 'Configurações indisponíveis.' }); }
});

app.get('/api/nfe/configuracoes/notas', async (req: Request, res: Response) => {
  try { return res.json({ sucesso: true, dados: await searchFiscalDocuments(res.locals.actor, String(req.query.busca || '')) }); }
  catch (error) { return res.status(400).json({ sucesso: false, erro: error instanceof Error ? error.message : 'Consulta indisponível.' }); }
});

app.post('/api/nfe/configuracoes', async (req: Request, res: Response) => {
  const input = FiscalConfigurationInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ sucesso: false, erro: 'Configuração fiscal inválida.', detalhes: input.error.flatten() });
  try { return res.json({ sucesso: true, dados: await saveFiscalConfiguration(res.locals.actor, input.data) }); }
  catch (error) { return res.status(409).json({ sucesso: false, erro: error instanceof Error ? error.message : 'Falha ao salvar configuração.' }); }
});

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

app.get('/api/nfe/consultar/:sale_id', async (req: Request, res: Response): Promise<any> => {
  const saleId = String(req.params.sale_id);
  if (!isValidUUID(saleId)) return res.status(400).json({ sucesso: false, erro: 'sale_id inválido' });
  if (!sefazService) return res.status(503).json({ sucesso: false, erro: 'Serviço SEFAZ indisponível.' });
  try {
    const issue = await getNfeIssue(saleId, res.locals.tenantId);
    if (!issue.access_key) return res.status(409).json({ sucesso: false, erro: 'Tentativa ainda sem chave de acesso.' });
    const sefaz = await sefazService.consultarNFe(issue.access_key);
    let reconciled = false;
    if (issue.status === 'cancel_unknown' && sefaz.cancellation) {
      await completeNfeCancellation(saleId, res.locals.tenantId, 'cancelled', sefaz.cancellation);
      return res.json({ sucesso: true, dados: { statusLocal: 'cancelled', chave: issue.access_key,
        cStat: sefaz.cancellation.cStat, reconciled: true, message: 'Cancelamento conciliado com a SEFAZ.' } });
    }
    if (['unknown', 'transmitting'].includes(issue.status) && ['100', '150'].includes(sefaz.cStat)) {
      if (!issue.signed_xml || !sefaz.protocolXml || !sefaz.protocolo) throw new Error('Protocolo/assinatura ausente; conciliação manual necessária.');
      const xml = recoverAuthorizedXml(issue.signed_xml, sefaz.protocolXml, env.sefazAmbiente);
      await completeNfeIssue(saleId, res.locals.tenantId, 'authorized', sefaz.protocolo, xml);
      reconciled = true;
    }
    if (issue.status === 'unknown' && sefaz.cStat === '217' &&
        /NFE_Autorizacao: Rejei(?:ç|c)[aã]o:/i.test(issue.last_error || '')) {
      await completeNfeIssue(saleId, res.locals.tenantId, 'rejected', undefined, undefined,
        `${issue.last_error} Consulta SEFAZ: 217 - NF-e não consta na base.`);
      return res.json({ sucesso: true, dados: { statusLocal: 'rejected', chave: issue.access_key,
        cStat: sefaz.cStat, reconciled: true,
        message: 'Tentativa confirmada como rejeitada. A chave não consta na base da SEFAZ.' } });
    }
    return res.json({ sucesso: true, dados: { statusLocal: reconciled ? 'authorized' : issue.status,
      chave: issue.access_key, cStat: sefaz.cStat, motivo: sefaz.motivo, protocol: sefaz.protocolo,
      reconciled, message: reconciled ? 'NF-e conciliada e autorizada.' : issue.status === 'cancel_unknown'
        ? 'Cancelamento ainda não confirmado. Solicite conciliação fiscal antes de qualquer nova ação.' : sefaz.motivo } });
  } catch (error) {
    console.error('[API Consulta NF-e]', error);
    return res.status(502).json({ sucesso: false, erro: 'Falha na consulta da NF-e.' });
  }
});

app.post('/api/nfe/emitir/:sale_id', async (req: Request, res: Response): Promise<any> => {
  try {
    const sale_id = String(req.params.sale_id);

    if (!isValidUUID(sale_id)) {
      return res.status(400).json({ sucesso: false, erro: 'sale_id inválido: formato UUID esperado' });
    }

    const bodyParse = EmitirBodySchema.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ sucesso: false, erro: 'Corpo da requisição inválido', detalhes: bodyParse.error.flatten().fieldErrors });
    }

    console.log(`[API NF-e] Pedido recebido para sale_id: ${sale_id}`);

    if (!sefazService) {
      return res.status(503).json({ sucesso: false, erro: 'Serviço SEFAZ indisponível.' });
    }

    const resultado = await generateNfeXml(String(sale_id), bodyParse.data.revision, sefazService, res.locals.tenantId);

    if (resultado.success) {
      return res.status(200).json({ sucesso: true, dados: resultado, mensagem: 'Rota conectada', sale_id });
    } else {
      return res.status(422).json({ sucesso: false, erro: resultado.message });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API NF-e] Erro:', message);
    return res.status(error instanceof AuthError ? error.status : 500).json({ sucesso: false, erro: message });
  }
});

app.get('/api/nfe/xml/:ano/:mes', async (req: Request, res: Response): Promise<any> => {
  try {
    const ano = parseInt(String(req.params.ano), 10);
    const mes = parseInt(String(req.params.mes), 10);

    if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ sucesso: false, erro: 'Período inválido. Use /api/nfe/xml/AAAA/MM' });
    }

    const generator = getPaginatedNfeXmlsByMonth(ano, mes, res.locals.tenantId);
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

    const relatorio = await getSalesReportByMonth(ano, mes, res.locals.tenantId);
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
    if (!justificativa || typeof justificativa !== 'string' || justificativa.trim().length < 15 || justificativa.trim().length > 255) {
      return res.status(400).json({ sucesso: false, erro: 'justificativa inválida: mínimo 15 caracteres' });
    }

    console.log(`[API Cancelamento] Pedido recebido para sale_id: ${sale_id}`);

    if (!sefazService) {
      return res.status(503).json({ sucesso: false, erro: 'Serviço SEFAZ indisponível.' });
    }

    const nfeData = await getSaleNfeForCancel(sale_id, res.locals.tenantId);
    let resultado: Awaited<ReturnType<SefazService['cancelarNFe']>>;
    try {
      resultado = await sefazService.cancelarNFe(nfeData.invoiceKey, nfeData.nfeProtocol, justificativa.trim(),
        async signedEvent => { await prepareNfeCancellation(sale_id, res.locals.tenantId, signedEvent); });
    } catch (error) {
      // A local schema/signature error happens before the event is persisted or transmitted.
      // Only an event persisted for transmission can have an uncertain SEFAZ outcome.
      const issue = await getNfeIssue(sale_id, res.locals.tenantId);
      if (issue.cancellation_signed_xml) {
        await completeNfeCancellation(sale_id, res.locals.tenantId, 'cancel_unknown');
      }
      throw error;
    }

    if (resultado.success) {
      await completeNfeCancellation(sale_id, res.locals.tenantId, 'cancelled', resultado.receipt);
      return res.status(200).json({ sucesso: true, dados: resultado });
    }

    await completeNfeCancellation(sale_id, res.locals.tenantId, 'cancel_unknown');
    return res.status(422).json({ sucesso: false, erro: resultado.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API Cancelamento] Erro:', message);
    if (/^NFE_Cancelamento: Rejei(?:c|ç)[aã]o:/i.test(message)) {
      return res.status(422).json({ sucesso: false,
        erro: `${message} Consulte a situação da NF-e na SEFAZ antes de qualquer nova tentativa.` });
    }
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

    const resultado = await generateDanfePdf(String(sale_id), res.locals.tenantId);

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

const HOST = process.env.SERVER_HOST || '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
  console.log(`[server] Microserviço NF-e rodando em ${HOST}:${PORT}`);
  console.log(`[server] GET /api/nfe/status`);
  console.log(`[server] POST /api/nfe/emitir/:sale_id`);
  console.log(`[server] POST /api/nfe/danfe/:sale_id`);
});

function gracefulShutdown(signal: string) {
  console.log(`[server] Recebido ${signal}. Encerrando servidor...`);


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
