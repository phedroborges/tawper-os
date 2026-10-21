/** Coordenadas aproximadas do centro das cidades usadas na demo (WGS84). */

export type LatLng = { lat: number; lng: number };

const CITY_COORDS: Record<string, LatLng> = {
  "novo horizonte|sp": { lat: -21.4681, lng: -49.2236 },
  "olimpia|sp": { lat: -20.7372, lng: -48.9106 },
  "guaraci|sp": { lat: -20.4978, lng: -48.9419 },
  "severinia|sp": { lat: -20.8083, lng: -48.8056 },
  "martinopolis|sp": { lat: -22.1461, lng: -51.1708 },
  "assis|sp": { lat: -22.6619, lng: -50.4119 },
  "rio brilhante|ms": { lat: -21.8031, lng: -54.5428 },
  "candido mota|sp": { lat: -22.7464, lng: -50.3875 },
  "frutal|mg": { lat: -20.0242, lng: -48.9411 },
  "quirinopolis|go": { lat: -18.4478, lng: -50.4547 },
  "mineiros|go": { lat: -17.5694, lng: -52.5511 },
  "rio verde|go": { lat: -17.7922, lng: -50.9192 },
  "goiania|go": { lat: -16.6869, lng: -49.2648 },
  "anapolis|go": { lat: -16.3281, lng: -48.9531 },
  "catanduva|sp": { lat: -21.1378, lng: -48.9728 },
  "bebedouro|sp": { lat: -20.9494, lng: -48.4792 },
  "paraguacu paulista|sp": { lat: -22.4111, lng: -50.5756 },
  "jatai|go": { lat: -17.8808, lng: -51.7219 },
  "votuporanga|sp": { lat: -20.4228, lng: -49.9728 },
  "iturama|mg": { lat: -19.7278, lng: -50.1956 },
  "monte aprazivel|sp": { lat: -20.7725, lng: -49.7142 },
  "nova andradina|ms": { lat: -22.2328, lng: -53.3428 },
  "ourinhos|sp": { lat: -22.9789, lng: -49.8706 },
  "uberaba|mg": { lat: -19.7475, lng: -47.9319 },
  "pereira barreto|sp": { lat: -20.6383, lng: -51.1092 },
  "presidente venceslau|sp": { lat: -21.8756, lng: -51.8439 },
  "navirai|ms": { lat: -23.065, lng: -54.1906 },
  "sao paulo|sp": { lat: -23.5505, lng: -46.6333 },
  "sao jose do rio preto|sp": { lat: -20.8113, lng: -49.3758 },
};

function normalizeCityKey(cidade: string, uf: string) {
  return `${cidade
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")}|${uf.toLowerCase().trim()}`;
}

export function isValidLatLng(pos?: Partial<LatLng> | null): pos is LatLng {
  if (!pos) return false;
  const { lat, lng } = pos;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return true;
}

/**
 * Centro geométrico do Brasil. O Geocoding devolve esse ponto com status OK
 * quando o CEP não casa e o resultado é só o país.
 */
export function isCountryCentroid(lat: number, lng: number) {
  return Math.abs(lat + 14.235004) < 0.02 && Math.abs(lng + 51.92528) < 0.02;
}

const LOCAL_GEOCODE_TYPES = new Set([
  "street_address",
  "premise",
  "subpremise",
  "route",
  "intersection",
  "postal_code",
  "neighborhood",
  "sublocality",
  "sublocality_level_1",
  "locality",
  "administrative_area_level_2",
]);

/** Aceita rua, CEP ou cidade. Recusa o país inteiro e o centro do Brasil. */
export function isLocalGeocodeHit(hit: { lat: number; lng: number; types?: string[] }) {
  if (!isValidLatLng(hit) || isCountryCentroid(hit.lat, hit.lng)) return false;
  if (!hit.types?.length) return true;
  return hit.types.some((type) => LOCAL_GEOCODE_TYPES.has(type));
}

export function coordsForCity(cidade?: string, uf?: string): LatLng | undefined {
  if (!cidade || !uf) return undefined;
  return CITY_COORDS[normalizeCityKey(cidade, uf)];
}

export function companyLatLng(c: {
  latitude?: number | null;
  longitude?: number | null;
  cidade?: string;
  uf?: string;
}): LatLng | undefined {
  const lat = typeof c.latitude === "number" ? c.latitude : Number(c.latitude);
  const lng = typeof c.longitude === "number" ? c.longitude : Number(c.longitude);
  if (isValidLatLng({ lat, lng }) && !isCountryCentroid(lat, lng)) {
    return { lat, lng };
  }
  return coordsForCity(c.cidade, c.uf);
}

/** Distância em linha reta (metros). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimativa de km de carro quando o Directions API não responde.
 * Fator 1.35 sobre a linha reta (estradas BR costumam alongar ~30–40%).
 */
export function estimateRoadKm(points: LatLng[]): number {
  if (points.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += haversineMeters(points[i - 1]!, points[i]!);
  }
  return Math.max(1, Math.round((meters / 1000) * 1.35));
}

export function formatKm(meters: number) {
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function metersToKmRounded(meters: number) {
  return Math.max(1, Math.round(meters / 1000));
}

function mapsCoord(p: LatLng) {
  return `${p.lat},${p.lng}`;
}

/** Abre navegação no Google Maps até um destino (usa a localização atual do aparelho como origem). */
export function googleMapsNavigateUrl(destination: LatLng): string {
  const params = new URLSearchParams({
    api: "1",
    destination: mapsCoord(destination),
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Rota multi-parada no Google Maps.
 * Origem = localização atual; destino = última parada; intermediárias = waypoints.
 */
export function googleMapsRouteUrl(stops: LatLng[]): string | null {
  const pts = stops.filter(isValidLatLng);
  if (pts.length === 0) return null;
  if (pts.length === 1) return googleMapsNavigateUrl(pts[0]!);

  const destination = pts[pts.length - 1]!;
  const waypoints = pts.slice(0, -1);
  const params = new URLSearchParams({
    api: "1",
    destination: mapsCoord(destination),
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    // Google aceita no máx. ~10 waypoints nesta URL; mantemos todos e o app corta se precisar.
    params.set("waypoints", waypoints.map(mapsCoord).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function openGoogleMapsNavigation(destination: LatLng) {
  window.open(googleMapsNavigateUrl(destination), "_blank", "noopener,noreferrer");
}

export function openGoogleMapsRoute(stops: LatLng[]) {
  const url = googleMapsRouteUrl(stops);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
