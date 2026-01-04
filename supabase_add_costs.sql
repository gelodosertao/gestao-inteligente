-- Adiciona colunas para Receita e Custo Operacional na tabela de produtos
ALTER TABLE products ADD COLUMN IF NOT EXISTS recipe JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS operational_cost NUMERIC DEFAULT 0;

-- Comentário para documentação
COMMENT ON COLUMN products.recipe IS 'Lista de insumos e quantidades para produzir uma unidade (JSON)';
COMMENT ON COLUMN products.operational_cost IS 'Custo operacional extra por unidade (energia, mão de obra, etc)';
