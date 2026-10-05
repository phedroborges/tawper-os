"use client";

import { ArrowRight, CalendarCheck, CalendarClock, CircleAlert, MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertRow, TaskRow } from "@/components/crm/crm";
import { Card, CardHeader, Empty, PageHeader, Segmented, Stat } from "@/components/ui/primitives";
import { dailyBriefing } from "@/lib/ai";
import { isManager } from "@/lib/constants";
import { dayDiff, fmtAgo, longToday } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { alertsOf, byDueAsc } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";

type Tab = "atrasadas" | "hoje" | "proximas";

export default function MeuDiaPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const { open } = useUI();
  const router = useRouter();
  const [tab, setTab] = useState<Tab | null>(null);

  const mine = useMemo(() => s.activities.filter((a) => a.ownerId === user.id && a.status === "pendente").sort(byDueAsc), [s.activities, user.id]);
  const atrasadas = mine.filter((a) => dayDiff(a.dueAt, now) < 0);
  const hoje = mine.filter((a) => dayDiff(a.dueAt, now) === 0);
  const proximas = mine.filter((a) => dayDiff(a.dueAt, now) > 0 && dayDiff(a.dueAt, now) <= 14);
  const brief = useMemo(() => dailyBriefing(s, user, now), [s, user, now]);
  const alerts = useMemo(() => alertsOf(s, { ownerId: user.id, now }).filter((a) => a.tipo !== "atraso"), [s, user.id, now]);
  const semProximo = alerts.filter((a) => a.tipo === "sem_proximo_passo");
  const convs = s.conversations.filter((c) => c.unread > 0 && (c.ownerId === user.id || isManager(user))).sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  const activeTab: Tab = tab ?? (atrasadas.length ? "atrasadas" : hoje.length ? "hoje" : "proximas");
  const list = activeTab === "atrasadas" ? atrasadas : activeTab === "hoje" ? hoje : proximas;

  return (
    <div>
      <PageHeader title={brief.saudacao} subtitle={`${longToday(now)} · ${brief.resumo}`} />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5">
              <Sparkles size={15} className="text-ai" />
              <span className="text-[13.5px] font-medium text-ink">Por onde começar</span>
              <span className="label ml-auto">sugestão da IA</span>
            </div>
            {brief.prioridades.length === 0 ? (
              <div className="border-t border-line px-4 py-5 text-[13px] text-muted">Nenhuma pendência crítica. Bom momento para prospectar.</div>
            ) : (
              <ol className="border-t border-line">
                {brief.prioridades.map((p, i) => (
                  <li key={p.companyId}>
                    <Link href={`/empresas/${p.companyId}`} className="flex items-start gap-3 border-b border-line/70 px-4 py-3 last:border-b-0 hover:bg-soft/50">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-soft text-[11px] font-medium text-muted">{i + 1}</span>
                      <span className="flex-1 text-[13.5px] leading-snug text-ink">{p.texto}</span>
                      <ArrowRight size={15} className="mt-0.5 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {brief.equipe && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-soft/40 px-4 py-2.5 text-[12.5px] text-muted">
                <span className="font-medium text-ink">Equipe</span>
                <span>{brief.equipe.atrasadas} atrasadas</span>
                <span>{brief.equipe.semProximo} sem próximo passo</span>
                <span>{brief.equipe.estagnadas} paradas</span>
                <Link href="/gestao" className="ml-auto inline-flex items-center gap-1 font-medium text-navy hover:underline">
                  Abrir gestão <ArrowRight size={12} />
                </Link>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Atrasadas" value={atrasadas.length} icon={<CalendarClock size={15} />} tone={atrasadas.length ? "bad" : "neutral"} onClick={() => setTab("atrasadas")} />
            <Stat label="Para hoje" value={hoje.length} icon={<CalendarCheck size={15} />} onClick={() => setTab("hoje")} />
            <Stat
              label="Sem próximo passo"
              value={semProximo.length}
              icon={<CircleAlert size={15} />}
              tone={semProximo.length ? "bad" : "neutral"}
              onClick={() => open({ kind: "drill", title: "Contas sem próximo passo", companyIds: semProximo.map((a) => a.companyId) })}
            />
          </div>

          <Card>
            <CardHeader
              title="Minhas atividades"
              action={
                <Segmented
                  value={activeTab}
                  onChange={setTab}
                  options={[
                    { value: "atrasadas", label: `Atrasadas ${atrasadas.length}` },
                    { value: "hoje", label: `Hoje ${hoje.length}` },
                    { value: "proximas", label: `Próximas ${proximas.length}` },
                  ]}
                />
              }
            />
            <div className="border-t border-line">
              {list.length === 0 ? (
                <Empty icon={<CalendarCheck size={20} />} title="Nada nesta lista" text={activeTab === "atrasadas" ? "Você está em dia." : "Use Registrar para lançar o que aconteceu."} />
              ) : (
                list.map((a) => <TaskRow key={a.id} a={a} />)
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Atenção na sua carteira" kicker={alerts.length ? `${alerts.length} ${alerts.length === 1 ? "ponto de atenção" : "pontos de atenção"}` : "tudo em dia"} />
            <div className="border-t border-line">
              {alerts.length === 0 ? (
                <div className="px-4 py-5 text-[12.5px] text-muted">Nenhum alerta.</div>
              ) : (
                <div className="scrollbar-thin max-h-[320px] overflow-y-auto">
                  {alerts.slice(0, 8).map((a) => (
                    <AlertRow
                      key={a.id}
                      a={a}
                      actionLabel={a.tipo === "sem_proximo_passo" ? "Definir" : "Abrir"}
                      onAction={() => (a.tipo === "sem_proximo_passo" ? open({ kind: "newActivity", companyId: a.companyId }) : router.push(`/empresas/${a.companyId}`))}
                    />
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="WhatsApp" kicker={convs.length ? `${convs.length} ${convs.length === 1 ? "conversa aguardando" : "conversas aguardando"} resposta` : "sem mensagens novas"} action={<MessageCircle size={16} className="text-muted" />} />
            <div className="border-t border-line">
              {convs.length === 0 && <div className="px-4 py-5 text-[12.5px] text-muted">Nenhuma mensagem nova.</div>}
              {convs.slice(0, 4).map((c) => {
                const co = s.companies.find((x) => x.id === c.companyId);
                const last = c.messages.at(-1);
                return (
                  <Link key={c.id} href={`/conversas?c=${c.id}`} className="flex items-start gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0 hover:bg-soft/50">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ok-soft text-[12px] font-medium text-ok">{c.contatoNome[0]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                        {c.contatoNome}
                        <span className="truncate text-[11.5px] font-normal text-muted">{co ? co.nome : "sem cadastro"}</span>
                      </span>
                      <span className="block truncate text-[12px] text-muted">{last?.text}</span>
                    </span>
                    <span className="shrink-0 text-[10.5px] text-muted">{fmtAgo(c.lastAt, now)}</span>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
