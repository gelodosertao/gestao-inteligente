# 🧊 Geleiro PRO - Sistema de Gestão Inteligente para Geleiros

> **Transformando a gestão de fábricas e distribuidoras de gelo com tecnologia de ponta.**

O **Geleiro PRO** é uma solução SaaS (Software as a Service) desenvolvida especificamente para atender às necessidades do mercado de gelo (Geleiros). Com uma interface moderna, mobile-first e funcionalidades focadas na agilidade do dia a dia, o sistema centraliza vendas, estoque, clientes e financeiro em uma única plataforma.

---

## 🚀 Diferenciais do Produto

- **Mobile-First**: Projetado para ser usado em tablets e celulares, ideal para motoristas e vendedores em rota.
- **PDV Ágil**: Vendas rápidas com suporte a preços de Atacado e Varejo automáticos.
- **Gestão de Rotas**: Cadastro de clientes segmentado por ramo de atividade (Adega, Posto, Mercado, etc.) para otimização de entregas.
- **Inteligência de Dados**: Dashboards claros para tomada de decisão imediata.

---

## 🛠️ Funcionalidades Principais

### 1. 📊 Dashboard Executivo
- Visão geral do faturamento diário e mensal.
- Métricas de desempenho de vendas.
- Alertas de estoque baixo.

### 2. 🛒 Ponto de Venda (PDV) & Vendas
- **Interface de Caixa**: Design intuitivo para lançamento rápido de pedidos.
- **Modo Atacado/Varejo**: Alternância fácil de tabelas de preço.
- **Carrinho Inteligente**: Cálculo automático de totais e troco.
- **Histórico de Vendas**: Registro completo de todas as transações.

### 3. 📦 Gestão de Estoque
- Controle de produtos (Gelo em Cubo, Escama, Barra, etc.).
- Ajustes de estoque (Entradas/Saídas/Perdas).
- Visualização clara de níveis de estoque.

### 4. 👥 Gestão de Clientes (CRM)
- **Cadastro Completo**: Nome, CPF/CNPJ, Telefone, Email.
- **Busca por CEP**: Preenchimento automático de endereço via integração com ViaCEP.
- **Segmentação**: Classificação por ramo de atividade:
  - Adega
  - Ambulante
  - Atacadista
  - Bar
  - Conveniência
  - Distribuidora
  - Geleiro
  - Mercadinho
  - Restaurante
  - Supermercado
- **Importação em Massa**: Suporte a importação de clientes via XML.

### 5. 💰 Gestão Financeira
- Fluxo de Caixa (Entradas e Saídas).
- Contas a Pagar e Receber.
- Categorização de despesas (Fornecedores, Manutenção, Pessoal, etc.).
- Gráficos de Receita vs. Despesa.

### 6. 🤖 Assistente IA (Beta)
- Integração com Inteligência Artificial para insights de negócio e suporte operacional.

---

## 💻 Stack Tecnológica

O projeto foi construído utilizando as tecnologias mais modernas do mercado, garantindo performance, escalabilidade e facilidade de manutenção.

- **Frontend**: [React](https://react.dev/) com [TypeScript](https://www.typescriptlang.org/)
- **Estilização**: [Tailwind CSS](https://tailwindcss.com/) (Design System moderno e responsivo)
- **Ícones**: [Lucide React](https://lucide.dev/)
- **Gráficos**: [Recharts](https://recharts.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Integrações**: ViaCEP (API de CEPs)

---

## 🚀 Como Rodar o Projeto

### Pré-requisitos
- Node.js (v18 ou superior)
- NPM ou Yarn

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/ice-manager.git
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
Crie um arquivo `.env` na raiz do projeto e adicione suas chaves (ex: Supabase, Gemini AI).

4. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

---

## 🗺️ Roadmap para SaaS (Futuro)

Para transformar este sistema em um produto comercializável para múltiplos geleiros, os seguintes passos são sugeridos:

1.  **Multi-Tenancy (Multi-Empresa)**:
    -   Arquitetura para suportar múltiplos clientes (fábricas) no mesmo banco de dados, com isolamento total de dados.
2.  **App Mobile Nativo**:
    -   Desenvolvimento de app (React Native) para funcionamento offline em rotas de entrega sem sinal.
3.  **Módulo de Rotas e Logística**:
    -   Otimização de rotas de entrega baseada nos endereços dos clientes.
4.  **Integração com Maquininhas**:
    -   Pagamento integrado via TEF ou API de pagamentos (Pix, Cartão).
5.  **Portal do Cliente B2B**:
    -   Permitir que os clientes (adegas, bares) façam pedidos online diretamente.

---

## 📄 Licença

Este projeto é proprietário e desenvolvido para **Gelo do Sertão**. Todos os direitos reservados.
