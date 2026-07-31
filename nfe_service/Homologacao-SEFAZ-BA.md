# Homologação com SEFAZ-BA

> Micro-serviço: `nfe_service` (porta 3001)
> Ambiente: Homologação (`SEFAZ_AMBIENTE=2`)

---

## 1. Verificar configuração do `.env`

| Variável | Valor esperado | Status |
|----------|---------------|--------|
| `SEFAZ_AMBIENTE` | `2` | ✅ |
| `SEFAZ_UF` | `BA` | ✅ |
| `MOCK_LOCAL_ONLY` | `false` | ✅ |
| `CERTIFICADO_A1_BASE64` | Preenchido | ✅ |
| `CERTIFICADO_PASSWORD` | Preenchido | ✅ |
| `CNPJ_EMITENTE` | `47026674000129` | ✅ |
| `SUPABASE_URL` | Preenchido | ✅ |
| `SUPABASE_SERVICE_KEY` | Preenchido | ✅ |
| `SEFAZ_TIMEOUT_MS` | `60000` | ✅ |
| `API_AUTH_TOKEN` | Vazio (ignorado) | ✅ |

---

## 2. Subir o serviço

```bash
cd nfe_service

# Verificar se compila
npm run typecheck

# Iniciar servidor
npm run dev
```

Esperado no console:
```
[env] .env encontrado em: ...
[SefazService] Certificado A1 decodificado (#### bytes)
[SefazService] Symlink criado: node_modules/resources -> @treeunfe/shared/resources
[server] SefazService inicializado com sucesso
[server] Microserviço NF-e rodando em 0.0.0.0:3001
```

---

## 3. Testar endpoints (ordem recomendada)

### 3.1 Health check

```bash
curl http://localhost:3001/health
```

**Resposta esperada:**
```json
{ "status": "ok", "timestamp": "...", "service": "nfe-service" }
```

---

### 3.2 Status do serviço SEFAZ-BA

```bash
curl http://localhost:3001/api/nfe/status 
```

**Resposta esperada (sucesso):**
```json
{
  "sucesso": true,
  "dados": {
    "status": "100",
    "motivo": "Servico em operacao",
    "ambiente": "Homologação",
    "uf": "BA",
    "dataHora": "..."
  }
}
```

**Resposta esperada (erro):**
```json
{
  "sucesso": false,
  "erro": "Falha na carga do certificado digital: ..."
}
```

---

### 3.3 Emitir NF-e de teste

Substitua `<sale_id>` por um UUID de venda existente no banco:

```bash
curl -X POST http://localhost:3001/api/nfe/emitir/<sale_id> \
  -H "Content-Type: application/json" \
  -d '{"customerDoc":"12345678909"}'
```

**Para consumidor final (sem CPF/CNPJ):**
```bash
curl -X POST http://localhost:3001/api/nfe/emitir/<sale_id> \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### 3.4 Gerar DANFE (após emissão)

```bash
curl -X POST http://localhost:3001/api/nfe/danfe/<sale_id> \
  -H "Content-Type: application/json"
```

---

### 3.5 Cancelar NF-e

```bash
curl -X POST http://localhost:3001/api/nfe/cancelar/<sale_id> \
  -H "Content-Type: application/json" \
  -d '{"justificativa":"Teste em homologacao - cancelamento de nota emitida para testes"}'
```

> ⚠ A justificativa precisa ter no **mínimo 15 caracteres**.

---

## 4. Interpretar retornos da SEFAZ

### cStats de sucesso

| cStat | Significado |
|-------|-------------|
| `100` | NF-e autorizada ✅ |
| `101` | Cancelamento de NF-e homologado ✅ |
| `135` | Evento de cancelamento vinculado à NF-e ✅ |
| `150` | NF-e autorizada fora de prazo |
| `151` | NF-e autorizada com dígito verificador divergente |
| `155` | Cancelamento autorizado fora de prazo |
| `539` | NF-e duplicada (já autorizada antes) |

### cStats de erro comuns

| cStat | Significado | Ação |
|-------|-------------|------|
| `278` | xNome do destinatário não forçado para homologação | ✅ Já tratado no código |
| `656` | CNPJ do emitente não habilitado | Verificar SEFAZ/SCAN |
| `204` | Duplicidade de NF-e (mesmo nNF) | Verificar contador |
| `110` | Uso de certificado digital incompatível | Certificado A1 diferente do CNPJ? |

---

## 5. Diagnóstico de problemas

### O serviço não sobe

```
[FAIL-FAST] CERTIFICADO_A1_BASE64 ausente
```
→ `.env` não encontrado ou variável vazia. Verificar diretório.

```
[server] Falha ao inicializar SefazService: ...
```
→ Certificado inválido, senha errada, ou CNPJ incorreto. O servidor continua rodando sem o SEFAZ (rotas retornam 503). Verificar:
```bash
curl http://localhost:3001/api/nfe/status
```

### Timeout na comunicação

```
Erro na consulta de status: Timeout na comunicação com a SEFAZ-BA
```
- Firewall corporativo bloqueando saída para IPs da SEFAZ
- Aumentar `SEFAZ_TIMEOUT_MS` no `.env` (máx 300000)
- Testar de outra rede (ex: 4G do celular)

### Certificado rejeitado

```
Falha na carga do certificado digital
```
- Certificado expirado? Verificar validade do A1
- Senha incorreta? Confirmar `CERTIFICADO_PASSWORD`
- Base64 corrompido? Regenerar:
  ```bash
  certutil -encode certificado.pfx cert.txt
  # ou no Linux/Mac:
  # base64 -i certificado.pfx | pbcopy
  ```

---

## 6. Após homologação bem-sucedida

Quando os testes em homologação passarem:

1. Alterar `.env`: `SEFAZ_AMBIENTE=1`
2. Definir `SERVER_CORS_ORIGIN` com o domínio real
3. Definir `API_AUTH_TOKEN` com um token seguro
4. Remover certificado de homologação (se diferente do de produção)
5. Testar uma emissão real com valor baixo
6. Verificar se o XML foi salvo e DANFE gerou corretamente

---

## Checklist rápido

- [ ] `npm run typecheck` — zero erros
- [ ] Servidor inicia sem `FAIL-FAST`
- [ ] `GET /health` responde 200
- [ ] `GET /api/nfe/status` retorna informações da SEFAZ
- [ ] NF-e emitida retorna cStat `100` ou `539`
- [ ] `nfe_xml` salvo no banco (ver Supabase)
- [ ] DANFE gerado com sucesso
- [ ] Cancelamento funciona
