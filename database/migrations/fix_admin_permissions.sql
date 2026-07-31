-- Script de Reparo de Emergência (VERSÃO FINAL COM CASTING)
-- Resolve o erro: operator does not exist: text = uuid

-- 1. Função is_admin com casting explícito (::text)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Comparamos como texto para evitar conflitos de tipos entre table id e auth.uid
  SELECT TRIM(UPPER(role)) INTO caller_role 
  FROM public.app_users 
  WHERE id::text = auth.uid()::text;
  
  RETURN COALESCE(caller_role IN ('ADMIN', 'ADMINISTRADOR', 'ADMINISTRADOR_SISTEMA'), false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizar delete_auth_user com casting explícito
CREATE OR REPLACE FUNCTION public.delete_auth_user(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir usuários.';
  END IF;

  DELETE FROM public.app_users WHERE id::text = target_user_id::text;
  DELETE FROM auth.users WHERE id = target_user_id; -- Auth sempre é UUID
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atualizar update_user_password com casting explícito
CREATE OR REPLACE FUNCTION public.update_user_password(target_user_id uuid, new_password text)
RETURNS void AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar senhas.';
  END IF;

  UPDATE auth.users 
  SET encrypted_password = crypt(COALESCE(new_password, ''), gen_salt('bf'))
  WHERE id = target_user_id;

  UPDATE public.app_users
  SET password = COALESCE(new_password, '')
  WHERE id::text = target_user_id::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Forçar o seu perfil como ADMIN oficial
UPDATE public.app_users 
SET role = 'ADMIN' 
WHERE email = 'joaobolega@gmail.com'; 
