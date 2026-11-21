# Recebimentos de pagamentos — revisão de 10/11/2026

## Caminhos revisados

- Adega: `Sales` → `onUpdateSale` → `App.handleUpdateSale` → `dbSales.applyOperation` → RPC `apply_sale_operation`.
- Atacado: `WholesalePOS` → o mesmo caminho atômico.
- O botão removido apenas mudava o status para `Finalizado pela Fábrica`. A função SQL considera esse status final: gera receita integral e pode baixar estoque, sem exigir valor, data ou histórico de recebimento.
- `Receber` acrescenta uma parcela ao histórico e ao total pago. Mantém a venda pendente enquanto houver saldo; a quitação gera `Completed`, preservando o comportamento de estoque existente e os dados fiscais.

## Correções locais

- Removido `Confirmar Recebimento` nas duas telas.
- Validação compartilhada de valor e data, cálculo em centavos, quitação exata e bloqueio de excesso. Antes eram aceitos até R$ 0,10 acima do saldo e quitação com até R$ 0,05 faltando.
- Formulário aguarda o salvamento e permanece aberto em caso de erro. A aplicação agora propaga o erro de persistência aos componentes. Cliques durante o envio são bloqueados. Se os dados locais da venda mudarem durante o formulário, ele precisa ser reaberto.
- Movimentações e fechamento de caixa usam cada parcela, na data e forma registradas, inclusive enquanto a venda está pendente. A receita de categoria `Vendas` persistida não é somada novamente, preservando a estratégia anterior de evitar duplicação na tela.
- Vendas antigas sem histórico mantêm o valor e a data originais. Entradas antigas em `amountPaid` sem histórico são preservadas como diferença, sem repetir parcelas. Datas/formas ausentes em dados históricos não podem ser reconstruídas.
- Status antigos `Finalizado pela Fábrica` continuam legíveis e entram na projeção do caixa; não foram convertidos ou corrigidos em massa.

## Limites e próxima correção do banco

A definição SQL mais recente no repositório (`202610060001_nfe_drafts_and_rules.sql`) mantém lançamentos em `financials` pelo total de vendas finalizadas, usando a data e a forma originais. Não cria lançamentos individuais para parcelas pendentes. A alteração local corrige a projeção de recebimentos na tela e no fechamento; **não altera essa regra persistida nem comprova a definição instalada no servidor**.

Para alinhar também o extrato persistido, uma migração separada deve registrar cada parcela com sua identidade, data e forma, validar o acréscimo ao histórico sob o bloqueio da venda, preservar idempotência, estornar cancelamentos e conciliar os lançamentos anteriores sem duplicação. Deve ser testada primeiro em banco descartável com pagamentos parciais, quitação, repetição, concorrência e cancelamento. Não aplicar uma simples troca de `total` por `amountPaid`: vendas parciais antigas não têm o lançamento correspondente, e isso pode produzir diferenças incorretas.

A DRE mantém seu cálculo existente por vendas concluídas e data da venda. Ela não foi convertida em fluxo de caixa. Fechamentos históricos salvos também não foram regravados. Confirmar ou reparar divergências históricas exige conciliação com os dados reais.

Não houve conexão ao banco real, migração aplicada, emissão fiscal, commit, push ou publicação. Testes locais e renderização React não substituem validação de persistência e concorrência no servidor nem interação em navegador.
