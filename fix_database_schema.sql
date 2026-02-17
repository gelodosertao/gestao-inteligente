-- 1. Create Tenants Table (if not exists)
create table if not exists tenants (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamp with time zone default now()
);

-- 2. Create Default Tenant (if not exists)
insert into tenants (id, name)
select '00000000-0000-0000-0000-000000000000', 'Gelo do Sertão'
where not exists (select 1 from tenants where id = '00000000-0000-0000-0000-000000000000');

-- 3. Create or Update Tables with ALL required columns

-- PRODUCTS
create table if not exists products (
  id text primary key,
  name text,
  category text,
  price_matriz numeric,
  price_filial numeric,
  cost numeric,
  stock_matriz integer,
  stock_filial integer,
  unit text,
  min_stock integer,
  pack_size integer,
  price_pack numeric,
  is_stock_controlled boolean,
  combo_items jsonb,
  image text,
  recipe jsonb,
  recipe_batch_size numeric,
  operational_cost numeric,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
-- Add missing columns if table existed
alter table products add column if not exists pack_size integer;
alter table products add column if not exists price_pack numeric;
alter table products add column if not exists is_stock_controlled boolean;
alter table products add column if not exists combo_items jsonb;
alter table products add column if not exists image text;
alter table products add column if not exists recipe jsonb;
alter table products add column if not exists recipe_batch_size numeric;
alter table products add column if not exists operational_cost numeric;
alter table products add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- SALES
create table if not exists sales (
  id text primary key,
  date text,
  customer_name text,
  total numeric,
  branch text,
  status text,
  payment_method text,
  payment_splits jsonb,
  has_invoice boolean,
  items jsonb,
  cash_received numeric,
  change_amount numeric,
  created_at timestamp with time zone,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table sales add column if not exists payment_splits jsonb;
alter table sales add column if not exists created_at timestamp with time zone;
alter table sales add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- FINANCIALS
create table if not exists financials (
  id text primary key,
  date text,
  description text,
  amount numeric,
  type text,
  category text,
  branch text,
  payment_method text,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table financials add column if not exists branch text;
alter table financials add column if not exists payment_method text;
alter table financials add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- CUSTOMERS
create table if not exists customers (
  id text primary key,
  name text,
  cpf_cnpj text,
  email text,
  phone text,
  address text,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table customers add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- STOCK MOVEMENTS
create table if not exists stock_movements (
  id text primary key,
  date text,
  product_id text,
  product_name text,
  quantity numeric,
  type text,
  reason text,
  branch text,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table stock_movements add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- PRODUCTION LOGS
create table if not exists production_logs (
  id text primary key,
  date text,
  product_id text,
  product_name text,
  quantity numeric,
  shift text,
  responsible text,
  notes text,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table production_logs add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- CASH CLOSINGS
create table if not exists cash_closings (
  id text primary key,
  date text,
  branch text,
  opening_balance numeric,
  total_income numeric,
  total_expense numeric,
  total_by_payment_method jsonb,
  cash_in_drawer numeric,
  difference numeric,
  notes text,
  closed_by text,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table cash_closings add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- ORDERS
create table if not exists orders (
  id text primary key,
  date text,
  customer_name text,
  customer_phone text,
  address text,
  delivery_method text,
  payment_method text,
  items jsonb,
  total numeric,
  status text,
  branch text,
  created_at bigint,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table orders add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- CATEGORIES
create table if not exists categories (
  id uuid default gen_random_uuid() primary key,
  name text,
  type text,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table categories add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- STORE SETTINGS
create table if not exists store_settings (
  id text primary key,
  store_name text,
  phone text,
  address text,
  cover_image text,
  background_image text,
  logo_image text,
  opening_hours text,
  primary_color text,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table store_settings add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- APP USERS
create table if not exists app_users (
  id uuid default gen_random_uuid() primary key,
  name text,
  email text unique,
  password text,
  role text,
  avatar_initials text,
  tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000'
);
alter table app_users add column if not exists tenant_id uuid references tenants(id) default '00000000-0000-0000-0000-000000000000';

-- 4. Enable RLS (Row Level Security) on ALL tables
alter table products enable row level security;
alter table sales enable row level security;
alter table financials enable row level security;
alter table customers enable row level security;
alter table stock_movements enable row level security;
alter table production_logs enable row level security;
alter table cash_closings enable row level security;
alter table orders enable row level security;
alter table categories enable row level security;
alter table store_settings enable row level security;
alter table app_users enable row level security;

-- 5. Create Policies (Allow access only to own tenant)
-- Note: For simplicity in this app, we might just filter by tenant_id in the query (which we did in code).
-- But RLS is safer. Let's add a basic policy that allows everything for now to avoid permission errors 
-- if the user hasn't set up Auth context perfectly.
-- Ideally, we would check `auth.uid()` against `app_users` table, but Supabase Auth is separate from `app_users` table here.
-- So we will create a PERMISSIVE policy that allows all operations for now, relying on the frontend filtering.
-- REAL SECURITY would require linking Supabase Auth Users to App Users.

create policy "Enable all access for now" on products for all using (true);
create policy "Enable all access for now" on sales for all using (true);
create policy "Enable all access for now" on financials for all using (true);
create policy "Enable all access for now" on customers for all using (true);
create policy "Enable all access for now" on stock_movements for all using (true);
create policy "Enable all access for now" on production_logs for all using (true);
create policy "Enable all access for now" on cash_closings for all using (true);
create policy "Enable all access for now" on orders for all using (true);
create policy "Enable all access for now" on categories for all using (true);
create policy "Enable all access for now" on store_settings for all using (true);
create policy "Enable all access for now" on app_users for all using (true);
create policy "Enable all access for now" on tenants for all using (true);
-- Add pixel columns to store_settings table
ALTER TABLE store_settings 
ADD COLUMN IF NOT EXISTS facebook_pixel_id TEXT,
ADD COLUMN IF NOT EXISTS google_tag_id TEXT;

-- Add delivery fee columns to store_settings table
ALTER TABLE store_settings
ADD COLUMN IF NOT EXISTS delivery_base_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_per_km NUMERIC DEFAULT 0;