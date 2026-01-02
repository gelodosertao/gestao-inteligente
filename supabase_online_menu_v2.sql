-- Adiciona coluna de imagem de fundo
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS background_image TEXT;

-- Cria o bucket de imagens (se não existir)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Política de acesso público para leitura
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'images' );

-- Política de acesso para upload (autenticado)
CREATE POLICY "Auth Upload" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'images' );

-- Política de acesso para update (autenticado)
CREATE POLICY "Auth Update" 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'images' );
