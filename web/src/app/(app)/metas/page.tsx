"use client";

import { ArrowRight, Check, Medal, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { TypeIcon, UserAvatar } from "@/components/crm/crm";
import { Card, CardHeader, Empty, LinkButton, PageHeader, Progress, Segmented, Select } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import { annualGoalOf, elapsed, PERIOD_LABEL, periodGoal, periodRange, ranking, salesOf, salesPath, sellersOf, sold, TARGET_UNIT, TARGET_WINDOW, targetDone, type GoalPeriod } from "@/lib/goals";
import { useNow } from "@/lib/hooks";
import { useCurrentUser, useStore } from "@/lib/store";
import { cn, money, moneyShort } from "@/lib/utils";

const MEDALS = [
  { nome: "Ouro", cor: "#c99a1b", fundo: "#fbf3d9", altura: "h-28" },
  { nome: "Prata", cor: "#7d8794", fundo: "#eef0f3", altura: "h-20" },
  { nome: "Bronze", cor: "#a9683f", fundo: "#f6e9df", altura: "h-14" },
];

/** Ritmo: vendido comparado com o que já deveria estar vendido hoje, no período. */
function Pace({ vendido, meta, fracao }: { vendido: number; meta: number; fracao: number }) {
  if (meta <= 0) return null;
  const esperado = meta * fracao;
  const acima = vendido >= esperado;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-medium", acima ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand")}>
      {acima ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {acima ? "acima do ritmo" : `${moneyShort(esperado - vendido)} abaixo do ritmo`}
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
  const metaEmpresa = periodGoal(goals.anual, sales, period, now);
  const vendidoEmpresa = sold(sales, range);
  const rows = ranking(goals, users, sales, period, now);
  const podium = rows.filter((r) => r.vendido > 0).slice(0, 3);

  // "Minha meta": a do próprio vendedor; o gestor escolhe de quem quer ver.
  const focoId = manager ? who || sellers[0]?.id || user.id : user.id;
  const foco = users.find((u) => u.id === focoId) ?? user;
  const metaAnualFoco = annualGoalOf(goals, sellers, foco.id);
  const mes = periodRange("mes", now);
  const metaMes = periodGoal(metaAnualFoco, sales, "mes", now, foco.id);
  const vendidoMes = sold(sales, mes, foco.id);
  const path = salesPath(metaMes, deals);
  const vendasMes = sales.filter((s) => s.ownerId === foco.id && s.at >= mes.from && s.at < mes.to).length;

  return (
    <div>
      <PageHeader
        title="Metas"
        subtitle={`Meta de ${goals.ano}: ${money(goals.anual)}. O que não é vendido num mês é redistribuído nos meses que restam.`}
        actions={<Segmented value={period} onChange={setPeriod} options={(Object.keys(PERIOD_LABEL) as GoalPeriod[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader kicker={`Empresa · ${PERIOD_LABEL[period].toLowerCase()} atual`} title={`${moneyShort(vendidoEmpresa)} de ${moneyShort(metaEmpresa)}`} action={<Pace vendido={vendidoEmpresa} meta={metaEmpresa} fracao={fracao} />} />
            <div className="px-4 pb-4">
              <Progress value={metaEmpresa > 0 ? (vendidoEmpresa / metaEmpresa) * 100 : 0} tone={vendidoEmpresa >= metaEmpresa * fracao ? "green" : "amber"} className="h-2.5" />
              <div className="mt-2 flex justify-between text-[12px] text-muted">
                <span>{metaEmpresa > 0 ? `${Math.round((vendidoEmpresa / metaEmpresa) * 100)}% da meta` : "sem meta no período"}</span>
                <span>{vendidoEmpresa >= metaEmpresa ? "meta batida" : `faltam ${money(metaEmpresa - vendidoEmpresa)}`}</span>
              </div>
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
                    <div key={r.user.id} className="flex w-24 flex-col items-center text-center sm:w-32">
                      <UserAvatar userId={r.user.id} size={pos === 0 ? 52 : 42} />
                      <div className="mt-1.5 w-full truncate text-[13px] font-semibold text-ink">{r.user.short}</div>
                      <div className="text-[12.5px] font-bold text-ink">{moneyShort(r.vendido)}</div>
                      <div className="text-[11px] text-muted">{r.meta > 0 ? `${Math.round(r.pct)}% da meta` : "sem meta"}</div>
                      <div className={cn("mt-2 grid w-full place-items-center rounded-t-[8px] border border-b-0", m.altura)} style={{ background: m.fundo, borderColor: m.cor }}>
                        <span className="text-[22px] leading-none font-bold" style={{ color: m.cor }}>
                          {pos + 1}º
                        </span>
                        <span className="text-[10.5px] font-medium tracking-wide uppercase" style={{ color: m.cor }}>
                          {m.nome}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <ul className="border-t border-line">
              {rows.map((r, i) => (
                <li key={r.user.id} className={cn("flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0", r.user.id === user.id && "bg-soft/60")}>
                  <span className="w-5 text-center text-[12.5px] font-semibold text-muted">{i + 1}</span>
                  <UserAvatar userId={r.user.id} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium text-ink">{r.user.name}</span>
                      <span className="shrink-0 text-ink">
                        <b>{moneyShort(r.vendido)}</b> <span className="text-muted">/ {r.meta > 0 ? moneyShort(r.meta) : "—"}</span>
                      </span>
                    </div>
                    <Progress value={r.pct} tone={r.vendido >= r.meta * fracao ? "green" : "amber"} className="mt-1.5" />
                  </div>
                </li>
              ))}
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
                    <div className="mt-1 text-[12.5px] text-muted">de {money(metaMes)} neste mês</div>
                  </div>
                  <Pace vendido={vendidoMes} meta={metaMes} fracao={elapsed(mes, now)} />
                </div>
                <Progress value={metaMes > 0 ? (vendidoMes / metaMes) * 100 : 0} tone={vendidoMes >= metaMes * elapsed(mes, now) ? "green" : "amber"} className="mt-3 h-2.5" />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(["trimestre", "semestre", "ano"] as GoalPeriod[]).map((p) => {
                    const meta = periodGoal(metaAnualFoco, sales, p, now, foco.id);
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
              </div>
            )}
          </Card>

          {metaAnualFoco > 0 && (
            <Card>
              <CardHeader kicker="O que fazer para chegar lá" title="Caminho até a meta do mês" />
              <ol className="space-y-2 px-4 pb-3 text-[13px]">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">1</span>
                  <span>
                    Vender <b>{money(metaMes)}</b> no mês: cerca de <b>{path.vendas} {path.vendas === 1 ? "venda" : "vendas"}</b> com ticket médio de {money(path.ticketMedio)}. Feitas até agora: {vendasMes}.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">2</span>
                  <span>
                    Para isso, enviar perto de <b>{path.orcamentos} orçamentos</b>: hoje {Math.round(path.conversao * 100)}% dos negócios fechados viram venda.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">3</span>
                  <span>Manter o ritmo de atividades abaixo, que é o que gera os orçamentos.</span>
                </li>
              </ol>
              {path.estimado && <p className="mx-4 mb-3 rounded-[6px] bg-amber-50 px-3 py-2 text-[12px] text-amber-950">Ainda há poucas vendas registradas: ticket médio e conversão são estimativas e se ajustam sozinhos com o histórico.</p>}
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
