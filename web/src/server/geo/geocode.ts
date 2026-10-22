"use server";

import { normalizeCEP } from "@/lib/cep";
import { coordsForCity, isLocalGeocodeHit } from "@/lib/geo";

export type GeocodeResult = { lat: number; lng: number; formatted?: string; source: "google" | "nominatim" | "cidade" };
export type GeocodeFailure = { ok: false; reason: string };
export type GeocodeSuccess = { ok: true } & GeocodeResult;

async function googleGeocode(query: string, key: string): Promise<GeocodeSuccess | GeocodeFailure> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("region", "br");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return { ok: false, reason: `Google HTTP ${res.status}` };
  const body = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: {
      types?: string[];
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
    }[];
  };

  const hit = (body.results ?? []).find((result) => {
    const loc = result.geometry?.location;
    return !!loc && isLocalGeocodeHit({ lat: loc.lat, lng: loc.lng, types: result.types });
  });
  if (body.status === "OK" && hit?.geometry?.location) {
    const loc = hit.geometry.location;
    return { ok: true, lat: loc.lat, lng: loc.lng, formatted: hit.formatted_address, source: "google" };
  }
  if (body.status === "OK") {
    return { ok: false, reason: "Google devolveu só o país, sem a cidade." };
  }

  if (body.status === "REQUEST_DENIED") {
    return {
      ok: false,
      reason:
        body.error_message?.includes("not activated")
          ? "Geocoding API não está ATIVADA no projeto (Biblioteca de APIs → Ativar). Restringir a chave não basta."
          : body.error_message || "Google negou a chave (REQUEST_DENIED).",
    };
  }
  if (body.status === "ZERO_RESULTS") return { ok: false, reason: "Google não achou esse endereço." };
  return { ok: false, reason: `Google: ${body.status}${body.error_message ? ` — ${body.error_message}` : ""}` };
}

/** Fallback gratuito (OpenStreetMap) enquanto o Geocoding do Google não está ativo. */
async function nominatimGeocode(query: string): Promise<GeocodeSuccess | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { "User-Agent": "TawperOS/1.0 (rotas comerciais)" },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
    const hit = rows[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!isLocalGeocodeHit({ lat, lng })) return null;
    return {
      ok: true,
      lat,
      lng,
      formatted: hit.display_name,
      source: "nominatim",
    };
  } catch {
    return null;
  }
}

/**
 * Geocodifica CEP/endereço. Ordem: Google → Nominatim → centro da cidade (seed).
 */
export async function geocodeCepOrAddress(input: {
  cep?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
}): Promise<GeocodeSuccess | GeocodeFailure> {
  const key = (
    process.env.GOOGLE_GEOCODING_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_MAPS_API_KEY ??
    ""
  ).trim();

  const cep = normalizeCEP(input.cep);
  const cepLabel = cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : "";
  const queries = [
    ...new Set(
      [
        [cepLabel, input.cidade, input.uf, "Brasil"].filter(Boolean).join(", "),
        [input.endereco, input.cidade, input.uf, "Brasil"].filter(Boolean).join(", "),
        [input.cidade, input.uf, "Brasil"].filter(Boolean).join(", "),
        cepLabel ? `${cepLabel}, Brasil` : "",
      ].filter(Boolean),
    ),
  ];

  let lastGoogleError = "";
  if (key) {
    for (const q of queries) {
      const google = await googleGeocode(q, key);
      if (google.ok) return google;
      lastGoogleError = google.reason;
    }
  } else {
    lastGoogleError = "Nenhuma chave de Geocoding configurada.";
  }

  for (const q of queries) {
    const osm = await nominatimGeocode(q);
    if (osm) return osm;
  }

  const city = coordsForCity(input.cidade, input.uf);
  if (city) {
    return {
      ok: true,
      lat: city.lat,
      lng: city.lng,
      formatted: `${input.cidade}/${input.uf}`,
      source: "cidade",
    };
  }

  return { ok: false, reason: lastGoogleError || "Não foi possível localizar o CEP no mapa." };
}

export type ReverseGeocodeResult = {
  ok: true;
  lat: number;
  lng: number;
  cidade: string;
  uf: string;
  cep?: string;
  formatted?: string;
  source: "google" | "nominatim";
};

type AddressComponent = { long_name: string; short_name: string; types: string[] };

function pickComponent(components: AddressComponent[], type: string, short = false) {
  const hit = components.find((c) => c.types.includes(type));
  return hit ? (short ? hit.short_name : hit.long_name) : "";
}

async function googleReverse(lat: number, lng: number, key: string): Promise<ReverseGeocodeResult | GeocodeFailure> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("result_type", "locality|administrative_area_level_2");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return { ok: false, reason: `Google HTTP ${res.status}` };
  const body = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: { formatted_address?: string; address_components?: AddressComponent[] }[];
  };

  if (body.status === "REQUEST_DENIED") {
    return {
      ok: false,
      reason: body.error_message?.includes("not activated")
        ? "Geocoding API não está ATIVADA no projeto."
        : body.error_message || "Google negou a chave (REQUEST_DENIED).",
    };
  }
  if (body.status !== "OK" || !body.results?.[0]) {
    return { ok: false, reason: `Google reverse: ${body.status}` };
  }

  const components = body.results[0].address_components ?? [];
  const cidade =
    pickComponent(components, "locality") ||
    pickComponent(components, "administrative_area_level_2") ||
    pickComponent(components, "sublocality");
  const uf = pickComponent(components, "administrative_area_level_1", true);
  const cep = pickComponent(components, "postal_code").replace(/\D/g, "").slice(0, 8) || undefined;

  if (!cidade || !uf) return { ok: false, reason: "Não foi possível identificar cidade/UF nessa posição." };

  return {
    ok: true,
    lat,
    lng,
    cidade,
    uf,
    cep,
    formatted: body.results[0].formatted_address,
    source: "google",
  };
}

async function nominatimReverse(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "14");
  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { "User-Agent": "TawperOS/1.0 (rotas comerciais)" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      display_name?: string;
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        county?: string;
        state?: string;
        postcode?: string;
      };
    };
    const a = body.address;
    if (!a) return null;
    const cidade = a.city || a.town || a.village || a.municipality || a.county || "";
    const state = a.state || "";
    const ufMap: Record<string, string> = {
      "São Paulo": "SP",
      Goiás: "GO",
      "Mato Grosso do Sul": "MS",
      "Minas Gerais": "MG",
      Paraná: "PR",
    };
    const uf = ufMap[state] || (state.length === 2 ? state.toUpperCase() : "");
    if (!cidade || !uf) return null;
    return {
      ok: true,
      lat,
      lng,
      cidade,
      uf,
      cep: a.postcode?.replace(/\D/g, "").slice(0, 8),
      formatted: body.display_name,
      source: "nominatim",
    };
  } catch {
    return null;
  }
}

/** Coordenadas GPS → cidade, UF e (opcional) CEP. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | GeocodeFailure> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: "Coordenadas inválidas." };
  }
  const key = (
    process.env.GOOGLE_GEOCODING_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_MAPS_API_KEY ??
    ""
  ).trim();

  if (key) {
    const google = await googleReverse(lat, lng, key);
    if (google.ok) return google;
    const osm = await nominatimReverse(lat, lng);
    if (osm) return osm;
    return google;
  }

  const osm = await nominatimReverse(lat, lng);
  if (osm) return osm;
  return { ok: false, reason: "Não foi possível converter a localização em cidade/UF." };
}
