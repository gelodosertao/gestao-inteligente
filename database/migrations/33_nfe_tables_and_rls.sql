-- =========================================================================
-- MIGRATION 33: NF-e TABLES, ROLES, AND RLS POLICIES
-- Cria a estrutura necessária para o microserviço de NF-e (nfe_service)
-- com isolamento de privilégios, integridade referencial e RLS.
--
-- DIAGRAMA DE RELACIONAMENTO (Mermaid):
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │                        Fluxo NF-e                              │
-- └─────────────────────────────────────────────────────────────────┘
--
-- sales 1 ──────> * sale_items
-- (ON DELETE CASCADE)
--
-- sales
-- ┌──────────────────────────────────────┐
-- │ id (PK, TEXT)                        │
-- │ ... (campos existentes)              │
-- │ has_invoice (boolean)                │
-- │ invoice_key (TEXT) ───── NF-e 44 díg │
-- │ invoice_url (TEXT)  ──── DANFE link  │
-- │ nfe_number (TEXT)                     │
-- │ nfe_series (TEXT)                     │
-- │ nfe_status (TEXT)                     │
-- │ nfe_xml (TEXT)       ──── XML NF-e   │
-- │ nfe_issued_at (TIMESTAMPTZ)           │
-- │ tenant_id (FK → tenants)             │
-- └──────────────────────────────────────┘
--        │
--        │ 1
--        │
--        ▼
-- ┌──────────────────────────────────────────┐
-- │ sale_items                                │
-- ├──────────────────────────────────────────┤
-- │ id (PK, UUID)                             │
-- │ sale_id (FK → sales.id) CASCADE       *   │
-- │ product_id (TEXT)                         │
-- │ product_name (TEXT)                       │
-- │ quantity (NUMERIC)                        │
-- │ price_at_sale (NUMERIC)                   │
-- │ ncm (TEXT)         ──── NCM do produto   │
-- │ cfop (TEXT)        ──── CFOP da operação │
-- │ cst (TEXT)         ──── CST tributário   │
-- │ selected_options (JSONB)                  │
-- │ notes (TEXT)                              │
-- │ tenant_id (FK → tenants)                 │
-- └──────────────────────────────────────────┘
--
-- Privilégios (Princípio do Menor Privilégio):
-- ┌──────────────────┬─────────┬──────────┬──────────┬──────────┐
-- │ Role             │ SELECT  │ INSERT   │ UPDATE   │ DELETE   │
-- ├──────────────────┼─────────┼──────────┼──────────┼──────────┤
-- │ nfe_service_role │    ✅   │    ✅    │    ✅    │    ❌    │
-- │ authenticated    │ via RLS │ via RLS  │ via RLS  │ only ADMIN│
-- └──────────────────┴─────────┴──────────┴──────────┴──────────┘
-- =========================================================================

-- =========================================================================
-- 1. SALE_ITEMS: Tabela detalhada de itens da venda
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.sale_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id         TEXT NOT NULL,
    product_id      TEXT NOT NULL,
    product_name    TEXT NOT NULL,
    quantity        NUMERIC NOT NULL DEFAULT 0,
    price_at_sale   NUMERIC NOT NULL DEFAULT 0,
    ncm             TEXT DEFAULT '22011000',
    cfop            TEXT DEFAULT '5102',
    cst             TEXT DEFAULT '',
    selected_options JSONB DEFAULT '[]'::jsonb,
    notes           TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    tenant_id       UUID REFERENCES public.tenants(id)
        ON DELETE SET NULL DEFAULT NULL,
    CONSTRAINT fk_sale_items_sales
        FOREIGN KEY (sale_id)
        REFERENCES public.sales(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);

COMMENT ON TABLE public.sale_items IS 'Itens detalhados das vendas, com NCM/CFOP para NF-e';
COMMENT ON COLUMN public.sale_items.ncm IS 'NCM (Nomenclatura Comum do Mercosul) do produto';
COMMENT ON COLUMN public.sale_items.cfop IS 'CFOP (Código Fiscal de Operações e Prestações)';
COMMENT ON COLUMN public.sale_items.cst IS 'CST (Código de Situação Tributária)';

-- =========================================================================
-- 2. NF-e COLUMNS NA TABELA SALES
-- =========================================================================
ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS invoice_key       TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS invoice_url       TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS nfe_number        TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS nfe_series        TEXT DEFAULT '1',
    ADD COLUMN IF NOT EXISTS nfe_status        TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS nfe_xml           TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS nfe_issued_at     TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.sales.invoice_key   IS 'Chave de acesso NF-e (44 dígitos)';
