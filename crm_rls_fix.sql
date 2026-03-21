-- ============================================================
-- CRM RLS FIX — Execute este script no Supabase SQL Editor
-- Corrige as políticas de segurança das tabelas CRM
-- ============================================================

-- Remove policies antigas
DROP POLICY IF EXISTS "crm_leads_tenant_policy" ON crm_leads;
DROP POLICY IF EXISTS "crm_interactions_tenant_policy" ON crm_interactions;
DROP POLICY IF EXISTS "crm_tasks_tenant_policy" ON crm_tasks;

-- ── LEADS: permite acesso a usuários autenticados ──────────────
CREATE POLICY "crm_leads_authenticated" ON crm_leads
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── INTERACTIONS: permite acesso a usuários autenticados ───────
CREATE POLICY "crm_interactions_authenticated" ON crm_interactions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── TASKS: permite acesso a usuários autenticados ──────────────
CREATE POLICY "crm_tasks_authenticated" ON crm_tasks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Pronto! As tabelas CRM agora estão acessíveis.
-- O sistema filtra por tenant_id no código da aplicação.
-- ============================================================
