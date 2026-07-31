-- =========================================================================
-- GELO DO SERTAO - SECURITY REMEDIATION PLAN (RLS & POLICY FIXES)
-- Este script aplica todas as correcoes de seguranca recomendadas:
-- 1. Remocao de senha em formato texto-plano.
-- 2. Refinamento de isolamento multi-tenant.
-- 3. Restricao extrema em operacoes DELETE.
-- 4. Isolamento especifico para modulo financeiro.
-- =========================================================================

-- CRIT-02: Remover trigger, funcao e coluna de senha em texto plano
DROP TRIGGER IF EXISTS tr_sync_password ON app_users;
DROP FUNCTION IF EXISTS fn_sync_password();
ALTER TABLE app_users DROP COLUMN IF EXISTS password;

-- ---------------------------------------------------------
-- ALTA-01: Implementar isolamento tenant-based real via JWT
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid AS $$
  SELECT tenant_id
  FROM public.app_users
  WHERE id = auth.uid()::text
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Em 'products'
DROP POLICY IF EXISTS "products_tenant_policy" ON products;
CREATE POLICY "products_tenant_policy" ON products
    FOR ALL
    USING (tenant_id = public.get_user_tenant_id());

-- Em 'sales'
DROP POLICY IF EXISTS "sales_tenant_policy" ON sales;
CREATE POLICY "sales_tenant_policy" ON sales
    FOR ALL
    USING (tenant_id = public.get_user_tenant_id());

-- Em 'customers'
DROP POLICY IF EXISTS "customers_tenant_policy" ON customers;
CREATE POLICY "customers_tenant_policy" ON customers
    FOR ALL
    USING (tenant_id = public.get_user_tenant_id());

-- Em 'store_settings'
DROP POLICY IF EXISTS "settings_tenant_policy" ON store_settings;
CREATE POLICY "settings_tenant_policy" ON store_settings
    FOR ALL
    USING (tenant_id = public.get_user_tenant_id());

-- ---------------------------------------------------------
-- ALTA-03: Policies de controle de acesso (RBAC) nas Financas
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role
  FROM public.app_users
  WHERE id = auth.uid()::text
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Em 'financials'
DROP POLICY IF EXISTS "fin_select_policy" ON financials;
CREATE POLICY "fin_select_policy" ON financials
    FOR SELECT
    USING (
        tenant_id = public.get_user_tenant_id()
        AND (public.get_user_role() = 'ADMIN' OR EXISTS (
            SELECT 1 FROM public.app_users
            WHERE id = auth.uid()::text AND 'FINANCIAL' = ANY(allowed_modules)
        ))
    );

DROP POLICY IF EXISTS "fin_insert_policy" ON financials;
CREATE POLICY "fin_insert_policy" ON financials
    FOR INSERT
    WITH CHECK (
        tenant_id = public.get_user_tenant_id()
        AND (public.get_user_role() = 'ADMIN' OR EXISTS (
            SELECT 1 FROM public.app_users
            WHERE id = auth.uid()::text AND 'FINANCIAL' = ANY(allowed_modules)
        ))
    );

DROP POLICY IF EXISTS "fin_update_policy" ON financials;
CREATE POLICY "fin_update_policy" ON financials
    FOR UPDATE
    USING (
        tenant_id = public.get_user_tenant_id()
        AND public.get_user_role() = 'ADMIN'
    );

-- ---------------------------------------------------------
-- ALTA-05: Restricao rigida de DELETE apenas para ADMINS
-- ---------------------------------------------------------

-- 'financials'
DROP POLICY IF EXISTS "fin_delete_policy" ON financials;
CREATE POLICY "fin_delete_policy" ON financials
    FOR DELETE
    USING (
        tenant_id = public.get_user_tenant_id()
        AND public.get_user_role() = 'ADMIN'
    );

-- 'sales'
DROP POLICY IF EXISTS "sales_delete_policy" ON sales;
CREATE POLICY "sales_delete_policy" ON sales
    FOR DELETE
    USING (
        tenant_id = public.get_user_tenant_id()
        AND public.get_user_role() = 'ADMIN'
    );

-- 'products'
DROP POLICY IF EXISTS "products_delete_policy" ON products;
CREATE POLICY "products_delete_policy" ON products
    FOR DELETE
    USING (
        tenant_id = public.get_user_tenant_id()
        AND public.get_user_role() = 'ADMIN'
    );
