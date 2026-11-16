// Configuração do sistema editada em Configurações: regras de etapa, regras de atividade, metas e lembretes.

import {
  CONDICOES_PAGAMENTO,
  FUNNELS,
  OPCOES_ENTREGA_PADRAO,
  OPCOES_FRETE_PADRAO,
  OPCOES_VALIDADE_PADRAO,
  type Criterion,
  type StageDef,
  type SuggestedTask,
} from "./constants";
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

export interface AwardWeightsConfig {
  /** Peso da meta de vendas (0-100). */
  pesoVendas: number;
  /** Peso de atividades concluídas com clientes e pontualidade (0-100). */
  pesoAtividades: number;
  /** Peso de registros no CRM / uso ativo do sistema (0-100). */
  pesoRegistros: number;
  /** Peso de conversas no WhatsApp e qualidade dos pedidos à IA (0-100). */
  pesoQualidadeIA: number;
  /** Nota mínima de clareza/qualidade nos pedidos à IA (0-100%). */
  metaQualidadeIA: number;
  /** Quantidade esperada de registros pelo WhatsApp IA no mês. */
  metaConversasWhatsApp: number;
  /** % mínimo de atividades concluídas no prazo (0-100%). */
  metaPontualidade: number;
  /** Descrição opcional do prêmio ou campanha vigente. */
  premioDescricao?: string;
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
  /** Parâmetros da premiação multidimensional (Vendas + Atividades + Registros + Qualidade IA). */
  premiacao?: AwardWeightsConfig;
}

export interface ProposalStandardConfig {
  /** Prazo padrão de validade (dias) aplicado às novas propostas. */
  validadeDias: number;
  /** Lista de opções de validade disponíveis (ex.: [7, 15, 20, 30]). */
  validadesDias: number[];
  /** Condição de pagamento padrão. */
  condicaoPagamento: string;
  /** Lista editável de condições comerciais de pagamento (ex.: "28 dias", "28/56 dias"). */
  condicoesPagamento: string[];
  /** Prazo de entrega padrão. */
  prazoEntrega: string;
  /** Lista editável de prazos de entrega disponíveis. */
  opcoesEntrega: string[];
  /** Modalidade padrão de frete. */
  frete: string;
  /** Lista editável de opções de frete disponíveis. */
  opcoesFrete: string[];
  /** Define se valores do orçamento ERP aparecem na capa/resumo da proposta. */
  mostrarValores: boolean;
  /** Inclui os slides institucionais resumidos (< 10 páginas A4) junto ao orçamento ERP. */
  incluirInstitucional: boolean;
  /** Observações padrão incluídas nas condições comerciais. */
  observacoesPadrao: string;
}

