# Confirmar pedido no Atacado

Regra confirmada pelo usuário: a primeira confirmação de pagamento, mesmo parcial, baixa todos os itens do pedido no depósito escolhido. Os recebimentos seguintes apenas abatem a dívida.

- [x] Substituir Receber por Confirmar pedido em verde e remover a ação separada Confirmar saída.
- [x] Integrar pagamento, financeiro, estoque e histórico em uma transação, com origem obrigatória e proteção contra repetição.
- [x] Tratar pedidos antigos sem origem e pedidos pagos ainda sem baixa, sem gerar parcelas fictícias.
- [x] Verificar parcial, segunda parcela, insuficiência, falha/retry, cancelamento e compatibilidade fiscal; testar tela em desktop/celular.

Sem aplicação de migration remota, publicação, commit ou push nesta etapa.
