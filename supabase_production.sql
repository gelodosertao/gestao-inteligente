-- Tabela de Produção
CREATE TABLE IF NOT EXISTS production_logs (
  id TEXT PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  product_id TEXT REFERENCES products(id),
  product_name TEXT,
  quantity NUMERIC,
  shift TEXT,
  responsible TEXT,
  notes TEXT
);

-- Habilitar RLS (opcional, mas recomendado)
ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso (Simples para começar)
CREATE POLICY "Enable read access for all users" ON production_logs FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON production_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON production_logs FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON production_logs FOR DELETE USING (true);
