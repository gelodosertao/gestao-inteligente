# Integração fiscal externa

A gestão não inclui servidor de emissão. Vendas, estoque, clientes, financeiro e
relatórios de gestão funcionam sem API fiscal. Emissão, consulta externa,
cancelamento, geração de DANFE e exportações fiscais estão indisponíveis e mostram
**Integração fiscal não configurada**. Nenhuma emissão é simulada. O varejo não marca pagamento como emissão e seus
comprovantes são identificados como não fiscais. O checkout aguarda o registro
na gestão e não apresenta sucesso quando essa gravação falha.

## Ponto de integração

`services/fiscalIntegration.ts` centraliza `FiscalIntegration`, `getStatus()` e
`requireConfigured()`. A implementação retorna `configured: false` e lança
`FiscalIntegrationNotConfiguredError` ao exigir conexão. Não possui transporte,
endpoints, payloads, retries, fallback local ou credenciais. A disponibilidade não
substitui autorização nem confirmação de operações no futuro adaptador.

A conexão é opcional e está desativada por ausência de adaptador. **Não há variável
de ambiente que habilite emissão nesta etapa.** Configurar apenas uma URL não
ativa operações. Após definir o contrato no projeto independente, implementar um
adaptador nesta fronteira e a comunicação autenticada no servidor. URL privada,
credenciais, certificado e senha serão configurados exclusivamente no servidor;
nunca em `VITE_*`, localStorage ou formulários do navegador. Hospedagem e nomes das
configurações serão definidos naquela etapa, junto com o contrato real.

As telas usam `FiscalIntegrationNotice`; `/gestao/emissor` abre o painel de
integração. O host legado do emissor mantém login e painel sem chamadas fiscais.
O menu usa a rota interna. O PDV mostra os dados fiscais persistidos e permite
baixar XML cujo conteúdo já esteja armazenado. DANFE e exportações dependentes de
servidor permanecem bloqueados. Relatórios comerciais continuam disponíveis.

## Preservação

Campos de `Sale`, snapshots, XMLs, chaves, protocolos, numeração e mapeamentos de
leitura/gravação continuam presentes. O histórico do painel é limitado às vendas
carregadas pela gestão e não representa todo o acervo. Rascunhos, configurações,
regras, documentos e contadores persistidos permanecem no banco. A gestão não
consulta mais a tabela de rascunhos para carregar vendas; mostra a situação gravada
na própria venda, sem sintetizar situação fiscal a partir de um rascunho.

`database/migrations`, `supabase/migrations`, diagnósticos e registros de operações
SQL foram preservados. Nomes históricos do serviço nesses arquivos não são uma
dependência operacional. Não reaplicar SQLs para fazer a separação. Nenhuma
migração, alteração de grants/RLS ou limpeza de dados foi executada. A revisão de
acesso da API antiga no ambiente remoto depende de uma etapa autorizada de
encerramento operacional.

## Retirada local em 23/10/2026

Antes de remover `nfe_service/`, 276 arquivos próprios foram comparados por SHA-256
com `C:/Users/DELL/Documents/nfe_service`: nenhum ausente ou divergente. A comparação
inclui fontes, testes, configurações privadas e artefatos; exclui `node_modules`.
A cópia independente não foi alterada.

Removidos servidor interno, schemas próprios do serviço, pacote e dependências
privativas, PM2, testes e artefatos locais, clientes HTTP antigos, edição/emissão de
rascunhos, console tributário antigo, padrões específicos do emitente, scripts de
configuração/contador e job fiscal da CI. Não havia Dockerfile/Compose fiscal.
As dependências da raiz têm consumidores de gestão e foram mantidas.

As variáveis antigas de conexão e configuração SEFAZ foram retiradas do exemplo
de ambiente. O `.env` local já não continha essas variáveis e foi preservado.
Nenhum serviço remoto foi parado ou alterado; nenhum commit, push ou deploy foi feito.

## Validação

Executar `npm test`, `npm run typecheck` e `npm run build`. Conferir painel, PDVs,
configurações e relatórios sem API, histórico/XML armazenado e ausência de chamadas
fiscais. Evidências locais em `output/playwright/`.
