# Handoff Codex — fase 2: venda atômica e idempotente

## Estado de partida

- Branch atual: `chore/testes-ci-etapa1`; o worktree contém as mudanças ainda não commitadas da fase 1.
- Fase 1 adicionou CI, testes de persistência atual e testes NF-e. Linha de base verificada: app com 21 testes, NF-e com 4 testes, ambos os typechecks e builds aprovados.
- Não iniciar a fase 3: JWT e isolamento do serviço NF-e ficam fora desta sessão.
- O banco remoto não possui histórico registrado de migrations (`supabase migration list --linked` retornou vazio). Os 33 SQLs em `database/migrations` são legados e não devem ser aplicados em sequência.
- Antes de editar, seguir `CONTRIBUTING.md`: Issue, branch criada de `develop`, PR e Conventional Commits. Preserve as mudanças da fase 1.

## Problema confirmado

O fluxo em `App.tsx` chama separadamente `dbSales`, `dbFinancials` e `dbProducts`. `services/db.ts` também grava `sales` e depois `sale_items` em chamadas distintas. Falha intermediária deixa venda parcial; repetição pode duplicar itens ou financeiro. Estoque é calculado sobre estado carregado no navegador e sobrescrito por produto, permitindo perda de atualização concorrente. `financials` e `stock_movements` não têm vínculo confiável com a venda.

Arquivos principais:

- `App.tsx`: `handleAddSale`, `handleUpdateSale`, `handleDeleteSale`.
- `services/db.ts`: `dbSales`, `dbFinancials`, `dbProducts`, `dbStockMovements`.
- `types.ts`: `Sale`, `SaleItem`, `FinancialRecord`, `StockMovement`.
- Tabelas: `sales`, `sale_items`, `products`, `financials`, `stock_movements`, `app_users`.

## Decisões já fechadas

- Venda pendente não reserva nem baixa estoque e não cria receita.
- A conclusão baixa estoque e cria receita uma única vez.
- Estoque insuficiente em produto controlado recusa a conclusão; não permitir saldo negativo.
- Venda concluída pode ser editada: aplicar diferenças de itens, estoque e valor na mesma transação, mantendo histórico de ajustes.
- Cancelamento ou exclusão lógica devolve estoque e cria estorno financeiro auditável; não apagar o lançamento original.
- Use uma chave de idempotência estável por tentativa de operação. Mesma chave + mesmo payload retorna o resultado persistido; mesma chave + payload diferente retorna conflito.
- `sale_items` deve ser a fonte detalhada dos itens. Manter `sales.items` apenas como espelho temporário de compatibilidade, atualizado pela mesma transação.

## Implementação requerida

1. Faça preflight somente leitura no banco real com `supabase/diagnostics/sale_nfe_schema_contract.sql` e consultas de anomalias. Confirme tipos, constraints, RLS, grants, vendas sem itens e possíveis duplicações antes de escrever migration.
2. Crie uma migration aditiva para:
   - `sale_operations`: `tenant_id`, `operation_id`, `sale_id`, ação, hash do payload, resultado e timestamps; `UNIQUE (tenant_id, operation_id)`.
   - vínculos `sale_id` e `operation_id` em `financials` e `stock_movements`, com FKs/índices e unicidade por evento que só pode ocorrer uma vez;
   - constraints que impeçam divergência de tenant entre venda, itens, produtos e movimentos, depois de tratar anomalias existentes.
3. Implemente uma única RPC transacional, por exemplo `apply_sale_operation(operation_id, sale_id, action, payload)`, para criar, finalizar, editar e cancelar. Ela deve:
   - derivar usuário e tenant de `auth.uid()`/`app_users`, nunca aceitar tenant do cliente;
   - validar usuário ativo, permissão, payload, totais e produtos;
   - adquirir locks das linhas de produtos em ordem estável;
   - calcular deltas no servidor, incluindo combos;
   - gravar venda, itens, estoque, movimentos e financeiro dentro da mesma transação;
   - usar `SECURITY DEFINER` com `search_path` fixo e conceder `EXECUTE` somente a `authenticated`.
4. Troque os handlers do frontend por uma chamada à RPC. Gere a chave antes da chamada, preserve-a durante retries e só atualize a UI como concluída após sucesso. Em erro, refaça a leitura do servidor.
5. Depois de comprovar o novo fluxo, restrinja escrita direta que permita contornar a RPC. Não remova compatibilidade nem aplique mudanças destrutivas no mesmo passo.

## Testes e aceite

- Testes SQL/integração: rollback após falha em cada etapa; repetição idempotente; conflito de payload; duas vendas concorrentes pelo último item; isolamento entre tenants; usuário inativo/sem permissão; tentativa de forjar tenant.
- Fluxos: criar pendente sem alterar estoque/financeiro; finalizar uma vez; editar concluída com deltas; cancelar com devolução e estorno únicos; combos; produto sem controle de estoque; saldo insuficiente.
- Regressão: `npm test`, `npm run typecheck`, `npm run build`; repetir os três comandos em `nfe_service` sem modificar seu comportamento.
- Aceite: para cada operação, todas as tabelas mudam juntas ou nenhuma muda; retries não duplicam efeitos; concorrência não perde baixas; nenhum cliente escolhe o tenant.

## Rollback

Faça rollout aditivo. Mantenha o caminho antigo disponível apenas até a RPC passar em homologação. Se o cliente novo falhar, reverta o frontend e preserve tabelas/colunas aditivas para diagnóstico. Após bloquear escritas diretas, não reabra policies inseguras: suspenda novas vendas e corrija à frente. Não faça rollback destrutivo nem remova registros de operações, movimentos ou estornos.
