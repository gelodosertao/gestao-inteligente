# Checklist — Emissão de NF-e em Produção (SEFAZ-BA)

> Data: 31/07/2026 — Status: **Em homologação** (`SEFAZ_AMBIENTE=2`)
> Micro-serviço: `nfe_service` (porta 3001) — Biblioteca: `@treeunfe/nfe` v2.2.8
> Emitente: GDS PRODUTOS ALIMENTICIOS LTDA — CNPJ `47026674000129`

---

## ✅ O que já está pronto

| Item | Onde | Status |
|------|------|--------|
| Código completo (geração, emissão, cancelamento, DANFE, XML, relatório mensal) | `nfe_service/src/` | ✅ |
| Certificado A1 no projeto | `certs/174078781_GDS_PRODUTOS_ALIMENTICIOS_LTDA_47026674000129.pfx` | ✅ |
| `.env` do serviço configurado (cert, senha, CNPJ, Supabase) | `nfe_service/.env` | ✅ |
| Contador nNF atômico implementado | `NfeCounterService.ts` + migrations | ✅ |
| Correções de schema Zod / tipos / truncamento de campos | `SefazService.ts`, `nfe-schemas.ts`, `ibge-utils.ts` | ✅ |
| UI de emissão de NF-e no POS | `components/WholesalePOS.tsx` | ✅ |

---

## ❌ O que falta para produção

### 1. Trocar ambiente para produção (obrigatório)

- [ ] `SEFAZ_AMBIENTE=2` → `1` em `nfe_service/.env`
- ⚠️ Com `2`, as notas saem como **"NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"** e usam CNPJ dummy `99999999000191`.

### 2. Hospedar o micro-serviço (crítico)

- [ ] Subir o `nfe_service` em um VPS/cloud com HTTPS e IP fixo
- [ ] Definir `VITE_NFE_SERVICE_URL` no build do app
- ⚠️ Hoje: `services/invoiceService.ts:13` usa fallback `localhost:3001` — web (Vercel) e Android não alcançam a SEFAZ

### 3. Configuração de produção no `.env`

- [ ] `API_AUTH_TOKEN` — vazio hoje; obrigatório em produção (o serviço nem inicia sem ele)
- [ ] `SERVER_CORS_ORIGIN` — definir domínio real (não pode ser `*` em produção)
- [ ] `SUPABASE_SERVICE_KEY` — confirmar que é a chave `service_role` (nunca anon)

### 4. Conferir dados do emitente (hardcoded no código)

- [ ] `SefazService.ts:238-250`:
  - IE: `117178795`
  - Razão: `GDS PRODUTOS ALIMENTICIOS LTDA`
  - Endereço: RODOVIA BA 160, 2040, SAO JOAO — Ibotirama/BA, CEP 47520000
  - Telefone: 77999820028
- ⚠️ Devem bater **exatamente** com o cadastro na SEFAZ-BA

### 5. Testes de homologação (checklist pendente)

- [ ] `npm run typecheck` — zero erros
- [ ] Servidor inicia sem `FAIL-FAST`
- [ ] `GET /health` responde 200
- [ ] `GET /api/nfe/status` retorna status da SEFAZ
- [ ] NF-e emitida retorna `cStat 100` ou `539`
- [ ] `nfe_xml` salvo no Supabase
- [ ] DANFE gerado corretamente
- [ ] Cancelamento funciona
- [ ] Sem rejeição `656` (CNPJ emitente não habilitado)
- [ ] Sem rejeição `110` (certificado incompatível)
- [ ] Sem rejeição `204` (duplicidade de nNF)

### 6. Migrações no Supabase

- [ ] `database/migrations/33_nfe_tables_and_rls.sql` aplicada
- [ ] `nfe_service/src/schemas/migration_nfe_counters.sql` aplicada

### 7. Obrigações legais (fora do código)

- [ ] Credenciamento ativo na SEFAZ-BA para emissão de NF-e
- [ ] Certificado A1 vigente e atrelado ao CNPJ do emitente
- [ ] CFOP/NCM corretos para o produto (gelo — NCM 2201/2202)
- [ ] Alíquotas de ICMS configuradas conforme regime tributário (CRT 1)

---

## 🚀 Passos após homologação bem-sucedida

1. Alterar `SEFAZ_AMBIENTE=1`
2. Definir `SERVER_CORS_ORIGIN` com o domínio real
3. Definir `API_AUTH_TOKEN` com token seguro
4. Remover certificado de homologação (se diferente do de produção)
5. Testar uma emissão real com valor baixo
6. Verificar se o XML foi salvo e o DANFE gerou corretamente

---

## 🔵 Melhorias futuras (pós-produção)

- Endpoint de CC-e (Carta de Correção)
- Endpoint de consulta de NF-e por chave
- Endpoint de inutilização de numeração
- Rate limit granular por rota