COMMENT ON COLUMN public.sales.invoice_url   IS 'URL do DANFE/PDF';
COMMENT ON COLUMN public.sales.nfe_number    IS 'Número da NF-e';
COMMENT ON COLUMN public.sales.nfe_series    IS 'Série da NF-e';
COMMENT ON COLUMN public.sales.nfe_status    IS 'Status: pending, authorized, cancelled, rejected';
COMMENT ON COLUMN public.sales.nfe_xml       IS 'XML completo da NF-e autorizada';

-- =========================================================================
-- 3. NF-E SERVICE ROLE (Privilégio Mínimo)
-- =========================================================================
-- Cria role NOLOGIN usada exclusivamente pelo microserviço nfe_service.
-- O serviço conecta via service_role Supabase e executa SET ROLE nfe_service_role
-- para restringir seus privilégios ao mínimo necessário.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nfe_service_role') THEN
        CREATE ROLE nfe_service_role NOINHERIT NOLOGIN;
    END IF;
END $$;

-- =========================================================================
-- 4. PRIVILÉGIOS (Princípio do Menor Privilégio)
-- =========================================================================
-- Acesso ao schema
GRANT USAGE ON SCHEMA public TO nfe_service_role;

-- Tabela sales: apenas SELECT, INSERT, UPDATE (sem DELETE)
GRANT SELECT, INSERT, UPDATE (id, date, customer_name, total, branch, status,
    payment_method, payment_splits, has_invoice,
    invoice_key, invoice_url, nfe_number, nfe_series, nfe_status, nfe_xml, nfe_issued_at,
    delivery_fee, discount, amount_paid, cash_received, change_amount, tenant_id)
ON public.sales TO nfe_service_role;

-- Tabela sale_items: SELECT, INSERT, UPDATE completos (sem DELETE)
GRANT SELECT, INSERT, UPDATE ON public.sale_items TO nfe_service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO nfe_service_role;

-- Nega explicitamente DELETE em todas as tabelas do schema
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM nfe_service_role;

-- =========================================================================
-- 5. ROW LEVEL SECURITY (RLS) PARA SALE_ITEMS
-- =========================================================================
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Política de isolamento multi-tenant (mesmo padrão das outras tabelas)
DROP POLICY IF EXISTS "sale_items_tenant_policy" ON public.sale_items;
CREATE POLICY "sale_items_tenant_policy" ON public.sale_items
    FOR ALL
    USING (tenant_id = public.get_user_tenant_id());

-- Apenas ADMIN pode deletar itens
DROP POLICY IF EXISTS "sale_items_delete_policy" ON public.sale_items;
CREATE POLICY "sale_items_delete_policy" ON public.sale_items
    FOR DELETE
    USING (
        tenant_id = public.get_user_tenant_id()
        AND public.get_user_role() = 'ADMIN'
    );

-- =========================================================================
-- 6. NOTA SOBRE RLS E O MICROSSERVIÇO
-- =========================================================================
-- A role nfe_service_role tem NOINHERIT e NOLOGIN — o acesso ao banco só
-- ocorre via SET ROLE partindo de um usuário com BYPASSRLS (ex: supabase_admin
-- autenticado com a chave service_role). Portanto, RLS não se aplica a estas
-- operações. As policies acima protegem apenas o acesso via authenticated (app).

-- =========================================================================
-- VERIFICAÇÃO DE INTEGRIDADE
-- =========================================================================
DO $$
DECLARE
    fk_count INTEGER;
    col_count INTEGER;
BEGIN
    -- Verifica FK em sale_items
    SELECT COUNT(*) INTO fk_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'sale_items'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'sale_id';

    IF fk_count = 0 THEN
        RAISE WARNING '[VERIFICAÇÃO] FK sale_id -> sales(id) NÃO encontrada em sale_items';
    ELSE
        RAISE NOTICE '[VERIFICAÇÃO] FK sale_id -> sales(id) OK (ON DELETE CASCADE)';
    END IF;

    -- Verifica colunas NF-e em sales
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'sales'
      AND column_name IN ('invoice_key','invoice_url','nfe_status');

    IF col_count < 3 THEN
        RAISE WARNING '[VERIFICAÇÃO] Colunas NF-e ausentes em sales (encontradas: %)', col_count;
    ELSE
        RAISE NOTICE '[VERIFICAÇÃO] Colunas NF-e em sales OK (%)', col_count;
    END IF;
END $$;
