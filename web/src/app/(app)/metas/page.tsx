"use client";

import { AlertTriangle, Award, Check, ClipboardCheck, Flame, Medal, Sparkles, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DotMatrixChart, PillSparkBars, ProportionalBarList, SegmentedMixBar } from "@/components/charts/MicroCharts";
import { TypeIcon, UserAvatar } from "@/components/crm/crm";
import { DraggableWidgetGrid, type DashboardWidgetDef } from "@/components/dashboard/DraggableWidgetGrid";
import { Badge, Card, Empty, LinkButton, PageHeader, Progress, Segmented, Select } from "@/components/ui/primitives";
import { isAdmin, isManager } from "@/lib/constants";
import { salesByMonth } from "@/lib/dashboard";
import {
  annualGoalOf,
  basePeriodGoal,
  DEFAULT_AWARD_CONFIG,
  elapsed,
  multidimensionalRanking,
  PERIOD_LABEL,
  periodGoal,
  periodRange,
  ranking,
  recordGoalForSeller,
  recordRegressionPace,
  salesOf,
  salesPath,
  sellerDailyActivityMatrix,
  sellerRecordsDone,
  sellersOf,
  sold,
  TARGET_UNIT,
  TARGET_WINDOW,
  targetDone,
  type GoalPeriod,
  type SellerIaSnapshot,
} from "@/lib/goals";
import { useNow } from "@/lib/hooks";
import { recordResult, type AgentRecord } from "@/lib/registros";
import { useCurrentUser, useStore } from "@/lib/store";
import { cn, money, moneyShort } from "@/lib/utils";

const MEDALS = [
  {
    nome: "Ouro",
    box: "border-amber-400/70 bg-amber-100/90 dark:border-amber-400/40 dark:bg-amber-500/15",
    text: "text-amber-800 dark:text-amber-200",
    altura: "h-28",
  },
  {
    nome: "Prata",
    box: "border-slate-300 bg-slate-100 dark:border-slate-400/40 dark:bg-slate-400/15",
    text: "text-slate-600 dark:text-slate-200",
    altura: "h-20",
  },
  {
    nome: "Bronze",
    box: "border-orange-400/60 bg-orange-100/90 dark:border-orange-400/40 dark:bg-orange-500/15",
    text: "text-orange-800 dark:text-orange-200",
    altura: "h-14",
  },
];

/** Ritmo: vendido comparado com o que já deveria estar vendido hoje, no período. */
function Pace({ vendido, meta, fracao }: { vendido: number; meta: number; fracao: number }) {
  if (meta <= 0) return null;
  if (vendido >= meta) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] bg-ok-soft px-2 py-0.5 text-[11.5px] font-semibold text-ok">
        <Flame size={12} /> Meta batida!
      </span>
    );
  }
  const esperado = meta * fracao;
  const acima = vendido >= esperado;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-medium", acima ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand")}>
      {acima ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {acima ? "no ritmo para bater" : `${moneyShort(esperado - vendido)} abaixo do ritmo hoje`}
    </span>
  );
}

