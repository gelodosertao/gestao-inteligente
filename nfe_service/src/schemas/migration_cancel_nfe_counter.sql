-- ============================================================
-- Migration: Criar função de rollback do contador NF-e
-- ============================================================
-- Executar após aplicar o migration_nfe_counters.sql
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_nfe_counter(p_series integer DEFAULT 1)
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_val integer;
BEGIN
  UPDATE nfe_counters
  SET last_nnf = GREATEST(last_nnf - 1, 0)
  WHERE series = p_series
  RETURNING last_nnf INTO new_val;

  IF NOT FOUND THEN
    INSERT INTO nfe_counters (series, last_nnf) VALUES (p_series, 0)
    RETURNING last_nnf INTO new_val;
  END IF;

  RETURN new_val;
END;
$$;
