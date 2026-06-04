export interface Delivery {
  id: string;
  clientName: string;
  address: string;
  city: string;
  orderDetails: string; // e.g., "10 sacos de Gelo em Cubo (5kg)"
  lat: number | null;
  lng: number | null;
  status: 'pending' | 'in_transit' | 'delivered';
  sequence: number; // Order of delivery
  distanceFromPrevious?: string; // e.g., "4.2 km"
  durationFromPrevious?: string; // e.g., "12 min"
}

export interface DepotSettings {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Route {
  id: string;
  date: string;
}

export interface RouteHistoryItem {
  id: string;
  date: string; // ISO or human-readable (e.g. "04/06/2026")
  depot: DepotSettings;
  deliveries: Delivery[];
  totalDistance: string;
  totalDuration: string;
  stopCount: number;
}
