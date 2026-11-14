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

export interface RecordGoalConfig {
  /** Quantidade padrão de registros esperada por vendedor na janela base. */
  meta: number;
  /** Janela base configurada pelo gestor. */
  por: "dia" | "semana" | "mes";
  /** Meta individual opcional por vendedor (userId → quantidade na janela base). */
  porVendedor?: Record<string, number>;
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
  /** Meta de registros comerciais por vendedor (base da regressão para bater a meta financeira). */
  registros?: RecordGoalConfig;
}

export interface ProposalStandardItem {
  id: string;
  equipamento: string;
  especificacao: string;
  modalidade: "venda" | "comodato" | "locacao" | "cortesia";
  unidade: string;
  qtd: number;
  valorUnitario: number;
}

export interface ProposalStandardConfig {
  validadeDias: number;
  condicaoPagamento: string;
  prazoEntrega: string;
  frete: string;
  mostrarValores: boolean;
  descontoMaxPct: number;
  incluirInstitucional: boolean;
  observacoesPadrao: string;
  itensPadrao?: ProposalStandardItem[];
}

export interface AppConfig {
  stageRules: Record<string, StageRule>;
  activityRules: Partial<Record<ActivityType, ActivityRule>>;
  goals: Goals | null;
  /** Quem desligou o lembrete diário por WhatsApp. */
  remindersOff: string[];
  /** Padrão oficial da Proposta Comercial (alterado somente pelo Administrador). */
  proposalStandard?: ProposalStandardConfig | null;
}

export const EMPTY_CONFIG: AppConfig = {
  stageRules: {},
  activityRules: {},
  goals: null,
  remindersOff: [],
  proposalStandard: null,
};

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
  const rawReg = obj(goals.registros);
  const regPor: RecordGoalConfig["por"] = rawReg.por === "dia" || rawReg.por === "semana" || rawReg.por === "mes" ? rawReg.por : "mes";
  const regPorVendedorRaw = obj(rawReg.porVendedor);
  const regPorVendedor: Record<string, number> = {};
  for (const [k, v] of Object.entries(regPorVendedorRaw)) {
    if (typeof v === "number" && v > 0) regPorVendedor[k] = v;
  }
  const registros: RecordGoalConfig | undefined =
    typeof rawReg.meta === "number" && rawReg.meta > 0
      ? { meta: Math.round(rawReg.meta), por: regPor, porVendedor: regPorVendedor }
      : undefined;
  return {
    stageRules: obj(raw.stageRules) as AppConfig["stageRules"],
    activityRules: obj(raw.activityRules) as AppConfig["activityRules"],
    goals:
      typeof goals.anual === "number" && typeof goals.ano === "number"
        ? {
            ano: goals.ano,
            anual: goals.anual,
            porVendedor: obj(goals.porVendedor) as Record<string, number>,
            participantes: Array.isArray(goals.participantes) ? goals.participantes.filter((x): x is string => typeof x === "string") : [],
            atividades: Array.isArray(goals.atividades) ? (goals.atividades as ActivityTarget[]) : [],
            ...(registros ? { registros } : {}),
          }
        : null,
    remindersOff: Array.isArray(raw.remindersOff) ? raw.remindersOff.filter((x): x is string => typeof x === "string") : [],
    proposalStandard: (() => {
      const ps = obj(raw.proposalStandard);
      if (typeof ps.condicaoPagamento !== "string" && typeof ps.validadeDias !== "number") return null;
      const itens = Array.isArray(ps.itensPadrao)
        ? (ps.itensPadrao as ProposalStandardItem[]).filter((x) => x && typeof x.equipamento === "string")
        : undefined;
      return {
        validadeDias: typeof ps.validadeDias === "number" && ps.validadeDias > 0 ? Math.min(180, Math.round(ps.validadeDias)) : 15,
        condicaoPagamento: typeof ps.condicaoPagamento === "string" && ps.condicaoPagamento ? ps.condicaoPagamento : "28 dias",
        prazoEntrega: typeof ps.prazoEntrega === "string" && ps.prazoEntrega ? ps.prazoEntrega : "Imediato / até 5 dias úteis após aprovação",
        frete: typeof ps.frete === "string" && ps.frete ? ps.frete : "CIF — Entrega e implantação pela Tawper",
        mostrarValores: typeof ps.mostrarValores === "boolean" ? ps.mostrarValores : true,
        descontoMaxPct: typeof ps.descontoMaxPct === "number" ? Math.max(0, Math.min(90, ps.descontoMaxPct)) : 0,
        incluirInstitucional: typeof ps.incluirInstitucional === "boolean" ? ps.incluirInstitucional : true,
        observacoesPadrao: typeof ps.observacoesPadrao === "string" ? ps.observacoesPadrao : "",
        ...(itens && itens.length > 0 ? { itensPadrao: itens } : {}),
      };
    })(),
  };
}
