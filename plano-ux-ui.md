# Plano de melhoria UX/UI

## Diagnóstico

1. Alto impacto: menu extenso sem agrupamento e orientação insuficiente no celular; largura do conteúdo não acompanha a largura real da barra lateral em todos os breakpoints.
2. Alto impacto: campos dependentes de placeholder e ações só com ícone reduzem a acessibilidade, sobretudo em vendas e cadastros.
3. Médio impacto: estados de carregamento, erro e vazio oferecem feedback e recuperação inconsistentes.
4. Médio impacto: hierarquia de títulos, filtros, botões e tabelas varia entre módulos, apesar da identidade de marca compartilhada.

## Etapas

1. Contexto Impeccable e padrões globais de foco, movimento, formulários e superfícies.
2. Shell de gestão: navegação, menu móvel, largura responsiva e estados compartilhados.
3. Fluxos frequentes: PDVs, estoque, clientes e financeiro.
4. Demais módulos relevantes e painel de logística: aplicar padrões de interação sem mudar a lógica operacional.
5. Validar em desktop e celular; executar typecheck e build.

## Limites

Sem mudança de banco, autenticação, integração, deploy ou commit. Telas protegidas exigem credenciais para uma validação visual completa com dados reais.

## Verificação desta execução

- Typecheck da aplicação principal e do painel de logística: aprovado.
- Build da aplicação principal e do painel de logística: aprovado fora do sandbox, onde o `esbuild` não consegue iniciar.
- Inspeção no navegador: login em 390 px e 1440 px; página pública em 390 px e 1440 px, com segunda captura do cabeçalho móvel após a correção.
- Telas internas protegidas: revisão de código e compilação, sem inspeção visual autenticada por falta de uma sessão de teste autorizada.
