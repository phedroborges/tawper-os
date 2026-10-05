"use client";

import { AlertTriangle, ArrowRight, Check, CircleCheck, FileText, Pause, PartyPopper, Trophy, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AIBadge } from "@/components/ai/ai";
import { Modal } from "@/components/ui/overlay";
import { Badge, Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { FUNNELS, getStage, MARCAS, MOTIVOS_ESPERA, MOTIVOS_PERDA, PAPEIS, PRENSAS, RAMOS, REGIOES, stageIndex, UFS, type Criterion } from "@/lib/constants";
import { addDays, fmtDateShort, fmtDue, fromInputDate, rel, toInputDate } from "@/lib/dates";
import { criterionMet, pendingOf } from "@/lib/selectors";
import { useStore, type ActivityDraft } from "@/lib/store";
import type { Company, Contact, Papel, Potencial, Prensa } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, money, quoteTotals } from "@/lib/utils";

/** Mudança de etapa validada (RN-03), com tarefas da nova etapa e próximo passo obrigatório (RN-01). */
export function MoveStageModal({ dealId, toStageId, preChecks, nota: initialNota }: { dealId: string; toStageId?: string; preChecks?: Record<string, boolean>; nota?: string }) {
  const s = useStore();
  const { close, open, toast } = useUI();
  const deal = s.deals.find((d) => d.id === dealId);
  const company = s.companies.find((c) => c.id === deal?.companyId);
  const stages = deal ? FUNNELS[deal.funnel].stages : [];
  const curIdx = deal ? stageIndex(deal.funnel, deal.stageId) : 0;
  const [target, setTarget] = useState(toStageId ?? stages[curIdx + 1]?.id ?? "");
  const [checks, setChecks] = useState<Record<string, boolean>>({ ...(preChecks ?? {}) });
  const [fields, setFields] = useState<Partial<Company>>({});
  const [newContact, setNewContact] = useState<{ nome: string; cargo: string; papel: Papel; whatsapp: string }>({ nome: "", cargo: "", papel: "Técnico", whatsapp: "" });
  const [nota, setNota] = useState(initialNota ?? "");
  const [tasksSel, setTasksSel] = useState<Record<number, boolean>>({ 0: true });

  const targetStage = deal && target ? getStage(deal.funnel, target) : undefined;
  const targetIdx = deal && target ? stageIndex(deal.funnel, target) : 0;
  const backwards = targetIdx < curIdx;
  const curStage = deal ? getStage(deal.funnel, deal.stageId) : undefined;

  const effectiveDeal = deal ? { ...deal, checklist: { ...deal.checklist, ...checks } } : undefined;
  const effectiveCompany = company ? ({ ...company, ...fields } as Company) : undefined;
  const contactsEff =
    company && newContact.nome.trim()
      ? [...s.contacts, { id: "tmp", companyId: company.id, nome: newContact.nome, cargo: newContact.cargo, papel: newContact.papel, influencia: 2, canal: "WhatsApp", autorizaContato: true, ativo: true } as Contact]
      : s.contacts;

  if (!deal || !company || !curStage || !effectiveDeal || !effectiveCompany) return null;

  const dataEff = { ...s, contacts: contactsEff };
  const criteria = backwards ? [] : curStage.criterios;
  const status = criteria.map((c) => ({ c, ok: criterionMet(dataEff, effectiveDeal, effectiveCompany, c) }));
  const missing = status.filter((x) => !x.ok);
  const hasPending = pendingOf(s, company.id).length > 0;
  const tasks = targetStage?.tarefas ?? [];
  const selectedTasks = tasks.filter((_, i) => tasksSel[i]);
  const needsNext = !hasPending && selectedTasks.length === 0 && !targetStage?.terminal;
  const canConfirm = targetStage && !targetStage.terminal && missing.length === 0 && !needsNext && (!backwards || nota.trim().length > 3);

  const confirm = () => {
    if (!targetStage) return;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== ""));
    if (Object.keys(patch).length) s.updateCompany(company.id, patch);
    if (newContact.nome.trim()) {
      s.addContact({ companyId: company.id, nome: newContact.nome, cargo: newContact.cargo || newContact.papel, papel: newContact.papel, influencia: 2, whatsapp: newContact.whatsapp || undefined, canal: "WhatsApp", autorizaContato: true, ativo: true });
    }
    const tarefas: ActivityDraft[] = selectedTasks.map((t, i) => ({ companyId: company.id, dealId: deal.id, titulo: t.titulo, tipo: t.tipo, dueAt: rel(t.prazoDias, 9 + i), ownerId: deal.ownerId, origem: "regra" }));
    s.moveDeal(deal.id, targetStage.id, { checks, tarefas, nota: nota.trim() || undefined });
    toast(`Etapa alterada para ${targetStage.nome}`, { sub: tarefas.length ? `${tarefas.length} tarefa(s) criada(s) pela regra da etapa` : `Tempo em ${curStage.nome} registrado` });
    close();
  };

  const setField = <K extends keyof Company>(k: K, v: Company[K]) => setFields((f) => ({ ...f, [k]: v }));

  const renderFix = (c: Criterion) => {
    if (c.kind === "check")
      return <Checkbox checked={Boolean(checks[c.id])} onChange={(v) => setChecks((x) => ({ ...x, [c.id]: v }))} label="Marcar como cumprido" />;
    if (c.kind === "contact")
      return (
        <div className="grid gap-2 sm:grid-cols-4">
          <Input placeholder="Nome" value={newContact.nome} onChange={(e) => setNewContact({ ...newContact, nome: e.target.value })} />
          <Input placeholder="Cargo" value={newContact.cargo} onChange={(e) => setNewContact({ ...newContact, cargo: e.target.value })} />
          <Select value={newContact.papel} onChange={(e) => setNewContact({ ...newContact, papel: e.target.value as Papel })}>
            {PAPEIS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <Input placeholder="WhatsApp" value={newContact.whatsapp} onChange={(e) => setNewContact({ ...newContact, whatsapp: e.target.value })} />
        </div>
      );
    if (c.kind === "quote")
      return (
        <Button size="xs" variant="dark" onClick={() => { close(); setTimeout(() => open({ kind: "quote", dealId: deal.id }), 100); }}>
          <FileText size={13} /> Montar orçamento agora
        </Button>
      );
    switch (c.field) {
      case "cidade":
        return (
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <Input placeholder="Cidade" value={fields.cidade ?? company.cidade ?? ""} onChange={(e) => setField("cidade", e.target.value)} />
            <Select value={fields.uf ?? company.uf ?? ""} onChange={(e) => setField("uf", e.target.value)}>
              <option value="">UF</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </div>
        );
      case "regiao":
        return (
          <Select value={fields.regiao ?? ""} onChange={(e) => setField("regiao", e.target.value)}>
            <option value="">Selecione…</option>
            {REGIOES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        );
      case "ramo":
        return (
          <Select value={fields.ramo ?? ""} onChange={(e) => setField("ramo", e.target.value)}>
            <option value="">Selecione…</option>
            {RAMOS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        );
      case "colhedoras":
        return <Input type="number" min={1} placeholder="Ex.: 14" value={fields.colhedoras ?? ""} onChange={(e) => setField("colhedoras", e.target.value ? Number(e.target.value) : undefined)} />;
      case "prensa":
        return (
          <Select value={fields.prensa ?? ""} onChange={(e) => setField("prensa", (e.target.value || undefined) as Prensa)}>
            <option value="">Selecione…</option>
            {PRENSAS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        );
      case "marcaAtual":
        return (
          <Select value={fields.marcaAtual ?? ""} onChange={(e) => setField("marcaAtual", e.target.value)}>
            <option value="">Selecione…</option>
            {MARCAS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        );
      case "potencial":
        return (
          <Select value={fields.potencial ?? ""} onChange={(e) => setField("potencial", (e.target.value || undefined) as Potencial)}>
            <option value="">Selecione…</option>
            <option>Alto</option>
            <option>Médio</option>
            <option>Baixo</option>
          </Select>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      onClose={close}
      size="lg"
      kicker={`${company.nome} · ${FUNNELS[deal.funnel].nome}`}
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Mover de <Badge tone="neutral">{curStage.nome}</Badge> <ArrowRight size={16} /> para
        </span>
      }
      icon={<ArrowRight size={18} />}
      footer={
        targetStage?.terminal ? (
          <>
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button variant="success" onClick={() => { close(); setTimeout(() => open({ kind: "win", dealId: deal.id }), 100); }}>
              <Trophy size={15} /> Registrar venda
            </Button>
          </>
        ) : (
          <>
            <span className="mr-auto text-[12px] text-muted">
              {missing.length ? `${missing.length} critério(s) pendente(s)` : needsNext ? "Defina o próximo passo" : "Tudo certo para avançar"}
            </span>
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirm} disabled={!canConfirm}>
              <Check size={15} /> Confirmar mudança
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {stages.map((st, i) => (
            <button
              key={st.id}
              type="button"
              disabled={i === curIdx}
              onClick={() => setTarget(st.id)}
              className={cn(
                "rounded-[6px] border px-2.5 py-1.5 text-[12.5px] whitespace-nowrap transition",
                i === curIdx && "cursor-default border-dashed border-line text-muted",
                st.id === target && "border-navy bg-navy text-white",
                st.id !== target && i !== curIdx && "border-line bg-white text-muted hover:text-ink",
              )}
            >
              {i + 1}. {st.nome}
            </button>
          ))}
        </div>

        {targetStage?.terminal ? (
          <div className="rounded-[6px] border border-ok/30 bg-ok-soft/60 p-4 text-[13px] text-ink">
            <div className="flex items-center gap-2 font-semibold text-ok">
              <Trophy size={16} /> {targetStage.nome} encerra a oportunidade como ganha.
            </div>
            <p className="mt-1 text-ink/75">Use “Registrar venda” para informar o valor. O sistema cria o pós-venda e o ciclo de recorrência automaticamente.</p>
          </div>
        ) : (
          <>
            {!backwards && (
              <div className="rounded-[6px] border border-line">
                <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
                  <div className="text-[13px] font-medium text-ink">Para sair de {curStage.nome}</div>
                  <span className={cn("text-[12px]", missing.length ? "text-warn" : "text-ok")}>{missing.length ? `faltam ${missing.length}` : "tudo certo"}</span>
                </div>
                {status.length === 0 && <div className="px-3.5 py-3 text-[12.5px] text-muted">Esta etapa não possui critérios mínimos de saída.</div>}
                <ul>
                  {status.map(({ c, ok }) => (
                    <li key={c.id} className="border-b border-line/70 px-3.5 py-2.5 last:border-b-0">
                      <div className="flex items-center gap-2 text-[13px]">
                        {ok ? <CircleCheck size={16} className="text-ok" /> : <AlertTriangle size={16} className="text-warn" />}
                        <span className={cn("font-medium", ok ? "text-ink" : "text-ink")}>{c.label}</span>
                        {c.hint && <span className="text-[11.5px] text-muted">({c.hint})</span>}
                        {ok && preChecks?.[c.id] && <AIBadge label="reconhecido pela IA" />}
                      </div>
                      {(!ok || (c.kind === "check" && checks[c.id] && !deal.checklist[c.id])) && <div className="mt-2 pl-6">{renderFix(c)}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {backwards && (
              <Field label="Motivo do retorno de etapa" required hint="fica na auditoria">
                <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: cliente pediu novo teste" />
              </Field>
            )}

            {targetStage && (
              <div className="rounded-[6px] border border-line">
                <div className="border-b border-line px-3.5 py-2.5">
                  <div className="text-[13px] font-medium text-ink">Ao entrar em {targetStage.nome}</div>
                  <div className="text-[12.5px] text-ink/75">
                    {targetStage.objetivo} Limite de permanência: <b>{targetStage.limiteDias} dias</b>.
                  </div>
                </div>
                <div className="space-y-2 px-3.5 py-3">
                  {tasks.map((t, i) => (
                    <Checkbox
                      key={t.titulo}
                      checked={Boolean(tasksSel[i])}
                      onChange={(v) => setTasksSel((x) => ({ ...x, [i]: v }))}
                      label={t.titulo}
                      sub={`${t.tipo} · vence ${fmtDue(rel(t.prazoDias))} · criada pela regra da etapa`}
                    />
                  ))}
                  {needsNext && (
                    <div className="flex items-center gap-2 rounded-[4px] bg-brand-soft px-2.5 py-1.5 text-[12px] text-brand">
                      <AlertTriangle size={13} /> A conta ficaria sem próximo passo. Mantenha ao menos uma tarefa.
                    </div>
                  )}
                  {hasPending && <div className="text-[11.5px] text-muted">A conta já possui {pendingOf(s, company.id).length} atividade(s) aberta(s).</div>}
                </div>
              </div>
            )}
            {!backwards && (
              <Field label="Observação" hint="opcional">
                <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: apresentação feita com a manutenção" />
              </Field>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Venda ganha → recorrência automática (RN-07). */
export function WinDealModal({ dealId }: { dealId: string }) {
  const s = useStore();
  const { close } = useUI();
  const deal = s.deals.find((d) => d.id === dealId);
  const company = s.companies.find((c) => c.id === deal?.companyId);
  const quote = s.quotes.filter((q) => q.dealId === dealId && (q.status === "enviado" || q.status === "aceito")).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const initial = quote ? Math.round(quoteTotals(quote.itens, quote.desconto).total) : deal?.valor ?? 0;
  const [valor, setValor] = useState(String(initial || ""));
  const [obs, setObs] = useState("");
  const [done, setDone] = useState<{ posVendaDue: string } | null>(null);
  if (!deal || !company) return null;
  const isFirst = deal.funnel === "aquisicao";
  const ciclo = isFirst ? 1 : deal.ciclo + 1;

  const confirm = () => {
    const v = Number(valor) || 0;
    s.winDeal(deal.id, { valor: v, obs: obs || (quote ? `Pedido referente ao orçamento ${quote.numero}.` : undefined) });
    setDone({ posVendaDue: rel(5, 10) });
  };

  if (done)
    return (
      <Modal
        onClose={close}
        size="md"
        kicker={isFirst ? "Primeira venda registrada" : "Recompra registrada"}
        title={`${company.nome} — ${money(Number(valor))}`}
        icon={<PartyPopper size={18} />}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Fechar
            </Button>
            <Link href={`/empresas/${company.id}`} onClick={close} className="inline-flex h-9.5 items-center gap-2 rounded-[5px] bg-navy px-4 text-[13px] font-semibold text-white hover:bg-navy-2">
              Ver a conta <ArrowRight size={14} />
            </Link>
          </>
        }
      >
        <div className="rounded-[8px] border border-ok/25 bg-ok-soft/50 p-4">
          <div className="text-[16px] font-medium text-ink">A jornada não termina na venda.</div>
          <p className="mt-1 text-[13px] text-muted">O sistema já preparou o ciclo de recorrência desta conta.</p>
        </div>
        <ul className="mt-4 space-y-2.5">
          {[
            `Venda registrada: ${money(Number(valor))}`,
            quote ? `Orçamento ${quote.numero} marcado como aceito` : "Oportunidade encerrada como ganha",
            `Conta movida para o funil de Recorrência · ciclo ${ciclo}`,
            `Pós-venda agendado para ${fmtDateShort(done.posVendaDue)} (confirmar entrega e aplicação)`,
            "IA registrou a previsão de recompra — sem cobrar o cliente antes da janela",
            "Gestor notificado e auditoria atualizada",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-[13px] text-ink">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ok text-white">
                <Check size={12} strokeWidth={3} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </Modal>
    );

  return (
    <Modal
      onClose={close}
      kicker={isFirst ? "Encerrar como ganha · primeira venda" : `Recompra · ciclo ${deal.ciclo}`}
      title={company.nome}
      icon={<Trophy size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="success" onClick={confirm} disabled={!Number(valor)}>
            <Trophy size={15} /> Confirmar venda
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor realizado (R$)" required>
            <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} className="text-[16px] font-bold" />
          </Field>
          <Field label="Data">
            <Input value={new Date().toLocaleDateString("pt-BR")} disabled />
          </Field>
        </div>
        {quote && (
          <div className="flex items-center gap-2 rounded-[5px] bg-soft px-3 py-2 text-[12.5px] text-navy-3">
            <FileText size={14} /> Baseado no orçamento {quote.numero} · {quote.itens.length} itens · {quote.condicao}
          </div>
        )}
        <Field label="Observação" hint="opcional">
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Ex.: PC 45021 recebido por e-mail" />
        </Field>
        <div className="rounded-[6px] border border-ok/25 bg-ok-soft/50 p-3.5">
          <div className="label mb-1.5 text-ok">O que o sistema faz ao confirmar</div>
          <ul className="square-list space-y-1 text-[12.5px] text-ink/80">
            <li>Encerra a oportunidade como ganha e registra tempo e autor.</li>
            <li>Cria a oportunidade de Recorrência (ciclo {ciclo}) em Pós-venda.</li>
            <li>Agenda o pós-venda para {fmtDateShort(rel(5))}.</li>
            <li>Registra a previsão de recompra sugerida pela IA.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

/** Perda explícita com motivo padronizado (RN-06). */
export function LoseDealModal({ dealId }: { dealId: string }) {
  const s = useStore();
  const { close, toast } = useUI();
  const deal = s.deals.find((d) => d.id === dealId);
  const company = s.companies.find((c) => c.id === deal?.companyId);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  if (!deal || !company) return null;
  const confirm = () => {
    s.loseDeal(deal.id, { motivo, obs });
    toast("Oportunidade encerrada como perdida", { tone: "warn", sub: `Motivo: ${motivo}` });
    close();
  };
  return (
    <Modal
      onClose={close}
      size="sm"
      kicker="Encerrar como perdida"
      title={company.nome}
      icon={<XCircle size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} disabled={!motivo}>
            Confirmar perda
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Motivo padronizado" required>
          <Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Selecione…</option>
            {MOTIVOS_PERDA.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Observação" hint="opcional">
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
        </Field>
        {deal.funnel === "recorrencia" && <p className="text-[12px] text-muted">Por ser um cliente recorrente, o sistema cria um plano de recuperação em Relacionamento.</p>}
      </div>
    </Modal>
  );
}

/** Espera controlada (RN-05). */
export function StandbyModal({ companyId }: { companyId: string }) {
  const s = useStore();
  const { close, toast } = useUI();
  const company = s.companies.find((c) => c.id === companyId);
  const [motivo, setMotivo] = useState("");
  const [condicao, setCondicao] = useState("");
  const [reav, setReav] = useState(toInputDate(addDays(new Date(), 30).toISOString()));
  const [resp, setResp] = useState(company?.ownerId ?? "");
  if (!company) return null;
  const confirm = () => {
    s.setStandby(company.id, { motivo, condicao, reavaliacao: fromInputDate(reav, 9), responsavelId: resp });
    toast("Conta colocada em espera", { tone: "warn", sub: `Reavaliação em ${fmtDateShort(fromInputDate(reav))}` });
    close();
  };
  return (
    <Modal
      onClose={close}
      kicker="Espera controlada"
      title={company.nome}
      icon={<Pause size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={confirm} disabled={!motivo || !condicao.trim() || !reav}>
            Colocar em espera
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[12.5px] text-muted">“Stand by” não é uma etapa solta: exige motivo, condição de retomada, responsável e data de reavaliação. O sistema cria a tarefa de reavaliação automaticamente.</p>
        <Field label="Motivo" required>
          <Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Selecione…</option>
            {MOTIVOS_ESPERA.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Condição de retomada" required>
          <Input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex.: liberação do orçamento 2027" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reavaliar em" required>
            <Input type="date" value={reav} onChange={(e) => setReav(e.target.value)} />
          </Field>
          <Field label="Responsável">
            <Select value={resp} onChange={(e) => setResp(e.target.value)}>
              {s.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.short}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
