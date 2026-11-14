"use client";

import { AlertTriangle, GitMerge, GripVertical, Headset, Pause, Search, Sparkles, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIBadge } from "@/components/ai/ai";
import { DaysInStage, DueLabel, PeriodFilter, RegionSelect, UserAvatar } from "@/components/crm/crm";
import { Badge, Input, PageHeader, Segmented, Select } from "@/components/ui/primitives";
import { FUNNELS, isManager, saleLabel, stageIndex } from "@/lib/constants";
import { stageKeyToUi } from "@/lib/crm-map";
import { daysSince, fmtDateShort, inPeriod, NO_PERIOD, type Period } from "@/lib/dates";
import { matchesRegionFilter } from "@/lib/regions";
import { useNow } from "@/lib/hooks";
import { canSeeCompany, inSupport, isStagnant, missingCriteria, nextStepOf } from "@/lib/selectors";
import { useCurrentUser, useStore, warnNoBack } from "@/lib/store";
import type { Deal, FunnelId } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, moneyShort, normalize } from "@/lib/utils";

function Kanban() {
  const params = useSearchParams();
  const router = useRouter();
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const open = useUI((u) => u.open);
  const toast = useUI((u) => u.toast);
  const [funnel, setFunnel] = useState<FunnelId>((params.get("f") as FunnelId) === "recorrencia" ? "recorrencia" : "aquisicao");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [regiao, setRegiao] = useState("");
  const [period, setPeriod] = useState<Period>(NO_PERIOD);
  const hasPeriod = Boolean(period.from || period.to);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [drag, setDrag] = useState<{
    dealId: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
    active: boolean;
  } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const stages = FUNNELS[funnel].stages;
  const deals = useMemo(() => {
    const n = q.trim() ? normalize(q.trim()) : "";
    return s.deals.filter((d) => {
      if (d.funnel !== funnel) return false;
      const c = s.companies.find((x) => x.id === d.companyId);
      if (!c || !canSeeCompany(user, c)) return false;
      if (owner && c.ownerId !== owner) return false;
      if (!matchesRegionFilter(regiao, c.uf)) return false;
      if (n) {
        const hay = normalize(`${c.nome} ${c.razaoSocial ?? ""} ${c.cidade ?? ""} ${c.uf ?? ""} ${d.titulo}`);
        if (!hay.includes(n)) return false;
      }
      // Negócio aberto: data em que entrou na etapa atual. Venda: data da venda (sem filtro, os últimos 90 dias).
      if (d.status === "aberta") return (c.status === "ativa" || c.status === "espera") && inPeriod(d.stageEnteredAt, period);
      if (d.status === "ganha") return d.closedAt ? (hasPeriod ? inPeriod(d.closedAt, period) : daysSince(d.closedAt, now) <= 90) : false;
      return false;
    });
  }, [s.deals, s.companies, funnel, user, q, owner, regiao, period, hasPeriod, now]);

  const risky = (d: Deal) => {
    const next = nextStepOf(s, d.companyId);
    return isStagnant(d, now) || !next || (next && new Date(next.dueAt) < new Date(now.toDateString()));
  };

  const openDeals = deals.filter((d) => d.status === "aberta");
  const wonDeals = deals.filter((d) => d.status === "ganha");
  const openTotal = openDeals.reduce((a, d) => a + (d.valor ?? 0), 0);
  const wonTotal = wonDeals.reduce((a, d) => a + (d.valorRealizado ?? d.valor ?? 0), 0);
  const riskCount = openDeals.filter((d) => risky(d)).length;
  const hasFilters = Boolean(q || owner || regiao || hasPeriod || onlyRisk);
  const clearFilters = () => {
    setQ("");
    setOwner("");
    setRegiao("");
    setPeriod(NO_PERIOD);
    setOnlyRisk(false);
  };

  const dropDeal = useCallback(
    (dealId: string, stageId: string) => {
      const d = s.deals.find((x) => x.id === dealId);
      if (!d || stageKeyToUi(d.stageId) === stageId || d.status !== "aberta") return;
      const st = stages.find((x) => x.id === stageId)!;
      if (st.terminal) {
        open({ kind: "win", dealId: d.id });
        return;
      }
      const c = s.companies.find((x) => x.id === d.companyId);
      const fromIdx = stageIndex(d.funnel, d.stageId);
      const toIdx = stageIndex(d.funnel, stageId);
      if (toIdx < fromIdx) {
        warnNoBack(d.id);
        return;
      }
      if (c && toIdx > fromIdx && missingCriteria(s, d, c).length === 0) {
        const hops = s.autoAdvanceDeal(d.id, { untilStageId: stageId, ignoreHold: true });
        if (hops) {
          const fresh = useStore.getState().deals.find((x) => x.id === d.id);
          const landed = fresh ? FUNNELS[fresh.funnel].stages.find((x) => x.id === stageKeyToUi(fresh.stageId)) : st;
          toast(`Etapa alterada para ${landed?.nome ?? st.nome}`, { sub: hops > 1 ? "Etapas já cumpridas foram avançadas automaticamente" : undefined });
          return;
        }
      }
      open({ kind: "move", dealId: d.id, toStageId: stageId });
    },
    [s, stages, open, toast],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (!drag.active && dist < 6) return;
      setDrag((prev) =>
        prev
          ? {
              ...prev,
              active: true,
              x: e.clientX - prev.offsetX,
              y: e.clientY - prev.offsetY,
            }
          : null,
      );
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const colEl = el?.closest("[data-stage-id]") as HTMLElement | null;
      const stageId = colEl?.dataset.stageId ?? null;
      overRef.current = stageId;
      setOver(stageId);

      // Auto-scroll horizontal quando arrastar perto das bordas
      const board = boardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        if (e.clientX < rect.left + 64) board.scrollLeft -= 14;
        else if (e.clientX > rect.right - 64) board.scrollLeft += 14;
      }
    };
    const onUp = () => {
      const targetStage = overRef.current;
      const wasActive = drag.active;
      const dealId = drag.dealId;
      overRef.current = null;
      setDrag(null);
      setOver(null);
      if (wasActive && targetStage) {
        dropDeal(dealId, targetStage);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, dropDeal]);

  const startPointerDrag = (e: React.PointerEvent<HTMLElement>, d: Deal) => {
    if (d.status !== "aberta" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    overRef.current = stageKeyToUi(d.stageId);
    setDrag({
      dealId: d.id,
      startX: e.clientX,
      startY: e.clientY,
      x: rect.left,
      y: rect.top,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      active: false,
    });
  };

  const draggedDeal = drag?.active ? s.deals.find((x) => x.id === drag.dealId) : undefined;
  const draggedFromIdx = draggedDeal ? stageIndex(draggedDeal.funnel, draggedDeal.stageId) : -1;

  const startMove = (d: Deal) => {
    const c = s.companies.find((x) => x.id === d.companyId);
    if (c && missingCriteria(s, d, c).length === 0) {
      const hops = s.autoAdvanceDeal(d.id, { ignoreHold: true });
      if (hops) {
        const fresh = useStore.getState().deals.find((x) => x.id === d.id);
        const landed = fresh ? FUNNELS[fresh.funnel].stages.find((x) => x.id === stageKeyToUi(fresh.stageId)) : undefined;
        toast(`Etapa alterada para ${landed?.nome ?? "próxima etapa"}`, { sub: hops > 1 ? "Etapas já cumpridas foram avançadas automaticamente" : undefined });
        return;
      }
      const next = FUNNELS[d.funnel].stages[stageIndex(d.funnel, d.stageId) + 1];
      if (next?.terminal) {
        open({ kind: "win", dealId: d.id });
        return;
      }
    }
    open({ kind: "move", dealId: d.id });
  };

  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1">
      <PageHeader
        kicker="Kanban · movimentação validada"
        title="Funis comerciais"
        subtitle={funnel === "recorrencia" ? "A recorrência é um ciclo: registrou a venda, o cliente volta para o Pós-venda e a venda fica na coluna Vendas." : "Arraste o cartão para mudar de etapa. O sistema valida o que falta e cria a tarefa da etapa seguinte."}
        actions={
          <Segmented
            value={funnel}
            onChange={(v) => {
              setFunnel(v);
              router.replace(`/funis?f=${v}`);
            }}
            options={[
              { value: "aquisicao", label: "Aquisição" },
              { value: "recorrencia", label: "Recorrência" },
            ]}
          />
        }
      />
      {/* Resumo rápido do funil */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-[10px] border border-line bg-white px-3.5 py-2.5">
          <div className="text-[11.5px] font-medium text-muted">Em aberto</div>
          <div className="mt-0.5 text-[22px] font-bold tracking-tight text-ink">{openDeals.length}</div>
          <div className="truncate text-[11px] text-muted">negócios no funil</div>
        </div>
        <div className="rounded-[10px] border border-line bg-white px-3.5 py-2.5">
          <div className="text-[11.5px] font-medium text-muted">Pipeline em aberto</div>
          <div className="mt-0.5 text-[22px] font-bold tracking-tight text-ink">{openTotal ? moneyShort(openTotal) : "—"}</div>
          <div className="truncate text-[11px] text-muted">soma dos valores estimados</div>
        </div>
        <button
          type="button"
          onClick={() => setOnlyRisk((v) => !v)}
          className={cn(
            "rounded-[10px] border px-3.5 py-2.5 text-left transition hover:border-navy-3/40",
            onlyRisk
              ? "border-navy bg-navy text-white shadow-sm"
              : riskCount > 0
              ? "border-brand/30 bg-brand-soft/40 text-ink"
              : "border-line bg-white text-ink",
          )}
        >
          <div className={cn("text-[11.5px] font-medium", onlyRisk ? "text-white/80" : "text-muted")}>Em risco / parados</div>
          <div className={cn("mt-0.5 text-[22px] font-bold tracking-tight", onlyRisk ? "text-white" : riskCount > 0 ? "text-brand" : "text-ink")}>
            {riskCount}
          </div>
          <div className={cn("truncate text-[11px]", onlyRisk ? "text-white/70" : "text-muted")}>
            {onlyRisk ? "clique para mostrar todos" : "clique para filtrar"}
          </div>
        </button>
        <div className="rounded-[10px] border border-line bg-white px-3.5 py-2.5">
          <div className="text-[11.5px] font-medium text-muted">Vendas ganhas</div>
          <div className="mt-0.5 text-[22px] font-bold tracking-tight text-ok">{wonTotal ? moneyShort(wonTotal) : "—"}</div>
          <div className="truncate text-[11px] text-muted">
            {wonDeals.length} {wonDeals.length === 1 ? "venda" : "vendas"} · {hasPeriod ? "no período" : "últimos 90 dias"}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-[300px]">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa ou cidade..." className="pl-9" />
        </div>
        {isManager(user) && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto">
            <option value="">Todos os vendedores</option>
            {s.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short}
              </option>
            ))}
          </Select>
        )}
        <RegionSelect value={regiao} onChange={setRegiao} ufs={s.companies.map((c) => c.uf)} />
        <PeriodFilter value={period} onChange={setPeriod} />
        <button
          type="button"
          onClick={() => setOnlyRisk((v) => !v)}
          className={cn("inline-flex h-10 items-center gap-1.5 rounded-[6px] border px-3 text-[12.5px]", onlyRisk ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:text-ink")}
        >
          <AlertTriangle size={14} /> Só com risco
        </button>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1 px-2 text-[12.5px] text-muted hover:text-ink">
            <X size={14} /> limpar
          </button>
        )}
        <span className="ml-auto hidden xl:inline text-[12px] text-muted">{FUNNELS[funnel].subtitulo}</span>
      </div>

      <div ref={boardRef} className={cn("scrollbar-thin -mx-4 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 2xl:-mx-8 2xl:px-8 lg:min-h-0 lg:flex-1 lg:overflow-y-hidden", drag?.active && "select-none cursor-grabbing")}>
        {/* Cada etapa ganha uma fatia igual da largura, nunca menos que 240px: telas largas mostram todas. */}
        <div className="grid h-full auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3">
          {stages.map((st, stIdx) => {
            const col = deals
              .filter((d) => stageKeyToUi(d.stageId) === st.id && (!onlyRisk || (d.status === "aberta" && risky(d))))
              .sort((a, b) => {
                if (st.terminal) return (b.closedAt ?? "").localeCompare(a.closedAt ?? "");
                const ra = risky(a) ? 0 : 1;
                const rb = risky(b) ? 0 : 1;
                if (ra !== rb) return ra - rb;
                return (a.stageEnteredAt ?? "").localeCompare(b.stageEnteredAt ?? "");
              });
            const total = col.reduce((a, d) => a + (d.valorRealizado ?? d.valor ?? 0), 0);
            const isOverOther = Boolean(drag?.active && over === st.id && draggedDeal && stageKeyToUi(draggedDeal.stageId) !== st.id);
            const isValidDrop = isOverOther && stIdx > draggedFromIdx;
            const isInvalidDrop = isOverOther && stIdx < draggedFromIdx;
            return (
              <section
                key={st.id}
                data-stage-id={st.id}
                className={cn(
                  "flex min-h-0 min-w-0 flex-col rounded-[8px] border transition-all duration-150 lg:h-full",
                  st.terminal ? "border-line bg-ok-soft/30" : "border-line bg-soft/50",
                  isValidDrop && "border-navy/50 bg-navy/[0.04] ring-2 ring-navy/15",
                  isInvalidDrop && "border-brand/40 bg-brand-soft/20",
                )}
              >
                <header className="border-b border-line/80 px-3 pt-2.5 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                      {st.terminal && <Trophy size={14} className="text-ok" />}
                      {st.nome}
                    </h3>
                    <span className="rounded-full bg-white px-2 text-[11px] leading-5 font-bold text-navy-3">{col.length}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between text-[11px] text-muted">
                    <span>{total ? moneyShort(total) : "—"}</span>
                    <span>{st.terminal ? (hasPeriod ? "no período" : "últimos 90 dias") : `limite ${st.limiteDias}d`}</span>
                  </div>
                </header>
                <div className="scrollbar-thin flex min-h-[220px] flex-1 flex-col gap-2 overflow-y-auto p-2 lg:min-h-0">
                  {isValidDrop && (
                    <div className="rounded-[8px] border-2 border-dashed border-navy/40 bg-navy/[0.05] px-3 py-2.5 text-center text-[11.5px] font-semibold text-navy transition-all">
                      Soltar para mover para {st.nome}
                    </div>
                  )}
                  {isInvalidDrop && (
                    <div className="rounded-[8px] border border-dashed border-brand/40 bg-brand-soft/30 px-3 py-2 text-center text-[11px] font-medium text-brand">
                      Não é possível voltar etapa
                    </div>
                  )}
                  {col.map((d) => {
                    const c = s.companies.find((x) => x.id === d.companyId)!;
                    const next = nextStepOf(s, d.companyId);
                    const stagnant = d.status === "aberta" && isStagnant(d, now);
                    const overdue = next && new Date(next.dueAt) < new Date(now.toDateString());
                    const sug = s.suggestions.some((x) => x.companyId === c.id && x.status === "pendente");
                    const isRisk = d.status === "aberta" && (stagnant || (!next && c.status === "ativa") || Boolean(overdue));
                    const isDragging = drag?.active && drag.dealId === d.id;
                    return (
                      <article
                        key={d.id}
                        onPointerDown={(e) => startPointerDrag(e, d)}
                        className={cn(
                          "group rounded-[8px] border bg-white p-3 transition-all duration-150 hover:border-navy-3/30",
                          d.status === "aberta" && "cursor-grab touch-none",
                          isRisk ? "border-brand/30 border-l-[3px] border-l-brand bg-brand-soft/10" : "border-line",
                          isDragging && "border-dashed border-navy/35 bg-navy/[0.03] opacity-35 scale-[0.98]",
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical size={14} className="mt-0.5 shrink-0 text-line group-hover:text-muted" />
                          <div className="min-w-0 flex-1">
                            <Link href={`/empresas/${c.id}`} className="block truncate text-[13px] leading-snug font-medium text-ink hover:underline">
                              {c.nome}
                            </Link>
                            <div className="truncate text-[11px] text-muted">
                              {c.cidade}/{c.uf} · {d.titulo}
                            </div>
                          </div>
                          <UserAvatar userId={c.ownerId} size={22} />
                        </div>
                        {d.status === "ganha" ? (
                          <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                            <Badge tone="green">{saleLabel(d)}</Badge>
                            <span className="text-[11px] text-muted">{fmtDateShort(d.closedAt)}</span>
                            <span className="ml-auto text-[13.5px] font-bold text-ok">{moneyShort(d.valorRealizado ?? d.valor)}</span>
                          </div>
                        ) : (
                          <>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <DaysInStage deal={d} />
                              {c.status === "espera" && (
                                <Badge tone="amber">
                                  <Pause size={10} /> espera
                                </Badge>
                              )}
                              {inSupport(s, c.id) && (
                                <Badge tone="amber">
                                  <Headset size={10} /> em suporte
                                </Badge>
                              )}
                              {c.influenciadoraId && (
                                <Badge tone="ai">
                                  <GitMerge size={10} /> dependente
                                </Badge>
                              )}
                              {sug && <AIBadge label="sugestão" />}
                              {d.valor ? <span className="ml-auto text-[11.5px] font-semibold text-ink">{moneyShort(d.valor)}</span> : null}
                            </div>
                            <div className={cn("mt-2 rounded-[6px] px-2 py-1.5 text-[11.5px]", overdue ? "bg-brand-soft/60" : "bg-soft/70")}>
                              {c.status === "espera" ? (
                                <span className="text-warn">{c.standby?.motivo}</span>
                              ) : next ? (
                                <>
                                  <div className="truncate font-medium text-ink">{next.titulo}</div>
                                  <DueLabel iso={next.dueAt} className="text-[11px]" />
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    open({ kind: "newActivity", companyId: c.id });
                                  }}
                                  className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                                  title="Agendar próximo passo"
                                >
                                  <AlertTriangle size={11} /> Sem próximo passo
                                </button>
                              )}
                            </div>
                          </>
                        )}
                        {d.status === "aberta" && (
                          <div className="mt-1.5 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => open({ kind: "quick", companyId: c.id })}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-[4px] py-1 text-[11px] font-semibold text-navy hover:bg-navy/5"
                              title="Registrar atividade"
                            >
                              <Sparkles size={11} /> Registrar
                            </button>
                            <button
                              type="button"
                              onClick={() => open({ kind: "viewStage", dealId: d.id })}
                              className="flex-1 rounded-[4px] py-1 text-[11px] font-semibold text-navy-3 hover:bg-soft"
                            >
                              Etapa
                            </button>
                            <button type="button" onClick={() => startMove(d)} className="flex-1 rounded-[4px] py-1 text-[11px] font-semibold text-navy-3 hover:bg-soft">
                              Mover →
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {col.length === 0 && !isOverOther && <div className="grid flex-1 place-items-center py-6 text-[11.5px] text-muted/70">Vazio</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Cartão flutuante animado dentro do sistema durante o arraste */}
      {drag?.active && draggedDeal && (() => {
        const c = s.companies.find((x) => x.id === draggedDeal.companyId);
        if (!c) return null;
        const next = nextStepOf(s, draggedDeal.companyId);
        const stagnant = isStagnant(draggedDeal, now);
        const overdue = next && new Date(next.dueAt) < new Date(now.toDateString());
        const isRisk = stagnant || (!next && c.status === "ativa") || Boolean(overdue);
        return (
          <div
            style={{
              position: "fixed",
              left: drag.x,
              top: drag.y,
              width: drag.width,
              zIndex: 60,
              pointerEvents: "none",
            }}
            className={cn(
              "rounded-[8px] border bg-white p-3 shadow-2xl ring-2 ring-navy/20 rotate-[1.5deg] scale-[1.03]",
              isRisk ? "border-brand/40 border-l-[3px] border-l-brand" : "border-navy/30",
            )}
          >
            <div className="flex items-start gap-1.5">
              <GripVertical size={14} className="mt-0.5 shrink-0 text-navy" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] leading-snug font-semibold text-ink">{c.nome}</div>
                <div className="truncate text-[11px] text-muted">
                  {c.cidade}/{c.uf} · {draggedDeal.titulo}
                </div>
              </div>
              <UserAvatar userId={c.ownerId} size={22} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <DaysInStage deal={draggedDeal} />
              {draggedDeal.valor ? <span className="ml-auto text-[11.5px] font-semibold text-ink">{moneyShort(draggedDeal.valor)}</span> : null}
            </div>
            {next && (
              <div className={cn("mt-2 rounded-[6px] px-2 py-1.5 text-[11.5px]", overdue ? "bg-brand-soft/60" : "bg-soft/70")}>
                <div className="truncate font-medium text-ink">{next.titulo}</div>
                <DueLabel iso={next.dueAt} className="text-[11px]" />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export default function FunisPage() {
  return (
    <Suspense>
      <Kanban />
    </Suspense>
  );
}
