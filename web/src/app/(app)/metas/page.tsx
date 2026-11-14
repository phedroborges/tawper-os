"use client";

import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Flame, Medal, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { TypeIcon, UserAvatar } from "@/components/crm/crm";
import { Badge, Card, CardHeader, Empty, LinkButton, PageHeader, Progress, Segmented, Select } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import {
  annualGoalOf,
  basePeriodGoal,
  elapsed,
  PERIOD_LABEL,
  periodGoal,
  periodRange,
  ranking,
  recordGoalForSeller,
  recordRegressionPace,
  salesOf,
  salesPath,
  sellerRecordsDone,
  sellersOf,
  sold,
  TARGET_UNIT,
  TARGET_WINDOW,
  targetDone,
  type GoalPeriod,
} from "@/lib/goals";
import { useNow } from "@/lib/hooks";
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

/** Metas: pódio da equipe, meta da empresa e o caminho de cada vendedor até a própria meta. */
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
  const sales = useMemo(() => salesOf(deals), [deals]);

  if (!goals || goals.anual <= 0)
    return (
      <div>
        <PageHeader title="Metas" subtitle="O caminho da equipe até o resultado do ano." />
        <Card>
          <Empty
            icon={<Target size={20} />}
            title="As metas ainda não foram definidas"
            text={user.role === "admin" ? "Informe a meta anual da empresa. O sistema divide por vendedor, por mês, trimestre e semestre." : "O administrador ainda não informou a meta do ano."}
            action={user.role === "admin" ? <LinkButton href="/configuracoes/metas" variant="primary">Definir metas</LinkButton> : undefined}
          />
        </Card>
      </div>
    );

  const range = periodRange(period, now);
  const fracao = elapsed(range, now);
  const metaEmpresa = basePeriodGoal(goals.anual, period);
  const metaEmpresaCobranca = periodGoal(goals.anual, sales, period, now);
  const vendidoEmpresa = sold(sales, range);
  const vendidoAnoEmpresa = sold(sales, periodRange("ano", now));
  const rows = ranking(goals, users, sales, period, now, true);
  const podium = rows.filter((r) => r.vendido > 0).slice(0, 3);

  // "Minha meta": a do próprio vendedor; o gestor escolhe de quem quer ver (ou clica no ranking).
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

  return (
    <div>
      <PageHeader
        title="Metas"
        subtitle={`Meta de ${goals.ano}: ${money(goals.anual)}. Acompanhamento justo do período com visão do saldo anual.`}
        actions={<Segmented value={period} onChange={setPeriod} options={(Object.keys(PERIOD_LABEL) as GoalPeriod[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader kicker={`Empresa · ${PERIOD_LABEL[period].toLowerCase()} atual`} title={`${moneyShort(vendidoEmpresa)} de ${moneyShort(metaEmpresa)}`} action={<Pace vendido={vendidoEmpresa} meta={metaEmpresa} fracao={fracao} />} />
            <div className="px-4 pb-4">
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
          </Card>

          <Card>
            <CardHeader kicker={`Quem mais vendeu · ${PERIOD_LABEL[period].toLowerCase()} atual`} title="Pódio" action={<Medal size={16} className="text-muted" />} />
            {podium.length === 0 ? (
              <Empty title="Ninguém no pódio ainda" text="A primeira venda registrada no período abre o pódio." />
            ) : (
              <div className="flex items-end justify-center gap-3 px-4 pt-2 pb-5 sm:gap-6">
                {/* Ordem visual clássica: prata, ouro, bronze. */}
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
                      <div className="text-[12.5px] font-bold text-ink">{moneyShort(r.vendido)}</div>
                      <div className="text-[11px] text-muted">{r.meta > 0 ? `${Math.round(r.pct)}% da meta` : "sem meta"}</div>
                      <div className={cn("mt-2 grid w-full place-items-center rounded-t-[8px] border border-b-0", m.altura, m.box)}>
                        <span className={cn("text-[22px] leading-none font-bold", m.text)}>
                          {pos + 1}º
                        </span>
                        <span className={cn("text-[10.5px] font-medium tracking-wide uppercase", m.text)}>
                          {m.nome}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <ul className="border-t border-line">
              {rows.map((r, i) => {
                const selected = r.user.id === focoId;
                return (
                  <li
                    key={r.user.id}
                    onClick={() => manager && setWho(r.user.id)}
                    className={cn(
                      "flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0 transition",
                      manager && "cursor-pointer hover:bg-soft/50",
                      selected && "bg-navy/[0.04] ring-1 ring-inset ring-navy/20 dark:bg-navy-3/10 dark:ring-navy-3/30",
                    )}
                  >
                    <span className="w-5 text-center text-[12.5px] font-semibold text-muted">{i + 1}</span>
                    <UserAvatar userId={r.user.id} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate font-medium text-ink">
                          {r.user.name}
                          {r.meta > 0 && <span className="ml-1.5 text-[11px] font-semibold text-muted">({Math.round(r.pct)}%)</span>}
                        </span>
                        <span className="shrink-0 text-ink">
                          <b>{moneyShort(r.vendido)}</b> <span className="text-muted">/ {r.meta > 0 ? moneyShort(r.meta) : "—"}</span>
                        </span>
                      </div>
                      <Progress value={Math.min(100, r.pct)} tone={r.vendido >= r.meta * fracao ? "green" : "amber"} className="mt-1.5" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader
              kicker={`Base e regressão da meta · ${PERIOD_LABEL[period].toLowerCase()} atual`}
              title="Meta de registros por vendedor"
              action={
                <div className="flex items-center gap-2">
                  <Badge tone={teamRegPace.status === "batida" || teamRegPace.status === "no_ritmo" ? "green" : "red"}>
                    {teamRegDone} de {teamRegGoal} ({Math.round(teamRegPace.pct)}%)
                  </Badge>
                  {user.role === "admin" && !goals.registros && (
                    <LinkButton href="/configuracoes/metas" size="xs" variant="outline">
                      Personalizar
                    </LinkButton>
                  )}
                </div>
              }
            />
            <div className="border-t border-line/70 px-4 py-3">
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <ClipboardCheck size={14} className="text-navy-3" />
                  Ritmo coletivo da equipe
                </span>
                <span className="text-muted">
                  Esperado hoje: <b className="text-ink">{teamRegPace.expectedToday}</b> · Restam{" "}
                  <b className="text-ink">{teamRegPace.remainingWorkdays}d úteis</b> ({teamRegPace.neededPerWorkday}/dia útil)
                </span>
              </div>
              <Progress
                value={Math.min(100, teamRegPace.pct)}
                tone={teamRegPace.status === "atrasado" ? "amber" : "green"}
                className="mt-2 h-2"
              />
            </div>
            <ul className="border-t border-line">
              {sellerRecordRows.length === 0 && (
                <li className="px-4 py-4 text-[12.5px] text-muted">Nenhum vendedor ativo para medir registros.</li>
              )}
              {sellerRecordRows.map(({ seller, pace }) => {
                const selected = seller.id === focoId;
                const overloaded = pace.neededPerWorkday > pace.basePerWorkday * 1.15;
                return (
                  <li
                    key={seller.id}
                    onClick={() => manager && setWho(seller.id)}
                    className={cn(
                      "border-b border-line/70 px-4 py-3 last:border-b-0 transition",
                      manager && "cursor-pointer hover:bg-soft/50",
                      selected && "bg-navy/[0.04] ring-1 ring-inset ring-navy/20 dark:bg-navy-3/10 dark:ring-navy-3/30",
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
                              {pace.status === "batida"
                                ? "Batida"
                                : pace.status === "no_ritmo"
                                  ? "No ritmo"
                                  : `${Math.abs(pace.paceGap)} abaixo do ritmo`}
                            </Badge>
                          </div>
                        </div>
                        <Progress
                          value={Math.min(100, pace.pct)}
                          tone={pace.status === "atrasado" ? "red" : "green"}
                          className="mt-1.5"
                        />
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 text-[11.5px] text-muted">
                          <span>
                            Ritmo base: <b className="text-ink">{pace.basePerWorkday}/dia útil</b>
                          </span>
                          {pace.missing > 0 ? (
                            <span className={cn("font-medium", overloaded ? "text-brand" : "text-ink")}>
                              Regressão p/ fechar: <b>{pace.neededPerWorkday}/dia útil</b> ({pace.remainingWorkdays}d úteis)
                            </span>
                          ) : (
                            <span className="font-medium text-ok">Meta de registros do período cumprida</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              kicker="Este mês"
              title={foco.id === user.id ? "Minha meta" : `Meta de ${foco.short}`}
              action={
                manager && sellers.length > 0 ? (
                  <Select value={focoId} onChange={(e) => setWho(e.target.value)} className="h-9 w-auto text-[13px]" aria-label="Vendedor">
                    {sellers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.short}
                      </option>
                    ))}
                  </Select>
                ) : undefined
              }
            />
            {metaAnualFoco <= 0 ? (
              <div className="px-4 pb-5 text-[13px] text-muted">{foco.short} não tem meta de venda definida. A meta vale para vendedores e representantes.</div>
            ) : (
              <div className="px-4 pb-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[26px] leading-none font-semibold text-ink">{money(vendidoMes)}</div>
                    <div className="mt-1 text-[12.5px] text-muted">
                      de {money(metaMes)} neste mês ({metaMes > 0 ? `${Math.round((vendidoMes / metaMes) * 100)}%` : "0%"})
                    </div>
                  </div>
                  <Pace vendido={vendidoMes} meta={metaMes} fracao={fracaoMes} />
                </div>
                <Progress value={metaMes > 0 ? Math.min(100, (vendidoMes / metaMes) * 100) : 0} tone={vendidoMes >= metaMes * fracaoMes ? "green" : "amber"} className="mt-3 h-2.5" />

                {/* Incentivo + Cobrança: quanto falta vs o que já está na mesa */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className={cn("rounded-[6px] border px-3 py-2", faltaMes === 0 ? "border-ok/30 bg-ok-soft/40" : "border-line bg-soft/40")}>
                    <div className="text-[11px] font-medium text-muted">{faltaMes === 0 ? "Meta do mês" : "Falta neste mês"}</div>
                    <div className={cn("text-[15px] font-bold", faltaMes === 0 ? "text-ok" : "text-ink")}>
                      {faltaMes === 0 ? "Batida!" : moneyShort(faltaMes)}
                    </div>
                  </div>
                  <div className="rounded-[6px] border border-line bg-soft/40 px-3 py-2">
                    <div className="text-[11px] font-medium text-muted">Na mesa (funil aberto)</div>
                    <div className="text-[15px] font-bold text-ink">
                      {moneyShort(pipelineFoco)} <span className="text-[11px] font-normal text-muted">({openDealsFoco.length})</span>
                    </div>
                  </div>
                </div>
                {faltaMes > 0 && (
                  <p className={cn("mt-2 text-[12px] font-medium", pipelineFoco >= faltaMes ? "text-ok" : "text-amber-800 dark:text-amber-300")}>
                    {pipelineFoco >= faltaMes
                      ? `Você já tem ${moneyShort(pipelineFoco)} em aberto na mesa — foco total em fechar!`
                      : `Seu funil aberto cobre ${Math.round((pipelineFoco / faltaMes) * 100)}% do que falta — precisa gerar novos orçamentos agora!`}
                  </p>
                )}

                {metaMesCobranca > metaMes * 1.05 && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-[6px] border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11.5px] text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                    <span>
                      Para recuperar o saldo de {goals.ano}, o ritmo anual exigido é <b>{moneyShort(metaMesCobranca)}/mês</b>.
                    </span>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
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

                <div className="mt-3 rounded-[6px] border border-line bg-soft/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="font-semibold text-ink">Meta de registros (mês)</span>
                    <span className="tabular-nums text-ink">
                      <b>{focoRecPace.done}</b> de {focoRecPace.target} ({Math.round(focoRecPace.pct)}%)
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, focoRecPace.pct)}
                    tone={focoRecPace.status === "atrasado" ? "amber" : "green"}
                    className="mt-1.5"
                  />
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
              </div>
            )}
          </Card>

          {metaAnualFoco > 0 && (
            <Card>
              <CardHeader kicker="O que fazer para chegar lá" title="Caminho até a meta do mês" />
              {faltaMes === 0 ? (
                <div className="mx-4 mb-3 rounded-[6px] bg-ok-soft/60 px-3 py-2.5 text-[13px] font-medium text-ok">
                  Parabéns! A meta de {money(metaMes)} deste mês já foi batida ({vendasMes} {vendasMes === 1 ? "venda" : "vendas"}). Continue o ritmo de atividades para abater o saldo do ano!
                </div>
              ) : (
                <ol className="space-y-2 px-4 pb-3 text-[13px]">
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">1</span>
                    <span>
                      Faltam <b>{money(faltaMes)}</b> neste mês: cerca de <b>{path.vendas} {path.vendas === 1 ? "venda" : "vendas"}</b> com ticket médio de {money(path.ticketMedio)} (já fez {vendasMes}).
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">2</span>
                    <span>
                      Para isso, gerar/trabalhar perto de <b>{path.orcamentos} orçamentos</b>: taxa de conversão usada de {Math.round(path.conversao * 100)}%.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">3</span>
                    <span>Manter o ritmo diário e mensal de atividades abaixo — é isso que coloca orçamento na mesa.</span>
                  </li>
                </ol>
              )}
              {faltaMes > 0 && path.estimado && (
                <p className="mx-4 mb-3 rounded-[6px] border border-amber-200/80 bg-amber-50 px-3 py-2 text-[12px] text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100">
                  Poucos negócios perdidos/fechados no histórico: usando referência conservadora de {Math.round(path.conversao * 100)}% de conversão.
                </p>
              )}
              <ul className="border-t border-line">
                {goals.atividades.length === 0 && <li className="px-4 py-4 text-[12.5px] text-muted">Nenhuma meta de atividade definida.</li>}
                {goals.atividades.map((t, i) => {
                  const done = targetDone(t, activities, foco.id, now);
                  const ok = done >= t.quantidade;
                  return (
                    <li key={`${t.tipo}-${t.por}-${i}`} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0">
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", ok ? "bg-ok text-white" : "bg-soft text-navy-3")}>{ok ? <Check size={14} strokeWidth={3} /> : <TypeIcon tipo={t.tipo} size={14} />}</span>
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
            </Card>
          )}

          {user.role === "admin" && (
            <LinkButton href="/configuracoes/metas" variant="outline" className="w-full justify-center">
              Configurar metas <ArrowRight size={14} />
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}
