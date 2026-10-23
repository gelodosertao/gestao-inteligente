# Contributing — Geleiro PRO

> Guia de contribuição para desenvolvedores e agentes AI.
> **Qualquer agente de qualquer modelo DEVE seguir este padrão.**

---

## 📋 Workflow: Issue → Branch → PR → Deploy

Todo trabalho no projeto segue este fluxo obrigatório:

```
1. Issue criada no GitHub (com labels e descrição)
2. Branch criada a partir de `develop`
3. Commits com mensagens padronizadas
4. PR aberta para `develop` (mencionando a Issue)
5. Code Review + Aprovação
6. Merge na `develop`
7. Promoção: develop → homologacao → main
```

---

## 🌳 Branch Strategy

```
main (Produção — auto-deploy Vercel)
  └── homologacao (Staging — testes de integração)
       └── develop (Desenvolvimento — integração contínua)
            ├── feature/xxx   → novas funcionalidades
            ├── fix/xxx       → correções de bug
            ├── improve/xxx   → melhorias/refatorações
            └── chore/xxx     → manutenção/infra/docs
```

### Regras

| Regra | Descrição |
|-------|-----------|
| **Nunca commitar direto em `main`** | Sempre via PR |
| **Nunca commitar direto em `homologacao`** | Sempre via PR de `develop` |
| **Branch sempre a partir de `develop`** | `git checkout develop && git checkout -b feature/minha-feature` |
| **Deletar branch após merge** | Manter o repositório limpo |

---

## 🏷️ Naming Conventions

### Branches

```
feature/descricao-curta    → Nova funcionalidade
fix/descricao-do-bug       → Correção de bug
improve/descricao          → Melhoria/refatoração
chore/descricao            → Infra, docs, CI/CD
hotfix/descricao           → Fix urgente direto em main (exceção)
```

**Exemplos:**
- `feature/endpoint-cce-nfe`
- `fix/contador-nnf-atomico`
- `improve/refatorar-sales-component`
- `chore/configurar-eslint`

### Commits (Conventional Commits)

```
<tipo>(<escopo>): <descrição curta>

Tipos: feat, fix, docs, style, refactor, perf, test, chore, ci
Escopo (opcional): nfe, pdv, dashboard, crm, estoque, financeiro, infra
```

**Exemplos:**
```
feat(nfe): implementar endpoint de carta de correção
fix(pdv): corrigir cálculo de troco no modo atacado
docs: atualizar README com instruções de deploy
perf(dashboard): otimizar queries do faturamento mensal
test(nfe): adicionar testes para SefazService
chore(infra): configurar GitHub Actions para CI
```

---

## 📝 Issues

### Criando uma Issue

Toda tarefa (correção, melhoria ou nova função) **DEVE** ter uma Issue no GitHub antes de iniciar o trabalho.

**Campos obrigatórios:**
- **Título**: Claro e descritivo
- **Descrição**: Contexto, comportamento esperado, critérios de aceite
- **Labels**: No mínimo 1 label de tipo + 1 de prioridade

### Labels disponíveis

| Label | Uso |
|-------|-----|
| `bug` | Correção de erro/defeito |
| `enhancement` | Melhoria em funcionalidade existente |
| `feature` | Nova funcionalidade |
| `documentation` | Documentação |
| `performance` | Otimização de performance |
| `security` | Segurança |
| `ux/ui` | Design e experiência do usuário |
| `infra` | Infraestrutura e DevOps |
| `nfe` | Nota Fiscal Eletrônica |
| `priority:critical` | Bloqueante — resolver imediatamente |
| `priority:high` | Importante — resolver nesta sprint |
| `priority:medium` | Planejado — resolver em breve |
| `priority:low` | Nice-to-have — quando possível |

---

## 🔀 Pull Requests

### Criando uma PR

**Regras obrigatórias:**

1. **Sempre referenciar a Issue** no corpo da PR usando:
   - `Closes #<número>` — fecha automaticamente a Issue ao fazer merge
   - `Refs #<número>` — referencia sem fechar (para PRs parciais)

2. **Título da PR** deve seguir o formato:
   ```
   <tipo>(<escopo>): <descrição> (#<issue>)
   ```
   Exemplo: `feat(nfe): implementar endpoint CC-e (#3)`

3. **Descrição da PR** deve conter:
   - O que foi feito
   - Por que foi feito
   - Como testar
   - Screenshots (se houver mudanças visuais)

4. **Checklist de PR** (usar o template `.github/PULL_REQUEST_TEMPLATE.md`)

### Fluxo de Merge

```
feature/xxx → develop     (PR com review)
develop     → homologacao (PR de promoção — testes de integração)
homologacao → main        (PR de deploy — produção)
```

| De → Para | Quem aprova | Testes necessários |
|-----------|------------|-------------------|
| `feature/*` → `develop` | Qualquer reviewer | Unit tests passam |
| `develop` → `homologacao` | Lead/Owner | Build + smoke test |
| `homologacao` → `main` | Owner | Testes e2e + validação manual |

---

## 🚀 Deploy

| Branch | Ambiente | URL | Auto-deploy? |
|--------|----------|-----|-------------|
| `main` | Produção | Vercel (prod) | ✅ Sim |
| `homologacao` | Staging | Vercel (preview) | ✅ Sim |
| `develop` | Dev | Local | ❌ Não |

### Processo de Deploy para Produção

1. Acumular features/fixes em `develop`
2. Abrir PR `develop` → `homologacao`
3. Testar no ambiente de staging
4. Abrir PR `homologacao` → `main`
5. Merge = deploy automático na Vercel

---

## 🤖 Instruções para Agentes AI

> **OBRIGATÓRIO para qualquer agente/modelo trabalhando neste repositório.**

### Antes de qualquer alteração de código:

1. **Verificar se existe Issue** para a tarefa. Se não existir, criar uma.
2. **Criar branch** a partir de `develop` seguindo as convenções de naming.
3. **Commits** devem seguir Conventional Commits.
4. **Abrir PR** mencionando a Issue com `Closes #N` ou `Refs #N`.

### Regras invioláveis:

- ❌ **NUNCA** commitar direto em `main` ou `homologacao`
- ❌ **NUNCA** fazer push sem Issue associada
- ❌ **NUNCA** criar PR sem mencionar a Issue
- ✅ **SEMPRE** criar branch a partir de `develop`
- ✅ **SEMPRE** usar Conventional Commits
- ✅ **SEMPRE** incluir `Closes #N` na descrição da PR

### Exemplo completo para um agente:

```bash
# 1. Atualizar develop
git checkout develop && git pull origin develop

# 2. Criar branch para a Issue #5
git checkout -b feature/testes-automatizados

# 3. Fazer as alterações e commitar
git add .
git commit -m "test: adicionar testes unitários para SefazService

Closes #5"

# 4. Push e abrir PR
git push origin feature/testes-automatizados

# 5. Criar PR via gh CLI
gh pr create \
  --base develop \
  --title "test: adicionar testes unitários (#5)" \
  --body "## O que foi feito
Adicionados testes unitários para SefazService.

Closes #5"
```

---

## 📁 Estrutura de Arquivos Relevantes

```
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.md         # Template para bugs
│   └── feature_request.md    # Template para features
└── PULL_REQUEST_TEMPLATE.md  # Template para PRs
CONTRIBUTING.md               # Este arquivo
```

---

## ❓ Dúvidas

Se tiver dúvidas sobre o workflow, consulte:
- Este arquivo (`CONTRIBUTING.md`)
- `.agents/memory/project-conventions.md`
- Ou abra uma Issue com a label `documentation`
