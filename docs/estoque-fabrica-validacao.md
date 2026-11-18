# Estoque da fábrica e PDV Atacado — implementação local

## Correção de data da produção — 18/11/2026

O erro `column "date" is of type timestamp with time zone but expression is of type text` foi reproduzido no PostgreSQL descartável. A função de produção declarava a data como texto; o verificador antigo também criava a coluna como texto, ocultando a incompatibilidade.

A migration `202611180002_production_timestamp_compatibility.sql` usa o tipo da própria coluna (`%TYPE`) para a data do lote e das movimentações. Substitui somente as duas funções envolvidas, preserva permissões e transações e não converte colunas nem altera registros existentes. Aplicada ao banco conectado em 18/11/2026, após autorização, junto com `202611180001_wholesale_order_stock_commitment.sql`.

`node scripts/verify-production-sql.mjs` agora reproduz o erro antes da correção e verifica rollback, datas, consumo, entrada de produção, perda e repetição após a migration. Passou nas quatro combinações de `text`/`timestamptz` nas colunas de produção e movimentos, inclusive com sessão em `America/Sao_Paulo`. Os tipos podem ser selecionados por `PRODUCTION_TEST_DATE_TYPE` e `PRODUCTION_TEST_MOVEMENT_DATE_TYPE`; ambos usam `timestamptz` por padrão. TypeScript e `git diff --check` também passaram.

No banco remoto, a coluna de produção era `timestamptz` e a de movimentos era `text`. As duas migrations foram aplicadas pela CLI e constam no histórico; o dry run posterior não indicou pendências. Os corpos das três funções substituídas correspondem ao SQL testado, normalizando somente quebras de linha; proprietários e permissões anteriores foram preservados. Definições anteriores e posteriores estão em `output/production-wholesale-before.json` e `output/production-wholesale-after.json`.

`output/verify-production-wholesale-remote.sql` executou produção e criação de pedido nas funções reais, sob o papel `authenticated`, dentro de transação terminada em `ROLLBACK`. Verificou data válida, repetição sem duplicidade, aumento de produção, compromisso de estoque na criação do Atacado, ausência de recebimento e de entrega inventados. A transação foi revertida; nenhum pedido ou lote de teste permaneceu gravado. Esta aplicação não publicou uma nova versão do frontend.

## Regra atual aprovada em 18/11/2026 — compromisso na criação

Esta revisão substitui a regra de primeira parcela descrita no registro anterior abaixo. O pedido Atacado compromete o estoque do depósito selecionado ao ser criado, mesmo sem pagamento. O saldo disponível diminui imediatamente. `fulfillmentStatus: committed` identifica esse compromisso sem comprovar entrega e sem preencher `dispatchedAt`. O botão verde passa a ser **Confirmar pagamento**; parcelas não repetem movimentos. Edição de quantidades movimenta somente diferenças, edição de preço não movimenta estoque, origem comprometida fica imutável e cancelamento devolve uma vez. Pedido recusado por insuficiência não deixa venda nem baixa parcial.

Pedidos antigos sem compromisso reconhecido exigem uma declaração administrativa explícita no recebimento: **Pedido já entregue e estoque descontado anteriormente**. O sistema reconhece os efeitos históricos sem descontar o saldo atual, preserva as parcelas e audita a declaração. Isso também permite utilizar pagamento já registrado, sem parcela fictícia. Nenhum pedido antigo é convertido em lote ou apenas por sua data.

A revisão depende da migration `202611180001_wholesale_order_stock_commitment.sql`, após as seis anteriores. As seis migrations anteriores foram aplicadas em produção em 17/11. Frontend e nova migration devem ser publicados coordenadamente; confirmar a ativação pelo histórico remoto e pela versão pública. A criação de um compromisso não gera entrada de caixa; a DRE também não reconhece reserva não paga como receita. O ranking de expedições continua excluindo simples compromissos sem entrega reconhecida.

Verificador da revisão: `node scripts/verify-wholesale-stock-commitment.mjs`, com `PGLITE_MODULE` configurado. Os verificadores anteriores preservam suas regras históricas e não representam a regra atual. O PostgreSQL descartável valida a transação; as disputas de revisão e repetições sequenciais não comprovam concorrência real entre conexões em produção.

Validação desta revisão: 108 verificações SQL, 185 testes de serviços/componentes e suíte completa com 221 testes em 23 arquivos aprovados (a suíte local também inclui 28 testes do checkout `.release-ux-ui`), TypeScript, build e `git diff --check` aprovados. Navegador local com chamadas externas bloqueadas e backend simulado: quitação histórica R$ 80 preservou Barreiras em 40; criação de pedido R$ 8 sem pagamento reduziu 40 para 39; quitação posterior preservou 39 e não marcou entrega. Formulário móvel teve sobreposição da navegação corrigida, com botão de pagamento acessível por rolagem. Evidências locais: `output/playwright/check-legacy-payment-no-stock.js`, `check-stock-commitment-create.js`, `check-stock-commitment-payment.js` e `stock-commitment-payment-mobile.png` no mesmo diretório.

## Registro da implementação anterior (16/11/2026)

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
