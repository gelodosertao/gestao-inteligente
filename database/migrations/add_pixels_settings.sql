-- Add pixel columns to store_settings table
ALTER TABLE store_settings 
ADD COLUMN IF NOT EXISTS facebook_pixel_id TEXT,
ADD COLUMN IF NOT EXISTS google_tag_id TEXT;
