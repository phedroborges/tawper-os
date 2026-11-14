"use client";

import { ArrowRight, CalendarCheck, CalendarClock, Check, CircleAlert, Clock, MapPin, MessageCircle, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TypeIcon } from "@/components/crm/crm";
import { Card, CardHeader, Empty, PageHeader, Progress } from "@/components/ui/primitives";
import { dailyBriefing, type DailyBriefing } from "@/lib/ai";
import { ALERT_LABEL, alertsOf, byDueAsc, type AlertType } from "@/lib/selectors";
import { isManager } from "@/lib/constants";
import { peerOf } from "@/lib/contact-match";
import { addDays, dayDiff, fmtDateShort, fmtTime, longToday } from "@/lib/dates";
import { annualGoalOf, periodGoal, periodRange, salesOf, sellersOf, sold } from "@/lib/goals";
import { useNow } from "@/lib/hooks";
import { isBusinessDay } from "@/lib/route-schedule";
import { useCurrentUser, useStore } from "@/lib/store";
import type { Activity, ActivityType } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, moneyShort } from "@/lib/utils";
import { aiBriefing } from "@/server/ai/actions";

/** Cor de cada tipo de atividade na agenda (o ícone e o nome vão junto: a cor nunca fala sozinha). */
const TYPE_TONE: Partial<Record<ActivityType, string>> = {
  Visita: "bg-[#e3ecf9] text-[#2456a6]",
  Reunião: "bg-[#ece6f7] text-[#5b3fa6]",
  Ligação: "bg-[#e1f3ee] text-[#0f8a72]",
  WhatsApp: "bg-[#e1f3ee] text-[#0f8a72]",
  Cotação: "bg-[#f8ecd9] text-[#8a5a00]",
  Suporte: "bg-brand-soft text-brand",
};

/** Bloco de número do topo: um número grande, um rótulo e, quando faz sentido, uma barra. */
function Tile({
  icon,
  label,
  value,
  sub,
  tone,
  progress,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "bad";
  progress?: number;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span className={cn("grid size-7 place-items-center rounded-full", tone === "bad" ? "bg-brand-soft text-brand" : "bg-soft text-navy-3")}>{icon}</span>
        {label}
      </div>
      <div className={cn("mt-2 text-[30px] leading-none font-semibold tracking-[-0.02em]", tone === "bad" ? "text-brand" : "text-ink")}>{value}</div>
      {progress !== undefined && <Progress value={progress} tone={progress >= 100 ? "green" : "navy"} className="mt-2.5" />}
      {sub && <div className="mt-1.5 truncate text-[12px] text-muted">{sub}</div>}
    </>
  );
  const className = cn("rounded-[10px] border border-line bg-white px-4 py-3.5 text-left block", (onClick || href) && "transition hover:border-navy-3/30 cursor-pointer");
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  const Comp = onClick ? "button" : "div";
  return (
    <Comp type={onClick ? "button" : undefined} onClick={onClick} className={className}>
      {content}
    </Comp>
  );
}

