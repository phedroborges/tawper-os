import type { Metadata } from "next";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Clock3,
  FileCheck2,
  Flag,
  GitBranch,
  LockKeyhole,
  Milestone,
  ShieldCheck,
  Target,
} from "lucide-react";
import { getImplementationPlan, type PlanPhase, type PlanStatus } from "@/lib/implementation-plan";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Implementação — Tawper OS",
  description: "Acompanhamento visual das fases, dependências e gates do plano mestre de implementação.",
};

export const dynamic = "force-static";

const STATUS_STYLE: Record<PlanStatus, { label: string; badge: string; dot: string; line: string }> = {
  "NÃO INICIADA": { label: "Não iniciada", badge: "bg-soft text-muted", dot: "border-line bg-white", line: "bg-line" },
  "PRONTA PARA INICIAR": { label: "Pronta para iniciar", badge: "bg-ai-soft text-ai", dot: "border-ai bg-ai-soft", line: "bg-line" },
  "EM ANDAMENTO": { label: "Em andamento", badge: "bg-navy text-white", dot: "border-navy bg-navy", line: "bg-navy" },
  BLOQUEADA: { label: "Bloqueada", badge: "bg-brand-soft text-brand", dot: "border-brand bg-brand-soft", line: "bg-brand" },
  "EM VALIDAÇÃO": { label: "Em validação", badge: "bg-warn-soft text-warn", dot: "border-warn bg-warn-soft", line: "bg-warn" },
  CONCLUÍDA: { label: "Concluída", badge: "bg-ok-soft text-ok", dot: "border-ok bg-ok", line: "bg-ok" },
};

const MILESTONES = {
  A: { name: "Marco A", title: "V1 operacional", description: "Da definição do produto à operação estabilizada em produção." },
  B: { name: "Marco B", title: "WhatsApp oficial", description: "Troca segura do provedor temporário pela integração oficial." },
  C: { name: "Marco C", title: "Inteligência e escala", description: "IA assistiva, rotas, indicadores e integrações avançadas." },
} as const;

