"use client";

import { ArrowRight, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertRow, UserAvatar, userName } from "@/components/crm/crm";
import { Button, Card, CardHeader, Empty, PageHeader, Progress } from "@/components/ui/primitives";
import { managerDigest } from "@/lib/ai";
import { isManager } from "@/lib/constants";
import { fmtAgo, fmtDateTime } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { ALERT_LABEL, alertsOf, sellerStats, type Alert, type AlertType } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, money } from "@/lib/utils";

const ORDER: AlertType[] = ["atraso", "sem_proximo_passo", "estagnacao", "sugestao", "orcamento", "recorrencia", "espera_vencida", "dados", "dependencia"];

export default function GestaoPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const router = useRouter();
  const { open } = useUI();
  const [tipo, setTipo] = useState<AlertType | "todas">("todas");
  const alerts = useMemo(() => alertsOf(s, { now }), [s, now]);
  const stats = useMemo(() => sellerStats(s, now), [s, now]);
  const digest = useMemo(() => managerDigest(s, now), [s, now]);
  const cobrancas = s.interactions.filter((i) => i.kind === "cobranca").slice(0, 5);

  if (!isManager(user)) return <Empty icon={<ShieldCheck size={20} />} title="Área do gestor" text="Troque para o perfil do Murilo no topo para ver a gestão da carteira." />;

  const counts = ORDER.map((t) => ({ t, n: alerts.filter((a) => a.tipo === t).length })).filter((x) => x.n > 0);
  const list = tipo === "todas" ? alerts : alerts.filter((a) => a.tipo === tipo);

  const actionFor = (a: Alert) => {
    if (a.tipo === "sem_proximo_passo") return { label: "Definir", fn: () => open({ kind: "newActivity", companyId: a.companyId }) };
    if (a.tipo === "sugestao") return { label: "Revisar", fn: () => router.push(`/empresas/${a.companyId}?tab=estrategia`) };
    if (a.tipo === "dados") return { label: "Completar", fn: () => open({ kind: "editCompany", companyId: a.companyId }) };
    return { label: "Cobrar", fn: () => open({ kind: "cobranca", companyId: a.companyId }) };
  };

  return (
    <div>
      <PageHeader
        kicker="Comando gerencial · revisão semanal"
        title="Gestão"
        subtitle="Só o que exige decisão: atrasos, contas sem próximo passo, estagnações e sugestões da IA."
      />

      <Card className="mb-5">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Sparkles size={15} className="text-ai" />
          <span className="text-[13.5px] font-medium text-ink">Resumo da semana</span>
          <span className="label ml-auto">gerado pela IA</span>
        </div>
        <ul className="space-y-1.5 border-t border-line px-4 py-3">
          {digest.linhas.map((l) => (
            <li key={l} className="flex gap-2 text-[13.5px] leading-snug text-ink">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
              {l}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card className="min-w-0">
          <CardHeader kicker={`${alerts.length} exceções`} title="Fila de exceções" />
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-line/70 px-3 py-2">
            <button type="button" onClick={() => setTipo("todas")} className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold", tipo === "todas" ? "bg-navy text-white" : "bg-soft text-navy-3")}>
              Todas {alerts.length}
            </button>
            {counts.map(({ t, n }) => (
              <button key={t} type="button" onClick={() => setTipo(t)} className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold", tipo === t ? "bg-navy text-white" : "bg-soft text-navy-3")}>
                {ALERT_LABEL[t]} {n}
              </button>
            ))}
          </div>
          <div className="scrollbar-thin max-h-[560px] overflow-y-auto">
            {list.map((a) => {
              const act = actionFor(a);
              return <AlertRow key={a.id} a={a} actionLabel={act.label} onAction={act.fn} />;
            })}
            {list.length === 0 && <Empty title="Nenhuma exceção" text="A carteira está em dia." />}
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader kicker="Execução × resultado · 30 dias" title="Quem está executando o processo" />
            <div className="divide-y divide-line/70">
              {stats.map((st) => (
                <button
                  key={st.user.id}
                  type="button"
                  onClick={() => open({ kind: "drill", title: `Carteira de ${st.user.short}`, subtitle: `${st.contas} contas ativas`, companyIds: s.companies.filter((c) => c.ownerId === st.user.id && (c.status === "ativa" || c.status === "espera")).map((c) => c.id) })}
                  className="block w-full px-4 py-3 text-left hover:bg-soft/40"
                >
                  <div className="flex items-center gap-2.5">
                    <UserAvatar userId={st.user.id} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink">{st.user.name}</span>
                        <span className={cn("text-[13px] font-bold", st.execucao.rate >= 0.8 ? "text-ok" : st.execucao.rate >= 0.6 ? "text-warn" : "text-brand")}>{Math.round(st.execucao.rate * 100)}%</span>
                      </div>
                      <Progress value={st.execucao.rate * 100} tone={st.execucao.rate >= 0.8 ? "green" : st.execucao.rate >= 0.6 ? "amber" : "red"} className="mt-1" />
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
                        <span>{st.contas} contas</span>
                        <span>{st.feitas} feitas</span>
                        <span>{st.avancos} avanços de etapa</span>
                        <span>{st.ganhos} ganhos · {money(st.valorGanho)}</span>
                        {st.atrasadas > 0 && <span className="font-semibold text-brand">{st.atrasadas} atrasadas</span>}
                        {st.semProximo > 0 && <span className="font-semibold text-brand">{st.semProximo} sem próximo passo</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-line/70 px-4 py-2 text-[11.5px] text-muted">Taxa de execução = atividades concluídas no prazo ÷ atividades que venceram no período.</div>
          </Card>

          <Card>
            <CardHeader kicker="Comentários e cobranças" title="Últimas cobranças do gestor" action={<Megaphone size={15} className="text-muted" />} />
            {cobrancas.length === 0 && <div className="px-4 py-5 text-[12.5px] text-muted">Nenhuma cobrança registrada.</div>}
            {cobrancas.map((i) => {
              const c = s.companies.find((x) => x.id === i.companyId);
              return (
                <Link key={i.id} href={`/empresas/${i.companyId}`} className="block border-b border-line/70 px-4 py-2.5 last:border-b-0 hover:bg-soft/40">
                  <div className="text-[12.5px] font-semibold text-ink">
                    {c?.nome} <span className="font-normal text-muted">→ {userName(s.users, c?.ownerId ?? "")}</span>
                  </div>
                  <div className="text-[12px] text-ink/75">“{i.conteudo}”</div>
                  <div className="text-[11px] text-muted">{fmtAgo(i.at, now)}</div>
                </Link>
              );
            })}
          </Card>

          <Card>
            <CardHeader
              kicker="Auditoria"
              title="Alterações recentes"
              action={
                <Link href="/auditoria" className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy-3 hover:text-brand">
                  Ver tudo <ArrowRight size={12} />
                </Link>
              }
            />
            {s.audit.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 border-b border-line/70 px-4 py-2 text-[12px] last:border-b-0">
                <UserAvatar userId={a.autorId} size={22} />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-ink">{userName(s.users, a.autorId)}</span> <span className="text-muted">alterou</span> {a.entidade.toLowerCase()} · {a.campo}
                  {a.para && <span className="text-ink/80"> → {a.para}</span>}
                  <div className="text-[11px] text-muted">
                    {s.companies.find((c) => c.id === a.companyId)?.nome} · {fmtDateTime(a.at)}
                  </div>
                </div>
              </div>
            ))}
          </Card>
          <Button variant="ai" className="w-full" onClick={() => useUI.getState().setAssistant(true)}>
            <Sparkles size={15} /> Perguntar à IA sobre a carteira
          </Button>
        </div>
      </div>
    </div>
  );
}
