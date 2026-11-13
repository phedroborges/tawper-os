"use client";

import { AlertTriangle, CalendarDays, Car, Check, Clock, ExternalLink, MapPin, Navigation, Route, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AIBadge, AIThinking } from "@/components/ai/ai";
import { CompanyLink, RegionSelect, StagePill, UserAvatar } from "@/components/crm/crm";
import { RouteMap, type DrivingRouteSummary } from "@/components/maps/RouteMap";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import { addDays, dayDiff, fmtDateShort, fmtTime, longToday, startOfDay } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { companyLatLng, estimateRoadKm, openGoogleMapsNavigation, openGoogleMapsRoute } from "@/lib/geo";
import { matchesRegionFilter, regionFilterLabel } from "@/lib/regions";
import { fallbackDriveMinutes, isBusinessDay, scheduleRoute, toBusinessDay, WORK_END, WORK_START } from "@/lib/route-schedule";
import { composeRouteDescription } from "@/lib/route-text";
import { alertsOf, daysInStage, lastInteractionAt, openDealOf, stageOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { aiRoute } from "@/server/ai/actions";

function toDateInputValue(d: Date) {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function fromDateInputValue(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, WORK_START, 0, 0, 0);
}

const weekday = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

/** Planejamento de rota: a IA prioriza, o Google mede a estrada e a agenda encaixa as visitas na jornada. */
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
  const [regiao, setRegiao] = useState("");
  const [dataVisita, setDataVisita] = useState(() => toDateInputValue(toBusinessDay(addDays(now, 2))));
  const [thinking, setThinking] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [driving, setDriving] = useState<DrivingRouteSummary | null>(null);
  const [optimizeWaypoints, setOptimizeWaypoints] = useState(true);
  const [aiRouteText, setAiRouteText] = useState("");
  /** Rota salva que está desenhada no mapa. */
  const [viewing, setViewing] = useState<string | null>(null);
  const data = useMemo(
    () => ({ companies, contacts, deals, activities, interactions, quotes, suggestions, strategies, users, conversations }),
    [companies, contacts, deals, activities, interactions, quotes, suggestions, strategies, users, conversations],
  );

  const mine = useMemo(() => data.companies.filter((c) => (c.status === "ativa" || c.status === "espera") && (isManager(user) || c.ownerId === user.id)), [data.companies, user]);

  const candidates = useMemo(() => {
    const al = alertsOf(data, { now });
    return mine
      .filter((c) => matchesRegionFilter(regiao, c.uf))
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
  }, [data, mine, regiao, now]);

  const myRoutes = useMemo(
    () => routes.filter((r) => isManager(user) || r.ownerId === user.id).sort((a, b) => a.data.localeCompare(b.data)),
    [routes, user],
  );
  const viewed = viewing ? myRoutes.find((r) => r.id === viewing) : undefined;

  const mapStops = useMemo(() => {
    const ids = new Set(candidates.map((x) => x.c.id));
    const extra = viewed ? viewed.paradas.map((p) => companies.find((c) => c.id === p.companyId)).filter((c) => c && !ids.has(c.id)) : [];
    return [...candidates.map((x) => x.c), ...extra].map((c) => ({ id: c!.id, nome: c!.nome, cidade: c!.cidade, uf: c!.uf, latitude: c!.latitude, longitude: c!.longitude }));
  }, [candidates, viewed, companies]);

  const stopOrder = useMemo(() => driving?.orderedIds ?? picked ?? [], [driving, picked]);
  const posOf = (id: string) => {
    const c = companies.find((x) => x.id === id);
    return c ? companyLatLng(c) : undefined;
  };

  /** Sem o Google: distância em linha reta × 1,35 entre as cidades da ordem. */
  const kmFallback = useMemo(() => {
    if (!picked?.length) return 0;
    return estimateRoadKm(stopOrder.map(posOf).filter((p): p is NonNullable<typeof p> => !!p));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posOf só lê companies
  }, [picked, stopOrder, companies]);
  const kmEstimado = driving?.distanceKm ?? kmFallback;

  /** Agenda encaixada na jornada: 8h às 18h, almoço, dia útil e folgas de estrada. */
  const agenda = useMemo(() => {
    const exact = driving && driving.legSeconds.length === stopOrder.length - 1 ? driving.legSeconds : null;
    return scheduleRoute(
      fromDateInputValue(dataVisita),
      stopOrder.map((id, i) => {
        if (i === 0) return { id, driveMinutes: 0 };
        if (exact) return { id, driveMinutes: Math.round(exact[i - 1] / 60) };
        const a = posOf(stopOrder[i - 1]);
        const b = posOf(id);
        return { id, driveMinutes: a && b ? fallbackDriveMinutes(estimateRoadKm([a, b])) : 60 };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posOf só lê companies
  }, [stopOrder, driving, dataVisita, companies]);

  const stopsInfo = (ids: string[]) =>
    ids.map((id) => {
      const row = candidates.find((item) => item.c.id === id);
      return { nome: row?.c.nome ?? "Conta", cidade: row?.c.cidade, uf: row?.c.uf, motivo: row?.motivos[0] };
    });
  const routeDescricao = useMemo(
    () => composeRouteDescription(aiRouteText, stopsInfo(stopOrder), kmEstimado),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopsInfo só lê candidates
    [stopOrder, candidates, aiRouteText, kmEstimado],
  );

  const resetSelection = () => {
    setPicked(null);
    setDriving(null);
    setOptimizeWaypoints(true);
    setAiRouteText("");
  };

  const changeDate = (value: string) => {
    if (!value) return;
    const chosen = fromDateInputValue(value);
    if (isBusinessDay(chosen)) return setDataVisita(value);
    const next = toBusinessDay(chosen);
    setDataVisita(toDateInputValue(next));
    toast("Sem visita em fim de semana ou feriado", { tone: "warn", sub: `A viagem foi para ${weekday(next)}.` });
  };

  const navigateStop = (companyId: string) => {
    const pos = posOf(companyId);
    if (!pos) return toast("Sem coordenadas", { tone: "warn", sub: "Cadastre CEP/GPS ou cidade da conta para navegar." });
    openGoogleMapsNavigation(pos);
  };

  const navigateFullRoute = (ids: string[]) => {
    const pts = ids.map(posOf).filter((p): p is NonNullable<typeof p> => !!p);
    if (pts.length === 0) return toast("Sem coordenadas", { tone: "warn", sub: "As contas da rota precisam de cidade ou GPS." });
    openGoogleMapsRoute(pts);
  };

  const togglePick = (id: string) => {
    setViewing(null);
    setDriving(null);
    setOptimizeWaypoints(true);
    setPicked((p) => ((p ?? []).includes(id) ? (p ?? []).filter((x) => x !== id) : [...(p ?? []), id]));
  };

  const onRouteComputed = (summary: DrivingRouteSummary | null) => {
    if (viewing) return;
    setDriving(summary);
    if (!summary || !optimizeWaypoints || !picked?.length) return;
    if (summary.orderedIds.join("|") === picked.join("|")) return;
    setPicked(summary.orderedIds);
    setOptimizeWaypoints(false);
  };

  const suggest = () => {
    const selected = candidates.filter((x) => (picked ?? []).includes(x.c.id));
    if (selected.length < 2) return toast("Selecione as contas", { tone: "warn", sub: "Marque pelo menos 2 contas na lista para a IA montar a rota só com elas." });
    setThinking(true);
    setDriving(null);
    setOptimizeWaypoints(true);
    const fallbackIds = selected.map((x) => x.c.id);
    void (async () => {
      let ids = fallbackIds;
      let descricao = "";
      try {
        const planned = await aiRoute({
          regiao: regionFilterLabel(regiao),
          candidates: selected.map((x) => ({ id: x.c.id, nome: x.c.nome, cidade: x.c.cidade, score: x.score, motivos: x.motivos, etapa: x.deal ? stageOf(x.deal).nome : undefined })),
          fallbackIds,
        });
        ids = planned.ids;
        descricao = planned.descricao;
      } catch {
        ids = fallbackIds;
      }
      // A IA só reordena o que foi marcado.
      const allowed = new Set(fallbackIds);
      ids = ids.filter((id) => allowed.has(id));
      for (const id of fallbackIds) if (!ids.includes(id)) ids.push(id);
      setAiRouteText(descricao);
      setPicked(ids);
      setThinking(false);
    })();
  };

  const save = (confirm: boolean) => {
    if (!stopOrder.length) return;
    planRoute({
      regiao: regionFilterLabel(regiao),
      data: (agenda.stops[0]?.arrive ?? fromDateInputValue(dataVisita)).toISOString(),
      paradas: stopOrder.map((id, i) => {
        const x = candidates.find((k) => k.c.id === id);
        return {
          companyId: id,
          objetivo: x?.motivos[0] ? `Visita: ${x.motivos[0]}` : "Visita de relacionamento",
          motivo: x?.motivos.join(" · ") || "Prioridade da região",
          horario: agenda.stops[i]?.arrive.toISOString(),
        };
      }),
      kmEstimado,
      ownerId: user.id,
      confirm,
      descricao: routeDescricao,
    });
    toast(confirm ? `Rota confirmada: ${stopOrder.length} visitas · ${kmEstimado} km` : `Rota planejada: ${stopOrder.length} paradas · ${kmEstimado} km`, {
      tone: "ai",
      sub: confirm ? "Visitas e tarefas de confirmação criadas para você" : "Confirme quando quiser criar as visitas",
    });
    resetSelection();
  };

  const confirmExisting = (routeId: string, stops: number) => {
    confirmRoute(routeId);
    toast(`Rota confirmada: ${stops} visitas criadas`, { tone: "ok", sub: "Cada visita ganhou uma tarefa de confirmação com o cliente" });
  };

  const orderedForMap = viewed ? viewed.paradas.map((p) => p.companyId) : picked && picked.length >= 2 ? picked : null;
  const lastDay = agenda.stops.length ? agenda.stops[agenda.stops.length - 1].arrive : null;

  return (
    <div>
      <PageHeader
        kicker={`Visitas e rotas · ${longToday(now)}`}
        title="Rotas"
        subtitle={`Marque as contas, a IA ordena e o sistema encaixa as visitas na jornada: ${WORK_START}h às ${WORK_END}h, com almoço, sem fim de semana.`}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Região" hint="filtra a lista e o mapa" className="w-full sm:w-64">
          <RegionSelect
            value={regiao}
            onChange={(v) => {
              setRegiao(v);
              resetSelection();
            }}
            ufs={mine.map((c) => c.uf)}
            className="w-full"
          />
        </Field>
        <Field label="Data da viagem" hint="dia da 1ª visita" className="w-full sm:w-64">
          <Input type="date" value={dataVisita} min={toDateInputValue(now)} onChange={(e) => changeDate(e.target.value)} />
        </Field>
      </div>

      {/* A rota fica em evidência, acima do mapa. */}
      {picked && picked.length > 0 && !viewed && (
        <Card className="mb-4 border-ai/40 shadow-card">
          <CardHeader
            kicker={`Rota em montagem · ${regionFilterLabel(regiao)}`}
            title={`${stopOrder.length} ${stopOrder.length === 1 ? "visita" : "visitas"} · começa ${weekday(agenda.stops[0]?.arrive ?? fromDateInputValue(dataVisita))}`}
            action={<AIBadge label="IA + Maps" />}
          />
          {agenda.days > 1 && lastDay && (
            <div className="mx-4 flex items-start gap-2 rounded-[6px] bg-amber-50 px-3 py-2 text-[12.5px] text-amber-950">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Esta rota não cabe em um dia. Ela precisa de <b>{agenda.days} dias</b> e termina {weekday(lastDay)}. Tire paradas ou planeje a pernoite.
              </span>
            </div>
          )}
          <ol className="grid gap-x-6 px-4 py-3 md:grid-cols-2 xl:grid-cols-3">
            {stopOrder.map((id, i) => {
              const x = candidates.find((k) => k.c.id === id);
              const slot = agenda.stops[i];
              if (!x || !slot) return null;
              const novoDia = i > 0 && agenda.stops[i - 1].day !== slot.day;
              return (
                <li key={id} className="flex items-start gap-3 py-1.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ai text-[11px] font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1 text-[12.5px]">
                    <div className="truncate font-semibold text-ink">{x.c.nome}</div>
                    <div className="text-muted">
                      {(agenda.days > 1 || novoDia) && <span className="font-medium text-ink">{weekday(slot.arrive)} · </span>}
                      {fmtTime(slot.arrive.toISOString())} às {fmtTime(slot.leave.toISOString())} · {x.c.cidade}/{x.c.uf}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!posOf(id)}
                    title={posOf(id) ? "Abrir no Google Maps" : "Sem coordenadas"}
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Car size={14} />
                {driving ? `${driving.distanceText} · ${driving.durationText} de estrada` : kmEstimado > 0 ? `~${kmEstimado} km (estimativa entre cidades)` : "Marque 2 contas para medir a distância"}
              </span>
              <span className="inline-flex items-center gap-1.5" title="Já somados: 20% de folga na estrada, 20 min de portaria, 10 min de espera e 1 h por visita">
                <Clock size={14} /> horários com folga de estrada, portaria e espera
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={resetSelection}>
                <X size={14} /> Limpar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigateFullRoute(stopOrder)} title="Abre a rota completa no Google Maps">
                <ExternalLink size={14} /> Navegar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => save(false)}>
                Só planejar
              </Button>
              <Button size="sm" variant="primary" onClick={() => save(true)}>
                Confirmar e criar visitas
              </Button>
            </div>
          </div>
        </Card>
      )}

      {viewed && (
        <Card className="mb-4 border-navy-3/30 shadow-card">
          <CardHeader
            kicker={`Rota ${viewed.status} · ${fmtDateShort(viewed.data)}`}
            title={`${viewed.paradas.length} paradas · ${viewed.kmEstimado} km`}
            action={
              <Button size="xs" variant="ghost" onClick={() => setViewing(null)}>
                <X size={13} /> Fechar
              </Button>
            }
          />
          <ol className="grid gap-x-6 px-4 pb-3 md:grid-cols-2 xl:grid-cols-3">
            {viewed.paradas.map((p, i) => (
              <li key={p.companyId} className="flex items-start gap-3 py-1.5 text-[12.5px]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <CompanyLink company={companies.find((c) => c.id === p.companyId)} className="text-[12.5px]" />
                  <div className="text-muted">{p.horario ? `${weekday(new Date(p.horario))} · ${fmtTime(p.horario)} · ` : ""}{p.objetivo}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="mb-5">
        <RouteMap stops={mapStops} orderedIds={orderedForMap} optimizeWaypoints={!viewed && optimizeWaypoints} onRouteComputed={onRouteComputed} height={360} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(360px,30vw,520px)]">
        <Card className="min-w-0">
          <CardHeader
            kicker={`${candidates.length} conta(s) · ${regionFilterLabel(regiao)}${picked?.length ? ` · ${picked.length} selecionada(s)` : ""}`}
            title="Contas com visita necessária ou recomendada"
            action={
              <Button size="sm" variant="ai" onClick={suggest} disabled={thinking || (picked?.length ?? 0) < 2} title={(picked?.length ?? 0) < 2 ? "Marque ao menos 2 contas" : "Ordenar a seleção com IA"}>
                <Sparkles size={14} /> Montar rota com IA
              </Button>
            }
          />
          {thinking && <AIThinking steps={[`Usando só as ${picked?.length ?? 0} contas selecionadas`, "Ordenando por prioridade comercial", "O mapa mede a distância de carro"]} className="m-4" />}
          {candidates.length === 0 ? (
            <Empty icon={<MapPin size={22} />} title={regiao ? "Nenhuma conta nesta região" : "Nenhuma conta disponível"} text={regiao ? "Troque para “Todas as regiões” ou revise a carteira." : "Cadastre empresas ativas ou revise a carteira."} />
          ) : (
            <ul>
              {candidates.map(({ c, deal, score, motivos }) => {
                const on = picked?.includes(c.id);
                const order = stopOrder.indexOf(c.id);
                return (
                  <li key={c.id} className={cn("flex items-start gap-3 border-b border-line/70 px-4 py-3 last:border-b-0", on && "bg-ai-soft/50")}>
                    <button
                      type="button"
                      onClick={() => togglePick(c.id)}
                      aria-label={on ? `Tirar ${c.nome} da rota` : `Incluir ${c.nome} na rota`}
                      className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-[4px] border-2", on ? "border-ai bg-ai text-white" : "border-line text-transparent")}
                    >
                      <Check size={11} strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {order >= 0 && <span className="grid size-5 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">{order + 1}</span>}
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
          {myRoutes.length === 0 && <Empty icon={<Route size={22} />} title="Nenhuma rota salva" text="Marque contas na lista, monte a rota e confirme." />}
          {myRoutes.map((route) => (
            <Card key={route.id} className={cn(route.status === "planejada" && "border-amber-300/60", viewing === route.id && "ring-2 ring-navy-3/30")}>
              <CardHeader
                kicker={`Rota ${route.status} · ${fmtDateShort(route.data)} · ${route.regiao}`}
                title={`${route.paradas.length} paradas · ${route.kmEstimado} km`}
                action={route.status === "planejada" ? <Badge tone="amber">planejada</Badge> : <CalendarDays size={16} className="text-muted" />}
              />
              <ol className="px-4 pb-2">
                {route.paradas.map((p, i) => (
                  <li key={p.companyId} className="flex gap-3 py-1.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">{i + 1}</span>
                    <div className="min-w-0 text-[12.5px]">
                      <CompanyLink company={companies.find((c) => c.id === p.companyId)} className="text-[12.5px]" />
                      <div className="text-[11.5px] text-muted">{p.horario ? `${fmtTime(p.horario)} · ` : ""}{p.objetivo}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 px-4 py-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    resetSelection();
                    setViewing(viewing === route.id ? null : route.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <MapPin size={14} /> {viewing === route.id ? "Tirar do mapa" : "Ver no mapa"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigateFullRoute(route.paradas.map((p) => p.companyId))}>
                  <ExternalLink size={14} /> Navegar
                </Button>
                {route.status === "planejada" && (
                  <Button size="sm" variant="primary" onClick={() => confirmExisting(route.id, route.paradas.length)}>
                    Confirmar e criar visitas
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
