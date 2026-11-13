// Configuração do sistema editada em Configurações: regras de etapa, regras de atividade, metas e lembretes.

import { FUNNELS, type Criterion, type StageDef, type SuggestedTask } from "./constants";
import type { ActivityType, FunnelId } from "./types";

export interface StageRule {
  limiteDias?: number;
  /** Critérios padrão desligados (ids de constants.ts). */
  removidos?: string[];
  /** Critérios criados pelo administrador: sempre uma confirmação (sim/não). */
  extras?: { id: string; label: string }[];
  /** Substitui as tarefas sugeridas ao entrar na etapa. */
  tarefas?: SuggestedTask[];
}

export interface ActivityRule {
  exigeResultado: boolean;
  exigeProximo: boolean;
  proximoTipo?: ActivityType;
  proximoPrazoDias?: number;
}

export interface ActivityTarget {
  tipo: ActivityType;
  quantidade: number;
  por: "dia" | "semana" | "mes";
}

export interface Goals {
  ano: number;
  /** Meta anual da empresa, em reais. */
  anual: number;
  /** Meta anual de cada vendedor (id → reais). Sem valor, divide o que sobra por igual. */
  porVendedor: Record<string, number>;
  /** Administradores e gestores que também vendem (ex.: o diretor): entram nas metas e no pódio. */
  participantes?: string[];
  atividades: ActivityTarget[];
}

export interface AppConfig {
  stageRules: Record<string, StageRule>;
  activityRules: Partial<Record<ActivityType, ActivityRule>>;
  goals: Goals | null;
  /** Quem desligou o lembrete diário por WhatsApp. */
  remindersOff: string[];
}

export const EMPTY_CONFIG: AppConfig = { stageRules: {}, activityRules: {}, goals: null, remindersOff: [] };

export const stageRuleKey = (funnel: FunnelId, stageId: string) => `${funnel}:${stageId}`;

/** Regra padrão: resultado livre, próximo passo obrigatório (toda conta ativa tem um próximo passo). */
export const DEFAULT_ACTIVITY_RULE: ActivityRule = { exigeResultado: false, exigeProximo: true };

export function activityRuleFor(config: AppConfig, tipo: ActivityType): ActivityRule {
  return { ...DEFAULT_ACTIVITY_RULE, ...config.activityRules[tipo] };
}

/** Definição original de cada etapa (constants.ts), guardada antes de qualquer regra ser aplicada. */
const BASE = new Map<string, Pick<StageDef, "limiteDias" | "criterios" | "tarefas">>();
for (const funnel of Object.values(FUNNELS)) {
  for (const st of funnel.stages) BASE.set(stageRuleKey(st.funnel, st.id), { limiteDias: st.limiteDias, criterios: [...st.criterios], tarefas: [...st.tarefas] });
}

export function baseStage(funnel: FunnelId, stageId: string) {
  return BASE.get(stageRuleKey(funnel, stageId));
}

/**
 * Aplica as regras de etapa sobre FUNNELS (no lugar): todo o sistema, tela e agente, lê as etapas dali.
 * Sempre parte da definição original, então pode ser chamada quantas vezes for preciso.
 */
export function applyStageRules(rules: Record<string, StageRule> = {}) {
  for (const funnel of Object.values(FUNNELS)) {
    for (const st of funnel.stages) {
      const base = BASE.get(stageRuleKey(st.funnel, st.id))!;
      const rule = rules[stageRuleKey(st.funnel, st.id)] ?? {};
      const off = new Set(rule.removidos ?? []);
      const extras: Criterion[] = (rule.extras ?? []).map((x) => ({ id: x.id, label: x.label, kind: "check" }));
      st.limiteDias = rule.limiteDias ?? base.limiteDias;
      st.criterios = [...base.criterios.filter((c) => !off.has(c.id)), ...extras];
      st.tarefas = rule.tarefas ?? base.tarefas;
    }
  }
}

/** Aceita o que veio do banco sem confiar no formato. */
export function parseConfig(raw: Partial<Record<keyof AppConfig, unknown>>): AppConfig {
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const goals = obj(raw.goals);
  return {
    stageRules: obj(raw.stageRules) as AppConfig["stageRules"],
    activityRules: obj(raw.activityRules) as AppConfig["activityRules"],
    goals:
      typeof goals.anual === "number" && typeof goals.ano === "number"
        ? { ano: goals.ano, anual: goals.anual, porVendedor: obj(goals.porVendedor) as Record<string, number>, participantes: Array.isArray(goals.participantes) ? goals.participantes.filter((x): x is string => typeof x === "string") : [], atividades: Array.isArray(goals.atividades) ? (goals.atividades as ActivityTarget[]) : [] }
        : null,
    remindersOff: Array.isArray(raw.remindersOff) ? raw.remindersOff.filter((x): x is string => typeof x === "string") : [],
  };
}
