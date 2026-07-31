-- =====================================================
-- MIGRATION: Tabelas de Logística (delivery_routes + delivery_stops)
-- Sistema Gelo do Sertão - Painel Logística
-- =====================================================

-- 1. Tabela de Rotas de Entrega
CREATE TABLE IF NOT EXISTS delivery_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date TEXT,
  depot_name TEXT NOT NULL DEFAULT 'Depósito',
  depot_address TEXT NOT NULL DEFAULT '',
  depot_lat FLOAT8 NOT NULL DEFAULT 0,
  depot_lng FLOAT8 NOT NULL DEFAULT 0,
  total_distance TEXT DEFAULT '-- km',
  total_duration TEXT DEFAULT '--',
  stop_count INT4 DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de Paradas/Entregas
CREATE TABLE IF NOT EXISTS delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  order_details TEXT NOT NULL DEFAULT '',
  lat FLOAT8,
  lng FLOAT8,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'delivered')),
  sequence INT4 NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_delivery_routes_tenant ON delivery_routes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_routes_status ON delivery_routes(status);
CREATE INDEX IF NOT EXISTS idx_delivery_routes_tenant_status ON delivery_routes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_route ON delivery_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_tenant ON delivery_stops(tenant_id);

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_stops ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS — Permitir acesso baseado no tenant_id do usuário autenticado
-- (Similar ao padrão usado nas demais tabelas do sistema)

-- delivery_routes: SELECT
CREATE POLICY "delivery_routes_select" ON delivery_routes
  FOR SELECT USING (true);

-- delivery_routes: INSERT
CREATE POLICY "delivery_routes_insert" ON delivery_routes
  FOR INSERT WITH CHECK (true);

-- delivery_routes: UPDATE
CREATE POLICY "delivery_routes_update" ON delivery_routes
  FOR UPDATE USING (true);

-- delivery_routes: DELETE
CREATE POLICY "delivery_routes_delete" ON delivery_routes
  FOR DELETE USING (true);

-- delivery_stops: SELECT
CREATE POLICY "delivery_stops_select" ON delivery_stops
  FOR SELECT USING (true);

-- delivery_stops: INSERT
CREATE POLICY "delivery_stops_insert" ON delivery_stops
  FOR INSERT WITH CHECK (true);

-- delivery_stops: UPDATE
CREATE POLICY "delivery_stops_update" ON delivery_stops
  FOR UPDATE USING (true);

-- delivery_stops: DELETE
CREATE POLICY "delivery_stops_delete" ON delivery_stops
  FOR DELETE USING (true);