function percent(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

function ProgressBar({ value, tone = "navy" }: { value: number; tone?: "navy" | "green" | "amber" }) {
  const color = tone === "green" ? "bg-ok" : tone === "amber" ? "bg-warn" : "bg-navy";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-soft-2" aria-label={`${value}% concluído`}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const style = STATUS_STYLE[status];
  return <span className={cn("inline-flex items-center rounded-[5px] px-2 py-1 text-[11px] font-semibold whitespace-nowrap", style.badge)}>{style.label}</span>;
}

function PhaseIcon({ phase }: { phase: PlanPhase }) {
  const style = STATUS_STYLE[phase.status];
  return (
    <span className={cn("relative z-10 grid size-9 shrink-0 place-items-center rounded-full border-2", style.dot)}>
      {phase.status === "CONCLUÍDA" ? (
        <Check size={16} className="text-ok" strokeWidth={2.5} />
      ) : phase.status === "EM ANDAMENTO" ? (
        <CircleDot size={16} className="text-white" />
      ) : phase.status === "BLOQUEADA" ? (
        <LockKeyhole size={14} className="text-brand" />
      ) : (
        <span className="text-[11px] font-bold text-muted">{phase.number}</span>
      )}
    </span>
  );
}

function Checklist({ items }: { items: { text: string; done: boolean }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.text} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-ink/85">
          {item.done ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : <Circle size={15} className="mt-0.5 shrink-0 text-muted/45" />}
          <span className={cn(item.done && "text-muted line-through decoration-line")}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

function PhaseCard({ phase, current, last }: { phase: PlanPhase; current: boolean; last: boolean }) {
  const completion = percent(phase.completedItems, phase.totalItems);
  const gateDone = phase.gate.items.filter((item) => item.done).length;
  const gateTotal = phase.gate.items.length;

  return (
    <div className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 md:grid-cols-[44px_minmax(0,1fr)] md:gap-4">
      <div className="flex flex-col items-center">
        <PhaseIcon phase={phase} />
        <div className={cn("mt-1 min-h-6 w-px flex-1", STATUS_STYLE[phase.status].line, last && "invisible")} />
      </div>

      <details className={cn("group mb-4 overflow-hidden rounded-[10px] border bg-white", current ? "border-navy/35 shadow-[0_8px_30px_#0a1d3f0d]" : "border-line")} open={current || undefined}>
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 marker:hidden md:px-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-muted">{phase.code}</span>
              <StatusBadge status={phase.status} />
              {current && <span className="rounded-[5px] bg-brand-soft px-2 py-1 text-[11px] font-semibold text-brand">Fase atual</span>}
            </div>
            <h3 className="mt-2 text-[15px] font-semibold text-ink md:text-[16px]">{phase.title}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{phase.objective}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {phase.estimate}</span>
              <span className="inline-flex items-center gap-1.5"><GitBranch size={13} /> Depende de {phase.dependency}</span>
              <span>{phase.completedItems}/{phase.totalItems} itens</span>
            </div>
            <div className="mt-2.5 max-w-xl"><ProgressBar value={completion} tone={phase.status === "CONCLUÍDA" ? "green" : phase.status === "EM VALIDAÇÃO" ? "amber" : "navy"} /></div>
          </div>
          <ChevronDown size={17} className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>

        <div className="border-t border-line bg-[#fcfcfc] px-4 py-4 md:px-5">
          <div className="grid gap-5 xl:grid-cols-2">
            {phase.sections.filter((section) => section.items.length > 0).map((section) => (
              <section key={section.title}>
                <h4 className="mb-2.5 text-[11.5px] font-semibold tracking-[0.04em] text-muted uppercase">{section.title}</h4>
                <Checklist items={section.items} />
              </section>
            ))}
          </div>

          <section className="mt-5 rounded-[8px] border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><ShieldCheck size={15} className="text-navy-3" /> {phase.gate.title}</div>
                <div className="mt-0.5 text-[11.5px] text-muted">{gateDone}/{gateTotal} critérios aprovados</div>
              </div>
              <StatusBadge status={phase.status === "CONCLUÍDA" ? "CONCLUÍDA" : "NÃO INICIADA"} />
            </div>
            <div className="mt-3"><Checklist items={phase.gate.items} /></div>
            <div className="mt-4 grid gap-2 border-t border-line pt-3 text-[11.5px] text-muted sm:grid-cols-3">
              <span><b className="font-semibold text-ink/70">Aprovado por:</b> {phase.gate.approvedBy}</span>
              <span><b className="font-semibold text-ink/70">Data:</b> {phase.gate.approvedAt}</span>
              <span><b className="font-semibold text-ink/70">Evidências:</b> {phase.gate.evidence}</span>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

export default async function ImplementacaoPage() {
  const plan = await getImplementationPlan();
  const current = plan.phases.find((phase) => phase.number === plan.currentPhaseNumber) ?? plan.phases[0];
  const currentPending = current.sections.flatMap((section) => section.items).filter((item) => !item.done).slice(0, 6);
  const currentProgress = percent(current.completedItems, current.totalItems);
  const overallProgress = percent(plan.completedItems, plan.totalItems);

  return (
    <div className="min-w-0 overflow-x-hidden">
      <div className="mb-5 overflow-hidden rounded-[12px] bg-navy text-white">
        <div className="grid min-w-0 gap-6 px-5 py-6 md:px-7 md:py-7 xl:grid-cols-[1.4fr_0.8fr] xl:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-white/60 uppercase">
              <Milestone size={14} /> Plano mestre · versão {plan.version}
            </div>
            <h1 className="mt-3 break-words text-[25px] leading-tight font-semibold tracking-[-0.02em] md:text-[30px]">Implementação do Tawper OS</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/70">Uma visão única das fases, dependências e gates. O progresso abaixo é lido diretamente do plano mestre — sem planilha paralela.</p>
          </div>
          <div className="min-w-0 rounded-[9px] border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11.5px] text-white/65">Progresso dos checklists</span>
              <strong className="text-[16px] font-semibold">{overallProgress}%</strong>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white" style={{ width: `${overallProgress}%` }} /></div>
            <div className="mt-2 flex flex-col gap-1 text-[11px] text-white/55 sm:flex-row sm:justify-between">
              <span>{plan.completedItems} de {plan.totalItems} itens</span>
              <span>{plan.completedPhases} de {plan.phases.length} fases concluídas</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[9px] border border-line bg-white p-4">
          <div className="flex items-center gap-2 text-muted"><Target size={15} /><span className="label">Fase atual</span></div>
          <div className="mt-2 text-[16px] font-semibold text-ink">{current.code} · {current.title}</div>
          <div className="mt-2"><StatusBadge status={current.status} /></div>
        </div>
        <div className="rounded-[9px] border border-line bg-white p-4">
          <div className="flex items-center gap-2 text-muted"><FileCheck2 size={15} /><span className="label">Progresso da fase</span></div>
          <div className="mt-2 text-[23px] font-semibold text-ink">{currentProgress}%</div>
          <div className="mt-2"><ProgressBar value={currentProgress} /></div>
        </div>
        <div className="rounded-[9px] border border-line bg-white p-4">
          <div className="flex items-center gap-2 text-muted"><CalendarDays size={15} /><span className="label">Estimativa da fase</span></div>
          <div className="mt-2 text-[16px] font-semibold text-ink">{current.estimate}</div>
          <div className="mt-1 text-[11.5px] text-muted">O gate, e não o prazo, autoriza o avanço.</div>
        </div>
        <div className="rounded-[9px] border border-line bg-white p-4">
          <div className="flex items-center gap-2 text-muted"><Flag size={15} /><span className="label">Plano atualizado</span></div>
          <div className="mt-2 text-[16px] font-semibold text-ink">{plan.updatedAt}</div>
          <div className="mt-1 text-[11.5px] text-muted">Aprovador dos gates: {plan.approver}</div>
        </div>
      </div>

      <div className="mb-6 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="min-w-0 overflow-hidden rounded-[10px] border border-navy/20 bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-navy text-white"><CircleDot size={17} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold tracking-[0.08em] text-navy-3 uppercase">Foco agora</div>
              <h2 className="mt-1 break-words text-[17px] font-semibold text-ink">{current.code} — {current.title}</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{current.objective}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2.5 text-[11.5px] font-semibold text-muted uppercase">Próximas pendências</div>
            <Checklist items={currentPending} />
          </div>
        </section>

        <section className="rounded-[10px] border border-line bg-white p-5">
          <div className="flex items-center gap-2"><LockKeyhole size={16} className="text-brand" /><h2 className="text-[14.5px] font-semibold text-ink">Regra de avanço</h2></div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">A próxima fase permanece bloqueada até todos os itens do gate atual estarem concluídos, com aprovador, data e evidências registrados no plano.</p>
          <div className="mt-4 rounded-[7px] bg-soft px-3.5 py-3 text-[12px] text-ink/80">
            <span className="font-semibold">Gate atual:</span> {current.gate.title}
            <div className="mt-1 text-muted">{current.gate.items.filter((item) => item.done).length} de {current.gate.items.length} critérios aprovados.</div>
          </div>
        </section>
      </div>

      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Caminho completo</div>
          <h2 className="mt-1 text-[19px] font-semibold text-ink">Fases e dependências</h2>
          <p className="mt-1 text-[12.5px] text-muted">Abra uma fase para consultar entregáveis, testes e gate.</p>
        </div>
        <div className="hidden items-center gap-2 text-[11.5px] text-muted md:flex"><CircleDot size={14} className="text-navy" /> atual <ArrowRight size={13} /> próxima dependência</div>
      </div>

      <div className="space-y-6">
        {(["A", "B", "C"] as const).map((milestone) => {
          const info = MILESTONES[milestone];
          const phases = plan.phases.filter((phase) => phase.milestone === milestone);
          return (
            <section key={milestone} className="rounded-[11px] border border-line bg-white/50 p-4 md:p-5">
              <div className="mb-5 flex flex-col gap-2 border-b border-line pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-brand uppercase">{info.name}</div>
                  <h2 className="mt-1 text-[17px] font-semibold text-ink">{info.title}</h2>
                  <p className="mt-1 text-[12.5px] text-muted">{info.description}</p>
                </div>
                <div className="text-[11.5px] text-muted">{phases.filter((phase) => phase.status === "CONCLUÍDA").length}/{phases.length} fases concluídas</div>
              </div>
              <div>
                {phases.map((phase, index) => <PhaseCard key={phase.code} phase={phase} current={phase.number === plan.currentPhaseNumber} last={index === phases.length - 1} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
