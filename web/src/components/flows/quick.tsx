"use client";

import { ArrowRight, Check, Mic, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Confidence, Highlighted } from "@/components/ai/ai";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { parseQuickNote, QUICK_EXAMPLES, type QuickProposal } from "@/lib/ai";
import { companyContext, funnelStages } from "@/lib/ai-context";
import { ACTIVITY_TYPES, FUNNELS, FIELD_LABELS, isManager, stageIndex } from "@/lib/constants";
import { fmtDue, fromInputDate, toInputDate } from "@/lib/dates";
import { missingCriteria, nextStepOf, openDealOf } from "@/lib/selectors";
import { reportError, useCurrentUser, useStore } from "@/lib/store";
import type { ActivityType, Company, Prioridade } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { aiQuickNote, aiTranscribe } from "@/server/ai/actions";

interface SpeechResult {
  isFinal: boolean;
  0?: { transcript: string };
}

interface SpeechEvent {
  results: ArrayLike<SpeechResult>;
  error?: string;
}

interface SpeechSession {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function speechCtor(): (new () => SpeechSession) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: new () => SpeechSession; webkitSpeechRecognition?: new () => SpeechSession };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const joinSpeech = (base: string, spoken: string) => [base.trim(), spoken.replace(/\s+/g, " ").trim()].filter(Boolean).join(" ");

