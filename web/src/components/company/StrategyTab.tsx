"use client";

import { Check, Copy, History, Lightbulb, Pencil, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { AIBadge, AIPanel, AIThinking } from "@/components/ai/ai";
import { TypeIcon, userName } from "@/components/crm/crm";
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { copilotFor } from "@/lib/ai";
import { fmtDate, fmtDue, fromInputDate, rel, toInputDate } from "@/lib/dates";
import { useStore } from "@/lib/store";
import type { AISuggestion, Company } from "@/lib/types";
import { useUI } from "@/lib/ui-store";

/** Copiloto estratégico (seção 9.2) com aprovação humana (RN-11). */
export function CopilotCard({ company, compact }: { company: Company; compact?: boolean }) {
  const s = useStore();
  const { toast } = useUI();
  const [thinking, setThinking] = useState(false);
  const [criarAcoes, setCriarAcoes] = useState(true);
  const pending = s.suggestions.find((x) => x.companyId === company.id && x.status === "pendente" && x.tipo === "estrategia");

  const generate = () => {
    setThinking(true);
    setTimeout(() => {
      const fresh = useStore.getState();
      const c = copilotFor(fresh, company.id);
      fresh.addSuggestion({ companyId: company.id, tipo: "estrategia", titulo: c.titulo, texto: c.texto, detalhes: c.detalhes, base: c.base, faltantes: c.faltantes });
      setThinking(false);
    }, 2200);
  };

  const decide = (sg: AISuggestion, d: "aprovada" | "descartada") => {
    s.decideSuggestion(sg.id, d, { criarAcoes });
    toast(d === "aprovada" ? "Estratégia aprovada e registrada" : "Sugestão descartada", {
      tone: d === "aprovada" ? "ai" : "info",
      sub: d === "aprovada" ? (criarAcoes && sg.detalhes ? `${sg.detalhes.acoes.length} ações criadas na agenda` : "Nova versão da estratégia salva") : "Decisão registrada na auditoria",
    });
  };

  if (thinking)
    return (
      <AIPanel title="Copiloto estratégico">
        <AIThinking steps={["Lendo cadastro, pessoas e histórico", "Comparando com a etapa e o concorrente", "Buscando casos semelhantes aprovados", "Escrevendo diagnóstico e plano"]} className="border-0 bg-transparent p-0" />
      </AIPanel>
    );

  if (!pending)
    return (
      <AIPanel title="Copiloto estratégico">
        <p className="text-[12.5px] text-ink/80">Peça à IA um diagnóstico da conta, hipóteses de bloqueio, próximas ações, perguntas para o cliente e um rascunho de mensagem.</p>
        <Button variant="ai" size="sm" className="mt-3" onClick={generate}>
          <Sparkles size={14} /> Gerar sugestão estratégica
        </Button>
        <p className="mt-2 text-[11px] text-muted">Toda recomendação indica os dados usados. Nada muda sem aprovação humana.</p>
      </AIPanel>
    );

  const d = pending.detalhes;
  return (
    <AIPanel
      title="Sugestão do copiloto"
      action={<Badge tone="amber">aguardando aprovação</Badge>}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {d && !compact && <Checkbox checked={criarAcoes} onChange={setCriarAcoes} label={<span className="text-[12px]">Criar as {d.acoes.length} ações na agenda</span>} />}
          <div className="ml-auto flex gap-2">
            <Button size="xs" variant="ghost" onClick={() => decide(pending, "descartada")}>
              <X size={13} /> Descartar
            </Button>
            <Button size="xs" variant="ai" onClick={() => decide(pending, "aprovada")}>
              <Check size={13} /> Aprovar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 text-[12.5px]">
        <div>
          <div className="text-[14px] font-semibold text-ink">{pending.titulo}</div>
          <p className="mt-0.5 text-ink/80">{pending.texto}</p>
        </div>
        {d && !compact && (
          <>
            <div>
              <div className="label">Diagnóstico</div>
              <p className="text-ink/85">{d.diagnostico}</p>
            </div>
            <div>
              <div className="label">Hipóteses de bloqueio</div>
              <ul className="square-list mt-0.5 space-y-0.5 text-ink/85">
                {d.hipoteses.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label">Próximas ações</div>
              <ul className="mt-1 space-y-1">
                {d.acoes.map((a) => (
                  <li key={a.titulo} className="flex items-center gap-2 rounded-[4px] bg-soft/60 px-2 py-1.5 text-ink">
                    <TypeIcon tipo={a.tipo} size={13} className="text-navy-3" />
                    <span className="flex-1">{a.titulo}</span>
                    <span className="text-[11px] text-muted">{fmtDue(rel(a.prazoDias))}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label">Perguntas para fazer ao cliente</div>
              <ul className="square-list mt-0.5 space-y-0.5 text-ink/85">
                {d.perguntas.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-[6px] border border-line bg-soft/40 p-2.5">
              <div className="flex items-center justify-between">
                <div className="label">Rascunho de WhatsApp</div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy-3 hover:text-brand"
                  onClick={() => {
                    navigator.clipboard?.writeText(d.rascunho).catch(() => {});
                    toast("Rascunho copiado", { tone: "info" });
                  }}
                >
                  <Copy size={12} /> copiar
                </button>
              </div>
              <p className="mt-1 text-ink/85 italic">“{d.rascunho}”</p>
            </div>
          </>
        )}
        <div className="rounded-[5px] bg-ai-soft/60 p-2.5">
          <div className="label text-ai">Baseado em</div>
          <ul className="mt-0.5 space-y-0.5 text-[11.5px] text-ink/75">
            {pending.base.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
          {pending.faltantes.length > 0 && (
            <>
              <div className="label mt-2 text-warn">Faltam dados — a IA pergunta em vez de inventar</div>
              <ul className="mt-0.5 space-y-0.5 text-[11.5px] text-warn">
                {pending.faltantes.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </AIPanel>
  );
}

export function StrategyTab({ company }: { company: Company }) {
  const s = useStore();
  const { toast } = useUI();
  const strategy = s.strategies.find((x) => x.companyId === company.id);
  const history = s.strategyHistory.filter((x) => x.companyId === company.id);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    objetivo: strategy?.objetivo ?? "",
    diagnostico: strategy?.diagnostico ?? "",
    barreira: strategy?.barreira ?? "",
    estrategia: strategy?.estrategia ?? "",
    resultadoEsperado: strategy?.resultadoEsperado ?? "",
    proximaRevisao: toInputDate(strategy?.proximaRevisao ?? rel(14)),
  });

  const save = () => {
    s.saveStrategy(company.id, { ...f, proximaRevisao: fromInputDate(f.proximaRevisao) });
    setEditing(false);
    toast("Estratégia salva", { sub: "Versão anterior mantida no histórico" });
  };

  return (
    <div className="grid gap-5 p-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader
            kicker={strategy ? `Estratégia vigente · v${strategy.versao}` : "Estratégia da conta"}
            title={strategy?.objetivo ?? "Nenhuma estratégia registrada"}
            action={
              !editing && (
                <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil size={12} /> {strategy ? "Revisar" : "Definir"}
                </Button>
              )
            }
          />
          {editing ? (
            <div className="space-y-3 p-4">
              <Field label="Objetivo comercial atual">
                <Input value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} />
              </Field>
              <Field label="Diagnóstico">
                <Textarea value={f.diagnostico} onChange={(e) => setF({ ...f, diagnostico: e.target.value })} rows={2} />
              </Field>
              <Field label="Barreira principal">
                <Input value={f.barreira} onChange={(e) => setF({ ...f, barreira: e.target.value })} />
              </Field>
              <Field label="Estratégia definida">
                <Textarea value={f.estrategia} onChange={(e) => setF({ ...f, estrategia: e.target.value })} rows={2} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Resultado esperado">
                  <Input value={f.resultadoEsperado} onChange={(e) => setF({ ...f, resultadoEsperado: e.target.value })} />
                </Field>
                <Field label="Próxima revisão">
                  <Input type="date" value={f.proximaRevisao} onChange={(e) => setF({ ...f, proximaRevisao: e.target.value })} />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button size="sm" variant="primary" onClick={save} disabled={!f.objetivo.trim() || !f.estrategia.trim()}>
                  Salvar nova versão
                </Button>
              </div>
            </div>
          ) : strategy ? (
            <dl className="grid gap-3 p-4 text-[12.5px]">
              {[
                ["Diagnóstico", strategy.diagnostico],
                ["Barreira principal", strategy.barreira],
                ["Estratégia definida", strategy.estrategia],
                ["Resultado esperado", strategy.resultadoEsperado],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="label">{k}</dt>
                  <dd className="mt-0.5 text-ink/85">{v}</dd>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3 text-[11.5px] text-muted">
                Definida por {userName(s.users, strategy.definidoPorId)} em {fmtDate(strategy.revisadaEm)} · revisão {fmtDue(strategy.proximaRevisao)}
                {strategy.origem === "ia-aprovada" && <AIBadge label="sugestão da IA aprovada" />}
              </div>
            </dl>
          ) : (
            <div className="p-4 text-[12.5px] text-muted">
              <Lightbulb size={14} className="mr-1 inline text-warn" /> Toda conta ativa deveria ter uma estratégia. Use o copiloto ao lado para começar.
            </div>
          )}
        </Card>

        {history.length > 0 && (
          <Card className="shadow-none">
            <CardHeader kicker="Histórico de estratégias" title={`${history.length} versão(ões) anterior(es)`} action={<History size={15} className="text-muted" />} />
            <ul>
              {history.map((h) => (
                <li key={`${h.versao}-${h.revisadaEm}`} className="border-b border-line/70 px-4 py-2.5 text-[12.5px] last:border-b-0">
                  <div className="font-semibold text-ink">
                    v{h.versao} · {h.objetivo}
                  </div>
                  <div className="text-ink/70">{h.estrategia}</div>
                  <div className="text-[11px] text-muted">
                    {userName(s.users, h.definidoPorId)} · {fmtDate(h.revisadaEm)}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <CopilotCard company={company} />
    </div>
  );
}
