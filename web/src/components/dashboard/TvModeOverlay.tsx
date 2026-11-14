"use client";

import { Activity, AlertTriangle, CalendarClock, Maximize2, Minimize2, Pause, Play, Radio, TrendingUp, Trophy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/crm/crm";
import type { salesByMonth, SellerDetail } from "@/lib/dashboard";
import { fmtDateShort } from "@/lib/dates";
import type { Metric } from "@/lib/selectors";
import type { Company, Deal, User } from "@/lib/types";
import { cn, money, moneyShort } from "@/lib/utils";
import { dealValue } from "@/lib/selectors";

interface TvModeOverlayProps {
  open: boolean;
  onClose: () => void;
  now: Date;
  monthSold: number;
  monthGoal: number;
  monthElapsedPct: number;
  metrics: Record<string, Metric>;
  sellers: (SellerDetail & { whatsapp: number })[];
  months: ReturnType<typeof salesByMonth>;
  closedDeals: Deal[];
  companies: Company[];
  users: User[];
  bottleneck: { stageName: string; count: number; valor: number; overLimit?: { name: string; media: number; limite: number } } | null;
}

export function TvModeOverlay({
  open,
  onClose,
  now,
  monthSold,
  monthGoal,
  monthElapsedPct,
  metrics,
  sellers,
  months,
  closedDeals,
  companies,
  users,
  bottleneck,
}: TvModeOverlayProps) {
  const [clock, setClock] = useState(() => new Date());
  const [slide, setSlide] = useState<0 | 1>(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!open || !autoRotate) return;
    const t = setInterval(() => setSlide((s) => (s === 0 ? 1 : 0)), 18_000);
    return () => clearInterval(t);
  }, [open, autoRotate]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
      return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }, [open]);

  if (!open) return null;

  const goalPct = monthGoal > 0 ? Math.min(140, Math.round((monthSold / monthGoal) * 100)) : 0;
  const expectedNow = monthGoal * (monthElapsedPct / 100);
  const onPace = monthGoal <= 0 ? true : monthSold >= expectedNow;
  const paceDiff = monthSold - expectedNow;
  const maxMonthVal = Math.max(1, ...months.map((m) => m.valor));
  const wonDeals = closedDeals.filter((d) => d.status === "ganha").slice(0, 5);

  const avgExec = sellers.length
    ? Math.round(
        sellers.reduce((sum, s) => sum + (s.noPrazo ?? 100), 0) / sellers.length,
      )
    : 100;

  const leaderboard = [...sellers].sort((a, b) => b.vendido - a.vendido || b.avancos - a.avancos || b.concluidas - a.concluidas);

  const toggleFs = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  };

  const timeStr = clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#080c14] text-slate-100">
      {/* Top Bar TV */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0d1320] px-6 py-3.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-brand font-black text-white">T</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold tracking-tight text-white">TAWPER · PAINEL COMERCIAL</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  <Radio size={12} className="animate-pulse" />
                  Ao vivo
                </span>
              </div>
              <div className="text-[12px] capitalize text-slate-400">{dateStr}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="mr-2 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-[12px]">
            <button
              type="button"
              onClick={() => setSlide(0)}
              className={cn("rounded-md px-2.5 py-1 font-semibold transition", slide === 0 ? "bg-white text-slate-950" : "text-slate-300 hover:text-white")}
            >
              Visão Geral
            </button>
            <button
              type="button"
              onClick={() => setSlide(1)}
              className={cn("rounded-md px-2.5 py-1 font-semibold transition", slide === 1 ? "bg-white text-slate-950" : "text-slate-300 hover:text-white")}
            >
              Evolução & Gargalos
            </button>
            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              title={autoRotate ? "Pausar rotação automática" : "Ativar rotação automática"}
              className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              {autoRotate ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>

          <div className="font-mono text-[22px] font-bold tabular-nums text-white">{timeStr}</div>

          <button
            type="button"
            onClick={toggleFs}
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            className="rounded-lg border border-white/15 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12.5px] font-semibold text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
            Sair (Esc)
          </button>
        </div>
      </header>

      {/* Conteúdo TV */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {/* Barra de Meta do Mês + Big Numbers */}
        <div className="grid shrink-0 gap-4 xl:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]">
          <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#101829] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ritmo da Meta · Mês atual</div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="text-[30px] font-black leading-none tabular-nums text-white">{moneyShort(monthSold)}</span>
                  {monthGoal > 0 && <span className="text-[14px] text-slate-400">de {moneyShort(monthGoal)}</span>}
                </div>
              </div>
              {monthGoal > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                    goalPct >= 100
                      ? "bg-emerald-500/20 text-emerald-300"
                      : onPace
                        ? "bg-sky-500/20 text-sky-300"
                        : "bg-rose-500/20 text-rose-300",
                  )}
                >
                  {goalPct >= 100 ? "Meta batida!" : onPace ? `+${moneyShort(paceDiff)} no ritmo` : `${moneyShort(Math.abs(paceDiff))} abaixo do ritmo`}
                </span>
              )}
            </div>
            {monthGoal > 0 ? (
              <div className="mt-3">
                <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", goalPct >= 100 ? "bg-emerald-400" : onPace ? "bg-sky-400" : "bg-amber-400")}
                    style={{ width: `${Math.min(100, goalPct)}%` }}
                  />
                  <div
                    title={`Ritmo esperado hoje: ${monthElapsedPct}%`}
                    className="absolute top-0 bottom-0 w-0.5 bg-white/90"
                    style={{ left: `${Math.min(99, Math.max(1, monthElapsedPct))}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[11.5px] text-slate-400">
                  <span>{goalPct}% atingido</span>
                  <span>Esperado hoje: {monthElapsedPct}%</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-[12px] text-slate-400">Configure a meta anual para acompanhar o ritmo diário na TV.</div>
            )}
          </div>

          <TvStat label="Em negociação" value={metrics.negociacao.value} sub={metrics.negociacao.sub} tone="info" />
          <TvStat label="Propostas abertas" value={metrics.propostas.value} sub={metrics.propostas.sub} tone="info" />
          <TvStat label="Ganhos (30d)" value={metrics.ganhos.value} sub={metrics.ganhos.sub} tone="ok" />
          <TvStat
            label="Execução da equipe"
            value={`${avgExec}%`}
            sub={`${metrics.atrasadas.value} atrasadas · ${metrics.estagnadas.value} estagnadas`}
            tone={avgExec >= 80 ? "ok" : avgExec >= 65 ? "warn" : "bad"}
          />
        </div>

        {/* Painel central alternável */}
        {slide === 0 ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
            {/* Placar da Equipe */}
            <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-[#101829] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Incentivo & Execução</div>
                  <h2 className="text-[18px] font-bold text-white">Placar da Equipe</h2>
                </div>
                <span className="text-[12px] text-slate-400">Vendido · No prazo · Avanços</span>
              </div>
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                {leaderboard.map((r, idx) => {
                  const late = r.atrasadas.reduce((a, b) => a + b, 0);
                  const exec = r.noPrazo ?? 100;
                  return (
                    <div key={r.user.id} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full text-[14px] font-black",
                          idx === 0 ? "bg-amber-400 text-slate-950" : idx === 1 ? "bg-slate-300 text-slate-950" : idx === 2 ? "bg-amber-700 text-white" : "bg-white/10 text-slate-300",
                        )}
                      >
                        {idx + 1}
                      </span>
                      <UserAvatar userId={r.user.id} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[16px] font-bold text-white">{r.user.name}</span>
                          <span className="text-[18px] font-black tabular-nums text-emerald-400">
                            {r.vendido > 0 ? moneyShort(r.vendido) : "R$ 0"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={cn("h-full rounded-full", exec >= 80 ? "bg-emerald-400" : exec >= 60 ? "bg-amber-400" : "bg-rose-500")}
                              style={{ width: `${Math.min(100, exec)}%` }}
                            />
                          </div>
                          <span className="text-[12.5px] font-semibold tabular-nums text-slate-300">
                            {r.noPrazo === null ? "—" : `${exec}% no prazo`}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-slate-400">
                          <span>{r.concluidas} feitas</span>
                          <span>{r.avancos} avanços de etapa</span>
                          {late > 0 ? (
                            <span className="font-bold text-rose-400">{late} atrasadas</span>
                          ) : (
                            <span className="font-semibold text-emerald-400">Em dia</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Direita: Últimos ganhos + Gargalos */}
            <div className="flex min-h-0 flex-col gap-4">
              <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-[#101829] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Celebração</div>
                    <h2 className="text-[18px] font-bold text-white">Últimos Ganhos</h2>
                  </div>
                  <Trophy size={20} className="text-amber-400" />
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {wonDeals.length === 0 && (
                    <div className="py-8 text-center text-[13px] text-slate-400">Nenhuma venda fechada neste período ainda.</div>
                  )}
                  {wonDeals.map((d) => {
                    const comp = companies.find((c) => c.id === d.companyId);
                    const seller = users.find((u) => u.id === d.ownerId);
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-bold text-white">{comp?.nome ?? "Cliente"}</div>
                          <div className="text-[12px] text-emerald-200/80">
                            {seller?.short ?? "Equipe"} · {fmtDateShort(d.closedAt)}
                          </div>
                        </div>
                        <div className="shrink-0 text-[16px] font-black tabular-nums text-emerald-300">{moneyShort(dealValue(d))}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-3">
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-rose-300">
                    <CalendarClock size={14} /> Atrasos agora
                  </div>
                  <div className="mt-1 text-[28px] font-black tabular-nums text-white">{metrics.atrasadas.value}</div>
                  <div className="text-[11.5px] text-rose-200/80">{metrics.semProximo.value} sem próximo passo</div>
                </div>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    <AlertTriangle size={14} /> Estagnadas
                  </div>
                  <div className="mt-1 text-[28px] font-black tabular-nums text-white">{metrics.estagnadas.value}</div>
                  <div className="text-[11.5px] text-amber-200/80">
                    {bottleneck ? `Foco: ${bottleneck.stageName}` : "Funil fluindo"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
            {/* Vendas últimos 6 meses */}
            <div className="flex flex-col rounded-xl border border-white/10 bg-[#101829] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tendência</div>
                  <h2 className="text-[18px] font-bold text-white">Vendas por mês (últimos 6 meses)</h2>
                </div>
                <TrendingUp size={20} className="text-sky-400" />
              </div>
              <div className="flex flex-1 items-end gap-4 pt-6">
                {months.map((mo) => {
                  const pct = Math.max(6, Math.round((mo.valor / maxMonthVal) * 100));
                  return (
                    <div key={mo.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[13px] font-bold tabular-nums text-white">{moneyShort(mo.valor)}</span>
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t-lg bg-gradient-to-t from-sky-600 to-sky-400 transition-all"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-semibold uppercase text-slate-400">{mo.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Inteligência de Gargalo */}
            <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#101829] p-5">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Inteligência Comercial</div>
                    <h2 className="text-[18px] font-bold text-white">Onde o dinheiro está concentrado e travando</h2>
                  </div>
                  <Activity size={20} className="text-amber-400" />
                </div>

                {bottleneck ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-[12px] uppercase tracking-wider text-slate-400">Maior volume financeiro no funil</div>
                      <div className="mt-1 text-[22px] font-black text-white">{bottleneck.stageName}</div>
                      <div className="mt-1 text-[14px] text-sky-300">
                        {bottleneck.count} contas · {money(bottleneck.valor)} em aberto
                      </div>
                    </div>

                    {bottleneck.overLimit && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
                        <div className="text-[12px] uppercase tracking-wider text-rose-300">Etapa acima do prazo limite</div>
                        <div className="mt-1 text-[22px] font-black text-white">{bottleneck.overLimit.name}</div>
                        <div className="mt-1 text-[14px] text-rose-200">
                          Média de {bottleneck.overLimit.media} dias (limite ideal: {bottleneck.overLimit.limite} dias)
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-10 text-center text-slate-400">Sem gargalos críticos detectados no momento.</div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-slate-300">
                Conversão atual: <b className="text-white">{metrics.conversao.value}</b> · Recorrência ativa:{" "}
                <b className="text-white">{metrics.recorrencia.value}</b>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TvStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "ok" | "warn" | "bad" | "info" }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#101829] p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div
        className={cn(
          "mt-1 text-[30px] font-black leading-none tabular-nums",
          tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : tone === "bad" ? "text-rose-400" : "text-white",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-2 truncate text-[12px] text-slate-400">{sub}</div>}
    </div>
  );
}