/** Registro em texto livre: a IA interpreta enquanto você escreve; você confirma numa tela só. */
export function QuickRegisterModal({ companyId: initialCompany, text: initialText }: { companyId?: string; text?: string }) {
  const s = useStore();
  const user = useCurrentUser();
  const { close, open, toast } = useUI();
  const [companyId, setCompanyId] = useState(initialCompany ?? "");
  const [text, setText] = useState(initialText ?? "");
  const [reading, setReading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
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
  const seq = useRef(0);
  const schedule = (novoTexto: string, empresaId = companyId) => {
    if (timer.current) clearTimeout(timer.current);
    const alvo = s.companies.find((c) => c.id === empresaId);
    if (!alvo || novoTexto.trim().length < 12) {
      seq.current += 1;
      setP(null);
      setReading(false);
      return;
    }
    setReading(true);
    timer.current = setTimeout(() => {
      const n = ++seq.current;
      const state = useStore.getState();
      const dealAtual = openDealOf(state, alvo.id);
      const local = parseQuickNote(novoTexto, {
        company: alvo,
        deal: dealAtual,
        contacts: state.contacts.filter((c) => c.companyId === alvo.id),
      });
      if (n !== seq.current) return;
      setP(local);
      if (!edited.current) {
        setApplyStage(Boolean(local.etapaSugerida));
        setApplyData(Object.keys(local.dadosExtraidos).length > 0);
      }
      const ctx = companyContext(state, alvo.id);
      void (async () => {
        let res = local;
        try {
          if (ctx) res = await aiQuickNote({ note: novoTexto, context: ctx, stages: funnelStages(dealAtual), fallback: local });
        } catch {
          res = local;
        }
        if (n !== seq.current) return;
        if (!edited.current) {
          setP(res);
          setApplyStage(Boolean(res.etapaSugerida));
          setApplyData(Object.keys(res.dadosExtraidos).length > 0);
        }
        setReading(false);
      })();
    }, 900);
  };

  const setTextAndRead = (v: string) => {
    setText(v);
    schedule(v);
  };
  const applyText = useRef(setTextAndRead);
  useEffect(() => {
    applyText.current = setTextAndRead;
  });

  const dictation = useRef<{ rec: SpeechSession; base: string; final: string; want: boolean } | null>(null);
  const tape = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const alive = useRef(true);

  const stopVoice = () => {
    const d = dictation.current;
    if (d) {
      d.want = false;
      d.rec.stop();
    }
    const current = tape.current;
    if (current && current.rec.state !== "inactive") current.rec.stop();
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const d = dictation.current;
      if (d) {
        d.want = false;
        d.rec.stop();
      }
      const current = tape.current;
      current?.stream.getTracks().forEach((track) => track.stop());
      if (current && current.rec.state !== "inactive") current.rec.stop();
    };
  }, []);

  const startDictation = (Ctor: new () => SpeechSession) => {
    const rec = new Ctor();
    const session = { rec, base: text.trim(), final: "", want: true };
    dictation.current = session;
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const piece = event.results[i]?.[0]?.transcript ?? "";
        if (event.results[i]?.isFinal) finalText += piece;
        else interim += piece;
      }
      session.final = finalText;
      if (alive.current) applyText.current(joinSpeech(session.base, `${finalText}${interim}`));
    };
    rec.onerror = (event) => {
      const code = event.error;
      if (code === "no-speech" || code === "aborted") return;
      session.want = false;
      if (!alive.current) return;
      setRecording(false);
      toast(code === "not-allowed" ? "Permita o microfone do navegador para ditar." : "Não consegui ouvir o microfone.", { tone: "warn" });
    };
    rec.onend = () => {
      if (session.final.trim()) {
        session.base = joinSpeech(session.base, session.final);
        session.final = "";
        if (alive.current) applyText.current(session.base);
      }
      if (session.want) {
        try {
          rec.start();
          return;
        } catch {
          session.want = false;
        }
      }
      if (dictation.current === session) dictation.current = null;
      if (alive.current) setRecording(false);
    };
    try {
      rec.start();
      setRecording(true);
    } catch {
      dictation.current = null;
      toast("Não consegui abrir o microfone.", { tone: "warn" });
    }
  };

  const startRecorder = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("Este navegador não grava áudio.", { tone: "warn" });
      return;
    }
    try {
      const base = text.trim();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      tape.current = { rec, stream, chunks };
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        tape.current = null;
        if (!alive.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) return;
        setTranscribing(true);
        const form = new FormData();
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        form.set("file", new File([blob], `fala.${ext}`, { type: blob.type || "audio/webm" }));
        void aiTranscribe(form)
          .then((said) => {
            if (!alive.current) return;
            if (!said) {
              toast("Não consegui transcrever o áudio.", { tone: "warn" });
              return;
            }
            applyText.current(joinSpeech(base, said));
          })
          .catch(() => {
            if (alive.current) toast("Não consegui transcrever o áudio.", { tone: "warn" });
          })
          .finally(() => {
            if (alive.current) setTranscribing(false);
          });
      };
      rec.start();
      setRecording(true);
    } catch {
      toast("Permita o microfone do navegador para ditar.", { tone: "warn" });
    }
  };

  const toggleVoice = () => {
    if (recording) {
      stopVoice();
      return;
    }
    const Ctor = speechCtor();
    if (Ctor) startDictation(Ctor);
    else void startRecorder();
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
      s.addInteraction({ companyId: company.id, dealId: deal?.id, canal: p.canal, autorId: user.id, titulo: p.resultado, conteudo: text.trim(), kind: "note" }).catch((e) => reportError(e, "Não foi possível salvar o registro"));
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
    }).catch((e) => reportError(e, "Não foi possível salvar o registro da IA"));
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
      if (stageIndex(d2.funnel, p.etapaSugerida.stageId) <= stageIndex(d2.funnel, d2.stageId)) {
        return;
      }
      if (falta.length === 0) {
        const st = FUNNELS[d2.funnel].stages.find((x) => x.id === p.etapaSugerida!.stageId)!;
        const t = st.tarefas[0];
        fresh.moveDeal(d2.id, st.id, {
          nota: "Mudança sugerida pela IA a partir do registro do vendedor.",
          tarefas: t ? [{ companyId: company.id, dealId: d2.id, titulo: t.titulo, tipo: t.tipo, dueAt: p.proximoPasso.dueAt, ownerId: d2.ownerId, origem: "regra" }] : [],
        });
        const extra = useStore.getState().autoAdvanceDeal(d2.id, { ignoreHold: true });
        const landed = useStore.getState().deals.find((x) => x.id === d2.id);
        const nome = landed ? FUNNELS[landed.funnel].stages.find((x) => x.id === landed.stageId)?.nome ?? st.nome : st.nome;
        toast(`Etapa alterada para ${nome}`, { tone: "ai", sub: extra > 0 ? "Etapas já cumpridas foram avançadas automaticamente" : "Sugerida pela IA, confirmada por você" });
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
            <Button size="xs" variant={recording ? "primary" : "ghost"} onClick={toggleVoice} disabled={transcribing}>
              <Mic size={13} className={recording ? "animate-pulse" : ""} /> {transcribing ? "transcrevendo…" : recording ? "parar" : "áudio"}
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
