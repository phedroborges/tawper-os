"use client";

import { AlertTriangle, Building2, CalendarClock, CircleAlert, ClipboardCheck, Handshake, Table2, Trophy, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_COLORS, ColumnChart, DonutChart, LineChart } from "@/components/charts/Charts";
import { HBarChart } from "@/components/charts/HBar";
import { PeriodFilter, UserAvatar } from "@/components/crm/crm";
import { Card, CardHeader, Empty, PageHeader, Segmented, Select, Stat } from "@/components/ui/primitives";
import { FUNNELS, isManager, saleLabel } from "@/lib/constants";
import { activitiesByType, cumulativeSales, lossesByReason, MONTH_LABELS, salesByMonth, scopeData, sellerDetail, type SellerDetail } from "@/lib/dashboard";
import { fmtDateShort, inPeriod, presetPeriod, type Period } from "@/lib/dates";
import { annualGoalOf, sellersOf } from "@/lib/goals";
import { useNow } from "@/lib/hooks";
import { recordResult, type AgentRecord } from "@/lib/registros";
import { avgTimeByStage, computeMetrics, dealValue, stageDistribution, type Metric } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import type { FunnelId } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, money, moneyShort } from "@/lib/utils";

/** Faixas do valor negociado: [rótulo, mínimo, máximo]. */
const FAIXAS: [string, number | undefined, number | undefined][] = [
  ["Qualquer valor", undefined, undefined],
  ["Até R$ 20 mil", undefined, 20_000],
  ["R$ 20 a 50 mil", 20_000, 50_000],
  ["R$ 50 a 100 mil", 50_000, 100_000],
  ["Acima de R$ 100 mil", 100_000, undefined],
];

type SortKey = "concluidas" | "noPrazo" | "atrasadas" | "atrasoMedio" | "registros" | "whatsapp" | "diasParado" | "participacao" | "avancos" | "vendido";

const COLUNAS: { key: SortKey; label: string; hint: string }[] = [
  { key: "concluidas", label: "Concluídas", hint: "Atividades concluídas no período" },
  { key: "noPrazo", label: "No prazo", hint: "% das concluídas que saíram até a data marcada" },
  { key: "atrasadas", label: "Atrasadas agora", hint: "Tarefas vencidas hoje: 1 a 3 dias, 4 a 7 e mais de 7" },
  { key: "atrasoMedio", label: "Atraso médio", hint: "Média de dias de atraso das concluídas fora do prazo" },
  { key: "registros", label: "Registros", hint: "Anotações no histórico dos clientes, no período" },
  { key: "whatsapp", label: "Pelo WhatsApp", hint: "Mensagens ao agente que gravaram algo, no período" },
  { key: "diasParado", label: "Sem agir há", hint: "Dias desde a última atividade concluída ou registro" },
  { key: "participacao", label: "Participação", hint: "Parte das atividades concluídas da equipe" },
  { key: "avancos", label: "Avanços", hint: "Mudanças de etapa no período" },
  { key: "vendido", label: "Vendido", hint: "Valor vendido no período" },
];

