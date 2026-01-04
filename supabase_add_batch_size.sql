-- Adiciona coluna para Tamanho do Lote da Receita
ALTER TABLE products ADD COLUMN IF NOT EXISTS recipe_batch_size NUMERIC DEFAULT 1;

COMMENT ON COLUMN products.recipe_batch_size IS 'Quantidade de referência para a receita (ex: 888 unidades)';
