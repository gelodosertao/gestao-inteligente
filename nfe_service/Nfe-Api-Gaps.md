# NFe API — Gaps para Homologação SEFAZ-BA

> Data: 23/07/2026 — Status: **✅ Tudo resolvido**
> Micro-serviço: `nfe_service` (porta 3001)
> Biblioteca: `@treeunfe/nfe` v2.2.8

---

## 🔴 Críticos

### 1. Type mismatches — strings onde a lib espera numbers ✔

**Status:** Resolvido — `SefazService.ts` agora envia `number` para todos os campos de `Ide`, `EnderDest` e `Emit`. Schemas Zod em `nfe-schemas.ts` atualizados com `z.number().int()`.

**Arquivos alterados:** `SefazService.ts`, `nfe-schemas.ts`

---

### 2. XML não é salvo após emissão real ✔

**Status:** Resolvido — `SefazService.emitirNFe()` agora monta o `nfeProc` com `buildXmlFromJson` a partir do retorno da SEFAZ e retorna `nfeXml` no resultado.

**Arquivo:** `SefazService.ts` (linhas 335-349)

---

### 3. Vazamento do contador nNF em caso de exceção ✔

**Status:** Resolvido — `productionEmit` agora envolve a chamada à SEFAZ em `try/catch` e chama `cancelNnf()` tanto no `else` (erro controlado) quanto no `catch` (exceção).

**Arquivo:** `NfeGenerator.ts` (linhas 313-320)

---

### 4. Status `pendente_emissao` ignorado no guard inicial ✔

**Status:** Resolvido — Se `nfe_status === 'pendente_emissao'`, o sistema reutiliza o `nNF` existente em vez de gerar um novo. O contador só é incrementado se `sale.nfe_number` estiver vazio.

**Arquivo:** `NfeGenerator.ts` (linhas 256-264, 342-344)

---

### 5. Grupo `IBSCBSTot` pode causar rejeição na SEFAZ-BA ✔

**Status:** Resolvido — `IBSCBSTot` removido do payload enviado. Schema Zod mantido como opcional para compatibilidade futura.

**Arquivo:** `SefazService.ts`

---

## 🟡 Moderados

### 6. Cidade do destinatário fixa em Ibotirama (2927408) ✔

**Status:** Resolvido — Criado `ibge-utils.ts` com função `resolveCityIbge()` que mapeia cidades da Bahia para códigos IBGE. Fallback para Ibotirama se cidade não encontrada.

**Arquivo:** `src/utils/ibge-utils.ts`

---

### 7. Sem validação de tamanho máximo de campos ✔

**Status:** Resolvido — Função `truncateString()` aplicada em todos os campos com limite NFe 4.00 (xNome 60, xLgr 60, xBairro 60, xMun 60, verProc 20, etc.).

**Arquivo:** `ibge-utils.ts`, `SefazService.ts`

---

### 8. `.env.example` desatualizado ✔

**Status:** Resolvido — Adicionadas variáveis `MOCK_LOCAL_ONLY`, `SEFAZ_TIMEOUT_MS`, `SERVER_CORS_ORIGIN`, `API_AUTH_TOKEN`.

**Arquivo:** `.env.example`

---

## 🔵 Melhorias (pós-homologação)

- Endpoint de **CC-e** (Carta de Correção)
- Endpoint de **consulta de NF-e** por chave
- Endpoint de **inutilização de numeração**
- Rate limit granular por rota
- `indIEDest` ainda como string no Zod (`DestSchema`) — lib `@treeunfe/types` espera `number`. Funciona via `as unknown`, mas pode ser refinado.

---

## ✅ Checklist final

| Item | Status |
|------|--------|
| `typecheck` (tsc --noEmit) | ✅ Zero erros |
| Zod valida ambos (string e number) | ✅ `indTot`, `orig`, `modFrete` aceitam ambos |
| Contador nNF atômico | ✅ `increment_nfe_counter` + `cancel_nfe_counter` |
| Certificado A1 | ✅ Configurado no `.env` |
| Ambiente homologação | ✅ `SEFAZ_AMBIENTE=2` |
| Homologação SEFAZ (dummy CNPJ/nome) | ✅ `xNome` e `CNPJ` forçados conforme regra |
