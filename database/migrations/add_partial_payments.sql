-- Add columns for partial payments tracking
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_history jsonb DEFAULT '[]'::jsonb;
