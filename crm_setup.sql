-- ============================================================
-- CRM MODULE — Gelo do Sertão
-- Execute este script no painel SQL do Supabase
-- ============================================================

-- 1. LEADS (Funil de Vendas)
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  city TEXT,
  channel TEXT NOT NULL DEFAULT 'Indicação', -- WhatsApp, Instagram, Facebook, Indicação, Site, Outros
  status TEXT NOT NULL DEFAULT 'NOVO',        -- NOVO, CONTATO, PROPOSTA, FECHADO, PERDIDO
  estimated_value NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  responsible_id TEXT,
  responsible_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_leads_tenant_policy" ON crm_leads
  FOR ALL USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR EXISTS (SELECT 1 FROM app_users WHERE id::text = (current_setting('request.jwt.claims', true)::json->>'sub') AND role = 'ADMIN'))
  WITH CHECK (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR EXISTS (SELECT 1 FROM app_users WHERE id::text = (current_setting('request.jwt.claims', true)::json->>'sub') AND role = 'ADMIN'));

-- Fallback mais simples (caso a policy acima dê erro, use esta):
-- DROP POLICY IF EXISTS "crm_leads_tenant_policy" ON crm_leads;
-- CREATE POLICY "crm_leads_open" ON crm_leads FOR ALL USING (true) WITH CHECK (true);

-- 2. INTERAÇÕES (Histórico de Contatos)
CREATE TABLE IF NOT EXISTS crm_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'NOTA', -- NOTA, WHATSAPP, LIGACAO, EMAIL, REUNIAO
  content TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_interactions_tenant_policy" ON crm_interactions
  FOR ALL USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR EXISTS (SELECT 1 FROM app_users WHERE id::text = (current_setting('request.jwt.claims', true)::json->>'sub') AND role = 'ADMIN'))
  WITH CHECK (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR EXISTS (SELECT 1 FROM app_users WHERE id::text = (current_setting('request.jwt.claims', true)::json->>'sub') AND role = 'ADMIN'));

-- 3. TAREFAS / FOLLOW-UPS
CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL, -- opcional
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, CONCLUIDA, CANCELADA
  responsible_id TEXT,
  responsible_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_tasks_tenant_policy" ON crm_tasks
  FOR ALL USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR EXISTS (SELECT 1 FROM app_users WHERE id::text = (current_setting('request.jwt.claims', true)::json->>'sub') AND role = 'ADMIN'))
  WITH CHECK (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR EXISTS (SELECT 1 FROM app_users WHERE id::text = (current_setting('request.jwt.claims', true)::json->>'sub') AND role = 'ADMIN'));

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant ON crm_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_lead ON crm_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_tenant ON crm_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_date ON crm_tasks(due_date);

-- ============================================================
-- Script concluído! As tabelas CRM estão prontas.
-- ============================================================
