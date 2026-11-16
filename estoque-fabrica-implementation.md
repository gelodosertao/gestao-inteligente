# Estoque da fábrica e PDV Atacado

Objetivo: saldos e recebimentos confirmados, rastreáveis e seguros para uso simultâneo. Preservar alterações locais existentes. Não aplicar migrations remotas, publicar, fazer commit ou push nesta etapa.

- [x] Agente 2: separar cadastro de saldo e criar contratos/transações comuns de movimentação com proteção contra repetição e concorrência.
- [x] Agente 1: confirmar gravações antes de atualizar a tela; propagar erros e preservar formulários.
- [x] Agente 6: padronizar Ibotirama, Barreiras e filial em saldos, depósitos e cálculos.
- [x] Agente 3: transferência atômica com origem/destino explícitos e histórico vinculado.
- [x] Agente 4: ajustes de inventário auditáveis, sem negativos e preservando mínimo zero.
- [x] Agente 7: unificar custo de lote/unidade e validar receita.
- [x] Agente 8: bloquear produção sem insumos e confirmar consumo integralmente.
- [x] Agente 5: extrato completo, compatível com movimentações antigas.
- [x] Agente 9: recebimento XML com conciliação, conversão de unidades, depósito e prevenção de repetição.
- [x] Agente 10: separar pedido, recebimento e expedição no Atacado; persistir parcelas e origem; validar edição/cancelamento/reenvio.

Verificação final: typecheck, testes de regressão e transações em banco descartável quando disponível, build e fluxos locais de interface. Registrar limitações e migrations pendentes de aplicação sem confundir validação local com publicação.
