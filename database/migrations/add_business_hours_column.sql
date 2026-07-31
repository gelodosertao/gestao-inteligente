-- Adicionar coluna de horários estruturados na tabela store_settings
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS business_hours JSONB;

-- Comentário para o desenvolvedor
COMMENT ON COLUMN store_settings.business_hours IS 'Horários de funcionamento estruturados por dia da semana (JSONB)';
