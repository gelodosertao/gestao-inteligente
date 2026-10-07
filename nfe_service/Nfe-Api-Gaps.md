# Estado da API NF-e — 07/10/2026

A interface, as funções do serviço e as migrações fiscais foram implementadas. As migrações `202609250001`, `202610060001` e `202610060002` constam no histórico remoto do Supabase. O usuário relatou autorização de uma NF-e em homologação pelo emissor próprio; conferir XML, protocolo e situação na SEFAZ antes de registrar a homologação como concluída. O cancelamento permanece pendente após rejeição da SEFAZ referente ao CNPJ do autor do evento.

| Área | Estado | Validação pendente |
| --- | --- | --- |
| Rascunho | API GET/PUT, revisão e acesso PDV | RLS real e edição concorrente no banco de homologação |
| Emissão | ADMIN, regra aprovada, reserva por ambiente, XML assinado antes da rede | Formato do XML gerado pela lib e retorno SOAP em homologação |
| Consulta | Reconstrói `nfeProc` do XML original e protocolo compatível | Timeout e consulta SEFAZ reais |
| Cancelamento | Persiste evento assinado antes da rede, resposta e estado incerto | Evento XML e consulta de cancelamento reais |
| DANFE/XML | Fonte é documento autorizado do ambiente | Renderização e ZIP com casos reais |
| IBS/CBS 2027 | Configuração tipada e vigência bloqueiam ausência de regra | Leiaute, cálculo e regra Simples homologados |

Os métodos de cartão exigem dados da transação ainda ausentes no PDV; a validação bloqueia emissão em vez de completar dados presumidos. A conclusão depende de configurar os meios e homologar esse grupo. Os documentos fiscais legados da série 1 não são importados automaticamente.
