"use client";

import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  useApiIsLoaded,
  useMap,
  useMapsLibrary,
  useMarkerRef,
} from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  companyLatLng,
  formatDuration,
  formatKm,
  googleMapsNavigateUrl,
  isValidLatLng,
  metersToKmRounded,
  type LatLng,
} from "@/lib/geo";
import { cn } from "@/lib/utils";

type MapPoint = {
  id: string;
  pos: LatLng;
  nome: string;
  cidade?: string;
  uf?: string;
};

export type RouteMapStop = {
  id: string;
  nome: string;
  cidade?: string;
  uf?: string;
  latitude?: number;
  longitude?: number;
};

export type DrivingRouteSummary = {
  distanceMeters: number;
  durationSeconds: number;
  distanceKm: number;
  distanceText: string;
  durationText: string;
  /** Ordem otimizada dos ids (quando optimizeWaypoints=true). */
  orderedIds: string[];
};

type Props = {
  stops: RouteMapStop[];
  /** Destaca a sequência da rota (ids na ordem). Sem isso, só mostra pins dos candidatos. */
  orderedIds?: string[] | null;
  className?: string;
  height?: number;
  onRouteComputed?: (summary: DrivingRouteSummary | null) => void;
  optimizeWaypoints?: boolean;
};

const API_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
/** String vazia no .env NÃO pode virar mapId — Advanced Marker quebra o mapa. */
const MAP_ID = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "").trim() || "DEMO_MAP_ID";

function stopPosition(stop: RouteMapStop): LatLng | undefined {
  return companyLatLng(stop);
}

function labelFor(n?: number) {
  if (!n) return undefined;
  return {
    text: String(n),
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "700",
  };
}

