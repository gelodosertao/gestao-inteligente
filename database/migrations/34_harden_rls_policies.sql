-- =========================================================================
-- MIGRATION 34: Harden Row Level Security policies
-- Removes broad USING (true) policies and replaces them with tenant/role-based
-- policies. Keep this migration staged and test it before applying to prod.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Helper functions used by RLS policies.
-- SECURITY DEFINER functions pin search_path to avoid object shadowing.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.app_users
  WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT TRIM(UPPER(role))
  FROM public.app_users
  WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_user_role() IN ('ADMIN', 'ADMINISTRADOR', 'ADMINISTRADOR_SISTEMA'), false);
$$;

CREATE OR REPLACE FUNCTION public.has_allowed_module(module_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.app_users
      WHERE id::text = auth.uid()::text
        AND UPPER(module_name) IN (
          SELECT UPPER(module_value)
          FROM unnest(COALESCE(allowed_modules, ARRAY[]::text[])) AS module_value
        )
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.same_tenant(row_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_tenant_id = public.get_user_tenant_id();
$$;

-- -------------------------------------------------------------------------
-- Enable RLS on application tables.
-- -------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.production_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sale_items ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- Drop policies that made RLS permissive by design.
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Enable all access for now" ON public.tenants;
DROP POLICY IF EXISTS "Enable all access for now" ON public.products;
DROP POLICY IF EXISTS "Enable all access for now" ON public.sales;
DROP POLICY IF EXISTS "Enable all access for now" ON public.financials;
DROP POLICY IF EXISTS "Enable all access for now" ON public.customers;
DROP POLICY IF EXISTS "Enable all access for now" ON public.stock_movements;
DROP POLICY IF EXISTS "Enable all access for now" ON public.production_logs;
DROP POLICY IF EXISTS "Enable all access for now" ON public.cash_closings;
DROP POLICY IF EXISTS "Enable all access for now" ON public.orders;
DROP POLICY IF EXISTS "Enable all access for now" ON public.categories;
DROP POLICY IF EXISTS "Enable all access for now" ON public.store_settings;
DROP POLICY IF EXISTS "Enable all access for now" ON public.app_users;

DROP POLICY IF EXISTS "Authenticated users can do everything on products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can do everything on sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can do everything on financials" ON public.financials;
DROP POLICY IF EXISTS "Authenticated users can do everything on customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can do everything on settings" ON public.store_settings;
DROP POLICY IF EXISTS "Authenticated users can do everything on stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Authenticated users can do everything on production_logs" ON public.production_logs;
DROP POLICY IF EXISTS "Authenticated users can do everything on cash_closings" ON public.cash_closings;
DROP POLICY IF EXISTS "Authenticated users can do everything on categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can read all profiles" ON public.app_users;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.app_users;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.app_users;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.app_users;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.app_users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.app_users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.app_users;
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.app_users;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.app_users;
DROP POLICY IF EXISTS "Admins can delete any profile" ON public.app_users;

DROP POLICY IF EXISTS "crm_leads_authenticated" ON public.crm_leads;
DROP POLICY IF EXISTS "crm_interactions_authenticated" ON public.crm_interactions;
DROP POLICY IF EXISTS "crm_tasks_authenticated" ON public.crm_tasks;
DROP POLICY IF EXISTS "crm_leads_tenant_policy" ON public.crm_leads;
DROP POLICY IF EXISTS "crm_interactions_tenant_policy" ON public.crm_interactions;
DROP POLICY IF EXISTS "crm_tasks_tenant_policy" ON public.crm_tasks;

DROP POLICY IF EXISTS "delivery_routes_select" ON public.delivery_routes;
DROP POLICY IF EXISTS "delivery_routes_insert" ON public.delivery_routes;
DROP POLICY IF EXISTS "delivery_routes_update" ON public.delivery_routes;
DROP POLICY IF EXISTS "delivery_routes_delete" ON public.delivery_routes;
DROP POLICY IF EXISTS "delivery_stops_select" ON public.delivery_stops;
DROP POLICY IF EXISTS "delivery_stops_insert" ON public.delivery_stops;
DROP POLICY IF EXISTS "delivery_stops_update" ON public.delivery_stops;
DROP POLICY IF EXISTS "delivery_stops_delete" ON public.delivery_stops;

DROP POLICY IF EXISTS "products_tenant_policy" ON public.products;
DROP POLICY IF EXISTS "sales_tenant_policy" ON public.sales;
DROP POLICY IF EXISTS "customers_tenant_policy" ON public.customers;
DROP POLICY IF EXISTS "settings_tenant_policy" ON public.store_settings;
DROP POLICY IF EXISTS "fin_select_policy" ON public.financials;
DROP POLICY IF EXISTS "fin_insert_policy" ON public.financials;
DROP POLICY IF EXISTS "fin_update_policy" ON public.financials;
DROP POLICY IF EXISTS "fin_delete_policy" ON public.financials;
DROP POLICY IF EXISTS "sales_delete_policy" ON public.sales;
DROP POLICY IF EXISTS "products_delete_policy" ON public.products;
DROP POLICY IF EXISTS "sale_items_tenant_policy" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_delete_policy" ON public.sale_items;

DROP POLICY IF EXISTS "tenants_authenticated_select_own" ON public.tenants;
DROP POLICY IF EXISTS "tenants_public_insert_for_signup" ON public.tenants;
DROP POLICY IF EXISTS "tenants_admin_update_own" ON public.tenants;
DROP POLICY IF EXISTS "app_users_select_same_tenant_or_self" ON public.app_users;
DROP POLICY IF EXISTS "app_users_self_insert_non_admin" ON public.app_users;
DROP POLICY IF EXISTS "app_users_admin_insert_same_tenant" ON public.app_users;
DROP POLICY IF EXISTS "app_users_admin_update_same_tenant" ON public.app_users;
DROP POLICY IF EXISTS "app_users_admin_delete_same_tenant" ON public.app_users;
DROP POLICY IF EXISTS "products_anon_select_public_menu" ON public.products;
DROP POLICY IF EXISTS "products_authenticated_select_own" ON public.products;
DROP POLICY IF EXISTS "products_authenticated_insert_own" ON public.products;
DROP POLICY IF EXISTS "products_authenticated_update_own" ON public.products;
DROP POLICY IF EXISTS "products_admin_delete_own" ON public.products;
DROP POLICY IF EXISTS "store_settings_anon_select_public_menu" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_authenticated_select_own" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_admin_insert_own" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_admin_update_own" ON public.store_settings;
DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_authenticated_insert_own" ON public.orders;
DROP POLICY IF EXISTS "orders_authenticated_select_own" ON public.orders;
DROP POLICY IF EXISTS "orders_authenticated_update_own" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_delete_own" ON public.orders;
DROP POLICY IF EXISTS "sales_authenticated_select_own" ON public.sales;
DROP POLICY IF EXISTS "sales_authenticated_insert_own" ON public.sales;
DROP POLICY IF EXISTS "sales_authenticated_update_own" ON public.sales;
DROP POLICY IF EXISTS "sales_admin_delete_own" ON public.sales;
DROP POLICY IF EXISTS "customers_authenticated_select_own" ON public.customers;
DROP POLICY IF EXISTS "customers_authenticated_insert_own" ON public.customers;
DROP POLICY IF EXISTS "customers_authenticated_update_own" ON public.customers;
DROP POLICY IF EXISTS "customers_admin_delete_own" ON public.customers;
DROP POLICY IF EXISTS "financials_select_authorized_own" ON public.financials;
DROP POLICY IF EXISTS "financials_insert_authorized_own" ON public.financials;
DROP POLICY IF EXISTS "financials_admin_update_own" ON public.financials;
DROP POLICY IF EXISTS "financials_admin_delete_own" ON public.financials;
DROP POLICY IF EXISTS "stock_movements_authenticated_select_own" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_authenticated_insert_own" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_authenticated_update_own" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_admin_delete_own" ON public.stock_movements;
DROP POLICY IF EXISTS "production_logs_authenticated_select_own" ON public.production_logs;
DROP POLICY IF EXISTS "production_logs_authenticated_insert_own" ON public.production_logs;
DROP POLICY IF EXISTS "production_logs_authenticated_update_own" ON public.production_logs;
DROP POLICY IF EXISTS "production_logs_admin_delete_own" ON public.production_logs;
DROP POLICY IF EXISTS "cash_closings_authenticated_select_own" ON public.cash_closings;
DROP POLICY IF EXISTS "cash_closings_authenticated_insert_own" ON public.cash_closings;
DROP POLICY IF EXISTS "cash_closings_authenticated_update_own" ON public.cash_closings;
DROP POLICY IF EXISTS "cash_closings_admin_delete_own" ON public.cash_closings;
DROP POLICY IF EXISTS "categories_authenticated_select_own" ON public.categories;
DROP POLICY IF EXISTS "categories_authenticated_insert_own" ON public.categories;
DROP POLICY IF EXISTS "categories_authenticated_update_own" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_delete_own" ON public.categories;
DROP POLICY IF EXISTS "crm_leads_authenticated_select_own" ON public.crm_leads;
DROP POLICY IF EXISTS "crm_leads_authenticated_insert_own" ON public.crm_leads;
DROP POLICY IF EXISTS "crm_leads_authenticated_update_own" ON public.crm_leads;
DROP POLICY IF EXISTS "crm_leads_admin_delete_own" ON public.crm_leads;
DROP POLICY IF EXISTS "crm_interactions_authenticated_select_own" ON public.crm_interactions;
DROP POLICY IF EXISTS "crm_interactions_authenticated_insert_own" ON public.crm_interactions;
DROP POLICY IF EXISTS "crm_interactions_authenticated_update_own" ON public.crm_interactions;
DROP POLICY IF EXISTS "crm_interactions_admin_delete_own" ON public.crm_interactions;
DROP POLICY IF EXISTS "crm_tasks_authenticated_select_own" ON public.crm_tasks;
DROP POLICY IF EXISTS "crm_tasks_authenticated_insert_own" ON public.crm_tasks;
DROP POLICY IF EXISTS "crm_tasks_authenticated_update_own" ON public.crm_tasks;
DROP POLICY IF EXISTS "crm_tasks_admin_delete_own" ON public.crm_tasks;
DROP POLICY IF EXISTS "delivery_routes_authenticated_select_own" ON public.delivery_routes;
DROP POLICY IF EXISTS "delivery_routes_authenticated_insert_own" ON public.delivery_routes;
DROP POLICY IF EXISTS "delivery_routes_authenticated_update_own" ON public.delivery_routes;
DROP POLICY IF EXISTS "delivery_routes_admin_delete_own" ON public.delivery_routes;
DROP POLICY IF EXISTS "delivery_stops_authenticated_select_own" ON public.delivery_stops;
DROP POLICY IF EXISTS "delivery_stops_authenticated_insert_own" ON public.delivery_stops;
DROP POLICY IF EXISTS "delivery_stops_authenticated_update_own" ON public.delivery_stops;
DROP POLICY IF EXISTS "delivery_stops_admin_delete_own" ON public.delivery_stops;
DROP POLICY IF EXISTS "sale_items_authenticated_select_own" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_authenticated_insert_own" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_authenticated_update_own" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_admin_delete_own" ON public.sale_items;

-- -------------------------------------------------------------------------
-- Tenants and users.
-- Public self-registration may create a tenant, but cannot grant admin role.
-- -------------------------------------------------------------------------

CREATE POLICY "tenants_authenticated_select_own" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.get_user_tenant_id());

CREATE POLICY "tenants_public_insert_for_signup" ON public.tenants
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "tenants_admin_update_own" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.same_tenant(id) AND public.is_admin())
  WITH CHECK (public.same_tenant(id) AND public.is_admin());

