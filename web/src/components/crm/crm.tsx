"use client";

import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Bot,
  Building2,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  GitMerge,
  Handshake,
  Headset,
  Mail,
  MapPin,
  MessageCircle,
  Pause,
  Phone,
  Sparkles,
  StickyNote,
  Target,
  Trophy,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AIBadge } from "@/components/ai/ai";
import { Avatar, Badge, Button } from "@/components/ui/primitives";
import { FUNNELS, getStage } from "@/lib/constants";
import { dayDiff, dueState, fmtAgo, fmtDateTime, fmtDue } from "@/lib/dates";
import { daysInStage, stagnationLevel, type Alert, type TimelineItem } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Activity, ActivityType, Canal, Company, Deal, User } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export function TypeIcon({ tipo, size = 15, className }: { tipo: ActivityType | Canal; size?: number; className?: string }) {
  const map: Record<string, ReactNode> = {
    Ligação: <Phone size={size} />,
    WhatsApp: <MessageCircle size={size} />,
    "E-mail": <Mail size={size} />,
    Visita: <MapPin size={size} />,
    Reunião: <Users size={size} />,
    Cotação: <FileText size={size} />,
    Homologação: <ClipboardCheck size={size} />,
    Cadastro: <Building2 size={size} />,
    Suporte: <Headset size={size} />,
    Nota: <StickyNote size={size} />,
    Sistema: <Target size={size} />,
    IA: <Sparkles size={size} />,
    Outro: <Target size={size} />,
  };
  return <span className={cn("inline-flex", className)}>{map[tipo] ?? <Target size={size} />}</span>;
}

export function UserAvatar({ userId, size = 26 }: { userId: string; size?: number }) {
  const users = useStore((s) => s.users);
  if (userId === "ia")
    return (
      <span className="inline-grid shrink-0 place-items-center rounded-full bg-ai text-white" style={{ width: size, height: size }}>
        <Sparkles size={size * 0.5} />
      </span>
    );
  if (userId === "sistema")
    return (
      <span className="inline-grid shrink-0 place-items-center rounded-full bg-navy text-white" style={{ width: size, height: size }}>
        <Bot size={size * 0.52} />
      </span>
    );
  const u = users.find((x) => x.id === userId);
  if (!u) return null;
  return <Avatar name={u.name} initials={u.initials} color={u.color} size={size} />;
}

export function userName(users: User[], id: string) {
  if (id === "ia") return "Tawper IA";
  if (id === "sistema") return "Sistema";
  return users.find((u) => u.id === id)?.short ?? id;
}

export function StagePill({ deal, className }: { deal?: Deal; className?: string }) {
  if (!deal) return <Badge tone="muted">Sem oportunidade</Badge>;
  const st = getStage(deal.funnel, deal.stageId);
  if (deal.status === "ganha") return <Badge tone="green" className={className}>{deal.funnel === "aquisicao" ? "Primeira venda" : `Recompra · ciclo ${deal.ciclo}`}</Badge>;
  if (deal.status === "perdida") return <Badge tone="red" className={className}>Perdida</Badge>;
  return (
    <Badge tone={deal.funnel === "recorrencia" ? "green" : "neutral"} className={className}>
      {deal.funnel === "recorrencia" ? "Recorrência · " : ""}
      {st.nome}
    </Badge>
  );
}

export function StatusBadge({ c }: { c: Company }) {
  if (c.status === "espera") return <Badge tone="amber"><Pause size={11} /> Em espera</Badge>;
  if (c.status === "perdida") return <Badge tone="red">Perdida</Badge>;
  if (c.status === "arquivada") return <Badge tone="muted">Arquivada</Badge>;
  return <Badge tone="green">Ativa</Badge>;
}

export function UrgencyBadge({ u }: { u: Company["urgencia"] }) {
  return <Badge tone={u === "Alta" ? "red" : u === "Média" ? "amber" : "muted"}>Urgência {u.toLowerCase()}</Badge>;
}

