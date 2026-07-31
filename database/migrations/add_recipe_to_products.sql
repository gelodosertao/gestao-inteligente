-- Executar este script no painel SQL do Supabase para adicionar as novas colunas de receita à tabela de produtos

ALTER TABLE products ADD COLUMN IF NOT EXISTS recipe JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS recipe_batch_size NUMERIC DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS operational_cost NUMERIC DEFAULT 0;
