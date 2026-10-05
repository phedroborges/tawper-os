"use client";

import { AlertTriangle, Building2, CalendarClock, CircleAlert, ClipboardCheck, Handshake, Table2, Trophy, Tv, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HBarChart } from "@/components/charts/HBar";
import { Card, CardHeader, Empty, LinkButton, PageHeader, Segmented, Select, Stat } from "@/components/ui/primitives";
import { FUNNELS, isManager } from "@/lib/constants";
import { daysSince, fmtDateShort } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { avgTimeByStage, computeMetrics, dealValue, sellerStats, stageDistribution, type Metric } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import type { FunnelId } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, money, moneyShort } from "@/lib/utils";

export default function DashboardPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const open = useUI((u) => u.open);
  const manager = isManager(user);
  const [owner, setOwner] = useState(manager ? "" : user.id);
  const [funnel, setFunnel] = useState<FunnelId>("aquisicao");
  const [table, setTable] = useState(false);
  const ownerId = manager ? owner || undefined : user.id;

  const m = useMemo(() => computeMetrics(s, { ownerId, now }), [s, ownerId, now]);
  const dist = useMemo(() => stageDistribution(s, funnel, { ownerId }), [s, funnel, ownerId]);
  const avg = useMemo(() => avgTimeByStage(s, funnel), [s, funnel]);
  const stats = useMemo(() => sellerStats(s, now), [s, now]);
  const closed = useMemo(
    () =>
      s.deals
        .filter((d) => (d.status === "ganha" || d.status === "perdida") && d.closedAt && daysSince(d.closedAt, now) <= 90 && (!ownerId || d.ownerId === ownerId))
        .sort((a, b) => b.closedAt!.localeCompare(a.closedAt!)),
    [s.deals, ownerId, now],
  );

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
  const scopeLabel = ownerId ? `Carteira de ${s.users.find((u) => u.id === ownerId)?.short}` : "Operação completa";

  return (
    <div>
      <PageHeader
        kicker="Dashboard executivo"
        title="Painel"
        subtitle="Todo número abre a lista de clientes que o formou."
        actions={
          <LinkButton href="/tv" variant="dark">
            <Tv size={15} /> Modo TV
          </LinkButton>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {manager && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto min-w-[180px]">
            <option value="">Todos os vendedores</option>
            {s.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        )}
        <span className="rounded-[5px] border border-line bg-white px-3 py-2 text-[12.5px] text-muted">Período: últimos 30 dias · conversão em 90 dias</span>
        <span className="text-[12px] text-muted">{scopeLabel}</span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Em negociação"
          value={m.negociacao.value}
          sub={m.negociacao.sub}
          icon={<Handshake size={15} />}
          onClick={() => drill(m.negociacao)}
          className="col-span-2 lg:col-span-1"
        />
        {["ativas", "semProximo", "atrasadas", "estagnadas", "ganhos"].map(tile)}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[8px] border border-line bg-white px-4 py-3 text-[12.5px]">
        {["propostas", "conversao", "execucao", "feitas", "recorrencia", "dados", "perdas"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => m[k].companyIds.length && drill(m[k])}
            className={cn("flex items-baseline gap-2 text-left", m[k].companyIds.length > 0 && "hover:underline")}
          >
            <span className="text-muted">{m[k].label}</span>
            <span className={cn("text-[15px] font-semibold", m[k].tone === "bad" ? "text-brand" : m[k].tone === "warn" ? "text-warn" : "text-ink")}>{m[k].value}</span>
          </button>
        ))}
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader
            kicker={FUNNELS[funnel].subtitulo}
            title="Oportunidades por etapa"
            action={
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setTable((v) => !v)} title="Ver como tabela" className={cn("grid size-8 place-items-center rounded-[5px] border", table ? "border-navy bg-navy text-white" : "border-line text-muted hover:text-ink")}>
                  <Table2 size={14} />
                </button>
                <Segmented
                  value={funnel}
                  onChange={setFunnel}
                  options={[
                    { value: "aquisicao", label: "Aquisição" },
                    { value: "recorrencia", label: "Recorrência" },
                  ]}
                />
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
                  {dist.map((d) => (
                    <tr key={d.stage.id} className="border-t border-line/70">
                      <td className="py-1.5">{d.stage.nome}</td>
                      <td className="py-1.5 text-right font-semibold">{d.count}</td>
                      <td className="py-1.5 text-right">{d.valor ? money(d.valor) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <HBarChart
                rows={dist.map((d) => ({
                  key: d.stage.id,
                  label: d.stage.nome,
                  value: d.count,
                  display: `${d.count}${d.valor ? ` · ${moneyShort(d.valor)}` : ""}`,
                  tooltip: (
                    <>
                      <b>{d.count} contas</b> em {d.stage.nome}
                      <br />
                      {d.valor ? `${money(d.valor)} estimados · ` : ""}clique para ver a lista
                    </>
                  ),
                  onClick: () => open({ kind: "drill", title: `${FUNNELS[funnel].nome} · ${d.stage.nome}`, subtitle: d.stage.objetivo, companyIds: d.companyIds }),
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

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr_1fr]">
        <Card className="min-w-0">
          <CardHeader kicker="Esforço × avanço · 30 dias" title="Execução por vendedor" />
          <div className="px-4 py-3">
            <HBarChart
              max={100}
              rows={stats.map((st) => {
                const pct = Math.round(st.execucao.rate * 100);
                return {
                  key: st.user.id,
                  label: st.user.short,
                  value: pct,
                  display: `${pct}% · ${st.feitas} feitas`,
                  color: pct >= 80 ? "#17a173" : pct >= 60 ? "#b86e00" : "#d41624",
                  tooltip: (
                    <>
                      <b>{pct}% no prazo</b> ({st.execucao.onTime}/{st.execucao.total})
                      <br />
                      {st.avancos} avanços · {st.ganhos} ganhos · {st.atrasadas} atrasadas
                    </>
                  ),
                  onClick: () =>
                    open({ kind: "drill", title: `Carteira de ${st.user.short}`, companyIds: s.companies.filter((c) => c.ownerId === st.user.id && (c.status === "ativa" || c.status === "espera")).map((c) => c.id) }),
                };
              })}
              labelWidth={80}
            />
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-r-[2px] bg-ok" /> ≥ 80% bom</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-r-[2px] bg-warn" /> 60–79% atenção</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-r-[2px] bg-brand" /> &lt; 60% crítico</span>
            </div>
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
              <button key={k} type="button" onClick={() => drill(m[k])} className="flex items-center gap-3 rounded-[6px] border border-line px-3 py-2.5 text-left hover:border-navy/30 hover:bg-soft/40">
                <span className="grid size-8 place-items-center rounded-[5px] bg-brand-soft text-brand">{icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="label">{label}</span>
                  <span className="block text-[13px] font-semibold text-ink">
                    {m[k].value} {m[k].label.toLowerCase()}
                  </span>
                  <span className="block text-[11.5px] text-muted">{m[k].sub}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader kicker="Últimos 90 dias" title="Ganhos e perdas" />
          {closed.length === 0 && <Empty title="Nenhum fechamento no período" />}
          <ul className="scrollbar-thin max-h-[330px] overflow-y-auto">
            {closed.map((d) => {
              const c = s.companies.find((x) => x.id === d.companyId);
              const won = d.status === "ganha";
              return (
                <li key={d.id}>
                  <Link href={`/empresas/${d.companyId}`} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0 hover:bg-soft/40">
                    <span className={cn("grid size-7 place-items-center rounded-full", won ? "bg-ok text-white" : "bg-brand-soft text-brand")}>{won ? <Trophy size={13} /> : <XCircle size={13} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">{c?.nome}</span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {won ? (d.funnel === "aquisicao" ? "Primeira venda" : `Recompra · ciclo ${d.ciclo}`) : d.motivo?.split(" — ")[0]} · {fmtDateShort(d.closedAt)}
                      </span>
                    </span>
                    <span className={cn("text-[12.5px] font-bold", won ? "text-ink" : "text-muted line-through")}>{moneyShort(dealValue(d))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