export default function DashboardPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const open = useUI((u) => u.open);
  const manager = isManager(user);
  const [owner, setOwner] = useState(manager ? "" : user.id);
  const [companyId, setCompanyId] = useState("");
  const [faixa, setFaixa] = useState(0);
  const [period, setPeriod] = useState<Period>(() => presetPeriod("30"));
  const [funnel, setFunnel] = useState<FunnelId>("aquisicao");
  const [table, setTable] = useState(false);
  const [sort, setSort] = useState<SortKey>("concluidas");
  const [records, setRecords] = useState<AgentRecord[]>([]);
  const ownerId = manager ? owner || undefined : user.id;

  // Registros pelo WhatsApp (só gestor enxerga): alimenta a coluna "Pelo WhatsApp".
  useEffect(() => {
    if (!manager) return;
    let off = false;
    fetch("/api/registros", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { records: [] }))
      .then((data: { records?: AgentRecord[] }) => !off && setRecords(data.records ?? []))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [manager]);

  // Um recorte só: todos os números e gráficos leem os mesmos filtros.
  const d = useMemo(() => scopeData(s, { ownerId, companyId: companyId || undefined, valorMin: FAIXAS[faixa][1], valorMax: FAIXAS[faixa][2] }), [s, ownerId, companyId, faixa]);
  const m = useMemo(() => computeMetrics(d, { ownerId, now }), [d, ownerId, now]);
  const dist = useMemo(() => stageDistribution(d, funnel, { ownerId }), [d, funnel, ownerId]);
  const avg = useMemo(() => avgTimeByStage(d, funnel), [d, funnel]);
  const months = useMemo(() => salesByMonth(d.deals, now, 6), [d.deals, now]);
  const acumulado = useMemo(() => cumulativeSales(d.deals, now), [d.deals, now]);
  const porTipo = useMemo(() => activitiesByType(d.activities, period), [d.activities, period]);
  const perdas = useMemo(() => lossesByReason(d.deals, period), [d.deals, period]);
  const closed = useMemo(
    () => d.deals.filter((x) => (x.status === "ganha" || x.status === "perdida") && inPeriod(x.closedAt, period)).sort((a, b) => b.closedAt!.localeCompare(a.closedAt!)),
    [d.deals, period],
  );
  const detail = useMemo(() => {
    const whatsapp = (id: string) => records.filter((r) => r.userId === id && recordResult(r) === "gravado" && inPeriod(r.at, period)).length;
    const users = s.users.filter((u) => !ownerId || u.id === ownerId);
    const value = (r: SellerDetail & { whatsapp: number }) => (sort === "atrasadas" ? r.atrasadas.reduce((a, b) => a + b, 0) : sort === "noPrazo" ? (r.noPrazo ?? -1) : sort === "diasParado" ? (r.diasParado ?? 9999) : r[sort]);
    return sellerDetail(d, users, period, now)
      .map((r) => ({ ...r, whatsapp: whatsapp(r.user.id) }))
      .sort((a, b) => value(b) - value(a));
  }, [d, s.users, ownerId, period, now, records, sort]);

  // Meta do ano no mesmo recorte de vendedor (a meta não se divide por cliente nem por faixa de valor).
  const goals = s.config.goals;
  const metaAnual = goals && !companyId && faixa === 0 ? (ownerId ? annualGoalOf(goals, sellersOf(s.users, goals.participantes), ownerId) : goals.anual) : 0;

  const drill = (mt: Metric) => open({ kind: "drill", title: mt.label, subtitle: `${mt.value}${mt.sub ? ` · ${mt.sub}` : ""}`, companyIds: mt.companyIds });
  const ICONS: Record<string, React.ReactNode> = {
    ativas: <Building2 size={15} />,
    semProximo: <CircleAlert size={15} />,
    atrasadas: <CalendarClock size={15} />,
    estagnadas: <AlertTriangle size={15} />,
    ganhos: <Trophy size={15} />,
  };
  const tile = (key: string) => {
    const mt = m[key];
    return <Stat key={key} label={mt.label} value={mt.value} sub={mt.sub} tone={mt.tone} icon={ICONS[key]} onClick={mt.companyIds.length ? () => drill(mt) : undefined} />;
  };
  const filtered = Boolean((manager && owner) || companyId || faixa);
  const clientes = useMemo(() => [...s.companies].filter((c) => !ownerId || c.ownerId === ownerId).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [s.companies, ownerId]);

  return (
    <div>
      <PageHeader title="Painel" subtitle="Do resultado ao detalhe: quanto vendeu, onde o funil trava e quem está executando. Todo número abre a lista de clientes que o formou." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PeriodFilter value={period} onChange={setPeriod} />
        {manager && (
          <Select value={owner} onChange={(e) => { setOwner(e.target.value); setCompanyId(""); }} className="w-auto min-w-[170px]" aria-label="Vendedor">
            <option value="">Todos os vendedores</option>
            {s.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        )}
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-auto max-w-[240px] min-w-[170px]" aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
        <Select value={faixa} onChange={(e) => setFaixa(Number(e.target.value))} className="w-auto" aria-label="Valor negociado">
          {FAIXAS.map(([label], i) => (
            <option key={label} value={i}>
              {i === 0 ? "Qualquer valor negociado" : label}
            </option>
          ))}
        </Select>
        {filtered && (
          <button type="button" onClick={() => { setOwner(manager ? "" : user.id); setCompanyId(""); setFaixa(0); }} className="inline-flex h-10 items-center gap-1 rounded-[6px] px-2 text-[12.5px] text-muted hover:text-ink">
            <X size={14} /> limpar
          </button>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1500px]:grid-cols-6">
        <Stat label="Em negociação" value={m.negociacao.value} sub={m.negociacao.sub} icon={<Handshake size={15} />} onClick={() => drill(m.negociacao)} className="col-span-2 lg:col-span-1" />
        {["ativas", "semProximo", "atrasadas", "estagnadas", "ganhos"].map(tile)}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[8px] border border-line bg-white px-4 py-3 text-[12.5px]">
        {["propostas", "conversao", "execucao", "feitas", "recorrencia", "dados", "perdas"].map((k) => (
          <button key={k} type="button" onClick={() => m[k].companyIds.length && drill(m[k])} className={cn("flex items-baseline gap-2 text-left", m[k].companyIds.length > 0 && "hover:underline")}>
            <span className="text-muted">{m[k].label}</span>
            <span className={cn("text-[15px] font-semibold", m[k].tone === "bad" ? "text-brand" : m[k].tone === "warn" ? "text-warn" : "text-ink")}>{m[k].value}</span>
          </button>
        ))}
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader kicker="Últimos 6 meses" title="Vendas por mês" />
          <div className="px-4 pt-2 pb-4">
            <ColumnChart
              target={metaAnual > 0 ? metaAnual / 12 : undefined}
              targetLabel={metaAnual > 0 ? `meta média do mês ${moneyShort(metaAnual / 12)}` : undefined}
              rows={months.map((mo) => ({
                key: mo.key,
                label: mo.label,
                value: mo.valor,
                display: moneyShort(mo.valor),
                tooltip: (
                  <>
                    <b>{money(mo.valor)}</b> em {mo.vendas} {mo.vendas === 1 ? "venda" : "vendas"}
                    {mo.vendas > 0 && <span className="block text-white/70">clique para ver os clientes</span>}
                  </>
                ),
                onClick: mo.vendas ? () => open({ kind: "drill", title: `Vendas de ${mo.label}`, subtitle: money(mo.valor), companyIds: mo.companyIds }) : undefined,
              }))}
            />
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader kicker={`Ano de ${now.getFullYear()}`} title={metaAnual > 0 ? "Vendido acumulado e meta" : "Vendido acumulado no ano"} />
          <div className="px-4 pt-1 pb-3">
            <LineChart
              labels={MONTH_LABELS}
              format={moneyShort}
              series={[
                { name: "Vendido acumulado", color: CATEGORY_COLORS[0], values: acumulado },
                ...(metaAnual > 0 ? [{ name: "Meta acumulada", color: "#657087", dashed: true, values: MONTH_LABELS.map((_, i) => (metaAnual * (i + 1)) / 12) }] : []),
              ]}
            />
            {metaAnual <= 0 && <p className="mt-1 text-[11.5px] text-muted">Defina a meta do ano em Configurações › Metas para comparar com a linha da meta.</p>}
          </div>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader
            kicker={FUNNELS[funnel].subtitulo}
            title="Oportunidades por etapa"
            action={
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setTable((v) => !v)} title="Ver como tabela" aria-label="Ver como tabela" className={cn("grid size-8 place-items-center rounded-[5px] border", table ? "border-navy bg-navy text-white" : "border-line text-muted hover:text-ink")}>
                  <Table2 size={14} />
                </button>
                <Segmented value={funnel} onChange={setFunnel} options={[{ value: "aquisicao", label: "Aquisição" }, { value: "recorrencia", label: "Recorrência" }]} />
              </div>
            }
          />
          <div className="px-4 py-3">
            {table ? (
              <table className="w-full text-[12.5px] tabular-nums">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-semibold">Etapa</th>
                    <th className="py-1 text-right font-semibold">Contas</th>
                    <th className="py-1 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {dist.map((x) => (
                    <tr key={x.stage.id} className="border-t border-line/70">
                      <td className="py-1.5">{x.stage.nome}</td>
                      <td className="py-1.5 text-right font-semibold">{x.count}</td>
                      <td className="py-1.5 text-right">{x.valor ? money(x.valor) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <HBarChart
                rows={dist.map((x) => ({
                  key: x.stage.id,
                  label: x.stage.nome,
                  value: x.count,
                  display: `${x.count}${x.valor ? ` · ${moneyShort(x.valor)}` : ""}`,
                  tooltip: (
                    <>
                      <b>{x.count} contas</b> em {x.stage.nome}
                      <br />
                      {x.valor ? `${money(x.valor)} estimados · ` : ""}clique para ver a lista
                    </>
                  ),
                  onClick: () => open({ kind: "drill", title: `${FUNNELS[funnel].nome} · ${x.stage.nome}`, subtitle: x.stage.objetivo, companyIds: x.companyIds }),
                }))}
                labelWidth={132}
              />
            )}
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader kicker="Contas que já passaram pela etapa" title="Tempo médio por etapa (dias)" />
          <div className="px-4 py-3">
            <HBarChart
              color="#657087"
              rows={avg.map((a) => ({
                key: a.stage.id,
                label: a.stage.nome,
                value: a.media,
                display: a.amostras ? `${a.media}d` : "sem dados",
                marker: a.stage.limiteDias,
                markerLabel: `limite ${a.stage.limiteDias}d`,
                color: a.media > a.stage.limiteDias ? "#d41624" : "#657087",
                tooltip: (
                  <>
                    <b>{a.media} dias</b> em média · limite {a.stage.limiteDias}d
                    <br />
                    {a.amostras} passagens concluídas
                  </>
                ),
              }))}
              labelWidth={132}
            />
            <p className="mt-2 text-[11.5px] text-muted">A linha marca o limite da etapa. Em vermelho, as etapas que estão demorando mais que o limite.</p>
          </div>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader kicker="Concluídas no período" title="Atividades por tipo" />
          <div className="px-4 pb-4">
            <DonutChart unit="atividades" slices={porTipo} />
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader kicker="Negócios perdidos no período" title="Perdas por motivo" />
          <div className="px-4 pb-4">
            <DonutChart unit="perdas" slices={perdas.map((p) => ({ ...p, onClick: () => open({ kind: "drill", title: `Perdas · ${p.label}`, companyIds: p.companyIds }) }))} />
          </div>
        </Card>
        <Card>
          <CardHeader kicker="Onde agir agora" title="Atenção" />
          <div className="grid gap-2 p-3">
            {[
              { k: "atrasadas", icon: <CalendarClock size={16} />, label: "Atraso" },
              { k: "estagnadas", icon: <AlertTriangle size={16} />, label: "Estagnação" },
              { k: "dados", icon: <ClipboardCheck size={16} />, label: "Dado" },
              { k: "recorrencia", icon: <Handshake size={16} />, label: "Recorrência" },
            ].map(({ k, icon, label }) => (
              <button key={k} type="button" onClick={() => drill(m[k])} className="flex items-center gap-3 rounded-[6px] border border-line px-3 py-2 text-left hover:border-navy/30 hover:bg-soft/40">
                <span className="grid size-8 place-items-center rounded-[5px] bg-brand-soft text-brand">{icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="label">{label}</span>
                  <span className="block text-[13px] font-semibold text-ink">
                    {m[k].value} {m[k].label.toLowerCase()}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mb-5 overflow-x-auto">
        <CardHeader kicker="No período escolhido · clique no título da coluna para ordenar" title="Quem está fazendo o quê" />
        <table className="w-full min-w-[980px] text-[13px] tabular-nums">
          <thead>
            <tr className="border-y border-line text-left text-[11.5px] text-muted">
              <th className="px-4 py-2 font-medium">Pessoa</th>
              {COLUNAS.filter((c) => manager || c.key !== "whatsapp").map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium" aria-sort={sort === c.key ? "descending" : undefined}>
                  <button type="button" title={c.hint} onClick={() => setSort(c.key)} className={cn("whitespace-nowrap hover:text-ink", sort === c.key && "font-semibold text-ink underline underline-offset-4")}>
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-muted">
                  Ninguém com atividade neste recorte.
                </td>
              </tr>
            )}
            {detail.map((r) => {
              const late = r.atrasadas.reduce((a, b) => a + b, 0);
              return (
                <tr key={r.user.id} className="border-b border-line/70 last:border-b-0 hover:bg-soft/40">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 font-medium text-ink">
                      <UserAvatar userId={r.user.id} size={24} /> {r.user.short}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold text-ink">{r.concluidas}</td>
                  <td className={cn("px-2 py-2.5 text-right", r.noPrazo !== null && r.noPrazo < 60 ? "font-semibold text-brand" : "text-ink")}>{r.noPrazo === null ? "—" : `${r.noPrazo}%`}</td>
                  <td className="px-2 py-2.5 text-right">
                    {late === 0 ? (
                      <span className="text-muted">0</span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-1" title={`1 a 3 dias: ${r.atrasadas[0]} · 4 a 7 dias: ${r.atrasadas[1]} · mais de 7 dias: ${r.atrasadas[2]}`}>
                        <b className="mr-1 text-brand">{late}</b>
                        {r.atrasadas.map((n, i) => (
                          <span key={i} className={cn("min-w-5 rounded-[3px] px-1 text-center text-[11px]", n === 0 ? "bg-soft text-muted/60" : i === 2 ? "bg-brand text-white" : i === 1 ? "bg-brand-soft text-brand" : "bg-amber-100 text-amber-900")}>
                            {n}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right text-ink">{r.atrasoMedio ? `${r.atrasoMedio} d` : "—"}</td>
                  <td className="px-2 py-2.5 text-right text-ink">{r.registros}</td>
                  {manager && <td className="px-2 py-2.5 text-right text-ink">{r.whatsapp}</td>}
                  <td className={cn("px-2 py-2.5 text-right", r.diasParado === null || r.diasParado >= 3 ? "font-semibold text-brand" : "text-ink")}>{r.diasParado === null ? "nunca agiu" : r.diasParado === 0 ? "hoje" : `${r.diasParado} d`}</td>
                  <td className="px-2 py-2.5 text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-soft sm:block">
                        <span className="block h-full rounded-full bg-navy-3" style={{ width: `${r.participacao}%` }} />
                      </span>
                      {r.participacao}%
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right text-ink">{r.avancos}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-ink">{r.vendido ? moneyShort(r.vendido) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span>Atrasadas agora, por idade:</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-[2px] bg-amber-100" /> 1 a 3 dias</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-[2px] bg-brand-soft" /> 4 a 7 dias</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-[2px] bg-brand" /> mais de 7 dias</span>
        </div>
      </Card>

      <Card>
        <CardHeader kicker="No período escolhido" title="Ganhos e perdas" />
        {closed.length === 0 && <Empty title="Nenhum fechamento no período" />}
        <ul className="scrollbar-thin max-h-[330px] overflow-y-auto">
          {closed.map((x) => {
            const c = s.companies.find((cc) => cc.id === x.companyId);
            const won = x.status === "ganha";
            return (
              <li key={x.id}>
                <Link href={`/empresas/${x.companyId}`} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0 hover:bg-soft/40">
                  <span className={cn("grid size-7 place-items-center rounded-full", won ? "bg-ok text-white" : "bg-brand-soft text-brand")}>{won ? <Trophy size={13} /> : <XCircle size={13} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">{c?.nome}</span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {won ? saleLabel(x) : x.motivo?.split(" — ")[0]} · {fmtDateShort(x.closedAt)}
                    </span>
                  </span>
                  <span className={cn("text-[12.5px] font-bold", won ? "text-ink" : "text-muted line-through")}>{moneyShort(dealValue(x))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
