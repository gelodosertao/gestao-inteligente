-- Atualização da Tabela de Clientes
-- Execute este script no Editor SQL do Supabase para adicionar os novos campos.

-- Adiciona coluna para o Ramo de Atividade
ALTER TABLE customers ADD COLUMN IF NOT EXISTS segment text;

-- Adiciona coluna para a Cidade
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city text;

-- Adiciona coluna para o Estado (UF)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state text;

-- Comentário: Se você ainda não criou a tabela, use o comando abaixo (mas o ALTER TABLE acima já resolve se ela existir):
-- CREATE TABLE IF NOT EXISTS customers (
--   id text PRIMARY KEY,
--   name text NOT NULL,
--   cpf_cnpj text,
--   email text,
--   phone text,
--   address text,
--   segment text,
--   city text,
--   state text
-- );