CREATE POLICY "app_users_select_same_tenant_or_self" ON public.app_users
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id) OR id::text = auth.uid()::text);

CREATE POLICY "app_users_self_insert_non_admin" ON public.app_users
  FOR INSERT TO authenticated
  WITH CHECK (
    id::text = auth.uid()::text
    AND COALESCE(TRIM(UPPER(role)), '') NOT IN ('ADMIN', 'ADMINISTRADOR', 'ADMINISTRADOR_SISTEMA')
  );

CREATE POLICY "app_users_admin_insert_same_tenant" ON public.app_users
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "app_users_admin_update_same_tenant" ON public.app_users
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin())
  WITH CHECK (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "app_users_admin_delete_same_tenant" ON public.app_users
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

-- -------------------------------------------------------------------------
-- Core tenant-owned tables.
-- Products and store settings are readable by anon for the public menu.
-- Orders are insertable by anon for public checkout, but read/write remains
-- tenant-scoped for authenticated operators.
-- -------------------------------------------------------------------------

REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id,
  name,
  category,
  price_filial,
  stock_filial,
  unit,
  pack_size,
  price_pack,
  is_stock_controlled,
  combo_items,
  image,
  options,
  tenant_id
) ON public.products TO anon;

CREATE POLICY "products_anon_select_public_menu" ON public.products
  FOR SELECT TO anon
  USING (tenant_id IS NOT NULL);

