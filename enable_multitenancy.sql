-- 1. Create Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Create Default Tenant (if not exists)
-- Using a fixed UUID for the default tenant to easily migrate existing data
INSERT INTO tenants (id, name)
SELECT '00000000-0000-0000-0000-000000000000', 'Gelo do Sertão'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = '00000000-0000-0000-0000-000000000000');

-- 3. Add tenant_id to all tables and migrate existing data

-- app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE app_users SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- products
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE products SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE sales SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- financials
ALTER TABLE financials ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE financials SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE customers SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE orders SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- stock_movements
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE stock_movements SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- production_logs
ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE production_logs SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- cash_closings
ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE cash_closings SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE categories SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;

-- store_settings
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE store_settings SET tenant_id = '00000000-0000-0000-0000-000000000000' WHERE tenant_id IS NULL;
