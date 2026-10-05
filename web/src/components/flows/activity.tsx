"use client";

import { Check, Pause, Sparkles, Trophy, XCircle } from "lucide-react";
import { useState } from "react";
import { AIBadge } from "@/components/ai/ai";
import { TypeIcon } from "@/components/crm/crm";
import { Modal } from "@/components/ui/overlay";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { inferStage, parseQuickNote } from "@/lib/ai";
import { ACTIVITY_TYPES, getStage } from "@/lib/constants";
import { addDays, fmtDue, fromInputDate, rel, toInputDate } from "@/lib/dates";
import { openDealOf, stageOf } from "@/lib/selectors";
import { useStore, type ActivityDraft } from "@/lib/store";
import type { ActivityType, Prioridade } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

const RESULT_CHIPS = ["Contato realizado", "Sem resposta — tentar novamente", "Cliente pediu retorno", "Material enviado", "Visita realizada"];

type After = "next" | "standby" | "win" | "lose";

/** Concluir atividade exige decidir a continuidade (RN-02). */
export function CompleteActivityModal({ activityId }: { activityId: string }) {
  const s = useStore();
  const { close, open, toast } = useUI();
  const a = s.activities.find((x) => x.id === activityId);
  const company = s.companies.find((c) => c.id === a?.companyId);
  const deal = company ? openDealOf(s, company.id) : undefined;
  const suggested = deal ? stageOf(deal).tarefas[0] : undefined;

  const [resultado, setResultado] = useState("");
  const [after, setAfter] = useState<After>("next");
  const [titulo, setTitulo] = useState(suggested?.titulo ?? "Follow-up com o cliente");
  const [tipo, setTipo] = useState<ActivityType>(suggested?.tipo ?? "WhatsApp");
  const [due, setDue] = useState(toInputDate(rel(suggested?.prazoDias ?? 3)));
  const [prio, setPrio] = useState<Prioridade>("Média");
  const [fromAI, setFromAI] = useState(false);

  if (!a || !company) return null;

  const stageHint = deal && resultado.length > 8 ? inferStage(resultado, deal).etapa : undefined;

  const suggest = () => {
    const p = parseQuickNote(resultado || a.titulo, { company, deal, contacts: s.contacts.filter((c) => c.companyId === company.id) });
    setTitulo(p.proximoPasso.titulo);
    setTipo(p.proximoPasso.tipo);
    setDue(toInputDate(p.proximoPasso.dueAt));
    setPrio(p.proximoPasso.prioridade);
    setFromAI(true);
  };

  const confirm = () => {
    const res = resultado.trim() || "Concluída";
    if (after === "next") {
      s.completeActivity(a.id, {
        resultado: res,
        next: { companyId: company.id, dealId: deal?.id, tipo, titulo, dueAt: fromInputDate(due, 10), prioridade: prio, origem: fromAI ? "ia" : "manual", ownerId: a.ownerId },
      });
      toast("Atividade concluída", { sub: `Próximo passo: ${titulo} · ${fmtDue(fromInputDate(due))}` });
      close();
      if (stageHint && deal) setTimeout(() => open({ kind: "move", dealId: deal.id, toStageId: stageHint.stageId }), 120);
      return;
    }
    s.completeActivity(a.id, { resultado: res });
    close();
    setTimeout(() => {
      if (after === "standby") open({ kind: "standby", companyId: company.id });
      if (after === "win" && deal) open({ kind: "win", dealId: deal.id });
      if (after === "lose" && deal) open({ kind: "lose", dealId: deal.id });
    }, 120);
  };

  const opts: { v: After; label: string; icon: React.ReactNode; sub: string }[] = [
    { v: "next", label: "próximo passo", icon: <Check size={13} />, sub: "" },
    { v: "standby", label: "espera", icon: <Pause size={13} />, sub: "" },
    { v: "win", label: "venda", icon: <Trophy size={13} />, sub: "" },
    { v: "lose", label: "perda", icon: <XCircle size={13} />, sub: "" },
  ];

  return (
    <Modal
      onClose={close}
      size="lg"
      kicker="Concluir e definir o próximo passo"
      title={a.titulo}
      icon={<TypeIcon tipo={a.tipo} size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={confirm} disabled={after === "next" && !titulo.trim()}>
            <Check size={15} /> Concluir {after === "next" ? "e agendar" : "e continuar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-[12.5px] text-muted">
          {company.nome} · {a.tipo} · vencimento {fmtDue(a.dueAt)}
        </div>
        <Field label="Resultado" hint="o que aconteceu?">
          <Textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={3} placeholder="Ex.: Falei com João, ele manda as medidas até sexta." />
        </Field>
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {RESULT_CHIPS.map((c) => (
            <button key={c} type="button" onClick={() => setResultado(c)} className="rounded-[4px] border border-line bg-white px-2 py-1 text-[11.5px] text-ink/80 hover:border-navy/40">
              {c}
            </button>
          ))}
        </div>

        {stageHint && (
          <div className="flex items-center gap-2 rounded-[5px] bg-ai-soft px-3 py-2 text-[12.5px] text-ai">
            <Sparkles size={14} /> A IA entendeu avanço para <b>{stageHint.nome}</b>. Depois de concluir, você confirma a mudança de etapa.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          <span>Depois de concluir:</span>
          {opts.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setAfter(o.v)}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors", after === o.v ? "bg-navy text-white" : "hover:bg-soft hover:text-ink")}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>

        {after === "next" && (
          <div className="rounded-[6px] border border-line bg-soft/40 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="label">Próximo passo {fromAI && <AIBadge className="ml-1" />}</div>
              <Button size="xs" variant="subtle" onClick={suggest}>
                <Sparkles size={13} /> Sugerir com IA
              </Button>
            </div>
            <Input value={titulo} onChange={(e) => { setTitulo(e.target.value); setFromAI(false); }} className="font-semibold" />
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as ActivityType)}>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              <Select value={prio} onChange={(e) => setPrio(e.target.value as Prioridade)}>
                <option>Alta</option>
                <option>Média</option>
                <option>Baixa</option>
              </Select>
            </div>
            {deal && suggested && (
              <div className="mt-2 text-[11.5px] text-muted">
                Regra da etapa <b>{getStage(deal.funnel, deal.stageId).nome}</b>: {suggested.titulo.toLowerCase()}.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function NewActivityModal({ companyId, preset }: { companyId: string; preset?: Partial<ActivityDraft> }) {
  const s = useStore();
  const { close, toast } = useUI();
  const company = s.companies.find((c) => c.id === companyId);
  const deal = company ? openDealOf(s, company.id) : undefined;
  const sug = deal ? stageOf(deal).tarefas[0] : undefined;
  const [titulo, setTitulo] = useState(preset?.titulo ?? sug?.titulo ?? "");
  const [tipo, setTipo] = useState<ActivityType>(preset?.tipo ?? sug?.tipo ?? "Ligação");
  const [due, setDue] = useState(toInputDate(preset?.dueAt ?? rel(sug?.prazoDias ?? 2)));
  const [prio, setPrio] = useState<Prioridade>(preset?.prioridade ?? "Média");
  const [owner, setOwner] = useState(company?.ownerId ?? "");
  const [descricao, setDescricao] = useState(preset?.descricao ?? "");
  if (!company) return null;
  const save = () => {
    s.addActivity({ companyId, dealId: deal?.id, titulo, tipo, dueAt: fromInputDate(due, 10), prioridade: prio, ownerId: owner, descricao: descricao || undefined, origem: preset?.origem ?? "manual" });
    toast("Próximo passo agendado", { sub: `${titulo} · ${fmtDue(fromInputDate(due))}` });
    close();
  };
  return (
    <Modal
      onClose={close}
      kicker={company.nome}
      title="Novo próximo passo"
      icon={<Check size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!titulo.trim()}>
            Agendar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="O que precisa ser feito" required>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Ligar para o comprador" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as ActivityType)}>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vencimento">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Prioridade">
            <Select value={prio} onChange={(e) => setPrio(e.target.value as Prioridade)}>
              <option>Alta</option>
              <option>Média</option>
              <option>Baixa</option>
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              {s.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.short}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Detalhes" hint="opcional">
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
        </Field>
        {deal && (
          <div className="text-[12px] text-muted">
            Vinculado à oportunidade em <Badge>{getStage(deal.funnel, deal.stageId).nome}</Badge>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function RescheduleModal({ activityId }: { activityId: string }) {
  const s = useStore();
  const { close, toast } = useUI();
  const a = s.activities.find((x) => x.id === activityId);
  const [due, setDue] = useState(toInputDate(addDays(new Date(), 2).toISOString()));
  const [motivo, setMotivo] = useState("");
  if (!a) return null;
  const save = () => {
    s.rescheduleActivity(a.id, fromInputDate(due, 10));
    if (motivo.trim()) s.addInteraction({ companyId: a.companyId, canal: "Nota", autorId: s.currentUserId ?? "u-murilo", kind: "note", titulo: `Atividade reagendada: ${a.titulo}`, conteudo: motivo });
    toast("Atividade reagendada", { sub: fmtDue(fromInputDate(due)) });
    close();
  };
  return (
    <Modal
      onClose={close}
      size="sm"
      kicker="Reagendar"
      title={a.titulo}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save}>
            Salvar nova data
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 7].map((n) => (
            <Button key={n} size="xs" variant="outline" onClick={() => setDue(toInputDate(addDays(new Date(), n).toISOString()))}>
              +{n} {n === 1 ? "dia" : "dias"}
            </Button>
          ))}
        </div>
        <Field label="Nova data">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Motivo" hint="fica no histórico">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente pediu para falar na próxima semana" />
        </Field>
      </div>
    </Modal>
  );
}
