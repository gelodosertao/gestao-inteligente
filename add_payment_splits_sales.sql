-- Remove restrição de check se existir (para aceitar 'Split')
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;

-- Adiciona a coluna de splits se não existir
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_splits JSONB;
