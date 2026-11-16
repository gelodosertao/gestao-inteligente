# Estoque da fábrica e PDV Atacado — implementação local

As dez features do levantamento foram implementadas pelos respectivos especialistas. Não houve commit, push, deploy, aplicação de migrations remotas ou correção de dados históricos.

## Comportamento

- Cadastro de produto não substitui saldos. Criação, ajuste, transferência, perda, produção e recebimento têm operações próprias, com confirmação, histórico e identificador contra repetição.
- Os depósitos atuais são Ibotirama e Barreiras. A Filial foi retirada do cadastro, totais, alertas e opções de novas operações; seus saldos e registros antigos continuam preservados. Inventário físico exige motivo e saldo esperado para detectar uma contagem desatualizada.
- O Estoque abre em Gelo, com uma área separada de Insumos/embalagens. Produtos de outras categorias permanecem em Outros quando existirem. Cadastro, tabela, relatórios e reposição acompanham o grupo selecionado; insumos exibem custo, sem potencial de venda ou ranking comercial.
- Produção verifica a disponibilidade dos insumos e confirma entrada e consumo juntos. Custo unitário usa `(insumos do lote + operacional do lote) / quantidade` nas duas telas.
- Extrato reúne movimentações novas e antigas sem inventar saldos anteriores. Ranking considera expedições efetivas, excluindo pedidos não expedidos e cancelados.
- Recebimento XML exige vínculo ao produto interno e conferência de unidade/conversão; nota repetida não gera nova entrada. Produto existente mantém cadastro e preços.
- Atacado exige origem Ibotirama/Barreiras. **Confirmar pedido**, em verde, registra o pagamento e baixa todos os itens na primeira confirmação, mesmo parcial. Recebimentos posteriores só abatem a dívida, sem repetir a baixa. A etapa separada Confirmar saída foi retirada. Revisão do pedido protege contra alterações concorrentes; cancelamento preserva os recebimentos e cria estornos por forma de pagamento.

## Ativação pendente

Conferir o histórico de migrations do ambiente antes de publicar. A atualização depende, nesta ordem, de:

1. `202611120001_production_stock_operations.sql` — arquivo anterior já existente no trabalho local, ainda sem confirmação de aplicação remota.
2. `202611160001_inventory_operations.sql` — operações de inventário e proteção dos saldos.
3. `202611160002_wholesale_confirmation.sql` — parcelas, expedição, revisão e estornos do Atacado.
4. `202611160003_production_integrity.sql` — consumo e perdas de produção integrados à base nova.
5. `202611160004_factory_deposits.sql` — impede novas operações de inventário na antiga Filial, sem apagar ou redistribuir seus saldos anteriores.
6. `202611160005_wholesale_payment_confirmation.sql` — une a primeira confirmação de pagamento à baixa de estoque do pedido.

Publicar frontend e migrations de forma coordenada; o frontend novo não deve operar contra o contrato antigo. Aplicar somente após verificar ambiente, backup/recuperação e migrations instaladas. Este documento não representa execução dessa etapa.

## Validação local

Resultado após a confirmação integrada ao primeiro pagamento: **216 testes aprovados em 23 arquivos**, TypeScript, build de produção e verificação de whitespace aprovados. A nova regra de confirmação passou 54 verificações SQL. As bases anteriores continuam cobertas pelos verificadores de integração (26) e depósitos ativos (38).

No navegador foram confirmados: perda em Barreiras com falha/retry; transferência rejeitando quantidade negativa; ajuste físico com saldo esperado; leitura e conversão de XML (2 caixas → 20 unidades); extrato com movimentos e saldos; bloqueio de produção de 41 unidades com apenas 40 embalagens. Na regra atual do Atacado, uma primeira parcela de R$ 40 baixou os 10 itens do pedido em Barreiras (40 → 30), preservando Ibotirama; uma segunda parcela de R$ 10 deixou o estoque em 30 e a dívida em R$ 30. Falha de envio preservou o formulário e o identificador da parcela foi reutilizado. O botão verde Confirmar pedido e a ausência da etapa Confirmar saída foram conferidos em desktop e celular.

A revisão mais recente foi conferida em desktop e celular: formulário com somente Ibotirama/Barreiras; saldo antigo de 664 na Filial ausente dos campos e preservado no banco simulado; edição cadastral sem enviar saldos; abas separando gelo e embalagens; insumos com custo unitário. Capturas: `output/playwright/factory-product-edit-*.png` e `output/playwright/factory-inputs-*.png`.

- `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build` e `git diff --check`.
- `node scripts/verify-inventory-sql.mjs` e `node scripts/verify-production-sql.mjs`.
- `node scripts/verify-wholesale-confirmation.mjs` com `PGLITE_MODULE` apontando ao módulo PGlite instalado.
- `node scripts/verify-factory-integration.mjs`: preserva a verificação da base até a revisão003, com compra → produção → transferência → perda → recebimento → expedição → quitação → cancelamento.
- `node scripts/verify-wholesale-payment-confirmation.mjs` com `PGLITE_MODULE` apontando ao módulo PGlite instalado: valida a revisão005 atual, incluindo primeira parcela com baixa, parcelas seguintes sem nova baixa, insuficiência com rollback, repetição, concorrência, vendedor autorizado e proteções fiscais.
- `node scripts/verify-factory-deposits.mjs`: aplica também a revisão004 e verifica os dois depósitos ativos, o bloqueio da Filial, os privilégios das RPCs internas e a preservação dos registros antigos.
- Os verificadores de inventário, produção e integração aceitam `PGLITE_MODULE_PATH`. Na máquina atual reutilizam a instalação descartável em `%TEMP%/gelo-production-sql-test/node_modules/@electric-sql/pglite/dist/index.js`. Não usam credenciais remotas.
- Interface real verificada por Playwright com dados simulados e chamadas externas bloqueadas. Harness, cenários e capturas ficam em `output/playwright/`; não integram o build da aplicação.

## Limites e dados anteriores

PGlite usa uma conexão: os testes exercitam conflitos de revisão, repetição e rollback, mas não comprovam bloqueios entre conexões reais simultâneas. Banco publicado, política RLS instalada e versão pública não foram verificados nesta implementação.

Custos operacionais antigos precisam de conferência: as telas anteriores divergiam entre custo por unidade e por lote. Nenhum valor foi convertido automaticamente. Saldos históricos negativos ou inválidos permanecem bloqueados para movimentação e precisam de conciliação supervisionada. Registros antigos sem origem/responsável preservam essa ausência no extrato.

O build mantém avisos anteriores de Browserslist desatualizado e importação estática/dinâmica de `services/db.ts`; isso não impediu a compilação.
