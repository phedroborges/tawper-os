"use client";

import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  FileText,
  Handshake,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Target,
  Trophy,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ColumnChart } from "@/components/charts/Charts";
import { UserAvatar } from "@/components/crm/crm";
import { Badge, Button, Card, CardHeader, Empty, Progress, Segmented, Stat } from "@/components/ui/primitives";
import { saleLabel } from "@/lib/constants";
import type { salesByMonth, SellerDetail } from "@/lib/dashboard";
import { fmtDateShort } from "@/lib/dates";
import { dealValue, type Metric } from "@/lib/selectors";
import type { Company, Deal, User } from "@/lib/types";
import { cn, money, moneyShort } from "@/lib/utils";

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
  const [slide, setSlide] = useState<"geral" | "evolucao">("geral");
  const [autoRotate, setAutoRotate] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!open || !autoRotate) return;
    const t = setInterval(() => setSlide((s) => (s === "geral" ? "evolucao" : "geral")), 18_000);
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
  const wonDeals = closedDeals.filter((d) => d.status === "ganha").slice(0, 6);

  const avgExec = sellers.length
    ? Math.round(sellers.reduce((sum, s) => sum + (s.noPrazo ?? 100), 0) / sellers.length)
    : 100;

  const leaderboard = [...sellers].sort(
    (a, b) => b.vendido - a.vendido || b.avancos - a.avancos || b.concluidas - a.concluidas,
  );

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
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper text-ink">
      {/* Topbar idêntica ao Design System da Tawper */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-6">
        <div className="flex items-center gap-4">
          <Image src="/brand/tawper-logo.png" alt="Tawper" width={293} height={83} className="h-auto w-[116px]" priority />
          <span className="h-6 w-px bg-line" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-ink">Painel Comercial</span>
              <Badge tone="green">
                <span className="size-1.5 animate-pulse rounded-full bg-ok" />
                Ao vivo
              </Badge>
            </div>
            <div className="text-[11.5px] capitalize text-muted">{dateStr}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Segmented
            value={slide}
            onChange={setSlide}
            options={[
              { value: "geral", label: "Visão Geral" },
              { value: "evolucao", label: "Evolução & Funil" },
            ]}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoRotate((v) => !v)}
            title={autoRotate ? "Pausar alternância automática" : "Ativar alternância automática"}
            className="border border-line bg-white"
          >
            {autoRotate ? <Pause size={14} /> : <Play size={14} />}
            <span className="hidden sm:inline">{autoRotate ? "Auto" : "Pausado"}</span>
          </Button>

          <div className="rounded-[6px] border border-line bg-soft px-3 py-1.5 text-[16px] font-bold tabular-nums text-ink">
            {timeStr}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFs}
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            className="border border-line bg-white px-2.5"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </Button>

          <Button variant="outline" size="sm" onClick={onClose}>
            <X size={15} />
            Sair (Esc)
          </Button>
        </div>
      </header>

      {/* Corpo do Modo TV seguindo os componentes do sistema */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        {/* Linha 1: Ritmo da Meta + 4 Stats do sistema */}
        <div className="grid shrink-0 gap-3.5 xl:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))]">
          <Card className="flex flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <Target size={13} className="text-brand" />
                  Ritmo da Meta · Mês atual
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[26px] font-bold leading-none tabular-nums text-ink">{moneyShort(monthSold)}</span>
                  {monthGoal > 0 && <span className="text-[13px] text-muted">de {moneyShort(monthGoal)}</span>}
                </div>
              </div>
              {monthGoal > 0 && (
                <Badge tone={goalPct >= 100 ? "green" : onPace ? "navy" : "red"}>
                  {goalPct >= 100
                    ? "Meta batida"
                    : onPace
                      ? `+${moneyShort(paceDiff)} acima do ritmo`
                      : `${moneyShort(Math.abs(paceDiff))} abaixo do ritmo`}
                </Badge>
              )}
            </div>

            {monthGoal > 0 ? (
              <div className="mt-3">
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-soft">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", goalPct >= 100 ? "bg-ok" : onPace ? "bg-navy" : "bg-brand")}
                    style={{ width: `${Math.min(100, goalPct)}%` }}
                  />
                  <div
                    title={`Ritmo esperado hoje (${monthElapsedPct}%)`}
                    className="absolute top-0 bottom-0 w-0.5 bg-ink/70"
                    style={{ left: `${Math.min(99, Math.max(1, monthElapsedPct))}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[11.5px] text-muted">
                  <span>
                    <b className="text-ink">{goalPct}%</b> da meta atingida
                  </span>
                  <span>
                    Esperado hoje: <b className="text-ink">{monthElapsedPct}%</b>
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[12px] text-muted">Meta mensal não configurada.</div>
            )}
          </Card>

          <Stat label="Em negociação" value={metrics.negociacao.value} sub={metrics.negociacao.sub} icon={<Handshake size={15} />} />
          <Stat label="Propostas abertas" value={metrics.propostas.value} sub={metrics.propostas.sub} icon={<FileText size={15} />} />
          <Stat label="Ganhos (30d)" value={metrics.ganhos.value} sub={metrics.ganhos.sub} tone="good" icon={<Trophy size={15} />} />
          <Stat
            label="Execução no prazo"
            value={`${avgExec}%`}
            sub={`${metrics.feitas.value} concluídas · ${metrics.atrasadas.value} atrasadas`}
            tone={avgExec >= 80 ? "good" : avgExec >= 60 ? "warn" : "bad"}
            icon={<CheckCircle2 size={15} />}
          />
        </div>

        {/* Painel principal alternável */}
        {slide === "geral" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
            {/* Esquerda: Placar da Equipe */}
            <Card className="flex min-h-0 flex-col">
              <CardHeader
                kicker="Incentivo e compromisso · ordenado por resultado e avanço"
                title="Placar da equipe"
                action={<span className="text-[11.5px] text-muted">{leaderboard.length} vendedores ativos</span>}
              />
              <div className="scrollbar-thin min-h-0 flex-1 divide-y divide-line/70 overflow-y-auto">
                {leaderboard.map((r, idx) => {
                  const late = r.atrasadas.reduce((a, b) => a + b, 0);
                  const exec = r.noPrazo ?? 100;
                  return (
                    <div key={r.user.id} className="flex items-center gap-3.5 px-4 py-3">
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full border text-[12px] font-bold tabular-nums",
                          idx === 0
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : idx === 1
                              ? "border-slate-300 bg-slate-100 text-slate-700"
                              : idx === 2
                                ? "border-orange-300 bg-orange-50 text-orange-800"
                                : "border-line bg-soft text-muted",
                        )}
                      >
                        {idx + 1}º
                      </span>
                      <UserAvatar userId={r.user.id} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[14px] font-semibold text-ink">{r.user.name}</span>
                          <span className="text-[15px] font-bold tabular-nums text-ink">
                            {r.vendido > 0 ? moneyShort(r.vendido) : "R$ 0"}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <Progress
                            value={exec}
                            tone={exec >= 80 ? "green" : exec >= 60 ? "amber" : "red"}
                            className="flex-1"
                          />
                          <span
                            className={cn(
                              "w-24 text-right text-[11.5px] font-semibold tabular-nums",
                              exec >= 80 ? "text-ok" : exec >= 60 ? "text-warn" : "text-brand",
                            )}
                          >
                            {r.noPrazo === null ? "—" : `${exec}% no prazo`}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 text-[11.5px] text-muted">
                          <span>{r.concluidas} feitas</span>
                          <span>{r.avancos} avanços de etapa</span>
                          <span>{r.registros} registros</span>
                          {late > 0 ? (
                            <span className="font-semibold text-brand">{late} atrasadas</span>
                          ) : (
                            <span className="font-semibold text-ok">Em dia</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Direita: Últimos ganhos + Saúde operacional */}
            <div className="flex min-h-0 flex-col gap-4">
              <Card className="flex min-h-0 flex-1 flex-col">
                <CardHeader kicker="Fechamentos recentes" title="Últimos ganhos" action={<Trophy size={15} className="text-ok" />} />
                <div className="scrollbar-thin min-h-0 flex-1 divide-y divide-line/70 overflow-y-auto">
                  {wonDeals.length === 0 && <Empty title="Nenhum fechamento neste período" />}
                  {wonDeals.map((d) => {
                    const comp = companies.find((c) => c.id === d.companyId);
                    const seller = users.find((u) => u.id === d.ownerId);
                    return (
                      <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ok text-white">
                          <Trophy size={13} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-ink">{comp?.nome ?? "Cliente"}</div>
                          <div className="truncate text-[11.5px] text-muted">
                            {seller?.short ?? "Equipe"} · {saleLabel(d)} · {fmtDateShort(d.closedAt)}
                          </div>
                        </div>
                        <div className="shrink-0 text-[13.5px] font-bold tabular-nums text-ink">{moneyShort(dealValue(d))}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="shrink-0">
                <CardHeader kicker="Onde agir agora" title="Saúde e cobrança" />
                <div className="grid grid-cols-3 divide-x divide-line/80 p-3.5">
                  <div className="pr-3">
                    <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand">
                      <CalendarClock size={12} /> Atrasos
                    </div>
                    <div className="mt-1 text-[22px] font-bold tabular-nums text-brand">{metrics.atrasadas.value}</div>
                    <div className="text-[11px] text-muted">tarefas vencidas</div>
                  </div>
                  <div className="px-3">
                    <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <CircleAlert size={12} className="text-brand" /> Sem próximo passo
                    </div>
                    <div className="mt-1 text-[22px] font-bold tabular-nums text-ink">{metrics.semProximo.value}</div>
                    <div className="text-[11px] text-muted">contas ativas</div>
                  </div>
                  <div className="pl-3">
                    <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <AlertTriangle size={12} className="text-warn" /> Estagnadas
                    </div>
                    <div className="mt-1 text-[22px] font-bold tabular-nums text-ink">{metrics.estagnadas.value}</div>
                    <div className="truncate text-[11px] text-muted">
                      {bottleneck ? `Foco: ${bottleneck.stageName}` : "Dentro do prazo"}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
            <Card className="flex min-h-0 flex-col">
              <CardHeader kicker="Últimos 6 meses" title="Vendas por mês" />
              <div className="flex flex-1 flex-col justify-center px-4 py-4">
                <ColumnChart
                  target={monthGoal > 0 ? monthGoal : undefined}
                  targetLabel={monthGoal > 0 ? `meta do mês ${moneyShort(monthGoal)}` : undefined}
                  rows={months.map((mo) => ({
                    key: mo.key,
                    label: mo.label,
                    value: mo.valor,
                    display: moneyShort(mo.valor),
                    tooltip: (
                      <>
                        <b>{money(mo.valor)}</b> em {mo.vendas} {mo.vendas === 1 ? "venda" : "vendas"}
                      </>
                    ),
                  }))}
                />
              </div>
            </Card>

            <Card className="flex min-h-0 flex-col justify-between">
              <div>
                <CardHeader
                  kicker="Inteligência comercial"
                  title="Onde o funil concentra valor e tempo"
                  action={<Activity size={15} className="text-muted" />}
                />
                <div className="space-y-3 p-4">
                  {bottleneck ? (
                    <>
                      <div className="rounded-[8px] border border-line bg-soft/40 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Maior concentração financeira no funil
                        </div>
                        <div className="mt-1 text-[20px] font-bold text-ink">{bottleneck.stageName}</div>
                        <div className="mt-0.5 text-[13px] font-semibold text-navy">
                          {bottleneck.count} contas · {money(bottleneck.valor)} em aberto
                        </div>
                      </div>

                      {bottleneck.overLimit && (
                        <div className="rounded-[8px] border border-brand/30 bg-brand-soft/40 p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                            Etapa demorando acima do limite
                          </div>
                          <div className="mt-1 text-[20px] font-bold text-ink">{bottleneck.overLimit.name}</div>
                          <div className="mt-0.5 text-[13px] text-ink">
                            Tempo médio de <b>{bottleneck.overLimit.media} dias</b> (limite da etapa: {bottleneck.overLimit.limite}d)
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <Empty title="Sem gargalos críticos no momento" />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12.5px]">
                <span>
                  Conversão: <b className="text-ink">{metrics.conversao.value}</b>
                </span>
                <span>
                  Recorrência em dia: <b className="text-ink">{metrics.recorrencia.value}</b>
                </span>
                <span>
                  Carteira ativa: <b className="text-ink">{metrics.ativas.value} contas</b>
                </span>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
