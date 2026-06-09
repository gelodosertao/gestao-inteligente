import { useEffect, useRef, useState } from 'react';
import { Map, AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Delivery, DepotSettings } from '../types';

interface IceRouteMapProps {
  depot: DepotSettings;
  deliveries: Delivery[];
  returnToDepot: boolean;
  onUpdateSegmentMetrics: (metrics: { [key: string]: { distance: string; duration: string } }) => void;
}

export default function IceRouteMap({
  depot,
  deliveries,
  returnToDepot,
  onUpdateSegmentMetrics,
}: IceRouteMapProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const [selectedPin, setSelectedPin] = useState<{
    type: 'depot' | 'delivery';
    data: any;
  } | null>(null);

  // NOTE: avoid referencing global `google` namespace (may be missing in TS types)
  const polylinesRef = useRef<any[]>([]);


  // Active stops: valid coordinates and NOT already delivered
  const activeStops = [...deliveries]
    .filter((d) => d.lat !== null && d.lng !== null && d.status !== 'delivered')
    .sort((a, b) => a.sequence - b.sequence);


  useEffect(() => {
    if (!routesLib || !map) return;

    // Clear previous polylines
    polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    polylinesRef.current = [];

    if (activeStops.length === 0) {
      // Just center on the depot
      map.setCenter({ lat: depot.lat, lng: depot.lng });
      map.setZoom(13);
      return;
    }

    const segmentsMetrics: { [key: string]: { distance: string; duration: string } } = {};
    const bounds = new (window as any).google.maps.LatLngBounds();

    bounds.extend({ lat: depot.lat, lng: depot.lng });
    activeStops.forEach((stop) => bounds.extend({ lat: stop.lat!, lng: stop.lng! }));

    // Helper to calculate segment route
    const computeSegment = async (
      segmentId: string,
      origin: any,

      destination: any,

      color: string
    ) => {
      try {
        const response = await routesLib.Route.computeRoutes({

          origin,
          destination,
          travelMode: 'DRIVING',
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        });

        if (response.routes?.[0]) {
          const route = response.routes[0];
          const polylines = route.createPolylines();
          
          polylines.forEach((p) => {
            // Customize polyline style
            p.setOptions({
              strokeColor: color,
              strokeOpacity: 0.8,
              strokeWeight: 5,
            });
            p.setMap(map);
          polylinesRef.current.push(p);

          });

          // Extract duration and distance
          const distanceKm = (route.distanceMeters ? route.distanceMeters / 1000 : 0).toFixed(1);
          const durationMins = route.durationMillis
            ? Math.round(parseInt(String(route.durationMillis)) / 60000)
            : 0;

          segmentsMetrics[segmentId] = {
            distance: `${distanceKm} km`,
            duration: `${durationMins} min`,
          };
        }
      } catch (err) {
        console.error(`Error computing route segment ${segmentId}:`, err);
        // Fallback straight line drawing in case of API limitations or offline issues
        const fallbackPoly = new (window as any).google.maps.Polyline({

          path: [origin, destination],
          strokeColor: '#9ca3af',
          strokeOpacity: 0.6,
          strokeWeight: 3,
          strokePattern: 'dash',
        } as any);
        fallbackPoly.setMap(map);
        polylinesRef.current.push(fallbackPoly);
      }
    };

    const runRouting = async () => {
      // 1. First segment: Depot to Stop 1
      await computeSegment(
        'depot-to-stop-1',
        { lat: depot.lat, lng: depot.lng },
        { lat: activeStops[0].lat!, lng: activeStops[0].lng! },
        '#2563eb' // Blue
      );

      // 2. Intermediate segments: Stop i to Stop i+1
      for (let i = 0; i < activeStops.length - 1; i++) {
        const fromStop = activeStops[i];
        const toStop = activeStops[i + 1];
        await computeSegment(
          `stop-${fromStop.id}-to-stop-${toStop.id}`,
          { lat: fromStop.lat!, lng: fromStop.lng! },
          { lat: toStop.lat!, lng: toStop.lng! },
          '#4f46e5' // Indigo
        );
      }

      // 3. Last segment return: Stop N back to Depot
      if (returnToDepot) {
        const lastStop = activeStops[activeStops.length - 1];
        await computeSegment(
          'last-stop-to-depot',
          { lat: lastStop.lat!, lng: lastStop.lng! },
          { lat: depot.lat, lng: depot.lng },
          '#6b7280' // Gray
        );
      }

      onUpdateSegmentMetrics(segmentsMetrics);
      map.fitBounds(bounds, {
        top: 60,
        right: 60,
        bottom: 60,
        left: 60,
      });
    };

    runRouting();

    return () => {
      polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    };
  }, [routesLib, map, depot, deliveries, returnToDepot]);

  return (
    <>
      {/* Depot Marker */}
      <AdvancedMarker
        position={{ lat: depot.lat, lng: depot.lng }}
        title={depot.name}
        onClick={() => setSelectedPin({ type: 'depot', data: depot })}
      >
        <Pin background="#e11d48" borderColor="#be123c" glyphColor="#ffffff" scale={1.2}>
          🧊
        </Pin>
      </AdvancedMarker>

      {/* Delivery Markers */}
      {deliveries
        .filter((d) => d.lat !== null && d.lng !== null)
        .map((delivery) => {
          const isDelivered = delivery.status === 'delivered';
          const isInTransit = delivery.status === 'in_transit';
          
          let bgcolor = '#2563eb'; // blue for pending
          let bordercolor = '#1d4ed8';
          let glyphText = String(delivery.sequence);

          if (isDelivered) {
            bgcolor = '#10b981'; // green for delivered
            bordercolor = '#047857';
            glyphText = '✓';
          } else if (isInTransit) {
            bgcolor = '#f59e0b'; // amber for in_transit
            bordercolor = '#d97706';
          }

          return (
            <AdvancedMarker
              key={delivery.id}
              position={{ lat: delivery.lat!, lng: delivery.lng! }}
              title={`${delivery.sequence}. ${delivery.clientName}`}
              onClick={() => setSelectedPin({ type: 'delivery', data: delivery })}
            >
              <Pin
                background={bgcolor}
                borderColor={bordercolor}
                glyph={glyphText}
                glyphColor="#ffffff"
                scale={1.1}
              />
            </AdvancedMarker>
          );
        })}

      {/* InfoWindow */}
      {selectedPin && (
        <InfoWindow
          position={
            selectedPin.type === 'depot'
              ? { lat: selectedPin.data.lat, lng: selectedPin.data.lng }
              : { lat: selectedPin.data.lat, lng: selectedPin.data.lng }
          }
          onCloseClick={() => setSelectedPin(null)}
        >
          <div className="p-1 max-w-64 font-sans text-slate-800">
            {selectedPin.type === 'depot' ? (
              <div>
                <span className="inline-block px-2 py-0.5 mb-1.5 text-xs font-semibold bg-rose-100 text-rose-800 rounded-full">
                  Fábrica de Gelo
                </span>
                <h4 className="font-bold text-sm text-slate-900 mb-1">{selectedPin.data.name}</h4>
                <p className="text-xs text-slate-500 leading-tight">{selectedPin.data.address}</p>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-blue-600">
                    Parada #{selectedPin.data.sequence}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${
                      selectedPin.data.status === 'delivered'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedPin.data.status === 'in_transit'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {selectedPin.data.status === 'delivered'
                      ? 'Entregue'
                      : selectedPin.data.status === 'in_transit'
                      ? 'A Caminho'
                      : 'Pendente'}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 mb-1 leading-tight">
                  {selectedPin.data.clientName}
                </h4>
                <p className="text-xs text-slate-500 mb-2 leading-tight">{selectedPin.data.address}</p>
                <div className="bg-slate-50 p-1.5 rounded border border-slate-100 mb-1 text-xs">
                  <span className="font-semibold block text-slate-600 text-[10px] uppercase tracking-wider">
                    Pedido:
                  </span>
                  <span className="text-slate-800 font-medium">{selectedPin.data.orderDetails}</span>
                </div>
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}
