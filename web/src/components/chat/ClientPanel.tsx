"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  ExternalLink,
  FileText,
  Link2,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  Trophy,
  UserPlus,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { DaysInStage, DueLabel, StagePill, StageStepper, StatusBadge, Timeline, TypeIcon, userName } from "@/components/crm/crm";
import { Badge, Button } from "@/components/ui/primitives";
import { formatWhatsApp } from "@/lib/br-ids";
import { getStage } from "@/lib/constants";
import { matchByPhone } from "@/lib/contact-match";
import { fmtDateShort } from "@/lib/dates";
import { canSeeCompany, currentDealOf, missingCriteria, openDealOf, pendingOf, timelineOf, visibleCompanies } from "@/lib/selectors";
import { reportError, useCurrentUser, useStore } from "@/lib/store";
import type { Company, Contact, QuoteStatus } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { useAdvanceDeal } from "@/lib/use-advance";
import { cn, money, normalize, quoteTotals } from "@/lib/utils";

const QUOTE_TONE: Record<QuoteStatus, "neutral" | "ai" | "green" | "red"> = { rascunho: "neutral", enviado: "ai", aceito: "green", recusado: "red" };

function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[8px] border border-line bg-white", className)}>
      <div className="flex items-center gap-2 border-b border-line/70 px-3 py-2">
        <h3 className="label flex-1">{title}</h3>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function QuickButton({ icon, label, onClick, href, onNavigate, tone = "outline" }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; onNavigate?: () => void; tone?: "outline" | "primary" }) {
  const cls = cn(
    "flex flex-col items-center justify-center gap-1 rounded-[6px] px-1 py-2 text-[11.5px] font-medium transition-colors",
    tone === "primary" ? "bg-navy text-white hover:bg-navy-2" : "border border-line bg-white text-ink hover:bg-soft",
  );
  if (href)
    return (
      <Link href={href} onClick={onNavigate} className={cls}>
        {icon}
        {label}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  );
}

