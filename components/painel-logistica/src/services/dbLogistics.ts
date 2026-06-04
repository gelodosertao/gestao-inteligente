import { supabase, TENANT_ID } from './supabase';
import { Delivery, DepotSettings, RouteHistoryItem } from '../types';

// ============================================================
// Serviço de Persistência — Logística de Entregas (Supabase)
// ============================================================

/** Obtém o tenant_id ativo. Fallback para localStorage caso .env não esteja configurado. */
function getTenantId(): string {
  if (TENANT_ID) return TENANT_ID;
  // Tenta ler do sistema principal (se o usuário estiver logado lá)
  try {
    const stored = localStorage.getItem('app_user');
    if (stored) {
      const user = JSON.parse(stored);
      if (user?.tenantId) return user.tenantId;
    }
  } catch { /* ignore */ }
  return '';
}

/** Verifica se o Supabase está configurado e temos um tenant válido */
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const tid = getTenantId();
  return Boolean(url && key && tid);
}

// -----------------------------------------------------------
// ROTA ATIVA (a rota do dia, status = 'active')
// -----------------------------------------------------------

interface DbRoute {
  id: string;
  tenant_id: string;
  date: string | null;
  depot_name: string;
  depot_address: string;
  depot_lat: number;
  depot_lng: number;
  total_distance: string;
  total_duration: string;
  stop_count: number;
  status: string;
  created_at: string;
}

interface DbStop {
  id: string;
  route_id: string;
  tenant_id: string;
  client_name: string;
  address: string;
  city: string;
  order_details: string;
  lat: number | null;
  lng: number | null;
  status: string;
  sequence: number;
  created_at: string;
}

// --- Helpers para conversão DB ↔ App ---

function dbStopToDelivery(row: DbStop): Delivery {
  return {
    id: row.id,
    clientName: row.client_name,
    address: row.address,
    city: row.city,
    orderDetails: row.order_details,
    lat: row.lat,
    lng: row.lng,
    status: row.status as Delivery['status'],
    sequence: row.sequence,
  };
}

function dbRouteToHistoryItem(route: DbRoute, stops: DbStop[]): RouteHistoryItem {
  return {
    id: route.id,
    date: route.date || '',
    depot: {
      name: route.depot_name,
      address: route.depot_address,
      lat: route.depot_lat,
      lng: route.depot_lng,
    },
    deliveries: stops.map(dbStopToDelivery),
    totalDistance: route.total_distance,
    totalDuration: route.total_duration,
    stopCount: route.stop_count,
  };
}

// ============================================================
// CRUD PRINCIPAL
// ============================================================

