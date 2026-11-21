# Separação da API fiscal - etapa 1

Retirar a implementação interna e manter a gestão operacional sem conexão fiscal.

- [x] Ler instruções e Git; identificar alterações anteriores e consumidores.
- [x] Conferir a cópia independente por SHA-256 antes de remover a original.
- [x] Remover serviço, clientes HTTP, configuração, scripts e CI exclusivos.
- [x] Centralizar disponibilidade e bloquear operações sem integração.
- [x] Preservar dados fiscais, migrações e alterações anteriores.
- [x] Executar regressão e fluxos de interface; registrar evidências finais.

Resultado: 37 testes do projeto principal, TypeScript e build passaram. Fluxos
verificados no navegador com rede externa interceptada, inclusive checkouts sem
emissão. Relatório: `docs/separacao-fiscal-validacao.md`.

Escopo local: sem commit, push, PR, deploy, mudanças na API independente ou banco.
Mantida a branch atual para preservar trabalho preexistente. O fluxo de publicação
de CONTRIBUTING.md fica para outra etapa, conforme instrução do usuário.
