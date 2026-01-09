-- Garantir que a tabela de movimentos de estoque existe e tem as colunas corretas
CREATE TABLE IF NOT EXISTS stock_movements (
  id text PRIMARY KEY,
  date text,
  product_id text,
  product_name text,
  quantity numeric,
  type text,
  reason text,
  branch text
);

-- Desativar RLS para garantir que funcione sem login do Supabase
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
