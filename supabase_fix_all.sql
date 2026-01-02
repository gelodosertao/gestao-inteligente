-- SCRIPT DE CORREÇÃO GERAL DO BANCO DE DADOS
-- Execute este script para garantir que todas as colunas necessárias existam.

-- 1. Garante que a tabela de produtos tenha todas as colunas novas
ALTER TABLE products ADD COLUMN IF NOT EXISTS combo_items JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_pack NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_stock_controlled BOOLEAN DEFAULT true;

-- 2. Garante que a tabela de configurações da loja exista e tenha as colunas
CREATE TABLE IF NOT EXISTS store_settings (
  id TEXT PRIMARY KEY,
  store_name TEXT,
  phone TEXT,
  address TEXT,
  cover_image TEXT,
  background_image TEXT,
  logo_image TEXT,
  opening_hours TEXT,
  primary_color TEXT
);

-- Adiciona colunas que podem ter sido esquecidas na tabela de settings
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS background_image TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS logo_image TEXT;

-- 3. Configura o armazenamento de imagens (Storage)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Remove políticas antigas para recriar (evita erros de duplicidade)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update" ON storage.objects;

-- Recria as políticas
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'images' );

CREATE POLICY "Auth Upload" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'images' );

CREATE POLICY "Auth Update" 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'images' );
