-- SCRIPT DE CORREÇÃO PARA O ERRO "Database error finding user"
-- Execute este script no SQL Editor do Supabase

-- 1. Remove identidades que ficaram órfãs (usuários que foram deletados manualmente do auth.users)
DELETE FROM auth.identities 
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- 2. Assegura que os e-mails no auth.identities estejam em minúsculo e sem espaços (para corresponder ao fix_user_emails.sql)
UPDATE auth.identities
SET identity_data = jsonb_set(
  identity_data, 
  '{email}', 
  to_jsonb(lower(trim(identity_data->>'email')))
)
WHERE identity_data->>'email' IS NOT NULL
AND identity_data->>'email' != lower(trim(identity_data->>'email'));

-- 3. (Opcional) Corrigir inconsistências de provedor de log-in, se houver
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  raw_user_meta_data, 
  '{email}', 
  to_jsonb(lower(trim(raw_user_meta_data->>'email')))
)
WHERE raw_user_meta_data->>'email' IS NOT NULL
AND raw_user_meta_data->>'email' != lower(trim(raw_user_meta_data->>'email'));
