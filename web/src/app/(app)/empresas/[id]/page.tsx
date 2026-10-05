"use client";

import {
  ArrowRight,
  Building2,
  ChevronRight,
  Ellipsis,
  GitMerge,
  Megaphone,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  StickyNote,
  Trophy,
  UserPlus,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ChatThread, ConversationAI } from "@/components/chat/Chat";
import { DealTab } from "@/components/company/DealTab";
import { CopilotCard, StrategyTab } from "@/components/company/StrategyTab";
import { CompanyLink, NextStepCard, QualityMeter, StagePill, StageStepper, StatusBadge, TaskRow, Timeline, UrgencyBadge, UserAvatar, userName } from "@/components/crm/crm";
import { MenuItem, Popover } from "@/components/ui/overlay";
import { Badge, Button, Card, CardHeader, Empty } from "@/components/ui/primitives";
import { FUNNELS, getStage, isManager } from "@/lib/constants";
import { fmtAgo, fmtDate, fmtDateTime, rel } from "@/lib/dates";
import { canSeeCompany, currentDealOf, daysInStage, lastInteractionAt, missingCriteria, openDealOf, pendingOf, qualityOf, timelineOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, money } from "@/lib/utils";

type Tab = "timeline" | "conversa" | "atividades" | "negocio" | "estrategia" | "contatos" | "auditoria";