CREATE POLICY "products_authenticated_select_own" ON public.products
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "products_authenticated_insert_own" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "products_authenticated_update_own" ON public.products
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "products_admin_delete_own" ON public.products
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "store_settings_anon_select_public_menu" ON public.store_settings
  FOR SELECT TO anon
  USING (tenant_id IS NOT NULL);

CREATE POLICY "store_settings_authenticated_select_own" ON public.store_settings
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "store_settings_admin_insert_own" ON public.store_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "store_settings_admin_update_own" ON public.store_settings
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin())
  WITH CHECK (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "orders_public_insert" ON public.orders
  FOR INSERT TO anon
  WITH CHECK (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = tenant_id
    )
  );

CREATE POLICY "orders_authenticated_insert_own" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "orders_authenticated_select_own" ON public.orders
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "orders_authenticated_update_own" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "orders_admin_delete_own" ON public.orders
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "sales_authenticated_select_own" ON public.sales
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "sales_authenticated_insert_own" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "sales_authenticated_update_own" ON public.sales
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "sales_admin_delete_own" ON public.sales
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "customers_authenticated_select_own" ON public.customers
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "customers_authenticated_insert_own" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "customers_authenticated_update_own" ON public.customers
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "customers_admin_delete_own" ON public.customers
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "financials_select_authorized_own" ON public.financials
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id) AND public.has_allowed_module('FINANCIAL'));

