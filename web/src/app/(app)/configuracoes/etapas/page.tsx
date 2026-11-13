"use client";

import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, Input, PageHeader, Segmented, Select } from "@/components/ui/primitives";
import { baseStage, stageRuleKey, type StageRule } from "@/lib/config";
import { ACTIVITY_TYPES, FUNNELS, type SuggestedTask } from "@/lib/constants";
import { useStore } from "@/lib/store";
import type { ActivityType, FunnelId } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { useAction } from "@/lib/use-action";
import { normalize } from "@/lib/utils";

/** Requisitos das etapas: prazo, o que precisa estar cumprido para avançar e as tarefas criadas ao entrar. */
export default function EtapasConfigPage() {
  const saved = useStore((s) => s.config.stageRules);
  const saveConfig = useStore((s) => s.saveConfig);
  const toast = useUI((s) => s.toast);
  const action = useAction();
  const [funnel, setFunnel] = useState<FunnelId>("aquisicao");
  const [rules, setRules] = useState<Record<string, StageRule>>(saved);
  const [novo, setNovo] = useState<Record<string, string>>({});
  const patch = (key: string, p: Partial<StageRule>) => setRules((r) => ({ ...r, [key]: { ...r[key], ...p } }));

  const save = () =>
    void action.run(async () => {
      await saveConfig("stageRules", rules);
      toast("Requisitos das etapas salvos", { sub: "Já valem para a tela e para o agente do WhatsApp" });
    });

  return (
    <div>
      <PageHeader
        title="Requisitos das etapas"
        subtitle="O que o vendedor precisa cumprir para sair de cada etapa, quantos dias a conta pode ficar nela e quais tarefas o sistema cria ao entrar."
        actions={
          <>
            <Segmented value={funnel} onChange={setFunnel} options={[{ value: "aquisicao", label: "Aquisição" }, { value: "recorrencia", label: "Recorrência" }]} />
            <Button variant="primary" onClick={save} disabled={action.busy}>
              <Save size={15} /> {action.busy ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      />
      {action.error && <div className="mb-3 rounded-[6px] bg-brand-soft px-3 py-2 text-[12.5px] font-medium text-brand">{action.error}</div>}
      <div className="space-y-4">
        {FUNNELS[funnel].stages
          .filter((st) => !st.terminal)
          .map((st, index) => {
            const key = stageRuleKey(funnel, st.id);
            const base = baseStage(funnel, st.id)!;
            const rule = rules[key] ?? {};
            const off = new Set(rule.removidos ?? []);
            const extras = rule.extras ?? [];
            const tarefas: SuggestedTask[] = rule.tarefas ?? base.tarefas;
            const setTarefas = (next: SuggestedTask[]) => patch(key, { tarefas: next });
            const addCriterio = () => {
              const label = (novo[key] ?? "").trim();
              if (!label) return;
              const id = `x_${normalize(label).replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`;
              if (!extras.some((x) => x.id === id)) patch(key, { extras: [...extras, { id, label }] });
              setNovo((n) => ({ ...n, [key]: "" }));
            };
            return (
              <Card key={key}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold text-ink">
                      {index + 1}. {st.nome}
                    </div>
                    <div className="text-[12px] text-muted">{st.objetivo}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-[12.5px] text-muted">
                      Limite de
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={rule.limiteDias ?? base.limiteDias}
                        onChange={(e) => patch(key, { limiteDias: Math.max(1, Math.min(365, Number(e.target.value) || base.limiteDias)) })}
                        className="h-9 w-16 rounded-[6px] border border-line px-2 text-center text-[13px] text-ink"
                        aria-label={`${st.nome}: limite de dias na etapa`}
                      />
                      dias
                    </label>
                    {rules[key] && (
                      <Button size="xs" variant="ghost" title="Voltar esta etapa ao padrão" onClick={() => setRules((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key)))}>
                        <RotateCcw size={13} /> Padrão
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-5 p-4 lg:grid-cols-2">
                  <div>
                    <div className="label mb-2">Para avançar, precisa de</div>
                    <ul className="space-y-1.5">
                      {base.criterios.map((c) => (
                        <li key={c.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
                            <input
                              type="checkbox"
                              className="size-4 accent-[#0a1d3f]"
                              checked={!off.has(c.id)}
                              onChange={(e) => patch(key, { removidos: e.target.checked ? [...off].filter((id) => id !== c.id) : [...off, c.id] })}
                            />
                            {c.label}
                            <span className="text-[11px] text-muted">{c.kind === "check" ? "confirmação" : c.kind === "contact" ? "contato" : "campo do cadastro"}</span>
                          </label>
                        </li>
                      ))}
                      {extras.map((x) => (
                        <li key={x.id} className="flex items-center gap-2.5 text-[13px] text-ink">
                          <input type="checkbox" className="size-4 accent-[#0a1d3f]" checked readOnly aria-hidden tabIndex={-1} />
                          <span className="flex-1">{x.label}</span>
                          <button type="button" className="text-muted hover:text-brand" aria-label={`Remover ${x.label}`} onClick={() => patch(key, { extras: extras.filter((e) => e.id !== x.id) })}>
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                      {base.criterios.length + extras.length === 0 && <li className="text-[12.5px] text-muted">Nenhum requisito: a conta avança livremente.</li>}
                    </ul>
                    <div className="mt-2.5 flex gap-2">
                      <Input
                        value={novo[key] ?? ""}
                        onChange={(e) => setNovo((n) => ({ ...n, [key]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addCriterio()}
                        placeholder="Novo requisito. Ex.: Visita técnica realizada"
                        className="h-9 text-[13px]"
                      />
                      <Button size="sm" variant="outline" onClick={addCriterio} disabled={!(novo[key] ?? "").trim()}>
                        <Plus size={14} /> Incluir
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="label mb-2">Ao entrar na etapa, o sistema cria</div>
                    <ul className="space-y-2">
                      {tarefas.map((t, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2">
                          <Input value={t.titulo} onChange={(e) => setTarefas(tarefas.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} className="h-9 min-w-[180px] flex-1 text-[13px]" aria-label="Título da tarefa" />
                          <Select value={t.tipo} onChange={(e) => setTarefas(tarefas.map((x, j) => (j === i ? { ...x, tipo: e.target.value as ActivityType } : x)))} className="h-9 w-32 text-[13px]" aria-label="Tipo da tarefa">
                            {ACTIVITY_TYPES.map((a) => (
                              <option key={a}>{a}</option>
                            ))}
                          </Select>
                          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                            em
                            <input
                              type="number"
                              min={0}
                              max={90}
                              value={t.prazoDias}
                              onChange={(e) => setTarefas(tarefas.map((x, j) => (j === i ? { ...x, prazoDias: Math.max(0, Math.min(90, Number(e.target.value) || 0)) } : x)))}
                              className="h-9 w-14 rounded-[6px] border border-line px-2 text-center text-[13px] text-ink"
                              aria-label="Prazo em dias"
                            />
                            d
                          </span>
                          <button type="button" className="text-muted hover:text-brand" aria-label="Remover tarefa" onClick={() => setTarefas(tarefas.filter((_, j) => j !== i))}>
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                      {tarefas.length === 0 && <li className="text-[12.5px] text-muted">Nenhuma tarefa automática.</li>}
                    </ul>
                    <Button size="sm" variant="outline" className="mt-2.5" onClick={() => setTarefas([...tarefas, { titulo: "", tipo: "Ligação", prazoDias: 3 }])}>
                      <Plus size={14} /> Incluir tarefa
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
      </div>
      <p className="mt-3 text-[12px] text-muted">As etapas em si (nome e ordem) não mudam por aqui: elas amarram o histórico dos negócios e o agente do WhatsApp.</p>
    </div>
  );
}
