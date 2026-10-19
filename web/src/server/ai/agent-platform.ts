export type AgentKey =
  | "orchestrator"
  | "assistant_analytic"
  | "strategic_copilot"
  | "quick_note"
  | "next_step"
  | "conversation_summary"
  | "conversation_router"
  | "visit_route"
  | "lead_extractor"
  | "daily_briefing"
  | "manager_digest"
  | "transcription"
  | "conversation"
  | "operations";
export type ToolRisk = "read" | "write" | "external";

export interface AgentDefinition {
  key: AgentKey;
  purpose: string;
  modelProfile: "fast" | "reasoning";
  promptVersion: string;
  maxSteps: number;
  tools: { name: string; risk: ToolRisk }[];
}

export const AGENTS: Record<AgentKey, AgentDefinition> = {
  orchestrator: {
    key: "orchestrator",
    purpose: "Classificar a intenção, montar o plano e delegar sem responder pelo especialista.",
    modelProfile: "fast",
    promptVersion: "route-v1",
    maxSteps: 2,
    tools: [],
  },
  assistant_analytic: {
    key: "assistant_analytic",
    purpose: "Responder perguntas sobre operação, tarefas, contas e indicadores com blocos visuais.",
    modelProfile: "fast",
    promptVersion: "assistant-v2",
    maxSteps: 4,
    tools: [
      { name: "read_crm", risk: "read" },
      { name: "read_metrics", risk: "read" },
      { name: "search_knowledge", risk: "read" },
    ],
  },
  strategic_copilot: {
    key: "strategic_copilot",
    purpose: "Propor estratégia comercial usando fatos canônicos, evidências e lacunas reais.",
    modelProfile: "reasoning",
    promptVersion: "copilot-v2",
    maxSteps: 5,
    tools: [
      { name: "read_company", risk: "read" },
      { name: "search_knowledge", risk: "read" },
      { name: "propose_activities", risk: "write" },
    ],
  },
  quick_note: {
    key: "quick_note",
    purpose: "Transformar uma anotação livre em proposta estruturada, sem alterar o CRM.",
    modelProfile: "fast",
    promptVersion: "quick-note-v2",
    maxSteps: 2,
    tools: [{ name: "read_company", risk: "read" }, { name: "propose_activity", risk: "write" }],
  },
  next_step: {
    key: "next_step",
    purpose: "Sugerir um próximo passo a partir do resultado e do contexto cadastrado.",
    modelProfile: "fast",
    promptVersion: "next-step-v2",
    maxSteps: 2,
    tools: [{ name: "read_company", risk: "read" }, { name: "propose_activity", risk: "write" }],
  },
  conversation_summary: {
    key: "conversation_summary",
    purpose: "Resumir fatos, objeções e compromissos de uma conversa.",
    modelProfile: "fast",
    promptVersion: "conversation-summary-v2",
    maxSteps: 2,
    tools: [{ name: "read_conversation", risk: "read" }],
  },
  conversation_router: {
    key: "conversation_router",
    purpose: "Encaminhar conversa conhecida ao dono da carteira e deixar ambiguidades na fila.",
    modelProfile: "fast",
    promptVersion: "conversation-routing-rule-v1",
    maxSteps: 1,
    tools: [{ name: "read_contact_owner", risk: "read" }],
  },
  visit_route: {
    key: "visit_route",
    purpose: "Ordenar visitas entre candidatos reais, sem criar empresas.",
    modelProfile: "fast",
    promptVersion: "visit-route-v2",
    maxSteps: 2,
    tools: [{ name: "read_route_candidates", risk: "read" }],
  },
  lead_extractor: {
    key: "lead_extractor",
    purpose: "Extrair uma proposta de cadastro de lead a partir de mensagens.",
    modelProfile: "fast",
    promptVersion: "lead-extraction-v2",
    maxSteps: 2,
    tools: [{ name: "read_conversation", risk: "read" }, { name: "propose_lead", risk: "write" }],
  },
  daily_briefing: {
    key: "daily_briefing",
    purpose: "Organizar prioridades diárias sem modificar os fatos calculados.",
    modelProfile: "fast",
    promptVersion: "daily-briefing-v2",
    maxSteps: 2,
    tools: [{ name: "read_daily_metrics", risk: "read" }],
  },
  manager_digest: {
    key: "manager_digest",
    purpose: "Sintetizar indicadores gerenciais sem inventar números.",
    modelProfile: "reasoning",
    promptVersion: "manager-digest-v2",
    maxSteps: 2,
    tools: [{ name: "read_management_metrics", risk: "read" }],
  },
  transcription: {
    key: "transcription",
    purpose: "Converter áudio curto em texto, sem executar ações comerciais.",
    modelProfile: "fast",
    promptVersion: "transcription-v1",
    maxSteps: 1,
    tools: [],
  },
  conversation: {
    key: "conversation",
    purpose: "Resumir conversas, extrair fatos e preparar respostas.",
    modelProfile: "fast",
    promptVersion: "conversation-agent-v1",
    maxSteps: 4,
    tools: [
      { name: "read_conversation", risk: "read" },
      { name: "propose_message", risk: "write" },
    ],
  },
  operations: {
    key: "operations",
    purpose: "Preparar rotinas, formulários e trabalhos assíncronos.",
    modelProfile: "fast",
    promptVersion: "operations-agent-v1",
    maxSteps: 4,
    tools: [
      { name: "enqueue_form", risk: "external" },
      { name: "enqueue_indexing", risk: "write" },
    ],
  },
};

export interface AgentPlan {
  agent: AgentKey;
  intent: "lookup" | "tasks" | "metrics" | "strategy" | "conversation" | "automation";
  steps: { number: number; action: string; tool?: string }[];
  requiresApproval: boolean;
}

export function planForQuestion(question: string): AgentPlan {
  const value = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const intent: AgentPlan["intent"] = /enviar|formulario|automat/.test(value)
    ? "automation"
    : /tarefa|atividade|pendencia/.test(value)
    ? "tasks"
    : /venda|fatur|resultado|indicador|grafico|compar/.test(value)
      ? "metrics"
      : /estrateg|plano|negoci/.test(value)
        ? "strategy"
        : /whatsapp|conversa|mensagem/.test(value)
          ? "conversation"
          : "lookup";
  const agent: AgentKey = intent === "strategy" ? "strategic_copilot" : intent === "conversation" ? "conversation" : intent === "automation" ? "operations" : "assistant_analytic";
  const tools = AGENTS[agent].tools;
  return {
    agent,
    intent,
    steps: tools.slice(0, AGENTS[agent].maxSteps).map((tool, index) => ({ number: index + 1, action: tool.name.replaceAll("_", " "), tool: tool.name })),
    requiresApproval: tools.some((tool) => tool.risk !== "read"),
  };
}

export function canExecuteTool(risk: ToolRisk, options: { serverAuthenticated: boolean; humanApproved: boolean }) {
  if (!options.serverAuthenticated) return false;
  if (risk === "read") return true;
  return options.humanApproved;
}

export type ConversationAgentIntent = "summarize" | "route_conversation" | "extract_lead" | "draft_reply";

export function planConversationAgent(intent: ConversationAgentIntent) {
  const toolByIntent = {
    summarize: "summarize_conversation",
    route_conversation: "route_from_portfolio",
    extract_lead: "propose_lead",
    draft_reply: "propose_message",
  } as const;
  return {
    agent: "conversation" as const,
    intent,
    steps: ["read_conversation", toolByIntent[intent]],
    externalSideEffect: false,
    requiresApproval: intent === "extract_lead" || intent === "draft_reply",
  };
}
