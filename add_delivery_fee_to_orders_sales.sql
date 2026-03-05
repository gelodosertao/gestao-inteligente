-- Add delivery_fee column to orders and sales tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