function EmpresaView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const s = useStore();
  const user = useCurrentUser();
  const { open, toast } = useUI();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "timeline");
  const [note, setNote] = useState("");

  const company = s.companies.find((c) => c.id === id);
  const deal = company ? openDealOf(s, company.id) : undefined;
  const lastDeal = company ? currentDealOf(s, company.id) : undefined;
  const pending = company ? pendingOf(s, company.id) : [];
  const done = company ? s.activities.filter((a) => a.companyId === company.id && a.status === "concluida").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")) : [];
  const contacts = company ? s.contacts.filter((c) => c.companyId === company.id) : [];
  const conv = company ? s.conversations.find((c) => c.companyId === company.id) : undefined;
  const timeline = company ? timelineOf(s, company.id) : [];
  const audit = company ? s.audit.filter((a) => a.companyId === company.id) : [];
  const quality = company ? qualityOf(s, company) : { score: 0, missing: [] };
  const influencer = company?.influenciadoraId ? s.companies.find((c) => c.id === company.influenciadoraId) : undefined;
  const dependents = company ? s.companies.filter((c) => c.influenciadoraId === company.id) : [];
  const pendingSug = company ? s.suggestions.find((x) => x.companyId === company.id && x.status === "pendente") : undefined;
  const wins = company ? s.deals.filter((d) => d.companyId === company.id && d.status === "ganha") : [];

  if (!company) return <Empty title="Empresa não encontrada" text="Talvez a demo tenha sido reiniciada." action={<Link href="/carteira" className="font-semibold text-navy-3">Voltar para a carteira</Link>} />;
  if (!canSeeCompany(user, company))
    return <Empty icon={<Building2 size={20} />} title="Conta de outra carteira" text={`Esta conta pertence a ${userName(s.users, company.ownerId)}. Vendedores veem apenas a própria carteira (matriz de permissões).`} />;

  const stage = deal ? getStage(deal.funnel, deal.stageId) : undefined;
  const nextStage = deal ? FUNNELS[deal.funnel].stages[FUNNELS[deal.funnel].stages.findIndex((x) => x.id === deal.stageId) + 1] : undefined;

  /** Se não falta nenhum critério, avança direto e cria a tarefa da nova etapa — sem modal. */
  const avancar = () => {
    if (!deal || !nextStage) return;
    if (nextStage.terminal) {
      open({ kind: "win", dealId: deal.id });
      return;
    }
    const falta = missingCriteria(s, deal, company);
    if (falta.length) {
      open({ kind: "move", dealId: deal.id, toStageId: nextStage.id });
      return;
    }
    const t = nextStage.tarefas[0];
    s.moveDeal(deal.id, nextStage.id, {
      tarefas: t ? [{ companyId: company.id, dealId: deal.id, titulo: t.titulo, tipo: t.tipo, dueAt: rel(t.prazoDias, 10), ownerId: deal.ownerId, origem: "regra" }] : [],
    });
    toast(`Etapa alterada para ${nextStage.nome}`, { sub: t ? `Próximo passo criado: ${t.titulo.toLowerCase()}` : undefined });
  };

  const startConversation = () => {
    const contact = contacts.find((c) => c.whatsapp) ?? contacts[0];
    if (!contact) {
      open({ kind: "contact", companyId: company.id });
      return;
    }
    s.startConversation(company.id, contact.id);
    setTab("conversa");
  };

  const addNote = () => {
    if (!note.trim()) return;
    s.addInteraction({ companyId: company.id, dealId: deal?.id, canal: "Nota", autorId: user.id, kind: "note", titulo: "Nota interna", conteudo: note.trim() });
    setNote("");
    toast("Nota adicionada ao histórico");
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "timeline", label: "Histórico" },
    { id: "conversa", label: "Conversa", count: conv?.unread || undefined },
    { id: "atividades", label: "Tarefas", count: pending.length },
    { id: "negocio", label: "Negócio" },
    { id: "estrategia", label: "Estratégia" },
    { id: "contatos", label: "Contatos" },
    { id: "auditoria", label: "Auditoria" },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center gap-1 text-[12.5px] text-muted">
        <Link href="/carteira" className="font-semibold hover:text-ink">
          Carteira
        </Link>
        <ChevronRight size={13} />
        <span className="truncate">{company.nome}</span>
      </div>

      <Card className="mb-4 overflow-hidden">
        <div className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink md:text-[25px]">{company.nome}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted">
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <UserAvatar userId={company.ownerId} size={20} /> {userName(s.users, company.ownerId)}
                </span>
                <span>·</span>
                <span>{company.ramo ?? "ramo não informado"}</span>
                {company.cidade && (
                  <>
                    <span>·</span>
                    <span>
                      {company.cidade}/{company.uf}
                    </span>
                  </>
                )}
                <span>·</span>
                <span>{company.codigo}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {company.status !== "ativa" && <StatusBadge c={company} />}
                {company.urgencia === "Alta" && <UrgencyBadge u={company.urgencia} />}
                {company.clienteDesde && <Badge tone="green">cliente desde {fmtDate(company.clienteDesde)}</Badge>}
                {company.importadoDe && <Badge tone="outline">{company.importadoDe === "Moskit" ? "veio do Moskit" : "veio da planilha"}</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => open({ kind: "quick", companyId: company.id })}>
                <Sparkles size={14} /> Registrar
              </Button>
              {deal && company.status === "ativa" && nextStage && (
                <Button variant="primary" size="sm" onClick={avancar} title={nextStage.terminal ? undefined : `Critérios pendentes abrem a validação da etapa`}>
                  {nextStage.terminal ? "Registrar venda" : `Avançar para ${nextStage.nome}`} <ArrowRight size={14} />
                </Button>
              )}
              <Popover
                className="w-60 py-1"
                trigger={() => (
                  <button type="button" className="grid size-8 place-items-center rounded-[5px] border border-line bg-white hover:bg-soft" aria-label="Mais ações">
                    <Ellipsis size={16} />
                  </button>
                )}
              >
                {(close) => (
                  <div>
                    <MenuItem icon={<Pencil size={14} />} onClick={() => { close(); open({ kind: "editCompany", companyId: company.id }); }}>
                      Editar cadastro
                    </MenuItem>
                    <MenuItem icon={<Plus size={14} />} onClick={() => { close(); open({ kind: "newActivity", companyId: company.id }); }}>
                      Nova tarefa
                    </MenuItem>
                    <MenuItem icon={<UserPlus size={14} />} onClick={() => { close(); open({ kind: "contact", companyId: company.id }); }}>
                      Adicionar contato
                    </MenuItem>
                    <MenuItem icon={<MessageCircle size={14} />} onClick={() => { close(); startConversation(); }}>
                      Conversar no WhatsApp
                    </MenuItem>
                    {deal && (
                      <MenuItem icon={<Trophy size={14} />} onClick={() => { close(); open({ kind: "win", dealId: deal.id }); }}>
                        Registrar venda
                      </MenuItem>
                    )}
                    {company.status === "espera" ? (
                      <MenuItem icon={<Play size={14} />} onClick={() => { close(); s.resumeStandby(company.id); toast("Conta retomada", { sub: "Saiu da espera e voltou para a operação" }); }}>
                        Retomar conta
                      </MenuItem>
                    ) : (
                      company.status === "ativa" && (
                        <MenuItem icon={<Pause size={14} />} onClick={() => { close(); open({ kind: "standby", companyId: company.id }); }} sub="motivo e data obrigatórios">
                          Colocar em espera
                        </MenuItem>
                      )
                    )}
                    {deal && (
                      <MenuItem icon={<XCircle size={14} />} danger onClick={() => { close(); open({ kind: "lose", dealId: deal.id }); }}>
                        Marcar como perdida
                      </MenuItem>
                    )}
                    {isManager(user) && (
                      <MenuItem icon={<Megaphone size={14} />} onClick={() => { close(); open({ kind: "cobranca", companyId: company.id }); }} sub="notifica o responsável">
                        Comentar e cobrar
                      </MenuItem>
                    )}
                  </div>
                )}
              </Popover>
            </div>
          </div>
        </div>
        {lastDeal && (
          <div className="border-t border-line bg-soft/40 px-4 py-3 md:px-5">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span className="text-ink">{FUNNELS[lastDeal.funnel].nome}</span>
              {lastDeal.funnel === "recorrencia" && <span>ciclo {lastDeal.ciclo}</span>}
              {deal && stage && (
                <span>
                  {daysInStage(deal)} de {stage.limiteDias || "—"} dias na etapa{deal.valor ? ` · ${money(deal.valor)}` : ""}
                </span>
              )}
              {!deal && lastDeal.status === "perdida" && <span className="text-brand">Perdida — {lastDeal.motivo}</span>}
            </div>
            <StageStepper deal={lastDeal} />
          </div>
        )}
      </Card>

      <div className="mb-4 space-y-3">
        {company.status !== "perdida" && <NextStepCard company={company} next={pending[0]} onDefine={() => open({ kind: "newActivity", companyId: company.id })} />}
        {influencer && (
          <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-ai/20 bg-ai-soft/50 px-4 py-2.5 text-[12.5px]">
            <GitMerge size={16} className="text-ai" />
            <span className="text-ink/85">
              <b>Conta dependente</b> de <CompanyLink company={influencer} className="text-[12.5px]" /> — {company.condicaoDependencia}
            </span>
            <StagePill deal={openDealOf(s, influencer.id)} className="ml-auto" />
          </div>
        )}
        {dependents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-ai/20 bg-ai-soft/50 px-4 py-2.5 text-[12.5px] text-ink/85">
            <GitMerge size={16} className="text-ai" />
            <b>Conta influenciadora:</b> {dependents.length} empresa(s) dependem do avanço desta conta —
            {dependents.map((d) => (
              <CompanyLink key={d.id} company={d} className="text-[12.5px]" />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="no-scrollbar flex overflow-x-auto border-b border-line px-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative shrink-0 px-3 py-3 text-[13px] whitespace-nowrap transition-colors",
                  tab === t.id ? "font-medium text-ink" : "text-muted hover:text-ink",
                )}
              >
                {t.label}
                {Boolean(t.count) && <span className="ml-1.5 rounded-full bg-soft px-1.5 text-[10.5px] text-muted">{t.count}</span>}
                {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-[2px] bg-navy" />}
              </button>
            ))}
          </div>

          {tab === "timeline" && (
            <div>
              <div className="flex gap-2 border-b border-line/70 px-4 py-3">
                <StickyNote size={16} className="mt-2.5 shrink-0 text-muted" />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNote()}
                  placeholder="Adicionar nota interna ao histórico…"
                  className="h-9.5 flex-1 rounded-[5px] border border-line px-3 text-[13px] outline-none focus:border-navy-3"
                />
                <Button size="sm" variant="outline" onClick={addNote} disabled={!note.trim()}>
                  Salvar
                </Button>
                <Button size="sm" variant="ai" onClick={() => open({ kind: "quick", companyId: company.id, text: note || undefined })}>
                  <Sparkles size={13} /> Com IA
                </Button>
              </div>
              <Timeline items={timeline} />
            </div>
          )}

          {tab === "conversa" &&
            (conv ? (
              <div className="grid lg:grid-cols-[1fr_300px]">
                <ChatThread conv={conv} className="h-[560px]" />
                <div className="border-t border-line p-3 lg:border-t-0 lg:border-l">
                  <ConversationAI conv={conv} compact />
                </div>
              </div>
            ) : (
              <Empty
                icon={<MessageCircle size={20} />}
                title="Nenhuma conversa com esta conta"
                text="Inicie pelo WhatsApp integrado: a conversa fica vinculada à empresa e ao contato."
                action={
                  <Button variant="success" onClick={startConversation}>
                    <MessageCircle size={15} /> Iniciar conversa
                  </Button>
                }
              />
            ))}

          {tab === "atividades" && (
            <div>
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div className="label">Abertas</div>
                <Button size="xs" variant="outline" onClick={() => open({ kind: "newActivity", companyId: company.id })}>
                  <Plus size={12} /> Nova
                </Button>
              </div>
              {pending.length === 0 && <div className="px-4 py-4 text-[12.5px] text-muted">Nenhuma atividade aberta.</div>}
              {pending.map((a) => (
                <TaskRow key={a.id} a={a} showCompany={false} />
              ))}
              <div className="label px-4 pt-4 pb-1">Concluídas</div>
              {done.map((a) => (
                <div key={a.id} className="border-b border-line/70 px-4 py-2.5 text-[12.5px] last:border-b-0">
                  <div className="font-semibold text-ink">{a.titulo}</div>
                  <div className="text-ink/70">{a.resultado}</div>
                  <div className="text-[11px] text-muted">
                    {a.tipo} · {userName(s.users, a.ownerId)} · {a.completedAt ? fmtDateTime(a.completedAt) : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "negocio" && <DealTab company={company} />}
          {tab === "estrategia" && <StrategyTab company={company} />}

          {tab === "contatos" && (
            <div className="p-4">
              <div className="mb-3 flex justify-end">
                <Button size="sm" variant="primary" onClick={() => open({ kind: "contact", companyId: company.id })}>
                  <UserPlus size={14} /> Novo contato
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {contacts.map((c) => (
                  <div key={c.id} className="rounded-[6px] border border-line p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-soft text-[13px] font-bold text-navy-3">{c.nome[0]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink">{c.nome}</div>
                        <div className="text-[12px] text-muted">{c.cargo}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge tone={c.papel === "Decisor" ? "navy" : c.papel === "Comprador" ? "neutral" : "ai"}>{c.papel}</Badge>
                          <Badge tone="outline">influência {c.influencia === 3 ? "alta" : c.influencia === 2 ? "média" : "baixa"}</Badge>
                          <Badge tone="outline">prefere {c.canal}</Badge>
                        </div>
                        <div className="mt-2 text-[12px] text-ink/75">
                          {c.whatsapp && <div>WhatsApp {c.whatsapp}</div>}
                          {c.email && <div>{c.email}</div>}
                        </div>
                      </div>
                    </div>
                    {c.whatsapp && (
                      <Button
                        size="xs"
                        variant="success"
                        className="mt-2.5"
                        onClick={() => {
                          s.startConversation(company.id, c.id);
                          setTab("conversa");
                        }}
                      >
                        <MessageCircle size={12} /> Conversar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "auditoria" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line bg-soft/40 text-left">
                    {["Quando", "Quem", "Origem", "Campo", "Antes", "Depois"].map((h) => (
                      <th key={h} className="label px-4 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id} className="border-b border-line/70 last:border-b-0">
                      <td className="px-4 py-2 whitespace-nowrap text-muted">{fmtDateTime(a.at)}</td>
                      <td className="px-4 py-2">{userName(s.users, a.autorId)}</td>
                      <td className="px-4 py-2">
                        <Badge tone={a.origem === "ia" ? "ai" : a.origem === "automacao" ? "navy" : "outline"}>{a.origem === "automacao" ? "automação" : a.origem === "ia" ? "IA" : a.origem === "usuario" ? "usuário" : a.origem}</Badge>
                      </td>
                      <td className="px-4 py-2 font-medium">
                        {a.entidade} · {a.campo}
                      </td>
                      <td className="px-4 py-2 text-muted line-through decoration-muted/50">{a.de ?? "—"}</td>
                      <td className="px-4 py-2 font-medium text-ink">{a.para ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <aside className="min-w-0 space-y-4">
          {tab !== "estrategia" && company.status !== "perdida" && (
            <div>
              <CopilotCard company={company} compact />
              {pendingSug && (
                <button type="button" onClick={() => setTab("estrategia")} className="mt-1.5 w-full text-right text-[12px] font-semibold text-ai hover:underline">
                  Ver diagnóstico completo, perguntas e rascunho →
                </button>
              )}
            </div>
          )}

          <Card>
            <CardHeader
              title="Dados técnicos"
              kicker={company.colhedoras ? `${company.colhedoras} colhedoras` : "frota não informada"}
              action={
                <Button size="xs" variant="ghost" onClick={() => open({ kind: "editCompany", companyId: company.id })}>
                  <Pencil size={12} />
                </Button>
              }
            />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-4 py-3 text-[12.5px]">
              {[
                ["Modelos", company.modelos],
                ["Prensa", company.prensa],
                ["Marca atual", company.marcaAtual],
                ["Concorrente", company.concorrente],
                ["Potencial", company.potencial ? `${company.potencial}${company.potencialMensal ? ` · ${money(company.potencialMensal)}/mês` : ""}` : undefined],
                ["Origem", company.origem],
              ].map(([k, v]) => (
                <div key={k} className={cn(k === "Modelos" && "col-span-2")}>
                  <dt className="label">{k}</dt>
                  <dd className={cn("mt-0.5", v ? "font-medium text-ink" : "text-brand/80")}>{v ?? "não informado"}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-line/70 px-4 py-3">
              <QualityMeter score={quality.score} missing={quality.missing} />
              {quality.missing.length > 0 && <div className="mt-1.5 text-[11.5px] text-muted">Falta: {quality.missing.join(", ").toLowerCase()}.</div>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Contatos" kicker={`${contacts.length} ${contacts.length === 1 ? "pessoa" : "pessoas"}`} action={<Button size="xs" variant="ghost" onClick={() => open({ kind: "contact", companyId: company.id })}><UserPlus size={13} /></Button>} />
            <ul className="px-4 py-2">
              {contacts.slice(0, 4).map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-1.5 text-[12.5px]">
                  <span className="grid size-7 place-items-center rounded-full bg-soft text-[11px] font-bold text-navy-3">{c.nome[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{c.nome}</span>
                    <span className="block truncate text-[11.5px] text-muted">{c.cargo}</span>
                  </span>
                  <Badge tone={c.papel === "Decisor" ? "navy" : "outline"}>{c.papel}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4 text-[12.5px]">
            <div className="mb-2 text-[13.5px] font-medium text-ink">Resumo da conta</div>
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-muted">Última interação</dt>
                <dd className="font-medium">{(() => { const l = lastInteractionAt(s, company.id); return l ? fmtAgo(l) : "—"; })()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Atividades abertas</dt>
                <dd className="font-medium">{pending.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Compras realizadas</dt>
                <dd className="font-medium">{wins.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Receita registrada</dt>
                <dd className="font-medium">{money(wins.reduce((a, d) => a + (d.valorRealizado ?? d.valor ?? 0), 0))}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function EmpresaPage() {
  return (
    <Suspense>
      <EmpresaView />
    </Suspense>
  );
}
