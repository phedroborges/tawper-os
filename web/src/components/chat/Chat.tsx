"use client";

import { ArrowRight, BookOpen, Check, CheckCheck, FileText, Lock, Paperclip, Send, Sparkles, StickyNote, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AIPanel, AIThinking, Confidence } from "@/components/ai/ai";
import { StagePill } from "@/components/crm/crm";
import { Badge, Button } from "@/components/ui/primitives";
import { summarizeConversation } from "@/lib/ai";
import { FIELD_LABELS, getStage, stageIndex } from "@/lib/constants";
import { dayDiff, fmtDateShort, fmtDue, fmtTime, rel } from "@/lib/dates";
import { openDealOf } from "@/lib/selectors";
import { simulateClientReply } from "@/lib/sim";
import { useStore } from "@/lib/store";
import type { Company, Conversation } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { formatWhatsApp } from "@/lib/br-ids";
import { cn, money, quoteTotals } from "@/lib/utils";

const QUICK_REPLIES = [
  "Atendemos sim! Quantas colhedoras vocês têm e de qual modelo?",
  "Consegue me passar as medidas das mangueiras que mais estouram?",
  "Posso passar aí para uma visita técnica rápida?",
  "Podemos montar um teste em 2 colhedoras, sem compromisso.",
];

function DayDivider({ iso }: { iso: string }) {
  const d = dayDiff(iso);
  const label = d === 0 ? "Hoje" : d === -1 ? "Ontem" : fmtDateShort(iso);
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-[4px] bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-muted shadow-sm">{label}</span>
    </div>
  );
}

