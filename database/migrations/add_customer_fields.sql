-- Add missing columns to customers table for better tracking and campaigns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS segment TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch TEXT;
