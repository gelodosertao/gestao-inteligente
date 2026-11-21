# Testes da gestão

Executar `npm test`, `npm run typecheck` e `npm run build`. A CI valida somente a
gestão; a API fiscal tem projeto e validação independentes.

Os testes cobrem persistência de vendas e financeiro, operação atômica, permissões
e o estado fiscal não configurado. Mocks locais não comprovam estado remoto, RLS
nem respostas fiscais. A verificação de interface usa dados de demonstração
isolados e não emite documentos nem grava no banco real.

O banco não é alterado para testar a separação. SQLs de `database/migrations` são
legados e não devem ser aplicados em sequência. Registros, migrações e scripts
históricos de operações foram preservados. Consulte
[integração fiscal](../docs/integracao-fiscal.md).