export function ChatThread({ conv, className, showHeader = true }: { conv: Conversation; className?: string; showHeader?: boolean }) {
  const s = useStore();
  const { typing, setActiveConversation, toast } = useUI();
  const [text, setText] = useState("");
  const [nota, setNota] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const company = s.companies.find((c) => c.id === conv.companyId);
  const deal = company ? openDealOf(s, company.id) : undefined;
  const draftQuote = s.quotes.find((q) => q.companyId === conv.companyId && (q.status === "rascunho" || q.status === "enviado"));
  const isTyping = typing[conv.id];

  useEffect(() => {
    setActiveConversation(conv.id);
    s.markConversationRead(conv.id);
    return () => setActiveConversation(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conv.messages.length, isTyping]);

  const send = (t = text) => {
    const v = t.trim();
    if (!v) return;
    s.sendMessage(conv.id, v, { nota });
    setText("");
    if (!nota) simulateClientReply(conv.id, v);
  };

  const sendCatalog = () => {
    s.sendMessage(conv.id, "Segue o nosso catálogo com a linha de mangueiras 4SH, terminais e os kits prontos para colhedoras.", {
      attachment: { nome: "Catalogo_Tawper_2026.pdf", tipo: "pdf", detalhe: "Mangueiras, conexões e kits para colhedoras" },
    });
    simulateClientReply(conv.id, "catálogo");
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {showHeader && (
        <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-[#e7f6ee] text-[13px] font-bold text-ok">{conv.contatoNome[0]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
              {conv.contatoNome}
              {company ? (
                <Link href={`/empresas/${company.id}`} className="text-[12px] font-medium text-navy-3 hover:text-brand">
                  {company.nome}
                </Link>
              ) : (
                <Badge tone="amber">sem vínculo</Badge>
              )}
              {deal && <StagePill deal={deal} />}
            </div>
            <div className="text-[11.5px] text-muted">
              {formatWhatsApp(conv.telefone) || conv.telefone} · {s.users.find((u) => u.id === conv.ownerId)?.short}
            </div>
          </div>
        </div>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 md:px-6" style={{ backgroundImage: "radial-gradient(#d9d2c5 0.8px, transparent 0.8px)", backgroundSize: "14px 14px" }}>
        {conv.messages.length === 0 && <div className="mx-auto mt-10 max-w-xs rounded-[6px] bg-white/90 p-3 text-center text-[12.5px] text-muted">Nenhuma mensagem ainda. Comece a conversa abaixo.</div>}
        {conv.messages.map((m, i) => {
          const divider = i === 0 || conv.messages[i - 1].at.slice(0, 10) !== m.at.slice(0, 10);
          const mine = m.from === "tawper";
          if (m.from === "nota")
            return (
              <div key={m.id}>
                {divider && <DayDivider iso={m.at} />}
                <div className="my-2 flex justify-center">
                  <div className="max-w-[80%] rounded-[6px] border border-dashed border-warn/50 bg-warn-soft px-3 py-2 text-[12.5px] text-ink">
                    <div className="mb-0.5 flex items-center gap-1 text-[10.5px] font-bold tracking-wide text-warn uppercase">
                      <Lock size={10} /> Nota interna · {s.users.find((u) => u.id === m.autorId)?.short}
                    </div>
                    {m.text}
                  </div>
                </div>
              </div>
            );
          return (
            <div key={m.id}>
              {divider && <DayDivider iso={m.at} />}
              <div className={cn("my-1 flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[78%] rounded-[8px] px-2.5 pt-1.5 pb-1 text-[13px] leading-snug shadow-[0_1px_0.5px_#0000001f]", mine ? "rounded-tr-[2px] bg-[#d9fdd3]" : "rounded-tl-[2px] bg-white")}>
                  {m.attachment && (
                    <div className="mb-1.5 flex items-center gap-2 rounded-[5px] bg-black/[0.05] px-2.5 py-2">
                      <span className="grid size-8 place-items-center rounded-[4px] bg-brand text-white">
                        <FileText size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold text-ink">{m.attachment.nome}</span>
                        {m.attachment.detalhe && <span className="block text-[11px] text-muted">{m.attachment.detalhe}</span>}
                      </span>
                    </div>
                  )}
                  <span className="whitespace-pre-wrap text-ink">{m.text}</span>
                  <span className="float-right mt-1 ml-2 flex items-center gap-0.5 text-[10.5px] text-muted">
                    {fmtTime(m.at)}
                    {mine && <CheckCheck size={13} className="text-[#53bdeb]" />}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {isTyping && (
          <div className="my-1 flex justify-start">
            <div className="flex items-center gap-1 rounded-[8px] rounded-tl-[2px] bg-white px-3 py-2.5 shadow-sm">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 rounded-full bg-muted animate-pulse-dot" style={{ animationDelay: `${d * 0.18}s` }} />
              ))}
              <span className="ml-1.5 text-[11px] text-muted">{conv.contatoNome.split(" ")[0]} está digitando…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line bg-[#f6f6f4] px-3 py-2.5">
        <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
          <button type="button" onClick={sendCatalog} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink hover:border-navy/40">
            <BookOpen size={12} /> Enviar catálogo
          </button>
          {draftQuote && draftQuote.status === "enviado" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-soft px-2.5 py-1 text-[11.5px] text-navy-3">
              <FileText size={12} /> {draftQuote.numero} enviado · {money(quoteTotals(draftQuote.itens, draftQuote.desconto).total)}
            </span>
          )}
          {QUICK_REPLIES.map((q) => (
            <button key={q} type="button" onClick={() => send(q)} className="shrink-0 rounded-full border border-dashed border-line bg-white px-2.5 py-1 text-[11.5px] text-navy-3 hover:border-ai hover:text-ai">
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={() => setNota((v) => !v)}
            title="Nota interna (o cliente não vê)"
            className={cn("grid size-10 shrink-0 place-items-center rounded-full", nota ? "bg-warn text-white" : "text-muted hover:bg-white")}
          >
            <StickyNote size={18} />
          </button>
          <button type="button" onClick={() => toast("Anexos são simulados nesta demo", { tone: "info" })} className="hidden size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-white sm:grid">
            <Paperclip size={18} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={nota ? "Nota interna — só a equipe vê" : "Digite uma mensagem"}
            className={cn("h-10 min-w-0 flex-1 rounded-full border px-4 text-[13.5px] outline-none", nota ? "border-warn/50 bg-warn-soft" : "border-transparent bg-white")}
          />
          <button type="submit" className="grid size-10 shrink-0 place-items-center rounded-full bg-ok text-white hover:bg-[#12895f]" aria-label="Enviar">
            <Send size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}

/** Resumo da conversa pela IA + ações (criar atividade, atualizar cadastro, sugerir etapa). */
export function ConversationAI({ conv, compact }: { conv: Conversation; compact?: boolean }) {
  const s = useStore();
  const { open, toast } = useUI();
  const [thinking, setThinking] = useState(false);
  const [createdFor, setCreatedFor] = useState<string | null>(null);
  const [appliedFor, setAppliedFor] = useState<string | null>(null);
  const company = s.companies.find((c) => c.id === conv.companyId);
  const deal = company ? openDealOf(s, company.id) : undefined;
  const sum = conv.summary;
  const stale = sum && conv.messages.length && conv.messages.at(-1)!.at > sum.geradoEm;

  const generate = () => {
    setThinking(true);
    setTimeout(() => {
      const fresh = useStore.getState();
      const c2 = fresh.conversations.find((c) => c.id === conv.id)!;
      const d2 = c2.companyId ? openDealOf(fresh, c2.companyId) : undefined;
      fresh.setConversationSummary(conv.id, summarizeConversation(c2, d2));
      setThinking(false);
    }, 1700);
  };

  if (!company)
    return (
      <AIPanel title="Contato sem cadastro">
        <p className="text-[12.5px] text-ink/80">Este número ainda não está vinculado a nenhuma empresa. A IA pode ler a conversa e preencher o cadastro para você.</p>
        <Link href={`/empresas/nova?conv=${conv.id}`} className="mt-3 inline-flex h-9.5 w-full items-center justify-center gap-2 rounded-[5px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-dark">
          <UserPlus size={15} /> Cadastrar empresa com IA
        </Link>
        <p className="mt-2 text-[11.5px] text-muted">O sistema verifica duplicidade por nome, CNPJ e telefone antes de salvar.</p>
      </AIPanel>
    );

  const stageSug = sum?.etapaSugerida && deal && stageIndex(deal.funnel, sum.etapaSugerida) > stageIndex(deal.funnel, deal.stageId) ? getStage(deal.funnel, sum.etapaSugerida) : undefined;
  const extracted = sum?.dadosExtraidos ? (Object.entries(sum.dadosExtraidos).filter(([k, v]) => v !== undefined && company[k as keyof Company] !== v) as [keyof Company, unknown][]) : [];
  const summaryKey = sum?.geradoEm ?? "";

  return (
    <AIPanel
      title="Resumo da conversa"
      action={
        <Button size="xs" variant={sum ? "outline" : "ai"} onClick={generate} disabled={thinking}>
          <Sparkles size={12} /> {sum ? (stale ? "Atualizar" : "Refazer") : "Resumir com IA"}
        </Button>
      }
    >
      {thinking && <AIThinking steps={["Lendo as mensagens", "Extraindo compromissos e datas", "Comparando com a etapa do funil"]} className="border-0 bg-transparent p-0" />}
      {!thinking && !sum && <p className="text-[12.5px] text-muted">Gere um resumo com assunto, necessidade, objeções, compromissos e o próximo passo sugerido.</p>}
      {!thinking && sum && (
        <div className={cn("space-y-2.5 text-[12.5px]", compact && "text-[12px]")}>
          {stale && <Badge tone="amber">há mensagens novas desde o resumo</Badge>}
          <div>
            <div className="label">Assunto</div>
            <div className="font-semibold text-ink">{sum.assunto}</div>
          </div>
          <div>
            <div className="label">Necessidade</div>
            <div className="text-ink/85">{sum.necessidade}</div>
          </div>
          {sum.objecoes.length > 0 && (
            <div>
              <div className="label">Objeções</div>
              <ul className="square-list space-y-0.5 text-ink/85">
                {sum.objecoes.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {(sum.compromissosCliente.length > 0 || sum.compromissosTawper.length > 0) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {sum.compromissosCliente.length > 0 && (
                <div>
                  <div className="label">Compromisso do cliente</div>
                  {sum.compromissosCliente.map((c) => (
                    <p key={c} className="text-ink/85">“{c}”</p>
                  ))}
                </div>
              )}
              {sum.compromissosTawper.length > 0 && (
                <div>
                  <div className="label">Compromisso da Tawper</div>
                  {sum.compromissosTawper.map((c) => (
                    <p key={c} className="text-ink/85">“{c}”</p>
                  ))}
                </div>
              )}
            </div>
          )}
          {sum.datas.length > 0 && (
            <div>
              <div className="label">Datas mencionadas</div>
              {sum.datas.map((d) => (
                <div key={d} className="text-ink/85">{d}</div>
              ))}
            </div>
          )}
          <div className="rounded-[5px] border border-navy/15 bg-soft/60 p-2.5">
            <div className="label">Próximo passo sugerido</div>
            <div className="font-semibold text-ink">{sum.proximoPasso}</div>
            <div className="text-[11.5px] text-muted">
              {sum.proximoPassoTipo} · {fmtDue(rel(sum.proximoPassoDias))}
            </div>
            {createdFor === summaryKey ? (
              <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-ok">
                <Check size={13} /> Atividade criada
              </div>
            ) : (
              <Button
                size="xs"
                variant="dark"
                className="mt-2"
                onClick={() => {
                  s.addActivity({ companyId: company.id, tipo: sum.proximoPassoTipo, titulo: sum.proximoPasso, dueAt: rel(sum.proximoPassoDias, 10), prioridade: "Alta", origem: "ia" });
                  setCreatedFor(summaryKey);
                  toast("Atividade criada a partir da conversa", { tone: "ai", sub: sum.proximoPasso });
                }}
              >
                Criar atividade
              </Button>
            )}
          </div>
          {extracted.length > 0 && (
            <div className="rounded-[5px] border border-ai/20 bg-ai-soft/60 p-2.5">
              <div className="label text-ai">Dados para o cadastro</div>
              <ul className="mt-0.5 space-y-0.5 text-ink/85">
                {extracted.map(([k, v]) => (
                  <li key={k}>
                    {FIELD_LABELS[k] ?? k}: <b>{String(v)}</b>
                  </li>
                ))}
              </ul>
              {appliedFor === summaryKey ? (
                <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-ok">
                  <Check size={13} /> Cadastro atualizado
                </div>
              ) : (
                <Button
                  size="xs"
                  variant="ai"
                  className="mt-2"
                  onClick={() => {
                    s.updateCompany(company.id, Object.fromEntries(extracted) as Partial<Company>, "ia");
                    setAppliedFor(summaryKey);
                    toast("Cadastro atualizado com dados da conversa", { tone: "ai", sub: "Alteração registrada na auditoria com origem IA" });
                  }}
                >
                  Atualizar cadastro
                </Button>
              )}
            </div>
          )}
          {stageSug && deal && (
            <button type="button" onClick={() => open({ kind: "move", dealId: deal.id, toStageId: stageSug.id })} className="flex w-full items-center justify-between gap-2 rounded-[5px] border border-line bg-white px-2.5 py-2 text-left hover:border-navy/40">
              <span>
                <span className="label">Sugestão de funil</span>
                <span className="block font-semibold text-ink">Mover para {stageSug.nome}</span>
              </span>
              <ArrowRight size={15} className="text-navy-3" />
            </button>
          )}
          <Confidence value={sum.confianca} />
        </div>
      )}
    </AIPanel>
  );
}
