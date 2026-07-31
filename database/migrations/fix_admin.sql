-- SCRIPT PARA CORRIGIR PERMISSÕES DE ADMINISTRADOR
-- Substitua 'SEU_EMAIL_AQUI' pelo email do usuário que você quer transformar em ADMIN

-- 1. Tenta atualizar o usuário se ele já existir na tabela app_users
UPDATE app_users 
SET role = 'ADMIN' 
WHERE email = 'SEU_EMAIL_AQUI';

-- 2. Se o usuário não existir na tabela app_users (mas existir no Auth), insere ele
-- (Isso é útil se a criação do perfil falhou anteriormente)
INSERT INTO app_users (id, name, email, role, avatar_initials)
SELECT 
  id, 
  raw_user_meta_data->>'name', 
  email, 
  'ADMIN', 
  'AD'
FROM auth.users 
WHERE email = 'SEU_EMAIL_AQUI'
ON CONFLICT (id) DO UPDATE 
SET role = 'ADMIN';

-- 3. (Opcional) Relaxar a política de segurança para permitir que qualquer usuário logado crie seu perfil
-- Isso ajuda a evitar erros no futuro
DROP POLICY IF EXISTS "Users can insert their own profile" ON app_users;
CREATE POLICY "Users can insert their own profile" ON app_users FOR INSERT TO authenticated WITH CHECK (true);