/** Linha da agenda: hora, tipo em destaque, cliente, atalho de zap, reagendar e concluir. */
function AgendaRow({ a, late }: { a: Activity; late?: boolean }) {
  const company = useStore((s) => s.companies.find((c) => c.id === a.companyId));
  const contacts = useStore((s) => s.contacts.filter((c) => c.companyId === a.companyId && c.ativo));
  const contact = contacts[0];
  const { open, openInbox } = useUI();
  return (
    <li className="group flex flex-wrap items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0 hover:bg-soft/40">
      <div className={cn("w-12 shrink-0 text-right text-[12.5px] font-semibold tabular-nums", late ? "text-brand" : "text-ink")}>{late ? fmtDateShort(a.dueAt) : fmtTime(a.dueAt)}</div>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TYPE_TONE[a.tipo] ?? "bg-soft text-navy-3")} title={a.tipo}>
        <TypeIcon tipo={a.tipo} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">{a.titulo}</div>
        <div className="truncate text-[12px] text-muted">
          {a.tipo}
          {company && (
            <>
              {" · "}
              <Link href={`/empresas/${company.id}`} className="font-medium text-ink/80 hover:underline">
                {company.nome}
              </Link>
            </>
          )}
          {contact?.nome && (
            <>
              {" · "}
              <span className="text-ink/70">{contact.nome}</span>
            </>
          )}
          {a.prioridade === "Alta" && <span className="text-warn"> · prioridade alta</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 ml-auto sm:ml-0">
        {contact?.whatsapp && (
          <button
            type="button"
            onClick={() => openInbox(peerOf(contact))}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-emerald-300 bg-emerald-50/60 px-2.5 text-[12px] font-medium text-emerald-800 transition hover:border-emerald-500 hover:bg-emerald-100"
            title={`Abrir WhatsApp com ${contact.nome} (${contact.whatsapp})`}
          >
            <MessageCircle size={13} />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => open({ kind: "reschedule", activityId: a.id })}
          className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-line bg-white px-2.5 text-[12px] font-medium text-muted transition hover:border-navy-3/40 hover:text-ink"
          title="Reagendar data ou horário desta tarefa"
        >
          <Clock size={13} />
          <span className="hidden sm:inline">Reagendar</span>
        </button>
        <button
          type="button"
          onClick={() => open({ kind: "complete", activityId: a.id })}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border border-line bg-white px-2.5 text-[12px] font-medium text-ink transition hover:border-ok hover:bg-ok hover:text-white"
        >
          <Check size={13} strokeWidth={3} /> Concluir
        </button>
      </div>
    </li>
  );
}

/** Linha de tarefa concluída hoje: horário, desfecho e empresa. */
function ConcluidaRow({ a }: { a: Activity }) {
  const company = useStore((s) => s.companies.find((c) => c.id === a.companyId));
  return (
    <li className="flex items-center gap-3 border-b border-line/70 bg-emerald-50/30 px-4 py-2.5 last:border-b-0">
      <div className="w-12 shrink-0 text-right text-[12.5px] font-medium text-emerald-700 tabular-nums">
        {a.completedAt ? fmtTime(a.completedAt) : "—"}
      </div>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <Check size={16} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink line-through opacity-75">{a.titulo}</div>
        <div className="truncate text-[12px] text-muted">
          {a.resultado ? <span className="font-medium text-ink/90">Desfecho: {a.resultado}</span> : a.tipo}
          {company && (
            <>
              {" · "}
              <Link href={`/empresas/${company.id}`} className="font-medium text-ink/80 hover:underline">
                {company.nome}
              </Link>
            </>
          )}
        </div>
      </div>
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">Concluída</span>
    </li>
  );
}

