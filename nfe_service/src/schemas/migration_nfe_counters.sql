-- ============================================================
-- Migration: Criar contador sequencial para numeração NF-e
-- ============================================================
-- Instruções:
--   1. Acesse https://supabase.com/dashboard/project/licetziylggxtnoutjkn/sql/new
--   2. Cole e execute este SQL
--   3. Verifique: SELECT * FROM nfe_counters;
-- ============================================================

-- 1. Criar tabela de contadores (uma linha por série)
CREATE TABLE IF NOT EXISTS nfe_counters (
  series integer PRIMARY KEY DEFAULT 1,
  last_nnf integer NOT NULL DEFAULT 0
);

-- 2. Remover RLS padrão da tabela (a função SECURITY DEFINER gerencia)
ALTER TABLE nfe_counters DISABLE ROW LEVEL SECURITY;

-- 3. Criar função atômica para incrementar o contador
--    SECURITY DEFINER = roda como dono da tabela, sem RLS
--    segura contra race conditions em requisições concorrentes
CREATE OR REPLACE FUNCTION increment_nfe_counter(p_series integer DEFAULT 1)
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  next_val integer;
BEGIN
  INSERT INTO nfe_counters (series, last_nnf)
  VALUES (p_series, 1)
  ON CONFLICT (series) DO UPDATE SET last_nnf = nfe_counters.last_nnf + 1
  RETURNING last_nnf INTO next_val;
  RETURN next_val;
END;
$$;

-- 4. Inserir registro inicial para série 1 (se não existir)
INSERT INTO nfe_counters (series, last_nnf)
VALUES (1, 0)
ON CONFLICT (series) DO NOTHING;

-- 5. Testar: executar 3x e ver os números incrementarem
-- SELECT increment_nfe_counter(1); -- 1
-- SELECT increment_nfe_counter(1); -- 2
-- SELECT increment_nfe_counter(1); -- 3
