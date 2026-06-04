import { Delivery, DepotSettings } from '../types';

// Calculates distance in meters between two coordinates using Haversine formula
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth radius in meters
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(r1) * Math.cos(r2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Solves TSP using Nearest Neighbor + 2-Opt heuristic
export function optimizeRouteSequence(
  depot: DepotSettings,
  deliveries: Delivery[]
): Delivery[] {
  const geocodedDeliveries = deliveries.filter((d) => d.lat !== null && d.lng !== null);
  const ungeocodedDeliveries = deliveries.filter((d) => d.lat === null || d.lng === null);

  if (geocodedDeliveries.length === 0) return deliveries;

  // 1. Nearest Neighbor constructive heuristic
  const tour: Delivery[] = [];
  const unvisited = [...geocodedDeliveries];
  let currentLat = depot.lat;
  let currentLng = depot.lng;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = calculateDistance(
        currentLat,
        currentLng,
        unvisited[i].lat!,
        unvisited[i].lng!
      );
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }

    const nextStop = unvisited.splice(nearestIndex, 1)[0];
    tour.push(nextStop);
    currentLat = nextStop.lat!;
    currentLng = nextStop.lng!;
  }

  // 2. 2-Opt refinement local search (simple swap optimization for up to 100 markers)
  let improved = true;
  const n = tour.length;
  let iterations = 0;
  const maxIterations = 200; // avoid infinite loop

  const totalTourDistance = (route: Delivery[]): number => {
    let dist = 0;
    let currLat = depot.lat;
    let currLng = depot.lng;
    for (const stop of route) {
      dist += calculateDistance(currLat, currLng, stop.lat!, stop.lng!);
      currLat = stop.lat!;
      currLng = stop.lng!;
    }
    return dist;
  };

  let bestRoute = [...tour];
  let bestDistance = totalTourDistance(bestRoute);

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Reverse segment from i to j
        const newRoute = [...bestRoute];
        const segment = newRoute.slice(i, j + 1).reverse();
        newRoute.splice(i, j - i + 1, ...segment);

        const newDistance = totalTourDistance(newRoute);
        if (newDistance < bestDistance) {
          bestRoute = newRoute;
          bestDistance = newDistance;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  // 3. Re-assign sequences (starting from 1. Zero index is depot in our UI)
  const sortedGeocoded = bestRoute.map((delivery, index) => ({
    ...delivery,
    sequence: index + 1,
  }));

  // Append any ungeocoded items to the end with progressive sequences
  const sortedUngeocoded = ungeocodedDeliveries.map((delivery, index) => ({
    ...delivery,
    sequence: sortedGeocoded.length + index + 1,
  }));

  return [...sortedGeocoded, ...sortedUngeocoded];
}

// Generates an interactive multi-stop Google Maps URL
export function generateGoogleMapsNavigationUrl(
  depot: DepotSettings,
  deliveries: Delivery[]
): string {
  const activeDeliveries = deliveries
    .filter((d) => d.lat !== null && d.lng !== null && d.status !== 'delivered')
    .sort((a, b) => a.sequence - b.sequence);

  if (activeDeliveries.length === 0) {
    // Fallback to depot
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(depot.address)}`;
  }

  const origin = `${depot.lat},${depot.lng}`;
  // Destination is the final stop
  const lastStop = activeDeliveries[activeDeliveries.length - 1];
  const destination = `${lastStop.lat},${lastStop.lng}`;

  // Intermediate waypoints are all active stops except the last one
  const waypointList = activeDeliveries.slice(0, -1);
  const waypoints = waypointList
    .map((w) => `${w.lat},${w.lng}`)
    .join('|');

  const encodedWaypoints = encodeURIComponent(waypoints);
  const encodedOrigin = encodeURIComponent(origin);
  const encodedDestination = encodeURIComponent(destination);

  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedDestination}`;
  if (waypoints) {
    url += `&waypoints=${encodedWaypoints}`;
  }
  url += `&travelmode=driving`;

  return url;
}