export const DEFAULT_PROPOSAL_STANDARD: ProposalStandardConfig = {
  validadeDias: 15,
  validadesDias: [...OPCOES_VALIDADE_PADRAO],
  condicaoPagamento: CONDICOES_PAGAMENTO[1] ?? "28/56 dias",
  condicoesPagamento: [...CONDICOES_PAGAMENTO],
  prazoEntrega: OPCOES_ENTREGA_PADRAO[0],
  opcoesEntrega: [...OPCOES_ENTREGA_PADRAO],
  frete: OPCOES_FRETE_PADRAO[0],
  opcoesFrete: [...OPCOES_FRETE_PADRAO],
  mostrarValores: true,
  incluirInstitucional: true,
  observacoesPadrao:
    "Preços, itens e quantidades detalhados no orçamento oficial emitido no ERP Tawper (anexo integrante desta proposta).",
};

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

  const rawPrem = obj(goals.premiacao);
  const hasPrem =
    typeof rawPrem.pesoVendas === "number" ||
    typeof rawPrem.pesoAtividades === "number" ||
    typeof rawPrem.pesoRegistros === "number" ||
    typeof rawPrem.pesoQualidadeIA === "number";
  const numClamp = (v: unknown, fallback: number, min = 0, max = 100) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
  const premiacao: AwardWeightsConfig | undefined = hasPrem
    ? {
        pesoVendas: numClamp(rawPrem.pesoVendas, 40),
        pesoAtividades: numClamp(rawPrem.pesoAtividades, 20),
        pesoRegistros: numClamp(rawPrem.pesoRegistros, 20),
        pesoQualidadeIA: numClamp(rawPrem.pesoQualidadeIA, 20),
        metaQualidadeIA: numClamp(rawPrem.metaQualidadeIA, 80),
        metaConversasWhatsApp: numClamp(rawPrem.metaConversasWhatsApp, 15, 1, 500),
        metaPontualidade: numClamp(rawPrem.metaPontualidade, 80),
        ...(typeof rawPrem.premioDescricao === "string" && rawPrem.premioDescricao.trim()
          ? { premioDescricao: rawPrem.premioDescricao.trim().slice(0, 160) }
          : {}),
      }
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
            ...(premiacao ? { premiacao } : {}),
          }
        : null,
    remindersOff: Array.isArray(raw.remindersOff) ? raw.remindersOff.filter((x): x is string => typeof x === "string") : [],
    proposalStandard: (() => {
      const ps = obj(raw.proposalStandard);
      const hasAny =
        typeof ps.condicaoPagamento === "string" ||
        typeof ps.validadeDias === "number" ||
        Array.isArray(ps.condicoesPagamento) ||
        Array.isArray(ps.validadesDias);
      if (!hasAny) return null;

      const strList = (val: unknown, fallback: string[]) => {
        if (!Array.isArray(val)) return [...fallback];
        const clean = [...new Set(val.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean))];
        return clean.length > 0 ? clean : [...fallback];
      };
      const numList = (val: unknown, fallback: number[]) => {
        if (!Array.isArray(val)) return [...fallback];
        const clean = [
          ...new Set(
            val
              .map((x) => Math.round(Number(x)))
              .filter((n) => Number.isFinite(n) && n >= 1 && n <= 365),
          ),
        ].sort((a, b) => a - b);
        return clean.length > 0 ? clean : [...fallback];
      };

      const condicoesPagamento = strList(ps.condicoesPagamento, DEFAULT_PROPOSAL_STANDARD.condicoesPagamento);
      const validadesDias = numList(ps.validadesDias, DEFAULT_PROPOSAL_STANDARD.validadesDias);
      const opcoesFrete = strList(ps.opcoesFrete, DEFAULT_PROPOSAL_STANDARD.opcoesFrete);
      const opcoesEntrega = strList(ps.opcoesEntrega, DEFAULT_PROPOSAL_STANDARD.opcoesEntrega);

      const condicaoPagamento =
        typeof ps.condicaoPagamento === "string" && ps.condicaoPagamento.trim()
          ? ps.condicaoPagamento.trim()
          : condicoesPagamento[0];
      const validadeDias =
        typeof ps.validadeDias === "number" && ps.validadeDias > 0
          ? Math.min(365, Math.round(ps.validadeDias))
          : (validadesDias[0] ?? 15);
      const frete =
        typeof ps.frete === "string" && ps.frete.trim() ? ps.frete.trim() : opcoesFrete[0];
      const prazoEntrega =
        typeof ps.prazoEntrega === "string" && ps.prazoEntrega.trim()
          ? ps.prazoEntrega.trim()
          : opcoesEntrega[0];

      return {
        validadeDias,
        validadesDias: validadesDias.includes(validadeDias) ? validadesDias : [...validadesDias, validadeDias].sort((a, b) => a - b),
        condicaoPagamento,
        condicoesPagamento: condicoesPagamento.includes(condicaoPagamento) ? condicoesPagamento : [condicaoPagamento, ...condicoesPagamento],
        prazoEntrega,
        opcoesEntrega: opcoesEntrega.includes(prazoEntrega) ? opcoesEntrega : [prazoEntrega, ...opcoesEntrega],
        frete,
        opcoesFrete: opcoesFrete.includes(frete) ? opcoesFrete : [frete, ...opcoesFrete],
        mostrarValores: typeof ps.mostrarValores === "boolean" ? ps.mostrarValores : true,
        incluirInstitucional: typeof ps.incluirInstitucional === "boolean" ? ps.incluirInstitucional : true,
        observacoesPadrao: typeof ps.observacoesPadrao === "string" ? ps.observacoesPadrao : "",
      };
    })(),
  };
}