export default function MeuDiaPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const { open } = useUI();
  /** Dia escolhido na faixa da semana: 0 = hoje; -1 = atrasadas. */
  const [pick, setPick] = useState<number | null>(null);

  const mine = useMemo(() => s.activities.filter((a) => a.ownerId === user.id && a.status === "pendente").sort(byDueAsc), [s.activities, user.id]);
  const atrasadas = mine.filter((a) => dayDiff(a.dueAt, now) < 0);
  const hoje = mine.filter((a) => dayDiff(a.dueAt, now) === 0);
  const concluidasHoje = useMemo(
    () =>
      s.activities
        .filter((a) => a.ownerId === user.id && a.status === "concluida" && a.completedAt && dayDiff(a.completedAt, now) === 0)
        .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()),
    [s.activities, user.id, now],
  );
  const feitasHoje = concluidasHoje.length;
  const visitasSemana = mine.filter((a) => a.tipo === "Visita" && dayDiff(a.dueAt, now) >= 0 && dayDiff(a.dueAt, now) <= 7).length;

  // Próximos dias úteis (e finais de semana se tiver tarefa marcada).
  const dias = useMemo(() => {
    const out: { offset: number; date: Date }[] = [];
    for (let i = 0; (out.length < 5 || i < 7) && i < 14; i++) {
      const date = addDays(now, i);
      const hasTasks = mine.some((a) => dayDiff(a.dueAt, now) === i);
      if (i === 0 || isBusinessDay(date) || hasTasks) {
        out.push({ offset: i, date });
      }
    }
    return out;
  }, [now, mine]);

  const maxOffset = dias.length ? dias[dias.length - 1].offset : 0;
  const futuras = useMemo(() => mine.filter((a) => dayDiff(a.dueAt, now) > maxOffset), [mine, now, maxOffset]);

  const localBrief = useMemo(() => dailyBriefing(s, user, now), [s, user, now]);
  const briefKey = `${user.id}|${localBrief.resumo}|${localBrief.prioridades.map((p) => p.companyId).join(",")}`;
  const [aiBrief, setAiBrief] = useState<{ key: string; data: DailyBriefing } | null>(null);
  const brief = aiBrief?.key === briefKey ? aiBrief.data : localBrief;

  useEffect(() => {
    const cacheKey = `tawper-ai-brief:${briefKey}`;
    const fallback = dailyBriefing(useStore.getState(), user, new Date());
    let alive = true;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached) as DailyBriefing;
        queueMicrotask(() => {
          if (alive) setAiBrief({ key: briefKey, data });
        });
        return () => {
          alive = false;
        };
      }
    } catch {
      /* sessionStorage indisponível */
    }
    void (async () => {
      try {
        const data = await aiBriefing({ fallback });
        if (!alive) return;
        setAiBrief({ key: briefKey, data });
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          /* ignore quota */
        }
      } catch {
        /* mantém o briefing local */
      }
    })();
    return () => {
      alive = false;
    };
  }, [briefKey, user]);

  const alerts = useMemo(() => alertsOf(s, { ownerId: user.id, now }).filter((a) => a.tipo !== "atraso"), [s, user.id, now]);
  const alertGroups = useMemo(() => {
    const acc = new Map<AlertType, string[]>();
    for (const a of alerts) acc.set(a.tipo, [...(acc.get(a.tipo) ?? []), a.companyId]);
    return [...acc].sort((a, b) => b[1].length - a[1].length);
  }, [alerts]);

  // Meta do mês: a do vendedor; para gestor, a da empresa.
  const goals = s.config.goals;
  const meta = useMemo(() => {
    if (!goals || goals.anual <= 0) return null;
    const sales = salesOf(s.deals);
    const mes = periodRange("mes", now);
    const own = annualGoalOf(goals, sellersOf(s.users, goals.participantes), user.id);
    const personal = own > 0;
    if (!personal && !isManager(user)) return null;
    const alvo = periodGoal(personal ? own : goals.anual, sales, "mes", now, personal ? user.id : undefined);
    return { alvo, vendido: sold(sales, mes, personal ? user.id : undefined), personal };
  }, [goals, s.deals, s.users, user, now]);

  const selected = pick ?? (atrasadas.length && !hoje.length ? -1 : 0);
  const list = useMemo(() => {
    if (selected === -1) return atrasadas;
    if (selected === -2) return concluidasHoje;
    if (selected === -99) return futuras;
    return mine.filter((a) => dayDiff(a.dueAt, now) === selected);
  }, [selected, atrasadas, concluidasHoje, futuras, mine, now]);
  const totalHoje = hoje.length + feitasHoje;

  return (
    <div>
      <PageHeader title={brief.saudacao} subtitle={longToday(now)} />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile
          icon={<CalendarCheck size={15} />}
          label="Hoje"
          value={hoje.length === 0 && feitasHoje > 0 ? "0 ✓" : hoje.length}
          progress={totalHoje ? (feitasHoje / totalHoje) * 100 : undefined}
          sub={
            totalHoje
              ? hoje.length === 0
                ? `Todas as ${feitasHoje} tarefas concluídas!`
                : `${feitasHoje} de ${totalHoje} feitas hoje (${hoje.length} pendente${hoje.length > 1 ? "s" : ""})`
              : "nada marcado para hoje"
          }
          onClick={() => setPick(0)}
        />
        <Tile
          icon={<CalendarClock size={15} />}
          label="Atrasadas"
          value={atrasadas.length}
          tone={atrasadas.length ? "bad" : undefined}
          sub={atrasadas.length ? `a mais antiga é de ${fmtDateShort(atrasadas[0].dueAt)}` : "você está em dia"}
          onClick={() => setPick(-1)}
        />
        <Tile
          icon={<MapPin size={15} />}
          label="Visitas nos próximos 7 dias"
          value={visitasSemana}
          sub={visitasSemana ? "abrir planejamento em Rotas →" : "ver ou planejar em Rotas →"}
          href="/rotas"
        />
        {meta ? (
          <Tile
            icon={<Target size={15} />}
            label={meta.personal ? "Minha meta do mês" : "Meta da empresa no mês"}
            value={`${meta.alvo > 0 ? Math.round((meta.vendido / meta.alvo) * 100) : 0}%`}
            progress={meta.alvo > 0 ? (meta.vendido / meta.alvo) * 100 : 0}
            sub={`${moneyShort(meta.vendido)} de ${moneyShort(meta.alvo)}`}
            href={isManager(user) ? "/gestao" : undefined}
          />
        ) : (
          <Tile
            icon={<CircleAlert size={15} />}
            label="Sem próximo passo"
            value={alerts.filter((a) => a.tipo === "sem_proximo_passo").length}
            tone={alerts.some((a) => a.tipo === "sem_proximo_passo") ? "bad" : undefined}
            sub="contas ativas sem tarefa aberta"
            onClick={() => open({ kind: "drill", title: "Contas sem próximo passo", companyIds: alerts.filter((a) => a.tipo === "sem_proximo_passo").map((a) => a.companyId) })}
          />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(320px,28vw,440px)]">
        <Card className="min-w-0 self-start">
          <CardHeader title="Minha agenda" kicker="Toque em um dia para ver as tarefas" />
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-line px-4 py-3">
            {atrasadas.length > 0 && (
              <button
                type="button"
                onClick={() => setPick(-1)}
                className={cn("min-w-[84px] rounded-[8px] border px-3 py-2 text-left transition", selected === -1 ? "border-brand bg-brand text-white" : "border-brand/30 bg-brand-soft/60 text-brand hover:border-brand")}
              >
                <div className="text-[11px] font-medium">Atrasadas</div>
                <div className="text-[20px] leading-tight font-semibold">{atrasadas.length}</div>
              </button>
            )}
            {dias.map(({ offset, date }) => {
              const n = mine.filter((a) => dayDiff(a.dueAt, now) === offset).length;
              const on = selected === offset;
              return (
                <button
                  key={offset}
                  type="button"
                  onClick={() => setPick(offset)}
                  className={cn("min-w-[84px] flex-1 rounded-[8px] border px-3 py-2 text-left transition", on ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:border-navy-3/40")}
                >
                  <div className={cn("text-[11px] font-medium capitalize", on ? "text-white/80" : "text-muted")}>{offset === 0 ? "Hoje" : date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" })}</div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-[20px] leading-tight font-semibold">{n}</span>
                    <span className={cn("pb-0.5 text-[11px]", on ? "text-white/70" : "text-muted")}>{n === 1 ? "tarefa" : "tarefas"}</span>
                  </div>
                </button>
              );
            })}
            {futuras.length > 0 && (
              <button
                type="button"
                onClick={() => setPick(-99)}
                className={cn("min-w-[84px] rounded-[8px] border px-3 py-2 text-left transition", selected === -99 ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:border-navy-3/40")}
              >
                <div className={cn("text-[11px] font-medium", selected === -99 ? "text-white/80" : "text-muted")}>+ Futuras</div>
                <div className="flex items-end gap-1.5">
                  <span className="text-[20px] leading-tight font-semibold">{futuras.length}</span>
                  <span className={cn("pb-0.5 text-[11px]", selected === -99 ? "text-white/70" : "text-muted")}>{futuras.length === 1 ? "tarefa" : "tarefas"}</span>
                </div>
              </button>
            )}
            {feitasHoje > 0 && (
              <button
                type="button"
                onClick={() => setPick(-2)}
                className={cn("min-w-[84px] rounded-[8px] border px-3 py-2 text-left transition", selected === -2 ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400")}
              >
                <div className={cn("text-[11px] font-medium", selected === -2 ? "text-white/80" : "text-emerald-700")}>Feitas hoje</div>
                <div className="flex items-end gap-1.5">
                  <span className="text-[20px] leading-tight font-semibold">{feitasHoje}</span>
                  <span className={cn("pb-0.5 text-[11px]", selected === -2 ? "text-white/70" : "text-emerald-600")}>{feitasHoje === 1 ? "feita" : "feitas"}</span>
                </div>
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <div className="border-t border-line">
              <Empty
                icon={<CalendarCheck size={20} />}
                title={
                  selected === -1
                    ? "Nenhuma atrasada"
                    : selected === -2
                    ? "Nenhuma tarefa concluída hoje"
                    : selected === -99
                    ? "Nenhuma tarefa futura"
                    : selected === 0
                    ? "Nada pendente para hoje"
                    : "Nada marcado neste dia"
                }
                text={
                  selected === -2
                    ? "As tarefas concluídas hoje aparecerão aqui para você conferir seus desfechos."
                    : "Use Registrar, no topo, para lançar o que aconteceu ou marcar o próximo passo."
                }
              />
            </div>
          ) : (
            <ul className="border-t border-line">
              {selected === -2
                ? list.map((a) => <ConcluidaRow key={a.id} a={a} />)
                : list.map((a) => <AgendaRow key={a.id} a={a} late={selected === -1} />)}
            </ul>
          )}
        </Card>

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
                {brief.prioridades.slice(0, 3).map((p, i) => (
                  <li key={`${p.companyId}-${i}`}>
                    <Link href={`/empresas/${p.companyId}`} className="flex items-start gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0 hover:bg-soft/50">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ai-soft text-[11px] font-semibold text-ai">{i + 1}</span>
                      <span className="line-clamp-2 flex-1 text-[13px] leading-snug text-ink">{p.texto}</span>
                      <ArrowRight size={15} className="mt-0.5 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Atenção na carteira" kicker={alerts.length ? "Toque para ver os clientes" : "Tudo em dia"} />
            {alertGroups.length === 0 ? (
              <div className="border-t border-line px-4 py-5 text-[12.5px] text-muted">Nenhum ponto de atenção.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
                {alertGroups.map(([tipo, ids]) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => open({ kind: "drill", title: ALERT_LABEL[tipo], companyIds: [...new Set(ids)] })}
                    className="rounded-[8px] border border-line px-3 py-2.5 text-left transition hover:border-navy-3/40 hover:bg-soft/40"
                  >
                    <div className="text-[22px] leading-none font-semibold text-ink">{new Set(ids).size}</div>
                    <div className="mt-1 text-[12px] leading-snug text-muted">{ALERT_LABEL[tipo]}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {brief.equipe && (
            <Link href="/gestao" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[8px] border border-line bg-white px-4 py-3 text-[12.5px] text-muted hover:border-navy-3/30">
              <span className="font-medium text-ink">Equipe</span>
              <span>{brief.equipe.atrasadas} atrasadas</span>
              <span>{brief.equipe.semProximo} sem próximo passo</span>
              <span>{brief.equipe.estagnadas} paradas</span>
              <span className="ml-auto inline-flex items-center gap-1 font-medium text-navy">
                Abrir gestão <ArrowRight size={12} />
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
