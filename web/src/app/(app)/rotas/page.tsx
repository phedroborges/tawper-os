"use client";

import { Car, Check, Clock, ExternalLink, MapPin, Navigation, Route, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { AIBadge, AIThinking } from "@/components/ai/ai";
import { CompanyLink, StagePill, UserAvatar } from "@/components/crm/crm";
import { RouteMap, type DrivingRouteSummary } from "@/components/maps/RouteMap";
import { Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Select } from "@/components/ui/primitives";
import { REGIOES, isManager } from "@/lib/constants";
import { addDays, dayDiff, fmtDateShort, longToday, startOfDay } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { companyLatLng, estimateRoadKm, openGoogleMapsNavigation, openGoogleMapsRoute } from "@/lib/geo";
import { regionForCity } from "@/lib/regions";
import { alertsOf, daysInStage, lastInteractionAt, openDealOf, stageOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { aiRoute } from "@/server/ai/actions";

const TODAS_REGIOES = "__todas__";

function toDateInputValue(d: Date) {
  const x = startOfDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(value: string, hour = 8) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, hour, 0, 0, 0);
  return date.toISOString();
}

/** Planejamento de rota (fluxo 7.8): IA prioriza; Google Maps mede km e otimiza a sequência. */
export default function RotasPage() {
  const companies = useStore((s) => s.companies);
  const contacts = useStore((s) => s.contacts);
  const deals = useStore((s) => s.deals);
  const activities = useStore((s) => s.activities);
  const interactions = useStore((s) => s.interactions);
  const quotes = useStore((s) => s.quotes);
  const suggestions = useStore((s) => s.suggestions);
  const strategies = useStore((s) => s.strategies);
  const users = useStore((s) => s.users);
  const conversations = useStore((s) => s.conversations);
  const routes = useStore((s) => s.routes);
  const planRoute = useStore((s) => s.planRoute);
  const confirmRoute = useStore((s) => s.confirmRoute);
  const user = useCurrentUser();
  const now = useNow();
  const toast = useUI((u) => u.toast);
  /** Abre já com todas as contas visíveis — prontas para selecionar. */
  const [regiao, setRegiao] = useState(TODAS_REGIOES);
  const [dataVisita, setDataVisita] = useState(() => toDateInputValue(addDays(now, 2)));
  const [thinking, setThinking] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [driving, setDriving] = useState<DrivingRouteSummary | null>(null);
  const [optimizeWaypoints, setOptimizeWaypoints] = useState(true);
  const data = useMemo(
    () => ({ companies, contacts, deals, activities, interactions, quotes, suggestions, strategies, users, conversations }),
    [companies, contacts, deals, activities, interactions, quotes, suggestions, strategies, users, conversations],
  );

  const inRegion = (c: { regiao?: string; cidade?: string }) => {
    if (regiao === TODAS_REGIOES) return true;
    if (c.regiao === regiao) return true;
    return regionForCity(c.cidade) === regiao;
  };

  const candidates = useMemo(() => {
    const al = alertsOf(data, { now });
    return data.companies
      .filter((c) => (c.status === "ativa" || c.status === "espera") && inRegion(c))
      .filter((c) => isManager(user) || c.ownerId === user.id)
      .map((c) => {
        const deal = openDealOf(data, c.id);
        const last = lastInteractionAt(data, c.id);
        const myAlerts = al.filter((a) => a.companyId === c.id);
        let score = 0;
        const motivos: string[] = [];
        if (c.urgencia === "Alta") { score += 3; motivos.push("urgência alta"); }
        if (c.potencial === "Alto") { score += 2; motivos.push("potencial alto"); }
        if (myAlerts.some((a) => a.tipo === "atraso")) { score += 3; motivos.push("atividade atrasada"); }
        if (myAlerts.some((a) => a.tipo === "estagnacao")) { score += 2; motivos.push("parada na etapa"); }
        if (deal && ["homologacao", "posvenda", "relacionamento", "negociacao"].includes(deal.stageId)) { score += 2; motivos.push(`etapa pede visita (${stageOf(deal).nome})`); }
        if (last && dayDiff(last, now) < -20) { score += 1; motivos.push("sem contato há mais de 20 dias"); }
        return { c, deal, score, motivos };
      })
      .sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inRegion depende de regiao
  }, [data, regiao, user, now]);

  const regionRoutes = useMemo(
    () =>
      routes
        .filter((r) => (regiao === TODAS_REGIOES || r.regiao === regiao) && (isManager(user) || r.ownerId === user.id))
        .sort((a, b) => a.data.localeCompare(b.data)),
    [routes, regiao, user],
  );

  const routeRegiaoLabel = regiao === TODAS_REGIOES ? "Todas" : regiao;

  const mapStops = useMemo(
    () =>
      candidates.map(({ c }) => ({
        id: c.id,
        nome: c.nome,
        cidade: c.cidade,
        uf: c.uf,
        latitude: c.latitude,
        longitude: c.longitude,
      })),
    [candidates],
  );

  const stopOrder = driving?.orderedIds ?? picked ?? [];

  /** Fallback quando o Directions não fecha: haversine × 1,35 entre as cidades da ordem. */
  const kmFallback = useMemo(() => {
    if (!picked?.length) return 0;
    const order = stopOrder.length >= 2 ? stopOrder : picked;
    const pts = order
      .map((id) => {
        const row = candidates.find((k) => k.c.id === id);
        return row ? companyLatLng(row.c) : undefined;
      })
      .filter((p): p is NonNullable<typeof p> => !!p);
    return estimateRoadKm(pts);
  }, [picked, stopOrder, candidates]);

  const kmEstimado = driving?.distanceKm ?? kmFallback;

  const resetSelection = () => {
    setPicked(null);
    setDriving(null);
    setOptimizeWaypoints(true);
  };

  const navigateStop = (companyId: string) => {
    const row = candidates.find((k) => k.c.id === companyId);
    const pos = row ? companyLatLng(row.c) : undefined;
    if (!pos) {
      toast("Sem coordenadas", { tone: "warn", sub: "Cadastre CEP/GPS ou cidade da conta para navegar." });
      return;
    }
    openGoogleMapsNavigation(pos);
  };

  const navigateFullRoute = () => {
    const order = stopOrder.length ? stopOrder : picked ?? [];
    const pts = order
      .map((id) => {
        const row = candidates.find((k) => k.c.id === id);
        return row ? companyLatLng(row.c) : undefined;
      })
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (pts.length === 0) {
      toast("Sem coordenadas", { tone: "warn", sub: "As contas da rota precisam de cidade ou GPS." });
      return;
    }
    openGoogleMapsRoute(pts);
  };

  const togglePick = (id: string) => {
    setDriving(null);
    setOptimizeWaypoints(true);
    setPicked((p) => ((p ?? []).includes(id) ? (p ?? []).filter((x) => x !== id) : [...(p ?? []), id]));
  };

  const onRouteComputed = (summary: DrivingRouteSummary | null) => {
    setDriving(summary);
    if (!summary || !optimizeWaypoints || !picked?.length) return;
    if (summary.orderedIds.join("|") === picked.join("|")) return;
    setPicked(summary.orderedIds);
    setOptimizeWaypoints(false);
  };

  const suggest = () => {
    const selected = candidates.filter((x) => (picked ?? []).includes(x.c.id));
    if (selected.length < 2) {
      toast("Selecione as contas", {
        tone: "warn",
        sub: "Marque pelo menos 2 contas na lista para a IA montar a rota só com elas.",
      });
      return;
    }
    setThinking(true);
    setDriving(null);
    setOptimizeWaypoints(true);
    const fallbackIds = selected.map((x) => x.c.id);
    void (async () => {
      let ids = fallbackIds;
      try {
        ids = await aiRoute({
          regiao: routeRegiaoLabel,
          candidates: selected.map((x) => ({
            id: x.c.id,
            nome: x.c.nome,
            cidade: x.c.cidade,
            score: x.score,
            motivos: x.motivos,
            etapa: x.deal ? stageOf(x.deal).nome : undefined,
          })),
          fallbackIds,
        });
      } catch {
        ids = fallbackIds;
      }
      // Mantém somente o que estava marcado (a IA só reordena a seleção).
      const allowed = new Set(fallbackIds);
      ids = ids.filter((id) => allowed.has(id));
      if (ids.length < fallbackIds.length) {
        for (const id of fallbackIds) if (!ids.includes(id)) ids.push(id);
      }
      setPicked(ids);
      setThinking(false);
    })();
  };

  const buildParadas = (ids: string[]) =>
    ids.map((id) => {
      const x = candidates.find((k) => k.c.id === id)!;
      return {
        companyId: id,
        objetivo: x.motivos[0] ? `Visita: ${x.motivos[0]}` : "Visita de relacionamento",
        motivo: x.motivos.join(" · ") || "Prioridade da região",
      };
    });

  const saveDraft = () => {
    if (!stopOrder.length) return;
    planRoute({
      regiao: routeRegiaoLabel,
      data: fromDateInputValue(dataVisita),
      paradas: buildParadas(stopOrder),
      kmEstimado,
      ownerId: user.id,
      confirm: false,
    });
    toast(`Rota planejada: ${stopOrder.length} paradas · ${kmEstimado} km`, {
      tone: "ai",
      sub: driving ? "Quilometragem pelo Google Maps" : "Confirme quando quiser criar as visitas no Meu Dia",
    });
    resetSelection();
  };

  const confirmSuggestion = () => {
    if (!stopOrder.length) return;
    planRoute({
      regiao: routeRegiaoLabel,
      data: fromDateInputValue(dataVisita),
      paradas: buildParadas(stopOrder),
      kmEstimado,
      ownerId: user.id,
      confirm: true,
    });
    toast(`Rota confirmada: ${stopOrder.length} visitas · ${kmEstimado} km`, {
      tone: "ai",
      sub: "Após cada visita, o vendedor registra resultado e próximo passo",
    });
    resetSelection();
  };

  const confirmExisting = (routeId: string, stops: number) => {
    confirmRoute(routeId);
    toast(`Rota confirmada: ${stops} visitas criadas`, {
      tone: "ok",
      sub: "As atividades aparecem no Meu Dia do responsável",
    });
  };

  return (
    <div>
      <PageHeader
        kicker={`Visitas e rotas · ${longToday(now)}`}
        title="Rotas"
        subtitle="Marque as contas na lista e use a IA para ordenar a rota só com elas. O Google Maps calcula a distância de carro."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={regiao}
              onChange={(e) => {
                setRegiao(e.target.value);
                resetSelection();
              }}
              className="w-auto min-w-[200px]"
            >
              <option value={TODAS_REGIOES}>Todas as regiões</option>
              {REGIOES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={dataVisita}
              onChange={(e) => setDataVisita(e.target.value)}
              className="w-auto min-w-[150px]"
            />
          </div>
        }
      />
      <div className="mb-5">
        <RouteMap
          stops={mapStops}
          orderedIds={picked && picked.length >= 2 ? picked : null}
          optimizeWaypoints={optimizeWaypoints}
          onRouteComputed={onRouteComputed}
          height={360}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(360px,30vw,520px)]">
        <Card className="min-w-0">
          <CardHeader
            kicker={`${candidates.length} conta(s)${regiao === TODAS_REGIOES ? "" : ` · ${regiao}`}${picked?.length ? ` · ${picked.length} selecionada(s)` : ""}`}
            title="Contas com visita necessária ou recomendada"
            action={
              <Button
                size="sm"
                variant="ai"
                onClick={suggest}
                disabled={thinking || (picked?.length ?? 0) < 2}
                title={(picked?.length ?? 0) < 2 ? "Marque ao menos 2 contas" : "Ordenar a seleção com IA"}
              >
                <Sparkles size={14} /> Montar rota com IA
              </Button>
            }
          />
          {thinking && (
            <AIThinking
              steps={[
                `Usando só as ${picked?.length ?? 0} contas selecionadas`,
                "Ordenando por prioridade comercial",
                "O mapa mede a distância de carro",
              ]}
              className="m-4"
            />
          )}
          {candidates.length === 0 ? (
            <Empty
              icon={<MapPin size={22} />}
              title={regiao === TODAS_REGIOES ? "Nenhuma conta disponível" : "Nenhuma conta nesta região"}
              text={
                regiao === TODAS_REGIOES
                  ? "Cadastre empresas ativas ou revise a carteira."
                  : "Troque para “Todas as regiões” ou revise a carteira do vendedor."
              }
            />
          ) : (
            <ul>
              {candidates.map(({ c, deal, score, motivos }) => {
                const on = picked?.includes(c.id);
                const order = stopOrder.indexOf(c.id);
                return (
                  <li
                    key={c.id}
                    className={cn("flex items-start gap-3 border-b border-line/70 px-4 py-3 last:border-b-0", on && "bg-ai-soft/50")}
                  >
                    <button
                      type="button"
                      onClick={() => togglePick(c.id)}
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[4px] border-2",
                        on ? "border-ai bg-ai text-white" : "border-line text-transparent",
                      )}
                    >
                      <Check size={11} strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {order >= 0 && (
                          <span className="grid size-5 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">
                            {order + 1}
                          </span>
                        )}
                        <CompanyLink company={c} className="text-[13.5px]" />
                        <StagePill deal={deal} />
                        {deal && <span className="text-[11.5px] text-muted">{daysInStage(deal)}d na etapa</span>}
                      </div>
                      <div className="text-[12px] text-muted">
                        <MapPin size={11} className="mr-0.5 inline" />
                        {c.cidade}/{c.uf} · {c.colhedoras ? `${c.colhedoras} colhedoras` : "frota ?"}
                      </div>
                      {motivos.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {motivos.map((m) => (
                            <Badge key={m} tone="outline">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="label">prioridade</div>
                      <div className="text-[18px] font-bold text-ink">{score}</div>
                    </div>
                    <UserAvatar userId={c.ownerId} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="min-w-0 space-y-5">
          {picked && picked.length > 0 && (
            <Card className="border-ai/30">
              <CardHeader
                kicker="Rota sugerida"
                title={`${stopOrder.length} visitas · ${fmtDateShort(fromDateInputValue(dataVisita))} · ${regiao}`}
                action={<AIBadge label="IA + Maps" />}
              />
              <ol className="px-4 py-3">
                {stopOrder.map((id, i) => {
                  const x = candidates.find((k) => k.c.id === id)!;
                  const canNav = !!companyLatLng(x.c);
                  return (
                    <li key={id} className="flex items-start gap-3 py-1.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ai text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 text-[12.5px]">
                        <div className="font-semibold text-ink">{x.c.nome}</div>
                        <div className="text-muted">
                          {x.c.cidade}/{x.c.uf} · {x.motivos[0] ?? "relacionamento"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canNav}
                        title={canNav ? "Abrir no Google Maps" : "Sem coordenadas"}
                        onClick={() => navigateStop(id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-[6px] px-2 py-1 text-[11.5px] font-medium text-navy hover:bg-soft disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Navigation size={12} /> Ir
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-4 py-3">
                <div className="flex flex-col gap-0.5 text-[12px] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Car size={14} />
                    {driving
                      ? `${driving.distanceText} · Google Maps`
                      : kmEstimado > 0
                        ? `~${kmEstimado} km (estimativa entre cidades)`
                        : "Distância pendente"}
                  </span>
                  {driving && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock size={14} /> {driving.durationText} de deslocamento
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={navigateFullRoute}
                    title="Abre a rota completa no Google Maps a partir da sua localização"
                  >
                    <ExternalLink size={14} /> Navegar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={saveDraft}>
                    Só planejar
                  </Button>
                  <Button size="sm" variant="primary" onClick={confirmSuggestion}>
                    Confirmar e criar visitas
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {regionRoutes.length === 0 && !picked?.length && (
            <Empty
              icon={<Route size={22} />}
              title="Nenhuma rota nesta região"
              text="Monte com a IA ou marque contas na lista e confirme."
            />
          )}

          {regionRoutes.map((route) => (
            <Card key={route.id} className={cn(route.status === "planejada" && "border-amber-300/60")}>
              <CardHeader
                kicker={`Rota ${route.status} · ${fmtDateShort(route.data)}`}
                title={`${route.paradas.length} paradas · ${route.kmEstimado} km`}
                action={
                  route.status === "planejada" ? (
                    <Badge tone="amber">planejada</Badge>
                  ) : (
                    <Route size={16} className="text-muted" />
                  )
                }
              />
              <ol className="px-4 py-3">
                {route.paradas.map((p, i) => (
                  <li key={p.companyId} className="flex gap-3 py-1.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="text-[12.5px]">
                      <CompanyLink company={companies.find((c) => c.id === p.companyId)} className="text-[12.5px]" />
                      <div className="text-ink/75">{p.objetivo}</div>
                      <div className="text-[11px] text-muted">{p.motivo}</div>
                    </div>
                  </li>
                ))}
              </ol>
              {route.status === "planejada" && (
                <div className="flex justify-end border-t border-line/70 px-4 py-3">
                  <Button size="sm" variant="primary" onClick={() => confirmExisting(route.id, route.paradas.length)}>
                    Confirmar e criar visitas
                  </Button>
                </div>
              )}
            </Card>
          ))}

          <Card className="p-4 text-[12.5px] text-ink/75">
            <div className="label mb-1">Próximo passo</div>
            Distância de deslocamento já vem do Google Maps (Directions). Quilometragem real do veículo e custo por
            visita dependem do rastreador e da fonte financeira (Fase 4).
          </Card>
        </div>
      </div>
    </div>
  );
}
