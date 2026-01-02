-- Execute estes comandos no Editor SQL do seu projeto Supabase para adicionar os campos de Fardo

ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_pack numeric;
