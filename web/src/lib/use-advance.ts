"use client";

import { FUNNELS, getStage } from "./constants";
import { rel } from "./dates";
import { missingCriteria } from "./selectors";
import { useStore } from "./store";
import type { Company, Deal } from "./types";
import { useUI } from "./ui-store";

/**
 * "Avançar" de um clique, igual no perfil da empresa e na conversa: se a próxima etapa é a venda,
 * abre o registro de venda; se falta critério, abre a validação da etapa; senão avança direto.
 */
export function useAdvanceDeal() {
  const { open, toast } = useUI();

  const nextStageOf = (deal?: Deal) => {
    if (!deal) return undefined;
    const stages = FUNNELS[deal.funnel].stages;
    return stages[stages.findIndex((x) => x.id === deal.stageId) + 1];
  };

  const advance = (deal: Deal, company: Company) => {
    const s = useStore.getState();
    const nextStage = nextStageOf(deal);
    if (!nextStage) return;
    if (nextStage.terminal) {
      open({ kind: "win", dealId: deal.id });
      return;
    }
    if (missingCriteria(s, deal, company).length) {
      open({ kind: "move", dealId: deal.id, toStageId: nextStage.id });
      return;
    }
    const hops = s.autoAdvanceDeal(deal.id, { ignoreHold: true });
    const fresh = useStore.getState().deals.find((d) => d.id === deal.id);
    const landed = fresh ? getStage(fresh.funnel, fresh.stageId) : nextStage;
    if (hops) {
      toast(`Etapa alterada para ${landed.nome}`, { sub: hops > 1 ? "Etapas já cumpridas foram avançadas automaticamente" : undefined });
      return;
    }
    const t = nextStage.tarefas[0];
    s.moveDeal(deal.id, nextStage.id, {
      tarefas: t ? [{ companyId: company.id, dealId: deal.id, titulo: t.titulo, tipo: t.tipo, dueAt: rel(t.prazoDias, 10), ownerId: deal.ownerId, origem: "regra" }] : [],
    });
    toast(`Etapa alterada para ${nextStage.nome}`, { sub: t ? `Próximo passo criado: ${t.titulo.toLowerCase()}` : undefined });
  };

  return { advance, nextStageOf };
}