/** Metas: pódio multidimensional, constância em matriz de pontinhos, meta da empresa e caminho individual. */
export default function MetasPage() {
  const user = useCurrentUser();
  const now = useNow();
  const goals = useStore((s) => s.config.goals);
  const users = useStore((s) => s.users);
  const deals = useStore((s) => s.deals);
  const activities = useStore((s) => s.activities);
  const interactions = useStore((s) => s.interactions);
  const [period, setPeriod] = useState<GoalPeriod>("mes");
  const manager = isManager(user);
  const sellers = useMemo(() => sellersOf(users, goals?.participantes), [users, goals?.participantes]);
  const [who, setWho] = useState("");
  const [records, setRecords] = useState<AgentRecord[]>([]);
  const sales = useMemo(() => salesOf(deals), [deals]);

  // Busca registros do WhatsApp IA para medir volume de conversas e qualidade/clareza dos pedidos
  useEffect(() => {
    let off = false;
    fetch("/api/registros", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { records: [] }))
      .then((data: { records?: AgentRecord[] }) => !off && setRecords(data.records ?? []))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);

  const range = useMemo(() => periodRange(period, now), [period, now]);
  const monthlySales = useMemo(() => salesByMonth(deals, now, 6), [deals, now]);

  const iaByUser = useMemo<Record<string, SellerIaSnapshot>>(() => {
    const map: Record<string, SellerIaSnapshot> = {};
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();
    for (const s of sellers) {
      const scoped = records.filter((r) => {
        if (r.userId !== s.id) return false;
        const t = new Date(r.at).getTime();
        return t >= fromMs && t < toMs;
      });
      const gravados = scoped.filter((r) => recordResult(r) === "gravado").length;
      const errosOuVagos = scoped.filter((r) => recordResult(r) === "erro").length;
      const qualidadeMedia =
        scoped.length > 0
          ? Math.max(0, Math.min(100, Math.round(((scoped.length - errosOuVagos) / scoped.length) * 100)))
          : null;
      map[s.id] = { whatsappGravados: gravados, qualidadeMedia };
    }
    return map;
  }, [sellers, records, range]);

  const activityMatrix = useMemo(
    () =>
      sellerDailyActivityMatrix({
        sellers,
        activities,
        interactions,
        now,
        days: 21,
      }),
    [sellers, activities, interactions, now],
  );

  const adminUser = isAdmin(user);

  if (!goals || goals.anual <= 0) {
    return (
      <div>
        <PageHeader title="Metas" subtitle="O caminho da equipe até o resultado do ano." />
        <Card>
          <Empty
            icon={<Target size={20} />}
            title="As metas ainda não foram definidas"
            text={adminUser ? "Informe a meta anual da empresa. O sistema divide por vendedor, por mês, trimestre e semestre." : "O administrador ainda não informou a meta do ano."}
            action={adminUser ? <LinkButton href="/configuracoes/metas" variant="primary">Definir metas</LinkButton> : undefined}
          />
        </Card>
      </div>
    );
  }

  const awardCfg = { ...DEFAULT_AWARD_CONFIG, ...(goals.premiacao ?? {}) };
  const fracao = elapsed(range, now);
  const metaEmpresa = basePeriodGoal(goals.anual, period);
  const metaEmpresaCobranca = periodGoal(goals.anual, sales, period, now);
  const vendidoEmpresa = sold(sales, range);
  const vendidoAnoEmpresa = sold(sales, periodRange("ano", now));
  const rows = ranking(goals, users, sales, period, now, true);
  const multiRows = multidimensionalRanking({
    goals,
    users,
    sales,
    activities,
    interactions,
    iaByUser,
    period,
    now,
  });
  const podium = multiRows.slice(0, 3);

  const focoId = manager ? who || sellers[0]?.id || user.id : user.id;
  const foco = users.find((u) => u.id === focoId) ?? user;
  const metaAnualFoco = annualGoalOf(goals, sellers, foco.id);
  const mes = periodRange("mes", now);
  const fracaoMes = elapsed(mes, now);
  const metaMes = basePeriodGoal(metaAnualFoco, "mes");
  const metaMesCobranca = periodGoal(metaAnualFoco, sales, "mes", now, foco.id);
  const vendidoMes = sold(sales, mes, foco.id);
  const faltaMes = Math.max(0, metaMes - vendidoMes);
  const openDealsFoco = deals.filter((d) => d.status === "aberta" && d.ownerId === foco.id);
  const pipelineFoco = openDealsFoco.reduce((sum, d) => sum + (d.valor ?? 0), 0);
  const path = salesPath(faltaMes, deals, foco.id);
  const vendasMes = sales.filter((s) => s.ownerId === foco.id && s.at >= mes.from && s.at < mes.to).length;

  const sellerRecordRows = sellers.map((seller) => {
    const recGoal = recordGoalForSeller(goals, seller.id, period, now);
    const done = sellerRecordsDone(activities, interactions, seller.id, range);
    const pace = recordRegressionPace(done, recGoal.meta, range, now);
    return { seller, pace, custom: recGoal.custom };
  });
  const teamRegDone = sellerRecordRows.reduce((sum, r) => sum + r.pace.done, 0);
  const teamRegGoal = sellerRecordRows.reduce((sum, r) => sum + r.pace.target, 0);
  const teamRegPace = recordRegressionPace(teamRegDone, Math.max(1, teamRegGoal), range, now);

  const focoRecGoal = recordGoalForSeller(goals, foco.id, "mes", now);
  const focoRecDone = sellerRecordsDone(activities, interactions, foco.id, mes);
  const focoRecPace = recordRegressionPace(focoRecDone, focoRecGoal.meta, mes, now);

  const widgets: DashboardWidgetDef[] = [
    {
      id: "ranking-premiacao",
      title: "Pódio & Premiação Integral",
      subtitle: awardCfg.premioDescricao || "Pontuação por Vendas + Atividades + Registros + Qualidade IA",
      defaultSize: "lg",
      allowedSizes: ["md", "lg"],
      defaultRows: 3,
      allowedRows: [2, 3, 4],
      headerRight: <Medal size={15} className="text-amber-500" />,
      render: () => (
        <div className="space-y-4">
          <SegmentedMixBar
            items={[
              { key: "vendas", label: "Vendas", value: awardCfg.pesoVendas, display: `${awardCfg.pesoVendas}%`, color: "#29387f" },
              { key: "atividades", label: "Atividades & Prazo", value: awardCfg.pesoAtividades, display: `${awardCfg.pesoAtividades}%`, color: "#0f8a72" },
              { key: "registros", label: "Registros CRM", value: awardCfg.pesoRegistros, display: `${awardCfg.pesoRegistros}%`, color: "#b86e00" },
              { key: "ia", label: "WhatsApp & Clareza IA", value: awardCfg.pesoQualidadeIA, display: `${awardCfg.pesoQualidadeIA}%`, color: "#5b3fa6" },
            ]}
          />

          {podium.length > 0 && (
            <div className="flex items-end justify-center gap-3 border-y border-line/70 py-4 sm:gap-8">
              {[1, 0, 2].map((pos) => {
                const r = podium[pos];
                const m = MEDALS[pos];
                if (!r) return <div key={pos} className="w-24 sm:w-32" />;
                return (
                  <button
                    key={r.user.id}
                    type="button"
                    disabled={!manager}
                    onClick={() => manager && setWho(r.user.id)}
                    className={cn("flex w-24 flex-col items-center text-center sm:w-32 transition", manager && "cursor-pointer hover:opacity-85")}
                  >
                    <UserAvatar userId={r.user.id} size={pos === 0 ? 52 : 42} />
                    <div className="mt-1.5 w-full truncate text-[13px] font-semibold text-ink">{r.user.short}</div>
                    <div className="text-[14px] font-extrabold text-navy tabular-nums">{r.scoreGeral} pts</div>
                    <div className="text-[11px] text-muted">{moneyShort(r.vendido)}</div>
                    <div className={cn("mt-2 grid w-full place-items-center rounded-t-[8px] border border-b-0", m.altura, m.box)}>
                      <span className={cn("text-[20px] leading-none font-bold", m.text)}>{pos + 1}º</span>
                      <span className={cn("text-[10px] font-medium tracking-wide uppercase", m.text)}>{m.nome}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12.5px] tabular-nums">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-muted">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Vendedor</th>
                  <th className="px-2 py-2 text-right font-medium">Vendas ({awardCfg.pesoVendas}%)</th>
                  <th className="px-2 py-2 text-right font-medium">Atividades ({awardCfg.pesoAtividades}%)</th>
                  <th className="px-2 py-2 text-right font-medium">Registros ({awardCfg.pesoRegistros}%)</th>
                  <th className="px-2 py-2 text-right font-medium">WhatsApp & IA ({awardCfg.pesoQualidadeIA}%)</th>
                  <th className="px-2 py-2 text-right font-medium">Nota Geral</th>
                  <th className="py-2 pl-2 text-right font-medium">Prêmio</th>
                </tr>
              </thead>
              <tbody>
                {multiRows.map((r, i) => {
                  const selected = r.user.id === focoId;
                  return (
                    <tr
                      key={r.user.id}
                      onClick={() => manager && setWho(r.user.id)}
                      className={cn(
                        "border-b border-line/70 last:border-b-0 transition",
                        manager && "cursor-pointer hover:bg-soft/50",
                        selected && "bg-navy/[0.04]",
                      )}
                    >
                      <td className="py-2.5 pr-3 font-semibold text-muted">{i + 1}</td>
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex items-center gap-2 font-medium text-ink">
                          <UserAvatar userId={r.user.id} size={26} />
                          <span>
                            <span className="block">{r.user.name}</span>
                            <span className="text-[11px] text-muted">{moneyShort(r.vendido)} / {r.metaVenda > 0 ? moneyShort(r.metaVenda) : "—"}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold text-ink">{r.vendasScore}</td>
                      <td className="px-2 py-2.5 text-right">
                        <span className="font-semibold text-ink">{r.atividadesScore}</span>
                        <span className="block text-[10.5px] text-muted">{r.atividadesConcluidas} feitas · {r.pontualidadePct}% prazo</span>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span className="font-semibold text-ink">{r.registrosScore}</span>
                        <span className="block text-[10.5px] text-muted">{r.registrosFeitos}/{r.metaRegistros}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span className="font-semibold text-ink">{r.qualidadeIaScore}</span>
                        <span className="block text-[10.5px] text-muted">
                          {r.whatsappGravados} WhatsApp{r.qualidadeIaPct !== null ? ` · ${r.qualidadeIaPct}% clareza` : ""}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 rounded-[5px] bg-navy/10 px-2 py-0.5 text-[12.5px] font-bold text-navy">
                          {r.scoreGeral} pts
                        </span>
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        {r.elegivelPremio ? (
                          <Badge tone="green">
                            <Award size={11} /> Elegível
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Em evolução</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "heatmap-vendedores",
      title: "Atividades por vendedor (Matriz de pontinhos · 21 dias)",
      subtitle: "Veja quem está mais ativo todos os dias no CRM e em campo",
      defaultSize: "md",
      allowedSizes: ["sm", "md", "lg"],
      defaultRows: 2,
      allowedRows: [1, 2, 3],
      headerRight: <Sparkles size={14} className="text-navy-3" />,
      render: () => (
        <DotMatrixChart
          rows={activityMatrix}
          colLabels={["21 dias atrás", "10 dias atrás", "Hoje"]}
          tone="ok"
        />
      ),
    },
    {
      id: "meta-empresa",
      title: `Meta da empresa · ${moneyShort(vendidoEmpresa)} de ${moneyShort(metaEmpresa)}`,
      subtitle: `${PERIOD_LABEL[period]} atual · evolução dos últimos 6 meses`,
      defaultSize: "md",
      allowedSizes: ["sm", "md", "lg"],
      defaultRows: 2,
      allowedRows: [1, 2, 3],
      headerRight: <Pace vendido={vendidoEmpresa} meta={metaEmpresa} fracao={fracao} />,
      render: () => (
        <div className="space-y-4">
          <div>
            <Progress value={metaEmpresa > 0 ? Math.min(100, (vendidoEmpresa / metaEmpresa) * 100) : 0} tone={vendidoEmpresa >= metaEmpresa * fracao ? "green" : "amber"} className="h-2.5" />
            <div className="mt-2 flex justify-between text-[12px] text-muted">
              <span>{metaEmpresa > 0 ? `${Math.round((vendidoEmpresa / metaEmpresa) * 100)}% da meta do ${PERIOD_LABEL[period].toLowerCase()}` : "sem meta no período"}</span>
              <span>{vendidoEmpresa >= metaEmpresa ? "meta do período batida!" : `faltam ${money(metaEmpresa - vendidoEmpresa)}`}</span>
            </div>
            {period !== "ano" && metaEmpresaCobranca > metaEmpresa * 1.05 && (
              <div className="mt-3 flex items-start gap-2 rounded-[6px] border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[12px] text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                <span>
                  <b>Consciência do ano:</b> acumulado {moneyShort(vendidoAnoEmpresa)} de {moneyShort(goals.anual)}. Para fechar {goals.ano} no alvo, o ritmo exigido é <b>{moneyShort(metaEmpresaCobranca)}/{PERIOD_LABEL[period].toLowerCase()}</b>.
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-line/60 pt-3">
            <div className="mb-1.5 text-[11.5px] font-medium text-muted">Vendas mensais da empresa</div>
            <PillSparkBars
              height={62}
              tone="navy"
              items={monthlySales.map((mo, idx) => ({
                key: mo.key,
                label: mo.label,
                value: mo.valor,
                display: moneyShort(mo.valor),
                highlight: idx === monthlySales.length - 1,
              }))}
            />
          </div>
        </div>
      ),
    },
    {
      id: "ranking-vendas",
      title: "Ranking de vendas do período",
      subtitle: `${PERIOD_LABEL[period]} atual · clique no vendedor para detalhar`,
      defaultSize: "md",
      allowedSizes: ["sm", "md", "lg"],
      defaultRows: 2,
      allowedRows: [1, 2, 3],
      render: () => (
        <ProportionalBarList
          rows={rows.map((r, i) => ({
            key: r.user.id,
            label: `${i + 1}. ${r.user.name}`,
            sub: r.meta > 0 ? `${Math.round(r.pct)}% de ${moneyShort(r.meta)}` : "sem meta",
            value: r.vendido,
            display: moneyShort(r.vendido),
            dotColor: r.vendido >= r.meta * fracao ? "#0f7a5a" : "#29387f",
            onClick: manager ? () => setWho(r.user.id) : undefined,
          }))}
        />
      ),
    },
    {
      id: "minha-meta",
      title: foco.id === user.id ? "Minha meta (este mês)" : `Meta de ${foco.short} (este mês)`,
      subtitle: "Vendas, funil aberto e caminho para fechar o mês",
      defaultSize: "md",
      allowedSizes: ["sm", "md", "lg"],
      defaultRows: 3,
      allowedRows: [2, 3, 4],
      headerRight:
        manager && sellers.length > 0 ? (
          <Select value={focoId} onChange={(e) => setWho(e.target.value)} className="h-7 w-auto text-[12px]" aria-label="Vendedor">
            {sellers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short}
              </option>
            ))}
          </Select>
        ) : undefined,
      render: () =>
        metaAnualFoco <= 0 ? (
          <div className="py-4 text-[13px] text-muted">{foco.short} não tem meta de venda definida.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[24px] leading-none font-semibold text-ink">{money(vendidoMes)}</div>
                <div className="mt-1 text-[12.5px] text-muted">
                  de {money(metaMes)} neste mês ({metaMes > 0 ? `${Math.round((vendidoMes / metaMes) * 100)}%` : "0%"})
                </div>
              </div>
              <Pace vendido={vendidoMes} meta={metaMes} fracao={fracaoMes} />
            </div>
            <Progress value={metaMes > 0 ? Math.min(100, (vendidoMes / metaMes) * 100) : 0} tone={vendidoMes >= metaMes * fracaoMes ? "green" : "amber"} className="h-2.5" />

            <div className="grid grid-cols-2 gap-2">
              <div className={cn("rounded-[6px] border px-3 py-2", faltaMes === 0 ? "border-ok/30 bg-ok-soft/40" : "border-line bg-soft/40")}>
                <div className="text-[11px] font-medium text-muted">{faltaMes === 0 ? "Meta do mês" : "Falta neste mês"}</div>
                <div className={cn("text-[15px] font-bold", faltaMes === 0 ? "text-ok" : "text-ink")}>{faltaMes === 0 ? "Batida!" : moneyShort(faltaMes)}</div>
              </div>
              <div className="rounded-[6px] border border-line bg-soft/40 px-3 py-2">
                <div className="text-[11px] font-medium text-muted">Na mesa (funil aberto)</div>
                <div className="text-[15px] font-bold text-ink">
                  {moneyShort(pipelineFoco)} <span className="text-[11px] font-normal text-muted">({openDealsFoco.length})</span>
                </div>
              </div>
            </div>

            {metaMesCobranca > metaMes * 1.05 && (
              <div className="flex items-start gap-2 rounded-[6px] border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11.5px] text-amber-950">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-700" />
                <span>
                  Para recuperar o saldo de {goals.ano}, o ritmo anual exigido é <b>{moneyShort(metaMesCobranca)}/mês</b>.
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              {(["trimestre", "semestre", "ano"] as GoalPeriod[]).map((p) => {
                const meta = basePeriodGoal(metaAnualFoco, p);
                const v = sold(sales, periodRange(p, now), foco.id);
                return (
                  <div key={p} className="rounded-[6px] bg-soft/60 px-2 py-2">
                    <div className="label">{PERIOD_LABEL[p]}</div>
                    <div className="text-[13px] font-semibold text-ink">{moneyShort(v)}</div>
                    <div className="text-[11px] text-muted">de {moneyShort(meta)}</div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-[6px] border border-line bg-soft/40 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="font-semibold text-ink">Meta de registros (mês)</span>
                <span className="tabular-nums text-ink">
                  <b>{focoRecPace.done}</b> de {focoRecPace.target} ({Math.round(focoRecPace.pct)}%)
                </span>
              </div>
              <Progress value={Math.min(100, focoRecPace.pct)} tone={focoRecPace.status === "atrasado" ? "amber" : "green"} className="mt-1.5" />
              <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-muted">
                <span>Esperado até hoje: <b className="text-ink">{focoRecPace.expectedToday}</b></span>
                {focoRecPace.missing > 0 ? (
                  <span className={cn(focoRecPace.status === "atrasado" ? "font-medium text-brand" : "text-ink")}>
                    Exigido agora: <b>{focoRecPace.neededPerWorkday}/dia útil</b>
                  </span>
                ) : (
                  <span className="font-medium text-ok">Meta cumprida!</span>
                )}
              </div>
            </div>

            {faltaMes > 0 && (
              <div className="border-t border-line/70 pt-2.5 text-[12.5px]">
                <div className="mb-1.5 font-semibold text-ink">Caminho até a meta</div>
                <p className="text-muted">
                  Faltam <b className="text-ink">{money(faltaMes)}</b>: cerca de <b className="text-ink">{path.vendas} vendas</b> (ticket médio {money(path.ticketMedio)}) e{" "}
                  <b className="text-ink">{path.orcamentos} orçamentos</b> (já fez {vendasMes}).
                </p>
              </div>
            )}
          </div>
        ),
    },
    {
      id: "metas-atividade",
      title: `Metas de atividade · ${foco.short}`,
      subtitle: "Atividades operacionais definidas para o período",
      defaultSize: "md",
      allowedSizes: ["sm", "md", "lg"],
      defaultRows: 2,
      allowedRows: [1, 2, 3],
      render: () => (
        <ul className="divide-y divide-line/70">
          {goals.atividades.length === 0 && <li className="py-4 text-[12.5px] text-muted">Nenhuma meta de atividade definida.</li>}
          {goals.atividades.map((t, i) => {
            const done = targetDone(t, activities, foco.id, now);
            const ok = done >= t.quantidade;
            return (
              <li key={`${t.tipo}-${t.por}-${i}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", ok ? "bg-ok text-white" : "bg-soft text-navy-3")}>
                  {ok ? <Check size={14} strokeWidth={3} /> : <TypeIcon tipo={t.tipo} size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="font-medium text-ink">
                      {t.tipo}: {t.quantidade} {TARGET_UNIT[t.por]}
                    </span>
                    <span className="shrink-0 text-muted">
                      <b className="text-ink">{done}</b> de {t.quantidade} {TARGET_WINDOW[t.por]}
                    </span>
                  </div>
                  <Progress value={(done / Math.max(1, t.quantidade)) * 100} tone={ok ? "green" : "navy"} className="mt-1.5" />
                </div>
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      id: "registros-regressao",
      title: "Meta de registros por vendedor (Regressão)",
      subtitle: `${PERIOD_LABEL[period]} atual · constância diária de registros`,
      defaultSize: "lg",
      allowedSizes: ["md", "lg"],
      defaultRows: 3,
      allowedRows: [2, 3, 4],
      headerRight: (
        <Badge tone={teamRegPace.status === "batida" || teamRegPace.status === "no_ritmo" ? "green" : "red"}>
          {teamRegDone} de {teamRegGoal} ({Math.round(teamRegPace.pct)}%)
        </Badge>
      ),
      render: () => (
        <div className="space-y-3">
          <div className="rounded-[6px] border border-line/70 bg-soft/30 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <ClipboardCheck size={14} className="text-navy-3" />
                Ritmo coletivo da equipe
              </span>
              <span className="text-muted">
                Esperado hoje: <b className="text-ink">{teamRegPace.expectedToday}</b> · Restam{" "}
                <b className="text-ink">{teamRegPace.remainingWorkdays}d úteis</b> ({teamRegPace.neededPerWorkday}/dia útil)
              </span>
            </div>
            <Progress value={Math.min(100, teamRegPace.pct)} tone={teamRegPace.status === "atrasado" ? "amber" : "green"} className="mt-2 h-2" />
          </div>

          <ul className="divide-y divide-line/70">
            {sellerRecordRows.length === 0 && <li className="py-4 text-[12.5px] text-muted">Nenhum vendedor ativo para medir registros.</li>}
            {sellerRecordRows.map(({ seller, pace }) => {
              const selected = seller.id === focoId;
              const overloaded = pace.neededPerWorkday > pace.basePerWorkday * 1.15;
              return (
                <li
                  key={seller.id}
                  onClick={() => manager && setWho(seller.id)}
                  className={cn(
                    "py-2.5 transition",
                    manager && "cursor-pointer hover:bg-soft/40",
                    selected && "rounded-[6px] bg-navy/[0.04] px-2",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <UserAvatar userId={seller.id} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                        <span className="truncate font-semibold text-ink">
                          {seller.name}
                          <span className="ml-1.5 text-[11px] font-medium text-muted">({Math.round(pace.pct)}%)</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] tabular-nums text-ink">
                            <b>{pace.done}</b> <span className="text-muted">/ {pace.target} registros</span>
                          </span>
                          <Badge tone={pace.status === "atrasado" ? "red" : "green"}>
                            {pace.status === "batida" ? "Batida" : pace.status === "no_ritmo" ? "No ritmo" : `${Math.abs(pace.paceGap)} abaixo`}
                          </Badge>
                        </div>
                      </div>
                      <Progress value={Math.min(100, pace.pct)} tone={pace.status === "atrasado" ? "red" : "green"} className="mt-1.5" />
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 text-[11.5px] text-muted">
                        <span>Ritmo base: <b className="text-ink">{pace.basePerWorkday}/dia útil</b></span>
                        {pace.missing > 0 ? (
                          <span className={cn("font-medium", overloaded ? "text-brand" : "text-ink")}>
                            Regressão p/ fechar: <b>{pace.neededPerWorkday}/dia útil</b> ({pace.remainingWorkdays}d úteis)
                          </span>
                        ) : (
                          <span className="font-medium text-ok">Meta de registros cumprida</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Metas & Premiação"
        subtitle={`Meta de ${goals.ano}: ${money(goals.anual)}. Arraste os blocos pelos 6 pontinhos no canto superior esquerdo para organizar a sua visão.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {adminUser && (
              <LinkButton href="/configuracoes/metas" size="sm" variant="outline">
                Parâmetros das metas
              </LinkButton>
            )}
            <Segmented value={period} onChange={setPeriod} options={(Object.keys(PERIOD_LABEL) as GoalPeriod[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
          </div>
        }
      />

      <DraggableWidgetGrid board="metas" widgets={widgets} />
    </div>
  );
}
