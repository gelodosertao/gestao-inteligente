-- Adicionar coluna de forma de pagamento na tabela de financeiro
ALTER TABLE financials ADD COLUMN IF NOT EXISTS payment_method text;
