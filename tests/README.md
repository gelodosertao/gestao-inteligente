# Testes da etapa 1

O aplicativo usa Vitest (`npm test`); o servico NF-e usa o test runner do Node
(`npm test` dentro de `nfe_service`). A CI executa os testes, a checagem de
tipos e os builds dos dois projetos sem credenciais de producao.

Os novos testes do aplicativo cobrem o contrato atual de persistencia de venda,
itens e financeiro. Eles nao demonstram atomicidade ou idempotencia; estas
garantias dependem da transacao prevista para a etapa 2. Os testes do servico
NF-e cobrem utilitarios fiscais sem chamar a SEFAZ.

O esquema remoto ainda nao pode ser reproduzido localmente. A consulta
`supabase migration list --linked` retornou uma lista vazia em 2026-09-22.
Os SQLs de `database/migrations` sao legados e nao devem ser aplicados em
sequencia no banco de teste. A exportacao somente do esquema `public` por
`supabase db dump --linked --schema public` falhou porque este ambiente nao
tem Docker nem Podman. Assim, testes de integracao com Postgres/RLS ainda nao
fazem parte da CI. Antes de adiciona-los, obtenha um dump de esquema revisado,
sem dados nem segredos, em um ambiente com Docker/Podman, e compare-o com o
catalogo remoto e os scripts locais. Nao aplique esse retrato como migration
no projeto remoto ja existente.