CREATE POLICY "financials_insert_authorized_own" ON public.financials
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id) AND public.has_allowed_module('FINANCIAL'));

CREATE POLICY "financials_admin_update_own" ON public.financials
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin())
  WITH CHECK (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "financials_admin_delete_own" ON public.financials
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "stock_movements_authenticated_select_own" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "stock_movements_authenticated_insert_own" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "stock_movements_authenticated_update_own" ON public.stock_movements
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "stock_movements_admin_delete_own" ON public.stock_movements
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "production_logs_authenticated_select_own" ON public.production_logs
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "production_logs_authenticated_insert_own" ON public.production_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "production_logs_authenticated_update_own" ON public.production_logs
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "production_logs_admin_delete_own" ON public.production_logs
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "cash_closings_authenticated_select_own" ON public.cash_closings
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "cash_closings_authenticated_insert_own" ON public.cash_closings
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "cash_closings_authenticated_update_own" ON public.cash_closings
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "cash_closings_admin_delete_own" ON public.cash_closings
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "categories_authenticated_select_own" ON public.categories
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "categories_authenticated_insert_own" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "categories_authenticated_update_own" ON public.categories
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "categories_admin_delete_own" ON public.categories
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

-- -------------------------------------------------------------------------
-- CRM and logistics tables.
-- -------------------------------------------------------------------------

CREATE POLICY "crm_leads_authenticated_select_own" ON public.crm_leads
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_leads_authenticated_insert_own" ON public.crm_leads
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_leads_authenticated_update_own" ON public.crm_leads
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'))
  WITH CHECK (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_leads_admin_delete_own" ON public.crm_leads
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "crm_interactions_authenticated_select_own" ON public.crm_interactions
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_interactions_authenticated_insert_own" ON public.crm_interactions
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_interactions_authenticated_update_own" ON public.crm_interactions
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'))
  WITH CHECK (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_interactions_admin_delete_own" ON public.crm_interactions
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "crm_tasks_authenticated_select_own" ON public.crm_tasks
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_tasks_authenticated_insert_own" ON public.crm_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_tasks_authenticated_update_own" ON public.crm_tasks
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'))
  WITH CHECK (public.same_tenant(tenant_id) AND public.has_allowed_module('CRM'));

CREATE POLICY "crm_tasks_admin_delete_own" ON public.crm_tasks
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "delivery_routes_authenticated_select_own" ON public.delivery_routes
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "delivery_routes_authenticated_insert_own" ON public.delivery_routes
  FOR INSERT TO authenticated
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "delivery_routes_authenticated_update_own" ON public.delivery_routes
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (public.same_tenant(tenant_id));

CREATE POLICY "delivery_routes_admin_delete_own" ON public.delivery_routes
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "delivery_stops_authenticated_select_own" ON public.delivery_stops
  FOR SELECT TO authenticated
  USING (
    public.same_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.delivery_routes r
      WHERE r.id = route_id
        AND public.same_tenant(r.tenant_id)
    )
  );

CREATE POLICY "delivery_stops_authenticated_insert_own" ON public.delivery_stops
  FOR INSERT TO authenticated
  WITH CHECK (
    public.same_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.delivery_routes r
      WHERE r.id = route_id
        AND public.same_tenant(r.tenant_id)
    )
  );

CREATE POLICY "delivery_stops_authenticated_update_own" ON public.delivery_stops
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (
    public.same_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.delivery_routes r
      WHERE r.id = route_id
        AND public.same_tenant(r.tenant_id)
    )
  );

CREATE POLICY "delivery_stops_admin_delete_own" ON public.delivery_stops
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

CREATE POLICY "sale_items_authenticated_select_own" ON public.sale_items
  FOR SELECT TO authenticated
  USING (public.same_tenant(tenant_id));

CREATE POLICY "sale_items_authenticated_insert_own" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.same_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_id
        AND public.same_tenant(s.tenant_id)
    )
  );

CREATE POLICY "sale_items_authenticated_update_own" ON public.sale_items
  FOR UPDATE TO authenticated
  USING (public.same_tenant(tenant_id))
  WITH CHECK (
    public.same_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_id
        AND public.same_tenant(s.tenant_id)
    )
  );

CREATE POLICY "sale_items_admin_delete_own" ON public.sale_items
  FOR DELETE TO authenticated
  USING (public.same_tenant(tenant_id) AND public.is_admin());

-- -------------------------------------------------------------------------
-- Optional verification query for SQL Editor:
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual ILIKE '%true%' OR with_check ILIKE '%true%')
-- ORDER BY tablename, policyname;
-- =========================================================================
