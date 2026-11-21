# Estoque da fábrica: Gelo e Insumos

Pedido: retirar Filial do estoque atual e separar gelo de insumos/embalagens, mantendo o histórico.

- [x] Interface: abas Gelo e Insumos, tratamento separado para Outros, cadastro e relatórios do grupo selecionado, sem campos/colunas de estoque ou preço Filial.
- [x] Depósitos: somente Ibotirama e Barreiras em perdas, transferências, ajustes e recebimentos; totais e alertas excluem saldos antigos da Filial.
- [x] Banco: migration aditiva bloqueia novas operações de inventário na Filial e preserva seus valores/histórico.
- [x] Verificação: testes de grupos/edição/depósitos, SQL descartável, TypeScript, build e conferência em desktop/celular.

Não redistribuir ou apagar saldos antigos e não publicar/aplicar migrations remotas nesta etapa.
