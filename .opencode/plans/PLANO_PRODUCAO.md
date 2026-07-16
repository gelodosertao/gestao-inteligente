# Plano de Ação — nfe_service para Produção

> Gerado em: 15/07/2026
> Localização real do projeto: `nfe_service/`

---

## 🔴 Fase 0 — Hotfix (urgente, ~2h) ✅ CONCLUÍDA

| # | Tarefa | Status | Observação |
|---|--------|--------|------------|
| 0.1 | Verificar `import { ZipArchive }` | ✅ Correto | `archiver` expõe `{ ZipArchive }` como classe — já funcionava |
| 0.2 | Build + testar servidor | ✅ Testado | `GET /health` ✅, `GET /api/nfe/status` ✅, `GET /api/nfe/xml/:ano/:mes` ✅ (200 ZIP) |
| 0.3 | PM2 config | ✅ Criado | `nfe_service/ecosystem.config.js` com max_restarts, memory limit, logs |

> **Servidor operacional. Pode subir para homologação agora.**

---

## 🟡 Fase 1 — Segurança (~1 dia)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 1.1 | Helmet (security headers) | `npm install helmet` + `app.use(helmet())` em `server.ts` |
| 1.2 | Rate limiting | `npm install express-rate-limit` — 100 req/min por IP |
| 1.3 | Limitar body JSON | `express.json({ limit: '10mb' })` |
| 1.4 | Forçar `API_AUTH_TOKEN` em produção | Se `env.isProduction` e sem token, falhar startup |
| 1.5 | Lock CORS produção | `SERVER_CORS_ORIGIN` obrigatório (não aceitar `*` em prod) |

---

## 🟡 Fase 2 — Observabilidade (~1 dia)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 2.1 | Log estruturado | Substituir `console.log` por Pino |
| 2.2 | Request ID tracking | `express-request-id` para rastrear chamadas |
| 2.3 | Logs rotativos | File + stdout com pino-pretty (dev) e JSON (prod) |
| 2.4 | Health check avançado | `/health` testar conexão Supabase + SEFAZ |

---

## 🟡 Fase 3 — Infraestrutura (~1 dia)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 3.1 | Dockerfile | Multi-stage: builder (tsc) + runner (node slim) em `nfe_service/Dockerfile` |
| 3.2 | PM2 config | `nfe_service/ecosystem.config.js` com max_restarts, memory limit |
| 3.3 | CI/CD | GitHub Actions: lint → build → test → deploy |

---

## 🟢 Fase 4 — Qualidade (~1–2 dias)

| # | Tarefa | Detalhes |
|---|--------|----------|
| 4.1 | Testes unitários | Jest — SefazService, NfeGenerator, utils |
| 4.2 | Testes de integração | Endpoints com supertest |
| 4.3 | Swagger/OpenAPI | `swagger-jsdoc` + `swagger-ui-express` |
| 4.4 | 404 → JSON | `res.status(404).json({ sucesso: false, erro: 'Rota não encontrada' })` |
| 4.5 | Prefixo `/api/v1/` | Versionamento explícito das rotas |

---

## Sumário

| Fase | Dias | Prioridade | Pode subir? |
|------|------|------------|-------------|
| **Fase 0 — Hotfix** | **✅ Concluída** | 🔥 Urgente | ✅ Homologação |
| Fase 1 — Segurança | ~1 dia | Alta | ❌ |
| Fase 2 — Observabilidade | ~1 dia | Alta | ❌ |
| Fase 3 — Infraestrutura | ~1 dia | Média | ⚠️ Talvez |
| Fase 4 — Qualidade | ~1–2 dias | Média | ✅ Sem ser crítico |

**Total estimado: ~4–5 dias para tudo pronto.**
