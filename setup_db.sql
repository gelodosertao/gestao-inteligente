-- Script de Configuração do Banco de Dados (Supabase / PostgreSQL)
-- Copie e cole este conteúdo no Editor SQL do Supabase e execute.

-- 1. Tabela de Usuários (Login)
CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL, -- 'ADMIN' ou 'OPERATOR'
  avatar_initials text
);

-- 2. Tabela de Produtos (Estoque)
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text,
  price_matriz numeric DEFAULT 0,
  price_filial numeric DEFAULT 0,
  cost numeric DEFAULT 0,
  stock_matriz integer DEFAULT 0,
  stock_filial integer DEFAULT 0,
  unit text,
  min_stock integer DEFAULT 5
);

-- 3. Tabela de Vendas
CREATE TABLE IF NOT EXISTS sales (
  id text PRIMARY KEY,
  date text NOT NULL,
  customer_name text,
  total numeric DEFAULT 0,
  branch text, -- 'MATRIZ' ou 'FILIAL'
  status text, -- 'COMPLETED', 'PENDING', 'CANCELLED'
  payment_method text,
  has_invoice boolean DEFAULT false,
  items jsonb -- Armazena os itens da venda como JSON
);

-- 4. Tabela Financeira (Despesas e Receitas)
CREATE TABLE IF NOT EXISTS financials (
  id text PRIMARY KEY,
  date text NOT NULL,
  description text,
  amount numeric DEFAULT 0,
  type text, -- 'Income' ou 'Expense'
  category text
);

-- 5. Tabela de Clientes
CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  cpf_cnpj text,
  email text,
  phone text,
  address text
);

-- (Opcional) Inserir um usuário Admin padrão caso não exista nenhum
-- Senha padrão: admin123 (hash SHA-256)
INSERT INTO app_users (id, name, email, password, role, avatar_initials)
VALUES ('admin-init-001', 'Administrador', 'admin@gelo.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'ADMIN', 'AD')
ON CONFLICT (id) DO NOTHING;
