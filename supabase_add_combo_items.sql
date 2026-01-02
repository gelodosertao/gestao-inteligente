-- Add combo_items column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS combo_items JSONB;