export const dbLogistics = {

  // -----------------------------------------------------------
  // Carregar a rota ativa do dia
  // -----------------------------------------------------------
  async getActiveRoute(): Promise<{
    route: DbRoute | null;
    depot: DepotSettings | null;
    deliveries: Delivery[];
  }> {
    const tenantId = getTenantId();
    if (!tenantId) return { route: null, depot: null, deliveries: [] };

    // Buscar a rota ativa mais recente
    const { data: routes, error: routeError } = await supabase
      .from('delivery_routes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (routeError) {
      console.error('[IceRoute DB] Erro ao buscar rota ativa:', routeError);
      return { route: null, depot: null, deliveries: [] };
    }

    if (!routes || routes.length === 0) {
      return { route: null, depot: null, deliveries: [] };
    }

    const route = routes[0] as DbRoute;

    // Buscar as paradas dessa rota
    const { data: stops, error: stopsError } = await supabase
      .from('delivery_stops')
      .select('*')
      .eq('route_id', route.id)
      .order('sequence', { ascending: true });

    if (stopsError) {
      console.error('[IceRoute DB] Erro ao buscar paradas:', stopsError);
      return { route, depot: null, deliveries: [] };
    }

    const depot: DepotSettings = {
      name: route.depot_name,
      address: route.depot_address,
      lat: route.depot_lat,
      lng: route.depot_lng,
    };

    const deliveries = (stops || []).map(dbStopToDelivery);

    return { route, depot, deliveries };
  },

  // -----------------------------------------------------------
  // Salvar/Atualizar rota ativa completa (depot + paradas)
  // Upsert: se já existe uma rota ativa, atualiza. Senão, cria nova.
  // -----------------------------------------------------------
  async saveActiveRoute(
    depot: DepotSettings,
    deliveries: Delivery[],
    existingRouteId?: string
  ): Promise<string> {
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('Tenant ID não configurado');

    let routeId = existingRouteId;

    if (routeId) {
      // Atualizar rota existente
      const { error } = await supabase
        .from('delivery_routes')
        .update({
          depot_name: depot.name,
          depot_address: depot.address,
          depot_lat: depot.lat,
          depot_lng: depot.lng,
          stop_count: deliveries.length,
        })
        .eq('id', routeId);

      if (error) {
        console.error('[IceRoute DB] Erro ao atualizar rota:', error);
        throw error;
      }

      // Deletar paradas antigas e reinserir
      await supabase.from('delivery_stops').delete().eq('route_id', routeId);
    } else {
      // Criar nova rota
      const { data, error } = await supabase
        .from('delivery_routes')
        .insert([{
          tenant_id: tenantId,
          depot_name: depot.name,
          depot_address: depot.address,
          depot_lat: depot.lat,
          depot_lng: depot.lng,
          stop_count: deliveries.length,
          status: 'active',
        }])
        .select()
        .single();

      if (error || !data) {
        console.error('[IceRoute DB] Erro ao criar rota:', error);
        throw error || new Error('Falha ao criar rota');
      }

      routeId = data.id;
    }

    // Inserir paradas
    if (deliveries.length > 0) {
      const stopsToInsert = deliveries.map((d) => ({
        id: d.id.length > 20 ? d.id : undefined, // Only use UUID-style IDs, let DB generate otherwise
        route_id: routeId,
        tenant_id: tenantId,
        client_name: d.clientName,
        address: d.address,
        city: d.city,
        order_details: d.orderDetails,
        lat: d.lat,
        lng: d.lng,
        status: d.status,
        sequence: d.sequence,
      }));

      const { error: stopsError } = await supabase
        .from('delivery_stops')
        .insert(stopsToInsert);

      if (stopsError) {
        console.error('[IceRoute DB] Erro ao salvar paradas:', stopsError);
        throw stopsError;
      }
    }

    return routeId!;
  },

  // -----------------------------------------------------------
  // Atualizar status de uma parada individual
  // -----------------------------------------------------------
  async updateStopStatus(stopId: string, status: 'pending' | 'in_transit' | 'delivered'): Promise<void> {
    const { error } = await supabase
      .from('delivery_stops')
      .update({ status })
      .eq('id', stopId);

    if (error) {
      console.error('[IceRoute DB] Erro ao atualizar status da parada:', error);
      throw error;
    }
  },

  // -----------------------------------------------------------
  // Adicionar uma única parada a uma rota existente
  // -----------------------------------------------------------
  async addStop(routeId: string, delivery: Delivery): Promise<string> {
    const tenantId = getTenantId();
    if (!tenantId) throw new Error('Tenant ID não configurado');

    const { data, error } = await supabase
      .from('delivery_stops')
      .insert([{
        route_id: routeId,
        tenant_id: tenantId,
        client_name: delivery.clientName,
        address: delivery.address,
        city: delivery.city,
        order_details: delivery.orderDetails,
        lat: delivery.lat,
        lng: delivery.lng,
        status: delivery.status,
        sequence: delivery.sequence,
      }])
      .select()
      .single();

    if (error || !data) {
      console.error('[IceRoute DB] Erro ao adicionar parada:', error);
      throw error || new Error('Falha ao adicionar parada');
    }

    // Atualizar contagem
    await supabase
      .from('delivery_routes')
      .update({ stop_count: delivery.sequence })
      .eq('id', routeId);

    return data.id;
  },

  // -----------------------------------------------------------
  // Atualizar dados de uma parada (edição)
  // -----------------------------------------------------------
  async updateStop(stopId: string, data: Partial<Delivery>): Promise<void> {
    const updatePayload: Record<string, any> = {};
    if (data.clientName !== undefined) updatePayload.client_name = data.clientName;
    if (data.address !== undefined) updatePayload.address = data.address;
    if (data.city !== undefined) updatePayload.city = data.city;
    if (data.orderDetails !== undefined) updatePayload.order_details = data.orderDetails;
    if (data.lat !== undefined) updatePayload.lat = data.lat;
    if (data.lng !== undefined) updatePayload.lng = data.lng;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.sequence !== undefined) updatePayload.sequence = data.sequence;

    const { error } = await supabase
      .from('delivery_stops')
      .update(updatePayload)
      .eq('id', stopId);

    if (error) {
      console.error('[IceRoute DB] Erro ao atualizar parada:', error);
      throw error;
    }
  },

  // -----------------------------------------------------------
  // Deletar uma parada
  // -----------------------------------------------------------
  async deleteStop(stopId: string, routeId: string): Promise<void> {
    const { error } = await supabase
      .from('delivery_stops')
      .delete()
      .eq('id', stopId);

    if (error) {
      console.error('[IceRoute DB] Erro ao deletar parada:', error);
      throw error;
    }

    // Atualizar contagem da rota
    const { data: remaining } = await supabase
      .from('delivery_stops')
      .select('id')
      .eq('route_id', routeId);

    await supabase
      .from('delivery_routes')
      .update({ stop_count: remaining?.length || 0 })
      .eq('id', routeId);
  },

  // -----------------------------------------------------------
  // Reordenar paradas (atualizar sequence de todas)
  // -----------------------------------------------------------
  async reorderStops(deliveries: Delivery[]): Promise<void> {
    // Atualizar cada parada com sua nova sequence
    const updates = deliveries.map((d) =>
      supabase
        .from('delivery_stops')
        .update({ sequence: d.sequence })
        .eq('id', d.id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error('[IceRoute DB] Erro ao reordenar:', failed.error);
      throw failed.error;
    }
  },

  // -----------------------------------------------------------
  // Arquivar a rota ativa (mudar status e gravar métricas finais)
  // -----------------------------------------------------------
  async archiveRoute(
    routeId: string,
    dateLabel: string,
    totalDistance: string,
    totalDuration: string,
    stopCount: number
  ): Promise<void> {
    const { error } = await supabase
      .from('delivery_routes')
      .update({
        status: 'archived',
        date: dateLabel,
        total_distance: totalDistance,
        total_duration: totalDuration,
        stop_count: stopCount,
      })
      .eq('id', routeId);

    if (error) {
      console.error('[IceRoute DB] Erro ao arquivar rota:', error);
      throw error;
    }
  },

  // -----------------------------------------------------------
  // Listar histórico de rotas arquivadas
  // -----------------------------------------------------------
  async getArchivedRoutes(): Promise<RouteHistoryItem[]> {
    const tenantId = getTenantId();
    if (!tenantId) return [];

    const { data: routes, error } = await supabase
      .from('delivery_routes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[IceRoute DB] Erro ao buscar histórico:', error);
      return [];
    }

    if (!routes || routes.length === 0) return [];

    // Para cada rota arquivada, buscar suas paradas
    const items: RouteHistoryItem[] = [];
    for (const route of routes) {
      const { data: stops } = await supabase
        .from('delivery_stops')
        .select('*')
        .eq('route_id', route.id)
        .order('sequence', { ascending: true });

      items.push(dbRouteToHistoryItem(route as DbRoute, (stops || []) as DbStop[]));
    }

    return items;
  },

  // -----------------------------------------------------------
  // Deletar uma rota do histórico (cascade deleta paradas)
  // -----------------------------------------------------------
  async deleteRoute(routeId: string): Promise<void> {
    const { error } = await supabase
      .from('delivery_routes')
      .delete()
      .eq('id', routeId);

    if (error) {
      console.error('[IceRoute DB] Erro ao deletar rota:', error);
      throw error;
    }
  },

  // -----------------------------------------------------------
  // Limpar todo o histórico de um tenant
  // -----------------------------------------------------------
  async clearHistory(): Promise<void> {
    const tenantId = getTenantId();
    if (!tenantId) return;

    const { error } = await supabase
      .from('delivery_routes')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('status', 'archived');

    if (error) {
      console.error('[IceRoute DB] Erro ao limpar histórico:', error);
      throw error;
    }
  },

  // -----------------------------------------------------------
  // Atualizar configuração do depósito na rota ativa
  // -----------------------------------------------------------
  async updateDepot(routeId: string, depot: DepotSettings): Promise<void> {
    const { error } = await supabase
      .from('delivery_routes')
      .update({
        depot_name: depot.name,
        depot_address: depot.address,
        depot_lat: depot.lat,
        depot_lng: depot.lng,
      })
      .eq('id', routeId);

    if (error) {
      console.error('[IceRoute DB] Erro ao atualizar depósito:', error);
      throw error;
    }
  },
};
