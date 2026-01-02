-- Add is_stock_controlled column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_stock_controlled BOOLEAN DEFAULT TRUE;
