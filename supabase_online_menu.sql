-- Add image column to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;

-- Create store_settings table
CREATE TABLE IF NOT EXISTS store_settings (
  id TEXT PRIMARY KEY,
  store_name TEXT,
  phone TEXT,
  address TEXT,
  cover_image TEXT,
  logo_image TEXT,
  opening_hours TEXT,
  primary_color TEXT
);

-- Insert default settings if not exists
INSERT INTO store_settings (id, store_name, phone, address, opening_hours, primary_color)
VALUES ('default', 'Gelo do Sertão', '5577998129383', 'Rua Principal, 123', 'Seg-Sex: 08:00 - 18:00', '#2563eb')
ON CONFLICT (id) DO NOTHING;