/** Número sem cadastro: cadastrar a empresa ou vincular o número a uma empresa que já existe. */
function UnknownNumber({ peer, name, onNavigate }: { peer: string; name?: string; onNavigate?: () => void }) {
  const s = useStore();
  const user = useCurrentUser();
  const open = useUI((u) => u.open);
  const [q, setQ] = useState("");
  const found = useMemo(() => {
    const n = normalize(q);
    if (n.length < 2) return [];
    return visibleCompanies(s, user)
      .filter((c) => normalize(`${c.nome} ${c.razaoSocial} ${c.codigo} ${c.cidade ?? ""}`).includes(n))
      .slice(0, 6);
  }, [q, s, user]);
  const phone = formatWhatsApp(peer);
  const newHref = `/empresas/nova?whatsapp=${encodeURIComponent(peer)}${name ? `&contato=${encodeURIComponent(name)}` : ""}`;

  return (
    <div className="space-y-3">
      <Section title="Cliente">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-full bg-amber-50 text-amber-800">
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-ink">{name || phone}</div>
            <div className="text-[12px] text-muted">{phone} · número sem cadastro</div>
          </div>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted">Cadastre a empresa para registrar o atendimento, criar o próximo passo e montar orçamento a partir desta conversa.</p>
        <Link href={newHref} onClick={onNavigate} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[6px] bg-navy text-[13px] font-medium text-white hover:bg-navy-2">
          <Building2 size={15} /> Cadastrar empresa
        </Link>
      </Section>
      <Section title="Ou vincular a uma empresa existente">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa pelo nome ou código" className="h-9 w-full rounded-[6px] border border-line pr-2 pl-8 text-[12.5px] outline-none focus:border-navy-3" />
        </div>
        <ul className="mt-2 space-y-1">
          {found.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open({ kind: "contact", companyId: c.id, preset: { nome: name, whatsapp: phone } })}
                className="flex w-full items-center gap-2 rounded-[6px] border border-line px-2.5 py-2 text-left hover:bg-soft"
              >
                <Link2 size={14} className="shrink-0 text-navy-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink">{c.nome}</span>
                  <span className="text-[11px] text-muted">
                    {c.codigo}
                    {c.cidade ? ` · ${c.cidade}/${c.uf}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !found.length && <li className="py-2 text-center text-[12px] text-muted">Nenhuma empresa encontrada.</li>}
        </ul>
        <p className="mt-2 text-[11.5px] text-muted">O número entra como contato da empresa escolhida, e as próximas mensagens já aparecem com a ficha completa.</p>
      </Section>
    </div>
  );
}

/** Ficha do cliente ao lado da conversa: tudo da conta e as ações do dia a dia, sem sair do atendimento. */
function ClientCard({ company, contact, onNavigate }: { company: Company; contact: Contact; onNavigate?: () => void }) {
  const s = useStore();
  const user = useCurrentUser();
  const { open, toast } = useUI();
  const { advance, nextStageOf } = useAdvanceDeal();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const deal = openDealOf(s, company.id);
  const lastDeal = currentDealOf(s, company.id);
  const pending = pendingOf(s, company.id);
  const next = pending[0];
  const missing = deal ? missingCriteria(s, deal, company) : [];
  const nextStage = nextStageOf(deal);
  const stage = deal ? getStage(deal.funnel, deal.stageId) : undefined;
  const quotes = s.quotes.filter((q) => q.companyId === company.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const strategy = s.strategies.find((x) => x.companyId === company.id);
  const timeline = timelineOf(s, company.id).slice(0, 6);
  const others = s.contacts.filter((c) => c.companyId === company.id && c.id !== contact.id && c.ativo);
  const profile = `/empresas/${company.id}`;
  const active = company.status === "ativa";

  const saveNote = () => {
    const text = note.trim();
    if (!text) return;
    setSaving(true);
    s.addInteraction({ companyId: company.id, dealId: deal?.id, canal: "Nota", autorId: user.id, kind: "note", titulo: "Nota interna", conteudo: text })
      .then(() => {
        setNote("");
        toast("Nota adicionada ao histórico");
      })
      .catch((e) => reportError(e, "Não foi possível salvar a nota"))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-3">
      <Section
        title="Cliente"
        action={
          <Link href={profile} onClick={onNavigate} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy-3 hover:underline">
            Perfil completo <ExternalLink size={11} />
          </Link>
        }
      >
        <Link href={profile} onClick={onNavigate} className="block text-[15px] leading-snug font-semibold text-ink hover:underline">
          {company.nome}
        </Link>
        <div className="mt-0.5 text-[11.5px] text-muted">
          {company.codigo}
          {company.cidade ? ` · ${company.cidade}/${company.uf}` : ""}
          {company.colhedoras ? ` · ${company.colhedoras} colhedoras` : ""}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusBadge c={company} />
          <Badge tone="outline">resp. {userName(s.users, company.ownerId)}</Badge>
        </div>
        <div className="mt-2.5 rounded-[6px] bg-soft/60 px-2.5 py-2 text-[12px]">
          <div className="font-medium text-ink">
            {contact.nome} <span className="font-normal text-muted">· {contact.papel}</span>
          </div>
          {contact.cargo && <div className="text-muted">{contact.cargo}</div>}
          {others.length > 0 && <div className="mt-0.5 text-[11px] text-muted">+ {others.length} contato(s): {others.slice(0, 2).map((o) => o.nome).join(", ")}</div>}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <QuickButton tone="primary" icon={<Sparkles size={15} />} label="Registrar" onClick={() => open({ kind: "quick", companyId: company.id })} />
          <QuickButton icon={<Plus size={15} />} label="Tarefa" onClick={() => open({ kind: "newActivity", companyId: company.id })} />
          <QuickButton icon={<FileText size={15} />} label="Orçamento" onClick={() => (deal ? open({ kind: "quote", dealId: deal.id }) : toast("Sem negócio aberto", { tone: "warn", sub: "Abra ou retome um negócio para orçar." }))} />
          <QuickButton icon={<UserPlus size={15} />} label="Contato" onClick={() => open({ kind: "contact", companyId: company.id })} />
        </div>
      </Section>

      <Section
        title="Negócio"
        action={deal && <DaysInStage deal={deal} />}
      >
        {deal && stage ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <StagePill deal={deal} />
              {deal.valor ? <span className="text-[12px] font-semibold text-ink">{money(deal.valor)}</span> : null}
              {stage.limiteDias ? <span className="text-[11px] text-muted">limite {stage.limiteDias}d</span> : null}
            </div>
            <div className="mt-2">
              <StageStepper deal={deal} compact />
            </div>
            {missing.length > 0 ? (
              <ul className="mt-2.5 space-y-1">
                <li className="text-[11px] font-semibold text-muted uppercase">Falta para avançar</li>
                {missing.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-start gap-1.5 text-[12px] text-ink/85">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    {c.label}
                  </li>
                ))}
                {missing.length > 4 && <li className="text-[11px] text-muted">+ {missing.length - 4} critério(s)</li>}
              </ul>
            ) : (
              <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-ok">
                <Check size={13} /> Critérios da etapa cumpridos
              </p>
            )}
            {active && nextStage && (
              <Button size="sm" variant="primary" className="mt-3 w-full" onClick={() => advance(deal, company)}>
                {nextStage.terminal ? (
                  <>
                    <Trophy size={14} /> Registrar venda
                  </>
                ) : (
                  <>
                    Avançar para {nextStage.nome} <ArrowRight size={14} />
                  </>
                )}
              </Button>
            )}
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <Button size="xs" variant="outline" onClick={() => open({ kind: "move", dealId: deal.id })}>
                Etapa
              </Button>
              <Button size="xs" variant="outline" onClick={() => open({ kind: "win", dealId: deal.id })}>
                <Trophy size={12} /> Venda
              </Button>
              <Button size="xs" variant="outline" onClick={() => open({ kind: "lose", dealId: deal.id })}>
                <XCircle size={12} /> Perda
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-muted">
            {lastDeal?.status === "ganha" ? "Último negócio ganho." : lastDeal?.status === "perdida" ? `Último negócio perdido — ${lastDeal.motivo ?? "sem motivo"}.` : "Nenhum negócio aberto."}
          </p>
        )}
        {company.status === "espera" ? (
          <div className="mt-2.5 rounded-[6px] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-950">
            <div className="flex items-center gap-1.5 font-medium">
              <Pause size={12} /> Em espera{company.standby ? ` até ${fmtDateShort(company.standby.reavaliacao)}` : ""}
            </div>
            {company.standby && <div className="mt-0.5 text-amber-900/80">{company.standby.motivo} · retomada: {company.standby.condicao}</div>}
            <Button
              size="xs"
              variant="outline"
              className="mt-2"
              onClick={() => s.resumeStandby(company.id).then(() => toast("Conta retomada", { sub: "Saiu da espera e voltou para a operação" })).catch((e) => reportError(e, "Não foi possível retomar a conta"))}
            >
              <Play size={12} /> Retomar conta
            </Button>
          </div>
        ) : (
          active && (
            <button type="button" onClick={() => open({ kind: "standby", companyId: company.id })} className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-ink">
              <Pause size={11} /> Colocar em espera
            </button>
          )
        )}
      </Section>

      <Section
        title="Próximo passo"
        action={pending.length > 1 && <span className="text-[11px] text-muted">+{pending.length - 1} pendente(s)</span>}
      >
        {next ? (
          <>
            <div className="flex items-start gap-2">
              <TypeIcon tipo={next.tipo} className="mt-0.5 text-navy-3" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-snug font-medium text-ink">{next.titulo}</div>
                <DueLabel iso={next.dueAt} />
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <Button size="xs" variant="success" onClick={() => open({ kind: "complete", activityId: next.id })}>
                <Check size={12} /> Concluir
              </Button>
              <Button size="xs" variant="outline" onClick={() => open({ kind: "reschedule", activityId: next.id })}>
                <CalendarClock size={12} /> Reagendar
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12.5px] text-brand">
              <AlertTriangle size={13} /> Sem próximo passo
            </span>
            <Button size="xs" variant="primary" onClick={() => open({ kind: "newActivity", companyId: company.id })}>
              Definir
            </Button>
          </div>
        )}
      </Section>

      <Section
        title="Orçamentos"
        action={
          deal && (
            <button type="button" onClick={() => open({ kind: "quote", dealId: deal.id })} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy-3 hover:underline">
              <Plus size={11} /> Novo
            </button>
          )
        }
      >
        {quotes.length === 0 ? (
          <p className="text-[12.5px] text-muted">Nenhum orçamento ainda.</p>
        ) : (
          <ul className="space-y-2">
            {quotes.slice(0, 3).map((q) => {
              const t = quoteTotals(q.itens, q.desconto);
              return (
                <li key={q.id} className="rounded-[6px] border border-line/80 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => open({ kind: "quote", dealId: q.dealId, quoteId: q.id })} className="text-[12.5px] font-semibold text-ink hover:underline">
                      {q.numero}
                    </button>
                    <Badge tone={QUOTE_TONE[q.status]}>{q.status}</Badge>
                    <a href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noopener" className="ml-auto text-[11px] font-semibold text-navy-3 hover:underline">
                      PDF
                    </a>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    {t.total > 0 && <span className="font-medium text-ink">{money(t.total)}</span>}
                    {t.mensal > 0 && <span> + {money(t.mensal)}/mês</span>}
                    {q.enviadoEm ? ` · enviado ${fmtDateShort(q.enviadoEm)}` : ` · criado ${fmtDateShort(q.createdAt)}`}
                  </div>
                </li>
              );
            })}
            {quotes.length > 3 && <li className="text-[11px] text-muted">+ {quotes.length - 3} no perfil da empresa</li>}
          </ul>
        )}
      </Section>

      <Section
        title="Estratégia"
        action={
          <Link href={`${profile}?tab=estrategia`} onClick={onNavigate} className="text-[11.5px] font-semibold text-navy-3 hover:underline">
            {strategy ? "Revisar" : "Definir"}
          </Link>
        }
      >
        {strategy ? (
          <>
            <div className="flex items-start gap-1.5 text-[12.5px] font-medium text-ink">
              <Target size={13} className="mt-0.5 shrink-0 text-ai" />
              {strategy.objetivo}
            </div>
            <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-ink/75">{strategy.estrategia}</p>
            {strategy.proximaRevisao && <div className="mt-1 text-[11px] text-muted">v{strategy.versao} · revisar em {fmtDateShort(strategy.proximaRevisao)}</div>}
          </>
        ) : (
          <p className="text-[12.5px] text-muted">Nenhuma estratégia registrada para esta conta.</p>
        )}
      </Section>

      <Section
        title="Histórico"
        action={
          <Link href={`${profile}?tab=timeline`} onClick={onNavigate} className="text-[11.5px] font-semibold text-navy-3 hover:underline">
            Ver tudo
          </Link>
        }
        className="overflow-hidden"
      >
        <div className="-mx-3 -my-3">
          <Timeline items={timeline} />
        </div>
      </Section>

      <Section title="Nota rápida">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Algo importante desta conversa? Fica no histórico da empresa."
          className="min-h-16 w-full rounded-[6px] border border-line px-2.5 py-2 text-[12.5px] outline-none focus:border-navy-3"
        />
        <Button size="xs" variant="primary" className="mt-1.5" onClick={saveNote} disabled={!note.trim() || saving}>
          {saving ? "Salvando…" : "Salvar no histórico"}
        </Button>
      </Section>
    </div>
  );
}

/** Painel do cliente da conversa: identifica a empresa pelo número e mostra a ficha ou o cadastro. */
export function ClientPanel({ peer, name, onNavigate }: { peer: string; name?: string; onNavigate?: () => void }) {
  const s = useStore();
  const user = useCurrentUser();
  const matches = useMemo(() => matchByPhone(peer, s.contacts, s.companies), [peer, s.contacts, s.companies]);
  const allowed = matches.filter((m) => canSeeCompany(user, m.company));
  const [pick, setPick] = useState(0);

  if (!peer) return <p className="px-1 py-6 text-center text-[12.5px] text-muted">Selecione uma conversa para ver a ficha do cliente.</p>;
  if (!matches.length) return <UnknownNumber peer={peer} name={name} onNavigate={onNavigate} />;
  if (!allowed.length)
    return (
      <Section title="Cliente">
        <p className="text-[12.5px] text-muted">
          Este número é de um contato de {matches[0].company.nome}, que pertence à carteira de {userName(s.users, matches[0].company.ownerId)}.
        </p>
      </Section>
    );

  const current = allowed[Math.min(pick, allowed.length - 1)];
  return (
    <div className="space-y-2">
      {allowed.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {allowed.map((m, i) => (
            <button
              key={m.contact.id}
              type="button"
              onClick={() => setPick(i)}
              className={cn("rounded-full border px-2.5 py-1 text-[11.5px]", i === pick ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:text-ink")}
            >
              {m.company.nome}
            </button>
          ))}
        </div>
      )}
      <ClientCard key={current.company.id} company={current.company} contact={current.contact} onNavigate={onNavigate} />
    </div>
  );
}
