# Emissor NF-e — implementação aprovada

Tipo: WEB (React/TypeScript) + BACKEND (Node/Express/Supabase).

## Decisões

- Cliente identificado por ID; venda e cadastro alimentam o rascunho.
- Salvar nota não reserva número nem transmite. ADMIN emite; operadores autorizados preparam.
- Venda a prazo pode ser emitida antes da saída, sem alterar o pagamento.
- Regras fiscais por operação, emitente e vigência; classificações por produto.
- Operação inicial: produção própria, B2B interno BA, CRT 1, CFOP 5101, CSOSN 102.
- Série 2 em produção depende de confirmação de disponibilidade. Contadores por emitente, série e ambiente.
- PIS/COFINS e condições fiscais do prazo dependem de aprovação específica. Configuração incompleta bloqueia emissão.
- Regra de 2026 não se estende automaticamente a 2027. XML original não entra no repositório.

## Ordem de execução

1. Banco: vínculo do cliente, contexto comercial, configurações versionadas, rascunhos, reserva transacional e isolamento.
2. Serviço: validação fiscal, snapshot, autenticação por ação, emissão e recuperação sem retransmissão automática.
3. PDV: formulário preenchido pelo cadastro/venda, Salvar nota / Emitir nota, pendências e consulta.
4. Verificação: testes de regras, permissões, estados fiscais, totais, concorrência e compilação.
5. Homologação e publicação: executar somente depois da configuração aprovada e revisão das migrações pendentes.

## Contrato entre camadas

- `sales.customer_id` e `sales.fiscal_context` persistidos junto da operação atômica da venda.
- `GET /api/nfe/rascunho/:sale_id`: `{ sucesso, dados: { draft, customerId, context, issues, canEmit } }`.
- `PUT /api/nfe/rascunho/:sale_id`: `{ customerId, context, revision? }`; retorna os mesmos dados. Edição concorrente deve falhar.
- Contexto: `operation` (`internal_b2b_own_production`), `operationDate` (YYYY-MM-DD), `buyerPresence` (1/2/3/5/9), `freightMode` (0/1/2/3/4/9), `finalConsumer` boolean, `paymentTiming` (`cash`/`term`), `dueDate?`.
- `POST /api/nfe/emitir/:sale_id`: `{ revision }`, exige rascunho atual e revalida fontes.
- `GET /api/nfe/consultar/:sale_id`: consulta e concilia o XML original com o protocolo, sem retransmissão.
- Formato de pendência: `{ field: string, message: string }`.

## Limites de entrega

Este plano foi escrito antes da primeira emissão em homologação. O estado operacional atualizado, incluindo migrações registradas no Supabase e o cancelamento ainda pendente, está em `nfe_service/Checklist-Producao-SEFAZ.md`. As confirmações pendentes não devem ser simuladas.
