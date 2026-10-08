# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pessoas autorizadas a operar e administrar os módulos do sistema. Nesta revisão, o usuário confirmou prioridade equilibrada para todos os módulos; não foi definido um perfil principal único.

## Product Purpose

O sistema Gelo do Sertão reúne tarefas de vendas, estoque, clientes, produção, financeiro, relatórios e configuração em uma interface de gestão. O objetivo desta revisão é tornar essas tarefas mais claras e utilizáveis em desktop e celular.

## Operating Context

Há PDVs de varejo e atacado, módulos de gestão acessíveis conforme o perfil, um emissor fiscal e um painel de logística. A interface é uma aplicação React/Vite e também possui recursos de uso em dispositivo móvel.

## Capabilities and Constraints

- Preservar as regras de negócio, a autenticação, as integrações e os textos factuais. A identidade visual pode ser redesenhada.
- O menu e o carregamento de dados variam conforme permissões de acesso já implementadas.
- Esta revisão não inclui alterações de banco de dados, deploy ou commit.
- Público principal único, métricas de sucesso e requisitos de acessibilidade específicos permanecem sem definição.

## Brand Commitments

Preservar o nome Gelo do Sertão e o logotipo existente. A nova identidade visual deve transmitir proximidade regional com acabamento premium e um ambiente seguro e profissional no site e no sistema.

## Evidence on Hand

O código atual contém os fluxos e textos operacionais, além do logotipo em `public/logo.png`. As telas protegidas dependem de sessão e dados reais; não há dados de demonstração aprovados para afirmar resultados de negócio.

## Product Principles

- Priorizar a conclusão clara das tarefas em todos os módulos.
- Manter a navegação coerente entre perfis e tamanhos de tela.
- Tornar erros, estados vazios e ações recuperáveis compreensíveis.
- Preservar o significado dos dados e a integridade dos fluxos existentes.
