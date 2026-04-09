-- Script para corrigir segurança e permitir que Admins gerenciem usuários corretamente
-- sem diminuir a segurança do sistema.

-- 1. Cria função para verificar se o usuário atual é ADMIN
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Busca a role do usuário logado na tabela app_users
  SELECT role INTO caller_role FROM public.app_users WHERE id = auth.uid();
  RETURN COALESCE(caller_role = 'ADMIN', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Corrige as políticas RLS para app_users
-- Admins podem inserir perfis (para a criação de novos usuários funcionar)
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.app_users;
CREATE POLICY "Admins can insert any profile" ON public.app_users 
FOR INSERT TO authenticated 
WITH CHECK (public.is_admin());

-- Admins podem atualizar qualquer perfil
DROP POLICY IF EXISTS "Admins can update any profile" ON public.app_users;
CREATE POLICY "Admins can update any profile" ON public.app_users 
FOR UPDATE TO authenticated 
USING (public.is_admin());

-- Admins podem excluir qualquer perfil
DROP POLICY IF EXISTS "Admins can delete any profile" ON public.app_users;
CREATE POLICY "Admins can delete any profile" ON public.app_users 
FOR DELETE TO authenticated 
USING (public.is_admin());

-- Permite que usuários editem a si mesmos (já existia, garantindo que continue lá)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.app_users;
CREATE POLICY "Users can update their own profile" ON public.app_users 
FOR UPDATE TO authenticated  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.app_users;
CREATE POLICY "Users can insert their own profile" ON public.app_users 
FOR INSERT TO authenticated  WITH CHECK (auth.uid() = id);


-- 3. Cria RPCs para ações sensíveis nativas do Supabase Auth
-- Deletar um usuário completamente (Auth e Perfil)
CREATE OR REPLACE FUNCTION public.delete_auth_user(target_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Verificação de segurança
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir usuários.';
  END IF;

  -- 1. Remove do app_users (se existir)
  DELETE FROM public.app_users WHERE id = target_user_id;
  
  -- 2. Remove do Supabase Auth
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Alterar senha de um usuário
CREATE OR REPLACE FUNCTION public.update_user_password(target_user_id uuid, new_password text)
RETURNS void AS $$
BEGIN
  -- Verificação de segurança
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar senhas.';
  END IF;

  -- Atualiza o Auth Oficial (exige pgcrypto que já está ativo no Supabase)
  UPDATE auth.users 
  SET encrypted_password = crypt(COALESCE(new_password, ''), gen_salt('bf'))
  WHERE id = target_user_id;

  -- Opcional: Atualiza o campo password no app_users (para manter consistência com versões antigas)
  UPDATE public.app_users
  SET password = COALESCE(new_password, '')
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
