"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { TypeIcon } from "@/components/crm/crm";
import { Button, Card, PageHeader, Select } from "@/components/ui/primitives";
import { activityRuleFor, type ActivityRule } from "@/lib/config";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { useStore } from "@/lib/store";
import type { ActivityType } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { useAction } from "@/lib/use-action";

/** Requisitos das atividades: o que cada tipo exige para ser concluído e qual próximo passo o sistema sugere. */
export default function AtividadesConfigPage() {
  const config = useStore((s) => s.config);
  const saveConfig = useStore((s) => s.saveConfig);
  const toast = useUI((s) => s.toast);
  const action = useAction();
  const [rules, setRules] = useState<Record<string, ActivityRule>>(() => Object.fromEntries(ACTIVITY_TYPES.map((t) => [t, activityRuleFor(config, t)])));
  const set = (tipo: ActivityType, patch: Partial<ActivityRule>) => setRules((r) => ({ ...r, [tipo]: { ...r[tipo], ...patch } }));

  const save = () =>
    void action.run(async () => {
      await saveConfig("activityRules", rules);
      toast("Requisitos das atividades salvos", { sub: "Valem na próxima atividade concluída na tela" });
    });

  return (
    <div>
      <PageHeader
        title="Requisitos das atividades"
        subtitle="Para cada tipo de atividade: o que é obrigatório ao concluir e qual próximo passo o sistema já deixa sugerido. Assim nenhuma conta fica sem continuidade."
        actions={
          <Button variant="primary" onClick={save} disabled={action.busy}>
            <Save size={15} /> {action.busy ? "Salvando…" : "Salvar"}
          </Button>
        }
      />
      {action.error && <div className="mb-3 rounded-[6px] bg-brand-soft px-3 py-2 text-[12.5px] font-medium text-brand">{action.error}</div>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11.5px] tracking-wide text-muted uppercase">
              <th className="px-4 py-2.5 font-medium">Tipo de atividade</th>
              <th className="px-3 py-2.5 font-medium">Exige resultado escrito</th>
              <th className="px-3 py-2.5 font-medium">Exige próximo passo</th>
              <th className="px-3 py-2.5 font-medium">Próximo passo sugerido</th>
              <th className="px-3 py-2.5 font-medium">Prazo sugerido</th>
            </tr>
          </thead>
          <tbody>
            {ACTIVITY_TYPES.map((tipo) => {
              const r = rules[tipo];
              return (
                <tr key={tipo} className="border-b border-line/70 last:border-b-0">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 font-medium text-ink">
                      <TypeIcon tipo={tipo} size={15} className="text-navy-3" /> {tipo}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" className="size-4 accent-[#0a1d3f]" checked={r.exigeResultado} onChange={(e) => set(tipo, { exigeResultado: e.target.checked })} aria-label={`${tipo}: exige resultado escrito`} />
                  </td>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" className="size-4 accent-[#0a1d3f]" checked={r.exigeProximo} onChange={(e) => set(tipo, { exigeProximo: e.target.checked })} aria-label={`${tipo}: exige próximo passo`} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Select value={r.proximoTipo ?? ""} onChange={(e) => set(tipo, { proximoTipo: (e.target.value || undefined) as ActivityType | undefined })} className="h-9 w-44" aria-label={`${tipo}: próximo passo sugerido`}>
                      <option value="">O da etapa do funil</option>
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <input
                        type="number"
                        min={0}
                        max={90}
                        placeholder="etapa"
                        value={r.proximoPrazoDias ?? ""}
                        onChange={(e) => set(tipo, { proximoPrazoDias: e.target.value === "" ? undefined : Math.max(0, Math.min(90, Number(e.target.value))) })}
                        className="h-9 w-20 rounded-[6px] border border-line px-2 text-[13px] text-ink"
                        aria-label={`${tipo}: prazo sugerido em dias`}
                      />
                      dias
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-[12px] text-muted">Exemplo: marcar “Exige resultado escrito” em Visita obriga o vendedor a contar o que aconteceu antes de concluir. Desmarcar “Exige próximo passo” em Suporte permite encerrar um chamado sem agendar outra tarefa.</p>
    </div>
  );
}
