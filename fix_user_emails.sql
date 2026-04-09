-- Normaliza os e-mails na tabela pública do sistema
UPDATE public.app_users
SET email = lower(trim(email))
WHERE email != lower(trim(email));

-- Normaliza os e-mails na tabela oficial de autenticação do Supabase
UPDATE auth.users
SET email = lower(trim(email))
WHERE email != lower(trim(email));
