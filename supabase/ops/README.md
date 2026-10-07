# Operações pontuais da NF-e

Estes arquivos registram intervenções específicas. Eles **não são migrações** e não devem ser incluídos em `supabase db push` nem executados automaticamente.

- `20261006_nfe_gds_initial_config.sql`: carga inicial para os oito produtos do PDV Atacado. Contém um `tenant_id` literal; conferir o identificador, os dados fiscais e o estado remoto antes de qualquer execução. A transação falha se encontrar série, perfis ou regras em estado inesperado.
- `20261007_restore_nfe_3_after_local_cancel_validation.sql`: reparo restrito a uma nota de homologação, após erro local de validação do evento de cancelamento. Exige ausência de XML assinado e recibo de cancelamento. É histórico de operação, não rotina de correção; consultar a SEFAZ e o banco antes de qualquer intervenção semelhante.
