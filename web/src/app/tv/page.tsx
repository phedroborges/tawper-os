"use client";

import { ArrowLeft, Maximize2, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HBarChart } from "@/components/charts/HBar";
import { ShellGate } from "@/components/shell/AppShell";
import { daysSince, fmtDateShort } from "@/lib/dates";
import { alertsOf, computeMetrics, dealValue, sellerStats, stageDistribution, type Metric } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, moneyShort } from "@/lib/utils";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right">
      <div className="text-[28px] leading-none font-bold tabular-nums">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="mt-1 text-[12px] text-white/55 capitalize">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
    </div>
  );
}

function TV() {
  const s = useStore();
  const open = useUI((u) => u.open);
  const [now] = useState(() => new Date());
  const m = useMemo(() => computeMetrics(s, { now }), [s, now]);
  const acq = useMemo(() => stageDistribution(s, "aquisicao"), [s]);
  const rec = useMemo(() => stageDistribution(s, "recorrencia"), [s]);
  const stats = useMemo(() => sellerStats(s, now).sort((a, b) => b.execucao.rate - a.execucao.rate), [s, now]);
  const alerts = useMemo(() => {
    const seen = new Set<string>();
    return alertsOf(s, { now })
      .filter((a) => a.severidade === "alta")
      .filter((a) => (seen.has(a.companyId) ? false : (seen.add(a.companyId), true)))
      .slice(0, 6);
  }, [s, now]);
  const wins = s.deals.filter((d) => d.status === "ganha" && d.closedAt && daysSince(d.closedAt, now) <= 30).sort((a, b) => b.closedAt!.localeCompare(a.closedAt!));
  const drill = (mt: Metric) => open({ kind: "drill", title: mt.label, subtitle: mt.sub, companyIds: mt.companyIds });

  const big = (key: string, accent?: boolean) => {
    const mt = m[key];
    return (
      <button type="button" onClick={() => drill(mt)} className={cn("rounded-[8px] p-4 text-left ring-1 transition hover:ring-white/40", accent ? "bg-brand ring-brand" : "bg-white/[0.05] ring-white/10")}>
        <div className={cn("label", accent ? "text-white/80" : "text-white/50")}>{mt.label}</div>
        <div className="mt-2 text-[44px] leading-none font-bold tracking-[-0.03em]">{mt.value}</div>
        <div className={cn("mt-1.5 text-[12.5px]", accent ? "text-white/85" : "text-white/55")}>{mt.sub}</div>
      </button>
    );
  };

  return (
    <div className="navy-flat min-h-dvh px-6 py-5 text-white">
      <header className="mb-5 flex items-center gap-5">
        <Link href="/dashboard" className="grid size-9 place-items-center rounded-[5px] text-white/60 hover:bg-white/10 hover:text-white" title="Sair do modo TV">
          <ArrowLeft size={18} />
        </Link>
        <Image src="/brand/tawper-logo-white.png" alt="Tawper" width={140} height={40} />
        <div className="border-l border-white/20 pl-5">
          <div className="label text-white/50">Modo TV · sala comercial</div>
          <div className="text-[18px] font-semibold">Operação comercial ao vivo</div>
        </div>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className="ml-auto grid size-9 place-items-center rounded-[5px] text-white/60 hover:bg-white/10 hover:text-white" title="Tela cheia">
          <Maximize2 size={17} />
        </button>
        <Clock />
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {big("negociacao", true)}
        {big("ativas")}
        {big("semProximo")}
        {big("atrasadas")}
        {big("estagnadas")}
        {big("ganhos")}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <section className="rounded-[8px] bg-white/[0.04] p-4 ring-1 ring-white/10">
          <div className="label mb-3 text-white/50">Funil de aquisição · contas por etapa</div>
          <HBarChart
            dark
            color="#8fb0f0"
            labelWidth={132}
            rows={acq.map((d) => ({
              key: d.stage.id,
              label: d.stage.nome,
              value: d.count,
              display: `${d.count}${d.valor ? ` · ${moneyShort(d.valor)}` : ""}`,
              onClick: () => open({ kind: "drill", title: `Aquisição · ${d.stage.nome}`, companyIds: d.companyIds }),
            }))}
          />
          <div className="label mt-5 mb-3 text-white/50">Recorrência</div>
          <HBarChart
            dark
            color="#7fd3b4"
            labelWidth={132}
            rows={rec.map((d) => ({
              key: d.stage.id,
              label: d.stage.nome,
              value: d.count,
              display: String(d.count),
              onClick: () => open({ kind: "drill", title: `Recorrência · ${d.stage.nome}`, companyIds: d.companyIds }),
            }))}
          />
        </section>

        <section className="rounded-[8px] bg-white/[0.04] p-4 ring-1 ring-white/10">
          <div className="label mb-3 text-white/50">Execução no prazo · 30 dias</div>
          <ol className="space-y-3">
            {stats.map((st, i) => {
              const pct = Math.round(st.execucao.rate * 100);
              return (
                <li key={st.user.id} className="flex items-center gap-3">
                  <span className="w-5 text-[13px] font-bold text-white/40">{i + 1}</span>
                  <span className="grid size-9 place-items-center rounded-full text-[12px] font-bold" style={{ background: st.user.color }}>
                    {st.user.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-[13.5px] font-semibold">
                      <span>{st.user.short}</span>
                      <span className={pct >= 80 ? "text-[#6fe0b3]" : pct >= 60 ? "text-[#ffc56b]" : "text-[#ff8a92]"}>{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? "#17a173" : pct >= 60 ? "#e09a2d" : "#d41624" }} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/45">
                      {st.feitas} feitas · {st.avancos} avanços · {st.ganhos} ganhos
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="space-y-4">
          <div className="rounded-[8px] bg-white/[0.04] p-4 ring-1 ring-white/10">
            <div className="label mb-2 text-white/50">Atenção agora</div>
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="border-l-2 border-brand pl-3">
                  <div className="text-[13px] font-semibold">{s.companies.find((c) => c.id === a.companyId)?.nome}</div>
                  <div className="text-[12px] text-white/60">
                    {a.titulo} — {a.texto}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[8px] bg-white/[0.04] p-4 ring-1 ring-white/10">
            <div className="label mb-2 text-[#6fe0b3]">Vendas do mês</div>
            <ul className="space-y-2">
              {wins.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5">
                  <Trophy size={15} className="text-[#6fe0b3]" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.companies.find((c) => c.id === d.companyId)?.nome}</span>
                  <span className="text-[12px] text-white/50">{fmtDateShort(d.closedAt)}</span>
                  <span className="text-[13px] font-bold">{moneyShort(dealValue(d))}</span>
                </li>
              ))}
              {wins.length === 0 && <li className="text-[12.5px] text-white/50">Nenhuma venda nos últimos 30 dias.</li>}
            </ul>
          </div>
        </section>
      </div>
      <p className="mt-4 text-center text-[11.5px] text-white/35">Clique em qualquer número para ver a lista de clientes que o formou.</p>
    </div>
  );
}

export default function TVPage() {
  return (
    <ShellGate>
      <TV />
    </ShellGate>
  );
}
