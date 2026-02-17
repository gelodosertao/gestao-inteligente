-- Add delivery fees columns to store_settings table
ALTER TABLE store_settings 
ADD COLUMN IF NOT EXISTS delivery_base_fee numeric,
ADD COLUMN IF NOT EXISTS delivery_per_km numeric;