function DirectionsLayer({
  points,
  orderedIds,
  optimizeWaypoints,
  onRouteComputed,
}: {
  points: { id: string; pos: LatLng; nome: string }[];
  orderedIds?: string[] | null;
  optimizeWaypoints: boolean;
  onRouteComputed?: (summary: DrivingRouteSummary | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const [renderer, setRenderer] = useState<google.maps.DirectionsRenderer | null>(null);
  const onComputedRef = useRef(onRouteComputed);
  onComputedRef.current = onRouteComputed;

  const sequence = useMemo(() => {
    if (!orderedIds?.length) return [];
    return orderedIds
      .map((id) => points.find((p) => p.id === id))
      .filter((p): p is { id: string; pos: LatLng; nome: string } => !!p);
  }, [orderedIds, points]);

  const sequenceKey = sequence.map((s) => `${s.id}:${s.pos.lat},${s.pos.lng}`).join("|");

  useEffect(() => {
    if (!routesLib || !map) return;
    const next = new routesLib.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#123a7b",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      },
    });
    setRenderer(next);
    return () => {
      next.setMap(null);
    };
  }, [routesLib, map]);

  useEffect(() => {
    if (!routesLib || !renderer) return;
    if (sequence.length < 2) {
      renderer.set("directions", null);
      onComputedRef.current?.(null);
      return;
    }

    const service = new routesLib.DirectionsService();
    const origin = sequence[0]!.pos;
    const destination = sequence[sequence.length - 1]!.pos;
    const waypoints = sequence.slice(1, -1).map((s) => ({
      location: s.pos,
      stopover: true,
    }));

    let cancelled = false;
    void service
      .route({
        origin,
        destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: optimizeWaypoints && waypoints.length > 0,
        provideRouteAlternatives: false,
      })
      .then((result) => {
        if (cancelled) return;
        renderer.setDirections(result);
        const route = result.routes[0];
        if (!route) {
          onComputedRef.current?.(null);
          return;
        }
        const distanceMeters = route.legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
        const durationSeconds = route.legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
        // Descarta resultado absurdo (ex.: API devolveu só trecho local com pins faltando).
        if (distanceMeters <= 0) {
          onComputedRef.current?.(null);
          return;
        }
        const waypointOrder = route.waypoint_order ?? [];
        let ordered = sequence.map((s) => s.id);
        if (optimizeWaypoints && waypoints.length > 0 && waypointOrder.length > 0) {
          const middle = waypointOrder.map((i) => sequence[i + 1]!.id);
          ordered = [sequence[0]!.id, ...middle, sequence[sequence.length - 1]!.id];
        }
        onComputedRef.current?.({
          distanceMeters,
          durationSeconds,
          distanceKm: metersToKmRounded(distanceMeters),
          distanceText: formatKm(distanceMeters),
          durationText: formatDuration(durationSeconds),
          orderedIds: ordered,
        });
      })
      .catch((err) => {
        console.warn("[RouteMap] Directions falhou — usando estimativa por cidade", err);
        if (!cancelled) {
          renderer.set("directions", null);
          onComputedRef.current?.(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesLib, renderer, sequenceKey, optimizeWaypoints]);

  return null;
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]!);
      map.setZoom(11);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [map, points]);
  return null;
}

/** Resolve cidades sem lat/lng via Geocoding do Google (cache em memória). */
function useResolvedPoints(stops: RouteMapStop[]) {
  const geocodeLib = useMapsLibrary("geocoding");
  const ready = useApiIsLoaded();
  const [resolved, setResolved] = useState<MapPoint[]>([]);
  const cacheRef = useRef(new globalThis.Map<string, LatLng>());
  const stopsKey = stops
    .map((s) => `${s.id}:${s.latitude ?? ""}:${s.longitude ?? ""}:${s.cidade ?? ""}:${s.uf ?? ""}`)
    .join("|");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const metaOf = (s: RouteMapStop) => ({ id: s.id, nome: s.nome, cidade: s.cidade, uf: s.uf });

    // 1) Pontos já conhecidos (lat/lng ou cidade no mapa local) — publica na hora.
    const known: MapPoint[] = [];
    const missing: RouteMapStop[] = [];
    for (const s of stops) {
      const pos = stopPosition(s);
      if (pos && isValidLatLng(pos)) {
        known.push({ ...metaOf(s), pos });
      } else {
        missing.push(s);
      }
    }
    setResolved(known);

    if (missing.length === 0) return;

    void (async () => {
      const geocoder = geocodeLib ? new geocodeLib.Geocoder() : null;
      if (!geocoder) return;
      const extra: MapPoint[] = [];

      for (const s of missing) {
        if (!s.cidade || !s.uf) continue;
        const key = `${s.cidade}|${s.uf}`.toLowerCase();
        const cached = cacheRef.current.get(key);
        if (cached) {
          extra.push({ ...metaOf(s), pos: cached });
          continue;
        }
        try {
          const result = await geocoder.geocode({ address: `${s.cidade}, ${s.uf}, Brasil` });
          const loc = result.results[0]?.geometry?.location;
          if (!loc) continue;
          const pos = { lat: loc.lat(), lng: loc.lng() };
          if (!isValidLatLng(pos)) continue;
          cacheRef.current.set(key, pos);
          extra.push({ ...metaOf(s), pos });
        } catch {
          /* cidade não encontrada / Geocoding API */
        }
      }

      if (!cancelled && extra.length > 0) {
        setResolved([...known, ...extra]);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopsKey captura mudanças relevantes
  }, [stopsKey, geocodeLib, ready]);

  return resolved;
}

function CompanyMarker({
  point,
  order,
  selected,
  onSelect,
}: {
  point: MapPoint;
  order?: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const [markerRef, marker] = useMarkerRef();
  const place = [point.cidade, point.uf].filter(Boolean).join("/");

  return (
    <>
      <Marker
        ref={markerRef}
        position={point.pos}
        title={point.nome}
        label={labelFor(order)}
        onClick={() => onSelect(selected ? null : point.id)}
      />
      {selected && marker && (
        <InfoWindow
          anchor={marker}
          onCloseClick={() => onSelect(null)}
          headerDisabled
        >
          <div style={{ minWidth: 160, maxWidth: 240, padding: "2px 0" }}>
            {order ? (
              <div style={{ fontSize: 11, color: "#6b7c93", marginBottom: 2 }}>Parada {order}</div>
            ) : null}
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0b244a", lineHeight: 1.3 }}>{point.nome}</div>
            {place ? <div style={{ fontSize: 12, color: "#5a6a7e", marginTop: 2 }}>{place}</div> : null}
            <a
              href={googleMapsNavigateUrl(point.pos)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                color: "#123a7b",
                textDecoration: "none",
              }}
            >
              Navegar no Google Maps →
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function InnerMap({ stops, orderedIds, height, onRouteComputed, optimizeWaypoints }: Omit<Props, "className">) {
  const points = useResolvedPoints(stops);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const center = points[0]?.pos ?? { lat: -16.7, lng: -49.3 };
  const orderIndex = useMemo(() => {
    const index = new globalThis.Map<string, number>();
    orderedIds?.forEach((id, i) => index.set(id, i + 1));
    return index;
  }, [orderedIds]);

  useEffect(() => {
    setSelectedId(null);
  }, [stops, orderedIds]);

  return (
    <Map
      defaultCenter={center}
      defaultZoom={points.length ? 9 : 5}
      mapId={MAP_ID}
      gestureHandling="greedy"
      disableDefaultUI={false}
      style={{ width: "100%", height: "100%", minHeight: height }}
      className="h-full w-full"
      onClick={() => setSelectedId(null)}
    >
      {points.length > 0 && <FitBounds points={points.map((p) => p.pos)} />}
      {orderedIds && orderedIds.length >= 2 && (
        <DirectionsLayer
          points={points}
          orderedIds={orderedIds}
          optimizeWaypoints={!!optimizeWaypoints}
          onRouteComputed={onRouteComputed}
        />
      )}
      {points.map((p) => (
        <CompanyMarker
          key={p.id}
          point={p}
          order={orderIndex.get(p.id)}
          selected={selectedId === p.id}
          onSelect={setSelectedId}
        />
      ))}
    </Map>
  );
}

function MapLoadError({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center bg-soft/50 px-4 text-center text-[12.5px] text-muted">
      {message}
    </div>
  );
}

export function RouteMap({
  stops,
  orderedIds,
  className,
  height = 320,
  onRouteComputed,
  optimizeWaypoints = true,
}: Props) {
  const [authError, setAuthError] = useState<string | null>(null);

  if (!API_KEY) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-line bg-soft/60 px-4 text-center",
          className,
        )}
        style={{ height }}
      >
        <div className="text-[13px] font-medium text-ink">Google Maps não configurado</div>
        <div className="max-w-sm text-[12px] text-muted">
          Defina <code className="text-[11px]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> no ambiente de{" "}
          <strong>build</strong> (EasyPanel / Docker ARG) e faça rebuild. Em local use{" "}
          <code className="text-[11px]">.env.local</code>. Ative Maps JavaScript + Directions + Geocoding.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[8px] border border-line bg-soft/30", className)} style={{ height }}>
      {authError ? (
        <MapLoadError message={authError} />
      ) : (
        <APIProvider
          apiKey={API_KEY}
          libraries={["routes", "geocoding"]}
          onError={() =>
            setAuthError(
              "Falha ao carregar o Google Maps. Confira a chave, faturamento e se Maps JavaScript, Directions e Geocoding estão ativas.",
            )
          }
        >
          <InnerMap
            stops={stops}
            orderedIds={orderedIds}
            height={height}
            onRouteComputed={onRouteComputed}
            optimizeWaypoints={optimizeWaypoints}
          />
        </APIProvider>
      )}
      {stops.length === 0 && !authError && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[1] -translate-x-1/2 rounded-[6px] bg-white/95 px-3 py-1.5 text-[12px] text-muted shadow-sm">
          Selecione contas na lista para plotar no mapa
        </div>
      )}
    </div>
  );
}
