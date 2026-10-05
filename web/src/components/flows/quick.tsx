"use client";

import { ArrowRight, Check, Mic, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Confidence, Highlighted } from "@/components/ai/ai";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { parseQuickNote, QUICK_EXAMPLES, type QuickProposal } from "@/lib/ai";
import { ACTIVITY_TYPES, FUNNELS, FIELD_LABELS, isManager } from "@/lib/constants";
import { fmtDue, fromInputDate, toInputDate } from "@/lib/dates";
import { missingCriteria, nextStepOf, openDealOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import type { ActivityType, Company, Prioridade } from "@/lib/types";
import { useUI } from "@/lib/ui-store";

/** Registro em texto livre: a IA interpreta enquanto você escreve; você confirma numa tela só. */
export function QuickRegisterModal({ companyId: initialCompany, text: initialText }: { companyId?: string; text?: string }) {
  const s = useStore();
  const user = useCurrentUser();
  const { close, open, toast } = useUI();
  const [companyId, setCompanyId] = useState(initialCompany ?? "");
  const [text, setText] = useState(initialText ?? "");
  const [reading, setReading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [p, setP] = useState<QuickProposal | null>(null);
  const [applyStage, setApplyStage] = useState(true);
  const [applyData, setApplyData] = useState(true);
  const edited = useRef(false);

  const options = useMemo(
    () =>
      s.companies
        .filter((c) => (c.status === "ativa" || c.status === "espera") && (isManager(user) || c.ownerId === user.id))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [s.companies, user],
  );
  const company = s.companies.find((c) => c.id === companyId);
  const deal = company ? openDealOf(s, company.id) : undefined;

  // a IA lê sozinha quando o texto para de mudar — sem botão "interpretar"
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = (novoTexto: string, empresaId = companyId) => {
    if (timer.current) clearTimeout(timer.current);
    const alvo = s.companies.find((c) => c.id === empresaId);
    if (!alvo || novoTexto.trim().length < 12) {
      setP(null);
      setReading(false);
      return;
    }
    setReading(true);
    timer.current = setTimeout(() => {
      const res = parseQuickNote(novoTexto, {
        company: alvo,
        deal: openDealOf(s, alvo.id),
        contacts: s.contacts.filter((c) => c.companyId === alvo.id),
      });
      setP(res);
      if (!edited.current) {
        setApplyStage(Boolean(res.etapaSugerida));
        setApplyData(Object.keys(res.dadosExtraidos).length > 0);
      }
      setReading(false);
    }, 900);
  };

  const setTextAndRead = (v: string) => {
    setText(v);
    schedule(v);
  };

  const simulateVoice = () => {
    setRecording(true);
    setTimeout(() => {
      setRecording(false);
      setTextAndRead(QUICK_EXAMPLES[0]);
    }, 1800);
  };

  const confirm = () => {
    if (!company || !p) return;
    const pending = nextStepOf(s, company.id);
    const next = {
      companyId: company.id,
      tipo: p.proximoPasso.tipo,
      titulo: p.proximoPasso.titulo,
      dueAt: p.proximoPasso.dueAt,
      prioridade: p.proximoPasso.prioridade,
      origem: "ia" as const,
      ownerId: company.ownerId,
      descricao: p.pendenciaCliente ? `${p.pendenciaCliente}${p.contato ? ` — ${p.contato}` : ""}.` : undefined,
    };
    if (pending) s.completeActivity(pending.id, { resultado: text.trim(), next });
    else {
      s.addInteraction({ companyId: company.id, dealId: deal?.id, canal: p.canal, autorId: user.id, titulo: p.resultado, conteudo: text.trim(), kind: "note" });
      s.addActivity(next);
    }
    s.addInteraction({
      companyId: company.id,
      dealId: deal?.id,
      canal: "IA",
      autorId: "ia",
      kind: "ai",
      titulo: `Registro estruturado pela IA — confirmado por ${user.short}`,
      conteudo: [
        `Resultado: ${p.resultado.toLowerCase()}`,
        p.pendenciaCliente && `Pendência do cliente: ${p.pendenciaCliente.toLowerCase()}`,
        `Próximo passo: ${p.proximoPasso.titulo.toLowerCase()} (${fmtDue(p.proximoPasso.dueAt)})`,
        p.etapaSugerida && applyStage ? `Etapa sugerida: ${p.etapaSugerida.nome}` : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
    });
    if (applyData && Object.keys(p.dadosExtraidos).length) s.updateCompany(company.id, p.dadosExtraidos as Partial<Company>, "ia");
    if (deal && Object.keys(p.checks).length) s.setChecklist(deal.id, p.checks, "ia");

    close();
    toast("Registro salvo", { tone: "ai", sub: `${p.proximoPasso.titulo} · ${fmtDue(p.proximoPasso.dueAt)}` });

    if (deal && p.etapaSugerida && applyStage) {
      if (p.sugereGanho) {
        setTimeout(() => open({ kind: "win", dealId: deal.id }), 120);
        return;
      }
      const fresh = useStore.getState();
      const d2 = fresh.deals.find((x) => x.id === deal.id)!;
      const c2 = fresh.companies.find((x) => x.id === company.id)!;
      const falta = missingCriteria(fresh, d2, c2);
      if (falta.length === 0) {
        const st = FUNNELS[d2.funnel].stages.find((x) => x.id === p.etapaSugerida!.stageId)!;
        const t = st.tarefas[0];
        fresh.moveDeal(d2.id, st.id, {
          nota: "Mudança sugerida pela IA a partir do registro do vendedor.",
          tarefas: t ? [{ companyId: company.id, dealId: d2.id, titulo: t.titulo, tipo: t.tipo, dueAt: p.proximoPasso.dueAt, ownerId: d2.ownerId, origem: "regra" }] : [],
        });
        toast(`Etapa alterada para ${st.nome}`, { tone: "ai", sub: "Sugerida pela IA, confirmada por você" });
      } else {
        setTimeout(() => open({ kind: "move", dealId: deal.id, toStageId: p.etapaSugerida!.stageId, preChecks: p.checks }), 120);
      }
    }
  };

  const update = (patch: Partial<QuickProposal["proximoPasso"]>) => {
    edited.current = true;
    if (p) setP({ ...p, proximoPasso: { ...p.proximoPasso, ...patch } });
  };

  return (
    <Modal
      onClose={close}
      size="lg"
      title="O que aconteceu com o cliente?"
      kicker="Escreva como você falaria — a IA organiza"
      icon={<Sparkles size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!p}>
            <Check size={15} /> Confirmar e gravar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {initialCompany && company ? (
          <div className="text-[12.5px] text-muted">
            {company.nome}
            {deal ? ` · ${FUNNELS[deal.funnel].stages.find((x) => x.id === deal.stageId)?.nome}` : ""}
          </div>
        ) : (
          <Field label="Cliente" required>
            <Select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                schedule(text, e.target.value);
              }}
            >
              <option value="">Selecione a empresa…</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} — {c.cidade}/{c.uf}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div>
          <Textarea
            value={text}
            onChange={(e) => setTextAndRead(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ex.: Falei com João. Ele manda as medidas até sexta. Cobrar na segunda se não enviar."
            className="text-[14px]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button size="xs" variant={recording ? "primary" : "ghost"} onClick={simulateVoice} disabled={recording}>
              <Mic size={13} className={recording ? "animate-pulse" : ""} /> {recording ? "gravando…" : "áudio"}
            </Button>
            {QUICK_EXAMPLES.map((ex, i) => (
              <button
                key={ex}
                type="button"
                onClick={() => setTextAndRead(ex)}
                className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted hover:border-ai/40 hover:text-ai"
                title={ex}
              >
                exemplo {i + 1}
              </button>
            ))}
          </div>
        </div>

        {reading && (
          <div className="flex items-center gap-2 text-[12.5px] text-ai">
            <Sparkles size={14} className="animate-pulse" /> lendo
            <span className="flex gap-1">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 rounded-full bg-ai animate-pulse-dot" style={{ animationDelay: `${d * 0.18}s` }} />
              ))}
            </span>
          </div>
        )}

        {p && company && !reading && (
          <div className="space-y-3 rounded-[8px] border border-line bg-soft/30 p-4 animate-fade-in">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-ai" />
              <span className="text-[13px] font-medium text-ink">A IA entendeu</span>
              <span className="ml-auto">
                <Confidence value={p.confianca} />
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              “<Highlighted text={text} terms={p.destaques} />”
            </p>

            <div className="grid gap-3 text-[13px] sm:grid-cols-[1fr_1.4fr]">
              <div>
                <div className="label">Resultado</div>
                <div className="text-ink">{p.resultado}</div>
                {p.pendenciaCliente && (
                  <div className="mt-2">
                    <div className="label">Cliente ficou de</div>
                    <div className="text-ink">
                      {p.pendenciaCliente.toLowerCase()}
                      {p.prazoCliente ? ` até ${fmtDue(p.prazoCliente)}` : ""}
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-[6px] border border-line bg-white p-3">
                <div className="label mb-1">Próximo passo</div>
                <Input value={p.proximoPasso.titulo} onChange={(e) => update({ titulo: e.target.value })} />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Select value={p.proximoPasso.tipo} onChange={(e) => update({ tipo: e.target.value as ActivityType })}>
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                  <Input type="date" value={toInputDate(p.proximoPasso.dueAt)} onChange={(e) => update({ dueAt: fromInputDate(e.target.value, 10) })} />
                  <Select value={p.proximoPasso.prioridade} onChange={(e) => update({ prioridade: e.target.value as Prioridade })}>
                    <option>Alta</option>
                    <option>Média</option>
                    <option>Baixa</option>
                  </Select>
                </div>
              </div>
            </div>

            {(p.etapaSugerida || Object.keys(p.dadosExtraidos).length > 0) && (
              <div className="space-y-2 border-t border-line pt-3">
                {p.etapaSugerida && deal && (
                  <Checkbox
                    checked={applyStage}
                    onChange={(v) => {
                      edited.current = true;
                      setApplyStage(v);
                    }}
                    label={
                      p.sugereGanho ? (
                        "Registrar a venda como ganha"
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          Avançar para <span className="font-medium">{p.etapaSugerida.nome}</span> <ArrowRight size={12} className="text-muted" />
                        </span>
                      )
                    }
                    sub={p.etapaSugerida.motivo}
                  />
                )}
                {Object.keys(p.dadosExtraidos).length > 0 && (
                  <Checkbox
                    checked={applyData}
                    onChange={(v) => {
                      edited.current = true;
                      setApplyData(v);
                    }}
                    label="Atualizar o cadastro"
                    sub={Object.entries(p.dadosExtraidos)
                      .map(([k, v]) => `${FIELD_LABELS[k as keyof Company] ?? k}: ${v}`)
                      .join(" · ")}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
