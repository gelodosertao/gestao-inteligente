-- SCRIPT DE REVERSÃO (VOLTAR AO MODO ANTIGO)
-- Execute este script no SQL Editor do Supabase para fazer o login antigo funcionar.

-- 1. DESATIVAR RLS (Row Level Security)
-- Como não estamos mais usando o login do Supabase, precisamos liberar o acesso para o sistema funcionar.
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE financials DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closings DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;

-- 2. AJUSTAR TABELA DE USUÁRIOS (app_users)
-- Garantir que a coluna 'password' exista (pois vamos salvar a senha nela de novo)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password text;

-- Remover a restrição que obrigava o ID a ser igual ao do Supabase Auth (se existir)
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_id_fkey;

-- Garantir que o ID seja gerado automaticamente (caso não seja enviado)
ALTER TABLE app_users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. REMOVER POLÍTICAS ANTIGAS (Opcional, mas bom para limpeza)
DROP POLICY IF EXISTS "Authenticated users can do everything on products" ON products;
DROP POLICY IF EXISTS "Authenticated users can do everything on sales" ON sales;
-- ... (não precisa remover todas uma por uma se o RLS estiver desativado, mas evita confusão)
