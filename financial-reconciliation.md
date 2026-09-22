# Reconciliação financeira histórica

## Objetivo
Corrigir inconsistências históricas sem apagar lançamentos, mantendo uma trilha auditável antes de versionar a etapa 2.

## Tarefas
- [x] Auditar vendas concluídas, receitas de venda, tenant, valores e referências legadas.
- [x] Classificar correções seguras e casos que exigem revisão humana.
- [x] Criar migration aditiva de reconciliação e registro de auditoria.
- [x] Aplicar somente os ajustes aprovados no banco remoto.
- [x] Reexecutar a conciliação e confirmar os saldos após os ajustes.
- [x] Rodar testes e preparar as alterações para Git, sem commit/push automático.

## Critérios
- Nenhum lançamento histórico é apagado.
- Todo estorno ou vínculo recebe uma referência de venda, motivo e evidência.
- Casos ambíguos permanecem pendentes para decisão humana.

## Resultado da classificação
- Um estorno de R$ 300,00 tem evidência suficiente: venda `679d0975-7a09-46ff-86f7-d32db1e53024` possui duas receitas idênticas em dinheiro, na mesma data.
- Três duplicidades aparentes exigem revisão: IDs `232dbf2f-b120-43fb-ad8d-f1d756ae0313`, `bec0ca5e-fce9-4b13-a515-855f8831e716` e `4174`.
- Não há pares únicos e seguros para vincular automaticamente as 38 vendas sem receita às 19 receitas órfãs.

## Execução aprovada em 2026-09-22
- Aplicada a migration `202609220001_atomic_sale_operations.sql` e, em seguida, a `202609220002_financial_reconciliation.sql`.
- Criado um lançamento compensatório de `-300,00` para a venda `679d0975-7a09-46ff-86f7-d32db1e53024`; as duas receitas legadas de `300,00` foram preservadas.
- Registrados 63 casos em `PENDING_REVIEW`: 38 sem receita, 19 receitas órfãs, 3 duplicidades, 2 divergências de valor e 1 venda pendente com receita.

## Espaço de conciliação
- A aba **Casos auditados** é exclusiva de administradores e consulta os casos por RPC com isolamento por tenant.
- Cada resolução exige justificativa e confirmação em duas etapas. As opções são revisar sem ajuste, criar a receita ausente, vincular uma receita órfã ou criar estorno compensatório.
- A interface não exclui nem altera o lançamento histórico ao estornar; ela registra o ajuste e a decisão de auditoria.