export function DaysInStage({ deal }: { deal: Deal }) {
  const lvl = stagnationLevel(deal);
  const st = getStage(deal.funnel, deal.stageId);
  const d = daysInStage(deal);
  return (
    <span
      title={st.limiteDias ? `Limite da etapa: ${st.limiteDias} dias` : undefined}
      className={cn("inline-flex items-center gap-1 text-[11.5px]", lvl === "estagnada" ? "text-brand" : lvl === "atencao" ? "text-warn" : "text-muted")}
    >
      {lvl === "estagnada" && <AlertTriangle size={12} />}
      {d}d na etapa
    </span>
  );
}

export function DueLabel({ iso, className }: { iso: string; className?: string }) {
  const st = dueState(iso);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12px]",
        st === "atrasada" ? "text-brand" : st === "hoje" ? "text-ink" : "text-muted",
        className,
      )}
    >
      <CalendarClock size={12} />
      {fmtDue(iso)}
    </span>
  );
}

/** Etapas do funil: só a atual em destaque. */
export function StageStepper({ deal, compact }: { deal: Deal; compact?: boolean }) {
  const stages = FUNNELS[deal.funnel].stages;
  const cur = stages.findIndex((s) => s.id === deal.stageId);
  const passed = new Set(deal.history.map((h) => h.stageId));
  return (
    <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
      <ol className="flex min-w-max items-center gap-1">
        {stages.map((s, i) => {
          const done = i < cur || (deal.status === "ganha" && i <= cur);
          const current = i === cur && deal.status === "aberta";
          const skipped = i < cur && !passed.has(s.id);
          return (
            <li key={s.id} className="flex items-center gap-1">
              <span
                title={s.objetivo}
                className={cn(
                  "flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12.5px] whitespace-nowrap",
                  current && "bg-navy font-medium text-white",
                  done && !skipped && "text-ink",
                  (skipped || (!current && !done)) && "text-muted/70",
                )}
              >
                {done && !skipped && <Check size={12} className="text-ok" />}
                {compact || (!current && !done) ? s.curto : s.nome}
                {current && <span className="text-[11px] text-white/60">{daysInStage(deal)}d</span>}
              </span>
              {i < stages.length - 1 && <ChevronRight size={13} className="shrink-0 text-line" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function QualityMeter({ score, missing, hideLabel }: { score: number; missing: string[]; hideLabel?: boolean }) {
  const tone = score >= 80 ? "bg-ok" : score >= 60 ? "bg-warn" : "bg-brand";
  return (
    <div title={missing.length ? `Falta: ${missing.join(", ")}` : "Cadastro completo"}>
      <div className="flex items-center justify-between text-[11.5px] text-muted">
        <span>{hideLabel ? "" : "Cadastro"}</span>
        <span className={cn(score >= 60 ? "text-ink" : "text-brand")}>{score}%</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-soft">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function CompanyLink({ company, className }: { company?: Company; className?: string }) {
  if (!company) return null;
  return (
    <Link href={`/empresas/${company.id}`} className={cn("font-medium text-ink hover:underline", className)}>
      {company.nome}
    </Link>
  );
}

/** Linha de tarefa: um clique conclui e já propõe o próximo passo. */
export function TaskRow({ a, showCompany = true, compact }: { a: Activity; showCompany?: boolean; compact?: boolean }) {
  const companies = useStore((s) => s.companies);
  const open = useUI((s) => s.open);
  const c = companies.find((x) => x.id === a.companyId);
  const st = dueState(a.dueAt);
  return (
    <div className="group flex items-start gap-3 border-b border-line/70 px-4 py-3 last:border-b-0 hover:bg-soft/40">
      <button
        type="button"
        onClick={() => open({ kind: "complete", activityId: a.id })}
        title="Concluir e definir o próximo passo"
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line text-transparent transition hover:border-ok hover:bg-ok hover:text-white"
      >
        <Check size={11} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[13.5px] text-ink">{a.titulo}</span>
          {a.origem === "ia" && <AIBadge />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
          {showCompany && c && <CompanyLink company={c} className="text-[12px] font-medium text-ink" />}
          <span className="inline-flex items-center gap-1">
            <TypeIcon tipo={a.tipo} size={12} /> {a.tipo}
          </span>
          <DueLabel iso={a.dueAt} />
          {a.prioridade === "Alta" && st !== "atrasada" && <span className="text-warn">prioridade alta</span>}
        </div>
        {!compact && a.descricao && <p className="mt-1 text-[12px] text-muted">{a.descricao}</p>}
      </div>
      <Button size="xs" variant="subtle" className="opacity-100 md:opacity-0 md:group-hover:opacity-100" onClick={() => open({ kind: "complete", activityId: a.id })}>
        Concluir
      </Button>
    </div>
  );
}

/** Destaque do próximo passo da conta. */
export function NextStepCard({ company, next, onDefine }: { company: Company; next?: Activity; onDefine: () => void }) {
  const users = useStore((s) => s.users);
  const open = useUI((s) => s.open);
  if (company.status === "espera" && company.standby) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-white px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
          <Pause size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="label">Em espera</div>
          <div className="text-[14px] text-ink">{company.standby.motivo}</div>
          <div className="mt-0.5 text-[12px] text-muted">
            Retomada: {company.standby.condicao} · reavaliar {fmtDue(company.standby.reavaliacao)}
          </div>
        </div>
      </div>
    );
  }
  if (!next) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-brand/20 bg-brand-soft/50 px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-brand">
          <AlertTriangle size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-ink">Esta conta está sem próximo passo</div>
          <div className="text-[12.5px] text-muted">Toda conta ativa precisa de uma ação com dono e prazo.</div>
        </div>
        <Button variant="primary" size="sm" onClick={onDefine}>
          Definir agora
        </Button>
      </div>
    );
  }
  const st = dueState(next.dueAt);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-white px-4 py-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", st === "atrasada" ? "bg-brand-soft text-brand" : "bg-soft text-navy")}>
        <TypeIcon tipo={next.tipo} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="label">Próximo passo</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] text-ink">{next.titulo}</span>
          {next.origem === "ia" && <AIBadge />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
          <DueLabel iso={next.dueAt} />
          <span>{userName(users, next.ownerId)}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => open({ kind: "reschedule", activityId: next.id })}>
          Reagendar
        </Button>
        <Button size="sm" variant="primary" onClick={() => open({ kind: "complete", activityId: next.id })}>
          <Check size={14} /> Concluir
        </Button>
      </div>
    </div>
  );
}

const KIND_ICON: Record<string, ReactNode> = {
  create: <UserPlus size={14} />,
  stage: <ArrowRight size={14} />,
  win: <Trophy size={14} />,
  loss: <XCircle size={14} />,
  standby: <Pause size={14} />,
  quote: <FileText size={14} />,
  merge: <GitMerge size={14} />,
  import: <Upload size={14} />,
  cobranca: <AlertTriangle size={14} />,
  strategy: <Target size={14} />,
  contact: <UserPlus size={14} />,
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  const users = useStore((s) => s.users);
  if (!items.length) return <div className="px-4 py-8 text-center text-[13px] text-muted">Nenhum registro ainda.</div>;
  return (
    <ol className="relative px-4 py-3">
      <span className="absolute top-5 bottom-5 left-[29px] w-px bg-line" />
      {items.map((it) => {
        if (it.source === "activity" && it.activity) {
          const a = it.activity;
          const late = a.completedAt && dayDiff(a.completedAt, a.dueAt) > 0;
          return (
            <li key={it.id} className="relative flex gap-3 py-2.5">
              <span className="z-[1] grid size-7 shrink-0 place-items-center rounded-full border border-ok/30 bg-white text-ok">
                <Check size={13} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
                  <span className="font-medium text-ink">{a.titulo}</span>
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                    <TypeIcon tipo={a.tipo} size={11} /> {a.tipo} concluída
                  </span>
                  {late && <Badge tone="amber">fora do prazo</Badge>}
                </div>
                {a.resultado && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink/75">{a.resultado}</p>}
                <div className="mt-0.5 text-[11px] text-muted">
                  {userName(users, a.ownerId)} · {fmtDateTime(it.at)}
                </div>
              </div>
            </li>
          );
        }
        const i = it.interaction!;
        const isAI = i.autorId === "ia" || i.canal === "IA";
        const isWin = i.kind === "win";
        const isCob = i.kind === "cobranca";
        return (
          <li key={it.id} className="relative flex gap-3 py-2.5">
            <span
              className={cn(
                "z-[1] grid size-7 shrink-0 place-items-center rounded-full border",
                isAI ? "border-ai/25 bg-white text-ai" : isWin ? "border-ok/30 bg-white text-ok" : isCob ? "border-brand/25 bg-white text-brand" : "border-line bg-white text-muted",
              )}
            >
              {isAI ? <Sparkles size={13} /> : KIND_ICON[i.kind] ?? <TypeIcon tipo={i.canal} size={13} />}
            </span>
            <div className={cn("min-w-0 flex-1", isAI && "rounded-[6px] bg-ai-soft/70 px-3 py-2", isWin && "rounded-[6px] bg-ok-soft/70 px-3 py-2")}>
              <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
                <span className={cn("font-medium", isAI ? "text-ai" : "text-ink")}>{i.titulo}</span>
                {isAI && <AIBadge />}
                {!isAI && i.kind !== "stage" && i.kind !== "create" && i.canal !== "Sistema" && (
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                    <TypeIcon tipo={i.canal} size={11} /> {i.canal}
                  </span>
                )}
              </div>
              {i.conteudo && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink/75">{i.conteudo}</p>}
              <div className="mt-0.5 text-[11px] text-muted">
                {userName(users, i.autorId)} · {fmtDateTime(it.at)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const ALERT_ICON: Record<Alert["tipo"], ReactNode> = {
  atraso: <CalendarClock size={14} />,
  sem_proximo_passo: <AlertTriangle size={14} />,
  estagnacao: <Pause size={14} />,
  dados: <ClipboardCheck size={14} />,
  recorrencia: <Handshake size={14} />,
  espera_vencida: <Pause size={14} />,
  orcamento: <FileText size={14} />,
  sugestao: <Sparkles size={14} />,
  dependencia: <GitMerge size={14} />,
};

export function AlertRow({ a, onAction, actionLabel }: { a: Alert; onAction?: () => void; actionLabel?: string }) {
  const companies = useStore((s) => s.companies);
  const users = useStore((s) => s.users);
  const c = companies.find((x) => x.id === a.companyId);
  const tone = a.severidade === "alta" ? "text-brand bg-brand-soft" : a.severidade === "media" ? "text-warn bg-warn-soft" : "text-muted bg-soft";
  return (
    <div className="flex items-start gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0 hover:bg-soft/40">
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", a.tipo === "sugestao" ? "bg-ai-soft text-ai" : tone)}>{ALERT_ICON[a.tipo]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <CompanyLink company={c} className="text-[13px]" />
          <span className="text-[11.5px] text-muted">· {userName(users, a.ownerId)}</span>
        </div>
        <div className="text-[12.5px] text-muted">
          <span className="text-ink">{a.titulo}</span> — {a.texto}
        </div>
      </div>
      {onAction && (
        <Button size="xs" variant="outline" onClick={onAction}>
          {actionLabel ?? "Agir"}
        </Button>
      )}
    </div>
  );
}

export function timeAgo(iso?: string) {
  return iso ? fmtAgo(iso) : "—";
}

