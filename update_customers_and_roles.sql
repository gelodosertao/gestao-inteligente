-- Add new columns to customers table for Wholesale POS enhancements
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS responsible_name TEXT,
ADD COLUMN IF NOT EXISTS establishment_name TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Consolidate roles: everyone is now a representative with 5% commission
UPDATE app_users SET role = 'WHOLESALE_REPRESENTATIVE' WHERE role = 'WHOLESALE_SUPERVISOR';
