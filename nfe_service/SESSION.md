# Sessão — Revisão e Correção do `nfe_service`

## Data
14/07/2026

## O que foi feito

### Fase 1 — Contador Sequencial NF-e (nNF)
- Criada tabela `nfe_counters` no Supabase (série 1, last_nnf=0)
- Criada função RPC `increment_nfe_counter(series)` — atômica, `SECURITY DEFINER`
- Criado `src/services/NfeCounterService.ts` com `getNextNnf()` e `getCurrentNnf()`
- `npm run typecheck` → OK

### Fase 2 — Correção dos Dados da NF-e
- Instalado `xmlbuilder2` (substitui serializador XML caseiro)
- Criado `src/utils/nfe-utils.ts`:
  - `calcularDV(chave43)` — módulo 11
  - `montarChaveAcesso(params)` — chave de 44 dígitos
  - `gerarCNF()` — número aleatório de 8 dígitos
  - `buildXmlFromJson(data)` — XML builder confiável
- Corrigido `SefazService.ts`:
  - `CRT: '3'` → `'1'` (Simples Nacional)
  - `indFinal` baseado em CPF(1) vs CNPJ(0)
  - `nNF` agora vem do contador, não de `saleId.slice(-9)`
  - Valores monetários com `toFixed(2)`
- Corrigido `NfeGenerator.ts`:
  - `IS_SANDBOX` lê de `env.sefazAmbiente` (não hardcoded)
  - nNF real via `getNextNnf()`
  - Chave de acesso com CNPJ do emitente + DV calculado
  - `cDV` extraído da chave (`chave44[43]`)
  - `buildXmlString` removido, usado `xmlbuilder2`
  - `updateSaleNfeStatus()` chamado após emissão
- `npm run typecheck` + `tsc` → OK, zero erros

### Decisões tomadas
- Regime tributário: **Simples Nacional (CRT=1)**
- nNF: **contador atômico no Postgres** (sem race condition)

## Arquivos criados/modificados

| Arquivo | Ação |
|---------|------|
| `nfe_service/src/schemas/migration_nfe_counters.sql` | CRIADO |
| `nfe_service/src/services/NfeCounterService.ts` | CRIADO |
| `nfe_service/src/utils/nfe-utils.ts` | CRIADO |
| `apply_nfe_counter_migration.cjs` | CRIADO |
| `nfe_service/package.json` (xmlbuilder2) | MODIFICADO |
| `nfe_service/src/services/SefazService.ts` | MODIFICADO |
| `nfe_service/src/services/NfeGenerator.ts` | MODIFICADO |

## Fases concluídas nesta sessão

### Fase 3 — Segurança e Robustez
- [x] Validar `sale_id` (UUID) e `customerDoc` no endpoint (`server.ts`)
  - Regex UUID v4 para `sale_id` nos endpoints `emitir/:sale_id` e `danfe/:sale_id`
  - Validação de 11 (CPF) ou 14 (CNPJ) dígitos para `customerDoc`
  - Retorno 400 com mensagem clara se inválido
- [x] Adicionar graceful shutdown (`SIGTERM`/`SIGINT`)
  - `server.close()` com timeout de 10s para força de encerramento
- [x] Adicionar autenticação básica nas rotas
  - Middleware `Bearer Token` via env var `API_AUTH_TOKEN`
  - Se `API_AUTH_TOKEN` não estiver definido, autenticação é ignorada (compatibilidade retroativa)
- [x] Tratar `sale.total` com fallback `?? 0` em `NfeGenerator.productionEmit`

### Fase 4 — Pipeline de Persistência
- [x] Concluído na Fase 2 (já salva no banco)

### Fase 5 — Tipagem e Limpeza
- [x] Tipar `findCustomerByDoc` com interface `CustomerData` (remover `any`)
  - Interface exportada com campos: `razao_social`, `logradouro`, `numero`, `bairro`, `city`, `state`, `zip_code`, `phone`, `inscricao_estadual`, `cpf_cnpj`
- [x] Adicionar log no `catch` vazio da `DanfeService` (finally cleanup)
- [x] Remover duplicação de cliente Supabase no `DanfeService` (reutiliza client compartilhado)

### Fase 6 — Ajustes de Homologação e Resiliência
- [x] Corrigido `NfeGenerator.ts` para enviar XML real para SEFAZ quando `sefazAmbiente === 2`, movendo o mock isolado para uma ENV específica (`MOCK_LOCAL_ONLY`).
- [x] Corrigido `SefazService.ts` aplicando a regra de validação da SEFAZ (Rejeição 278): quando `tpAmb === 2`, `xNome` é forçado para "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" e o CNPJ forçado para "99999999000191".
- [x] Corrigida inicialização do `SefazService` no `server.ts`. O erro de setup (ex: problema no certificado) não mata mais o processo com `process.exit(1)`, permitindo que outras rotas independentes continuem no ar. Rotas dependentes da SEFAZ agora validam e retornam `503 Service Unavailable`.
- [x] Prevenção de **Memory Leak (OOM)** na rota `GET /api/nfe/xml/:ano/:mes`: substituída a consulta única por um `AsyncGenerator` iterável (`getPaginatedNfeXmlsByMonth`) no `SupabaseService.ts`, permitindo empacotamento em ZIP no `server.ts` de forma faseada, processando lotes (100 por vez) com stream e evitando superalocação na memória.

## Arquivos criados/modificados (fase atual)

| Arquivo | Ação |
|---------|------|
| `nfe_service/src/server.ts` | MODIFICADO — validação UUID/DOC, graceful shutdown, auth Bearer |
| `nfe_service/src/services/SupabaseService.ts` | MODIFICADO — interface `CustomerData`, fim do `any` |
| `nfe_service/src/services/DanfeService.ts` | MODIFICADO — client compartilhado, log no catch |
| `nfe_service/src/services/NfeGenerator.ts` | MODIFICADO — fallback `sale.total ?? 0` |
| `nfe_service/SESSION.md` | MODIFICADO — registro das fases 3-5 |

## Como reiniciar a sessão
```bash
cd nfe_service
npm run typecheck   # verificar se está tudo ok
npm run dev         # iniciar servidor
```
