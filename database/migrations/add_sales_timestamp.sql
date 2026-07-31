-- Adiciona a coluna de data/hora na tabela de vendas
ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;
