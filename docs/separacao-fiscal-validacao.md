# Validação da separação fiscal — 23/10/2026

## Resultado local

A pasta original foi removida e a gestão não possui transporte ou fallback para o
serviço anterior. A fronteira `services/fiscalIntegration.ts` permanece desativada.
Não há endpoints ou payloads definidos para a futura API nem configuração de
credenciais no navegador. A configuração no servidor será implementada após o
contrato do projeto independente; nenhuma variável de ambiente habilita emissão
nesta etapa. Ver [integração fiscal](integracao-fiscal.md).

## Preservação comprovada

- Cópia independente: `C:/Users/DELL/Documents/nfe_service`; 276 arquivos próprios
  comparados por SHA-256 antes da remoção e novamente ao final, sem divergências.
  Inclui fontes, testes, `.env` privado e artefatos; exclui somente `node_modules`.
- 85 arquivos protegidos sem alteração de hash: mudanças anteriores do painel de
  logística, imagem local, tipos persistidos, pacotes/lockfile, `.env` e arquivos
  de banco (migrations, diagnósticos e operações SQL).
- Campos fiscais, snapshots, XMLs e mapeamentos de persistência mantidos. Apenas
  removida a consulta a rascunhos que tornava a carga de vendas dependente do emissor.
- HEAD mantido em `4b07ab41407afb7935873b85b71431b2bc27545f`, na branch existente.
  Sem commit, stage, push, deploy, migração ou operação no banco remoto.

## Checks do projeto

| Verificação | Resultado |
|---|---|
| `npm.cmd test -- --exclude .release-ux-ui/**` | 5 arquivos, 37 testes aprovados |
| `npm.cmd run typecheck` | Aprovado |
| `npm.cmd run build` | Aprovado |
| `git diff --check` | Aprovado |
| Busca em código, scripts e CI por clientes/URLs/rotas antigas | Nenhuma referência operacional |
| Comparação final da cópia independente e arquivos protegidos | Aprovada |

A exclusão na chamada de teste evita executar testes duplicados do worktree
preexistente `.release-ux-ui`, que não foi alterado. Não há comando de lint/ESLint
configurado; o lint runner existente validou TypeScript. O build emite avisos sobre
Browserslist antigo e importação estática/dinâmica de `db.ts`, sem falha.

## Verificação no navegador

Executada contra o build Vite em preview local, com sessão fictícia e toda a rede
externa interceptada. As respostas de gestão são mocks; nenhum documento fiscal
foi emitido, e nenhuma gravação foi enviada ao banco real. Não é prova de banco,
estoque transacional ou RLS em produção.

- Painel apresenta “Integração fiscal não configurada”, com rota interna no menu.
- Histórico preserva situação, ambiente, número, chave e protocolo registrados.
- Download do XML armazenado produz exatamente o conteúdo local de teste.
- Configurações não exibem certificado/senha fiscal; botão de salvar está bloqueado.
- Exportações fiscais e DANFE desabilitados; CSV de gestão continua funcionando.
- Estoque e clientes carregam; histórico do atacado e fechamento do modal funcionam.
- Varejo conclui via RPC de gestão interceptada: total 8, `hasInvoice: false`,
  comprovante não fiscal, sem simulação de autorização ou QR fiscal fictício.
- Atacado confirma pedido via RPC interceptada: total 6, estado `Pending`,
  `hasInvoice: false`, `nfeStatus: nao_emitir`, cliente mantido.
- Falha de persistência injetada retorna ao pagamento e não exibe venda concluída.
- Painel a 390 × 844 exibe o estado desativado sem transbordamento horizontal.
- Nenhuma chamada fiscal, nenhuma leitura de rascunhos e nenhum erro de execução
  inesperado observado. Logs de erro da falha injetada são esperados.

Evidências e roteiros: `output/playwright/fiscal-*.png`, scripts `fiscal-*.js`,
`fiscal-preservation.json`, `fiscal-stored-xml.xml` e `management-report.csv`.
Os roteiros usam apenas dados fictícios e a instalação de Playwright já existente.

## Checks amplos e pendências existentes

O checklist `.agents/scripts/checklist.py` foi executado: segurança, lint e schema
passaram; o executor genérico de testes falhou com `Command not found: npm`
(incompatibilidade com `npm.cmd` no Windows). A suíte direta acima passou.
UX e SEO amplos falharam em critérios gerais existentes, incluindo detecção de
cores proibidas pela skill, metatags e regras sobre títulos em arquivos legados e
checkouts separados. Não foram alterados por esta separação.

`npm.cmd audit --audit-level=high` identificou 36 vulnerabilidades: 5 críticas,
24 altas, 6 moderadas e 1 baixa. Pacotes e lockfile da raiz estão idênticos ao
início; a separação não introduziu nem corrigiu esses achados. Nenhum pacote foi
instalado ou atualizado. Isso exige trabalho próprio antes de uma avaliação de
prontidão para publicação; não impede a retirada local do servidor.

Não há bloqueio pendente para esta etapa local. O contrato externo, seu adaptador,
a configuração privada no servidor e eventual desligamento/revogação de acessos
remotos são etapas futuras. As referências em migrations e histórico SQL foram
mantidas deliberadamente para preservar estruturas e rastreabilidade.
