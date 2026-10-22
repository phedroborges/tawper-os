export type RouteStopLine = {
  nome: string;
  cidade?: string;
  uf?: string;
  motivo?: string;
};

/** Lista numerada da rota, com cidade e motivo de cada parada. */
export function numberedRoute(stops: RouteStopLine[]) {
  return stops
    .map((stop, index) => {
      const place = [stop.cidade, stop.uf].filter(Boolean).join("/");
      const where = place ? ` (${place})` : "";
      const why = stop.motivo?.trim() ? ` — ${stop.motivo.trim()}` : "";
      return `${index + 1}. ${stop.nome}${where}${why}`;
    })
    .join("\n");
}

/**
 * A descrição da visita precisa conter a rota inteira.
 * Se o texto da IA omitir alguma parada, a lista numerada entra junto.
 */
export function composeRouteDescription(aiText: string | undefined, stops: RouteStopLine[], km?: number) {
  const route = numberedRoute(stops);
  if (!route) return (aiText ?? "").trim();
  const label = stops.length === 1 ? "parada" : "paradas";
  const head = km && km > 0 ? `Rota de ${stops.length} ${label}, cerca de ${km} km.` : `Rota de ${stops.length} ${label}.`;
  const factual = `${head}\n${route}`;
  const text = (aiText ?? "").trim();
  if (!text) return factual;
  const lower = text.toLowerCase();
  const missing = stops.some((stop) => stop.nome.trim() && !lower.includes(stop.nome.trim().toLowerCase()));
  return missing ? `${text}\n\n${factual}` : text;
}

/** Descrição da atividade: a parada atual e, em seguida, a rota do dia. */
export function visitRouteDescription(route: string, index: number, total: number) {
  const place = `Parada ${index + 1} de ${total}.`;
  return route.trim() ? `${place}\n${route.trim()}` : place;
}
