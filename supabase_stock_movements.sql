-- Create table for Stock Movements (Losses, Adjustments, Transfers)
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'LOSS', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN'
  reason TEXT,
  branch TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
