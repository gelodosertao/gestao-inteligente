-- ATUALIZAÇÃO PARA MODELO SaaS (Multi-Tenancy G.AI)
-- Este script expande a tabela de tenants (empresas) para suportar o modelo SaaS profissional.

-- 1. Expansão da tabela de empresas (tenants)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cnpj text UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS fatura_email text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cnae text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address_street text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address_number text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address_city text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address_state text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type text; -- ex: DISTRIBUIDORA, VAREJO, SERVIÇO
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'ACTIVE'; -- ACTIVE, TRIAL, PAST_DUE
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url text;

-- 2. Garantir que cada usuário saiba a qual empresa pertence
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_owner boolean DEFAULT false;

-- 3. Refinar Seguranca (RLS) - Blindagem de Dados
-- Garante que NINGUÉM veja dados de outro tenant a nível de banco de dados.

-- Função para pegar o tenant do usuário logado de forma segura
CREATE OR REPLACE FUNCTION public.get_my_tenant()
RETURNS uuid AS $$
BEGIN
  RETURN (SELECT tenant_id FROM public.app_users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Exemplo de aplicação em uma tabela (faremos em todas via loop ou manual se necessário)
-- Aqui aplicamos na tabela de vendas como exemplo principal de segurança
DROP POLICY IF EXISTS "SaaS: Users only see their company sales" ON sales;
CREATE POLICY "SaaS: Users only see their company sales" ON sales
FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant())
WITH CHECK (tenant_id = public.get_my_tenant());

-- Fazemos o mesmo para Produtos
DROP POLICY IF EXISTS "SaaS: Users only see their company products" ON products;
CREATE POLICY "SaaS: Users only see their company products" ON products
FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant())
WITH CHECK (tenant_id = public.get_my_tenant());

-- Adicionamos suporte a planos de usuários
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users int DEFAULT 5;
