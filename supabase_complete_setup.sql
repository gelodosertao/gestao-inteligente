-- SCRIPT COMPLETO: CRIAÇÃO DE TABELAS FALTANTES + SEGURANÇA (RLS)
-- Execute este script para corrigir o erro "relation does not exist" e aplicar a segurança.

-- 1. CRIAÇÃO DAS TABELAS QUE FALTAVAM
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

CREATE TABLE IF NOT EXISTS production_logs (
  id text PRIMARY KEY,
  date text,
  product_id text,
  product_name text,
  quantity numeric,
  shift text,
  responsible text,
  notes text
);

CREATE TABLE IF NOT EXISTS cash_closings (
  id text PRIMARY KEY,
  date text,
  branch text,
  opening_balance numeric,
  total_income numeric,
  total_expense numeric,
  total_by_payment_method jsonb,
  cash_in_drawer numeric,
  difference numeric,
  notes text,
  closed_by text
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text,
  type text
);

-- Garante que store_settings exista (caso não tenha sido criado antes)
CREATE TABLE IF NOT EXISTS store_settings (
  id text PRIMARY KEY,
  store_name text,
  phone text,
  address text,
  cover_image text,
  background_image text,
  logo_image text,
  opening_hours text,
  primary_color text
);

-- 2. ATIVAÇÃO DA SEGURANÇA (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- 3. CRIAÇÃO DAS POLÍTICAS DE ACESSO (Para usuários logados)

-- Remove políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Authenticated users can do everything on products" ON products;
DROP POLICY IF EXISTS "Authenticated users can do everything on sales" ON sales;
DROP POLICY IF EXISTS "Authenticated users can do everything on financials" ON financials;
DROP POLICY IF EXISTS "Authenticated users can do everything on customers" ON customers;
DROP POLICY IF EXISTS "Authenticated users can do everything on settings" ON store_settings;
DROP POLICY IF EXISTS "Authenticated users can do everything on stock_movements" ON stock_movements;
DROP POLICY IF EXISTS "Authenticated users can do everything on production_logs" ON production_logs;
DROP POLICY IF EXISTS "Authenticated users can do everything on cash_closings" ON cash_closings;
DROP POLICY IF EXISTS "Authenticated users can do everything on categories" ON categories;
DROP POLICY IF EXISTS "Authenticated users can read all profiles" ON app_users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON app_users;
DROP POLICY IF EXISTS "Users can update their own profile" ON app_users;

-- Recria as políticas
CREATE POLICY "Authenticated users can do everything on products" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on sales" ON sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on financials" ON financials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on customers" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on settings" ON store_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on stock_movements" ON stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on production_logs" ON production_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on cash_closings" ON cash_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on categories" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas Especiais para Usuários (app_users)
CREATE POLICY "Authenticated users can read all profiles" ON app_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own profile" ON app_users FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = id);
CREATE POLICY "Users can update their own profile" ON app_users FOR UPDATE TO authenticated USING (auth.uid()::text = id);
