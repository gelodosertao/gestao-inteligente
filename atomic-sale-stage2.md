# Venda atomica e idempotente - etapa 2

## Objetivo
Centralizar venda, itens, estoque e financeiro em uma RPC PostgreSQL transacional, isolada por tenant e segura para retries concorrentes.

## Tarefas
- [x] Confirmar o contrato e as anomalias do banco remoto sem escrita.
- [x] Adicionar migration aditiva com operacoes idempotentes, vinculos e RPC.
- [x] Trocar os handlers de venda pelo cliente da RPC, sem atualizacao otimista.
- [x] Cobrir sucesso, rollback, duplicidade e concorrencia nos testes.
- [x] Executar testes, typecheck, build e validacoes SQL disponiveis.

## Concluido quando
- [x] Cada operacao altera todas as tabelas juntas ou nenhuma delas.
- [x] O mesmo `operation_id` nao repete efeitos e payload divergente gera conflito.
- [x] Locks de venda e produtos impedem perda de atualizacao concorrente.
- [x] O tenant vem exclusivamente do usuario autenticado.

## Notas
- Migration aditiva; sem deploy remoto nesta etapa local.
- Autenticacao, NF-e e logistica nao serao alteradas.
