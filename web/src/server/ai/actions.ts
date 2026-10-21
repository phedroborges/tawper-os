"use server";

import { gateway } from "@ai-sdk/gateway";
import { experimental_transcribe as transcribe } from "ai";
import type { AssistantAnswer, AssistantBlock, CopilotResult, DailyBriefing, ExtractedLead, ManagerDigest, QuickProposal } from "@/lib/ai";
import { canonicalWhatsApp } from "@/lib/br-ids";
import { ACTIVITY_TYPES } from "@/lib/constants";
import type { ActivityType, ConversationSummary } from "@/lib/types";
import { listLiveCorpus } from "@/server/integrations/stevo-proof/live-store";
import { aiConfigured, askJSON, type ChatTurn } from "./openai";
import { reconcileCopilotWithKnownContacts } from "./guards";
import { AGENTS, planConversationAgent, planForQuestion } from "./agent-platform";
import { executeAssistantAction as executePlannedAction, planAssistantAction } from "./action-engine";
import type { AssistantActionExecution, AssistantActionProposal } from "@/lib/assistant-actions";
import {
  normalizeConversationSummary,
  normalizeDailyBriefing,
  normalizeExtractedLead,
  normalizeManagerDigest,
  normalizeNextStep,
  normalizeQuickNote,
  normalizeRouteIds,
  normalizeTranscript,
  validateTranscriptionFile,
} from "./contracts";

const TAWPER = `Você é o copiloto comercial da Tawper, fabricante de mangueiras hidráulicas para usinas de cana no Brasil.
Regras:
- Responda sempre em português do Brasil, de forma concreta e curta.
- Use SOMENTE os dados fornecidos. Não invente número, nome, cidade, valor, data, compromisso ou ID.
- Se faltar informação, diga o que falta. Nunca complete com chute.
- Nada no CRM muda sem um humano confirmar.
- Responda APENAS um objeto JSON válido, sem markdown e sem texto fora do JSON.`;

function dump(v: unknown) {
  return JSON.stringify(v);
}

function str(v: unknown, fallback = "", max = 600) {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  if (!t) return fallback;
  return t.length > max ? t.slice(0, max) : t;
}

function num(v: unknown, fallback: number, min: number, max: number) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function strList(v: unknown, fallback: string[], maxItems: number, maxLen = 240) {
  if (!Array.isArray(v)) return fallback;
  const out = v.map((x) => str(x, "", maxLen)).filter(Boolean).slice(0, maxItems);
  return out.length ? out : fallback;
}

function asTipo(v: unknown, fallback: ActivityType): ActivityType {
  return pick(v, ACTIVITY_TYPES, fallback);
}

type StageOpt = { id: string; nome: string };

const INTERNAL_HREFS = new Set(["/gestao", "/meu-dia", "/rotas", "/carteira", "/conversas"]);

function asAssistantItems(raw: unknown, fallback: AssistantAnswer["itens"], allowed: Set<string>) {
  const src = Array.isArray(raw) ? raw : fallback;
  if (!src?.length) return fallback;
  const items: NonNullable<AssistantAnswer["itens"]> = [];
  for (const it of src.slice(0, 12)) {
    if (!it || typeof it !== "object") continue;
    const row = it as { label?: unknown; meta?: unknown; href?: unknown; companyId?: unknown };
    const label = str(row.label, "", 80);
    if (!label) continue;
    const companyId = str(row.companyId, "", 80);
    let href: string | undefined;
    if (companyId && allowed.has(companyId)) href = `/empresas/${companyId}`;
    else if (typeof row.href === "string" && row.href.startsWith("/")) {
      const path = row.href.split("?")[0];
      const m = path.match(/^\/empresas\/([A-Za-z0-9-]+)$/);
      if (m && allowed.has(m[1])) href = `/empresas/${m[1]}`;
      else if (INTERNAL_HREFS.has(path)) href = path;
    }
    if (!href) continue;
    items.push({ label, meta: str(row.meta, "", 140) || undefined, href });
  }
  return items.length ? items : fallback;
}

function plainText(value: unknown, fallback = "", max = 4000) {
  return str(value, fallback, max)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/[*_`~]/g, "")
    .trim();
}

function safeHref(value: unknown, allowed: Set<string>) {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  const path = value.split("?")[0];
  const company = path.match(/^\/empresas\/([A-Za-z0-9-]+)$/);
  if (company && allowed.has(company[1])) return `/empresas/${company[1]}`;
  return INTERNAL_HREFS.has(path) ? path : undefined;
}

function asAssistantBlocks(raw: unknown, fallback: AssistantBlock[] | undefined, allowed: Set<string>): AssistantBlock[] | undefined {
  if (!Array.isArray(raw)) return fallback;
  const blocks: AssistantBlock[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.type === "text") {
      const text = plainText(row.text, "", 1800);
      if (text) blocks.push({ type: "text", text });
    } else if (row.type === "metric") {
      const label = plainText(row.label, "", 80);
      const value = plainText(row.value, "", 80);
      if (label && value) {
        const trend = row.trend === "up" || row.trend === "down" || row.trend === "neutral" ? row.trend : undefined;
        blocks.push({ type: "metric", label, value, comparison: plainText(row.comparison, "", 160) || undefined, trend });
      }
    } else if (row.type === "task_list" && Array.isArray(row.items)) {
      const items = row.items.slice(0, 20).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const task = entry as Record<string, unknown>;
        const title = plainText(task.title, "", 140);
        if (!title) return [];
        const status: "pending" | "done" | "cancelled" = task.status === "done" || task.status === "cancelled" ? task.status : "pending";
        return [{ title, status, meta: plainText(task.meta, "", 160) || undefined, href: safeHref(task.href, allowed) }];
      });
      if (items.length) blocks.push({ type: "task_list", title: plainText(row.title, "Tarefas", 100), items });
    } else if (row.type === "bar_chart" && Array.isArray(row.items)) {
      const items = row.items.slice(0, 8).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const bar = entry as Record<string, unknown>;
        const value = num(bar.value, 0, 0, 1_000_000_000_000);
        const label = plainText(bar.label, "", 60);
        if (!label) return [];
        return [{ label, value, display: plainText(bar.display, String(value), 60) }];
      });
      if (items.length) blocks.push({ type: "bar_chart", title: plainText(row.title, "Comparativo", 100), items });
    } else if (row.type === "table" && Array.isArray(row.columns) && Array.isArray(row.rows)) {
      const columns = row.columns.map((value) => plainText(value, "", 60)).filter(Boolean).slice(0, 6);
      const rows = row.rows
        .filter(Array.isArray)
        .slice(0, 15)
        .map((values) => values.slice(0, columns.length).map((value) => plainText(value, "—", 100)));
      if (columns.length && rows.length) blocks.push({ type: "table", title: plainText(row.title, "", 100) || undefined, columns, rows });
    }
  }
  return blocks.length ? blocks : fallback;
}

async function whatsappDaBase(escopo?: { gestor: boolean; telefones: string[] }) {
  try {
    const rows = await listLiveCorpus(4000);
    if (!rows) return { aviso: "O WhatsApp ao vivo não está disponível nesta leitura." };
    const permitidos = escopo?.gestor ? null : new Set((escopo?.telefones ?? []).map((tel) => canonicalWhatsApp(tel)));
    const filtradas = permitidos ? rows.filter((row) => permitidos.has(row.peer)) : rows;
    const mensagens: { quando: string; numero: string; quem: string; texto: string }[] = [];
    for (const row of filtradas) {
      mensagens.push({
        quando: row.at.slice(0, 16).replace("T", " "),
        numero: row.peer,
        quem: row.direction === "in" ? row.name || "cliente" : row.author || "Tawper",
        texto: row.body.length > 500 ? `${row.body.slice(0, 500)}…` : row.body,
      });
      if (JSON.stringify(mensagens).length > 45_000) {
        mensagens.pop();
        return { cobertura: `WhatsApp: as ${mensagens.length} mensagens mais recentes de ${filtradas.length}. As mais antigas ficaram de fora.`, mensagens };
      }
    }
    return { cobertura: `WhatsApp: ${filtradas.length} mensagens, todas incluídas.`, mensagens: mensagens.reverse() };
  } catch {
    return { aviso: "Não foi possível ler o WhatsApp agora." };
  }
}

export async function aiAssistant(input: {
  question: string;
  history?: ChatTurn[];
  actorId?: string;
  sistema: unknown;
  fallback: AssistantAnswer;
  allowedCompanyIds: string[];
  escopo?: { gestor: boolean; telefones: string[] };
}): Promise<AssistantAnswer> {
  if (!aiConfigured()) return input.fallback;
  const action = await planAssistantAction({ question: input.question, history: input.history, actorId: input.actorId });
  if (action) return action;
  const allowed = new Set(input.allowedCompanyIds);
  const plan = planForQuestion(input.question);
  const task = plan.agent === "strategic_copilot" ? "strategy" : "assistant";
  const whatsapp = await whatsappDaBase(input.escopo);
  const raw = await askJSON<{ texto?: unknown; itens?: unknown; blocos?: unknown }>({
    system: `${TAWPER}
Você responde qualquer pergunta sobre a Tawper e sobre a operação comercial, usando a base completa enviada.
A base traz cadastro, contatos, negócios, atividades, histórico, orçamentos, estratégias, rotas, alertas, indicadores, funis, catálogo de produtos e as mensagens de WhatsApp.
Conte, filtre, compare e explique a partir desses registros. Se o dado está na base, responda com ele. Se não está, diga que não está registrado.
Pedidos de mover etapa, criar tarefa ou concluir tarefa são tratados antes desta resposta por ferramentas seguras. Aqui, não afirme que uma ação foi executada se você recebeu apenas dados para consulta.
Leia o campo "cobertura": se algo foi encurtado, avise só quando a pergunta depender desse trecho.
Cite a empresa pelo nome. Em "itens", use o empresaId exatamente como veio na base.
Entregue a resposta já mastigada. Para tarefas, use task_list com o check correto. Para indicadores, use metric e bar_chart comparando com ontem ou com o período anterior. Use table quando houver linhas e colunas. Não use markdown nem HTML.
JSON: { "texto": string, "blocos": [
  { "type": "text", "text": string } |
  { "type": "metric", "label": string, "value": string, "comparison": string, "trend": "up"|"down"|"neutral" } |
  { "type": "task_list", "title": string, "items": [{ "title": string, "status": "pending"|"done"|"cancelled", "meta": string, "href": string }] } |
  { "type": "bar_chart", "title": string, "items": [{ "label": string, "value": number, "display": string }] } |
  { "type": "table", "title": string, "columns": string[], "rows": string[][] }
], "itens": [{ "label": string, "meta": string, "companyId": string }] }
"itens" é opcional e só para contas que existem na base. "texto" pode ser longo quando a pergunta pede lista, conta ou explicação.`,
    user: `Pergunta: ${str(input.question, "", 2000)}\n\nPlano do orquestrador:\n${dump(plan)}\n\nBase do Tawper OS:\n${dump(input.sistema)}\n\nWhatsApp:\n${dump(whatsapp)}`,
    history: (input.history ?? []).slice(-6),
    maxTokens: 1800,
    temperature: 0.2,
    timeoutMs: 90_000,
    task,
    agentKey: plan.agent,
    promptVersion: AGENTS[plan.agent].promptVersion,
  });
  if (!raw) return input.fallback;
  return {
    texto: plainText(raw.texto, input.fallback.texto, 4000),
    blocos: asAssistantBlocks(raw.blocos, input.fallback.blocos, allowed),
    itens: asAssistantItems(raw.itens, undefined, allowed),
  };
}

export async function confirmAssistantAction(input: { actorId: string; action: AssistantActionProposal }): Promise<AssistantActionExecution> {
  return executePlannedAction(input);
}

export async function aiCopilot(input: { context: unknown; fallback: CopilotResult }): Promise<CopilotResult> {
  if (!aiConfigured()) return reconcileCopilotWithKnownContacts(input.fallback, input.context);
  const raw = await askJSON<{
    titulo?: unknown;
    texto?: unknown;
    diagnostico?: unknown;
    hipoteses?: unknown;
    acoes?: { titulo?: unknown; tipo?: unknown; prazoDias?: unknown }[];
    perguntas?: unknown;
    rascunho?: unknown;
    objetivo?: unknown;
    barreira?: unknown;
    estrategia?: unknown;
    resultadoEsperado?: unknown;
    base?: unknown;
    faltantes?: unknown;
  }>({
    system: `${TAWPER}
Você é o copiloto estratégico. Com o contexto da conta, produza um plano acionável.
O contexto da conta é a fonte canônica e vence o rascunho local. Antes de sugerir descobrir, mapear ou procurar uma pessoa, confira "contatos". Se já houver Decisor, Comprador ou Técnico cadastrado, cite-o pelo nome e não liste esse papel como dado faltante.
JSON: {
  "titulo": string,
  "texto": string,
  "diagnostico": string,
  "hipoteses": string[],
  "acoes": [{ "titulo": string, "tipo": "Ligação"|"WhatsApp"|"E-mail"|"Visita"|"Reunião"|"Cotação"|"Homologação"|"Cadastro"|"Suporte"|"Outro", "prazoDias": number }],
  "perguntas": string[],
  "rascunho": string,
  "objetivo": string,
  "barreira": string,
  "estrategia": string,
  "resultadoEsperado": string,
  "base": string[],
  "faltantes": string[]
}
2 a 4 ações. "tipo" só dos valores listados. "rascunho" é mensagem curta de WhatsApp, sem inventar nome de contato que não esteja no contexto.
"faltantes" lista o que o cadastro não tem. "base" lista os fatos usados.`,
    user: `Contexto da conta:\n${dump(input.context)}\n\nRascunho das regras locais:\n${dump(input.fallback)}`,
    maxTokens: 1600,
    temperature: 0.4,
    task: "strategy",
    agentKey: "strategic_copilot",
    promptVersion: AGENTS.strategic_copilot.promptVersion,
  });
  if (!raw) return reconcileCopilotWithKnownContacts(input.fallback, input.context);
  const fb = input.fallback;
  const acoesRaw = Array.isArray(raw.acoes) ? raw.acoes : [];
  const acoes = (acoesRaw.length ? acoesRaw : fb.detalhes.acoes).slice(0, 4).map((a, i) => {
    const src = a && typeof a === "object" ? a : {};
    const prev = fb.detalhes.acoes[i] ?? fb.detalhes.acoes[0];
    return {
      titulo: str((src as { titulo?: unknown }).titulo, prev?.titulo ?? "Follow-up com o cliente", 120),
      tipo: asTipo((src as { tipo?: unknown }).tipo, prev?.tipo ?? "WhatsApp"),
      prazoDias: num((src as { prazoDias?: unknown }).prazoDias, prev?.prazoDias ?? 2, 0, 30),
    };
  });
  return reconcileCopilotWithKnownContacts({
    titulo: str(raw.titulo ?? raw.objetivo, fb.titulo, 140),
    texto: str(raw.texto ?? raw.estrategia, fb.texto, 500),
    detalhes: {
      diagnostico: str(raw.diagnostico, fb.detalhes.diagnostico, 500),
      hipoteses: strList(raw.hipoteses, fb.detalhes.hipoteses, 5, 220),
      acoes,
      perguntas: strList(raw.perguntas, fb.detalhes.perguntas, 5, 180),
      rascunho: str(raw.rascunho, fb.detalhes.rascunho, 500),
      objetivo: str(raw.objetivo, fb.detalhes.objetivo, 220),
      barreira: str(raw.barreira, fb.detalhes.barreira, 220),
      estrategia: str(raw.estrategia, fb.detalhes.estrategia, 500),
      resultadoEsperado: str(raw.resultadoEsperado, fb.detalhes.resultadoEsperado, 220),
    },
    base: strList(raw.base, fb.base, 8, 180),
    faltantes: strList(raw.faltantes, fb.faltantes, 6, 180),
  }, input.context);
}

export async function aiQuickNote(input: {
  note: string;
  context: unknown;
  stages: StageOpt[];
  fallback: QuickProposal;
}): Promise<QuickProposal> {
  if (!aiConfigured()) return input.fallback;
  const raw = await askJSON<Record<string, unknown>>({
    system: `${TAWPER}
Você interpreta o registro livre do vendedor e devolve o mesmo JSON estruturado.
JSON: {
  "canal": "WhatsApp"|"Ligação"|"E-mail"|"Visita"|"Reunião"|"Nota",
  "resultado": string,
  "resumo": string,
  "contato": string,
  "pendenciaCliente": string,
  "proximoPasso": { "titulo": string, "tipo": "Ligação"|"WhatsApp"|"E-mail"|"Visita"|"Reunião"|"Cotação"|"Homologação"|"Cadastro"|"Suporte"|"Outro", "dueAt": string (ISO ou YYYY-MM-DD), "prioridade": "Alta"|"Média"|"Baixa" },
  "prazoCliente": string (ISO ou YYYY-MM-DD),
  "etapaSugerida": { "stageId": string, "nome": string, "motivo": string } | null,
  "checks": { [id: string]: boolean },
  "dadosExtraidos": { "colhedoras": number, "modelos": string, "marcaAtual": string, "prensa": string, "concorrente": string },
  "destaques": string[],
  "confianca": number,
  "sugereGanho": boolean
}
"stageId" só pode ser um dos ids enviados em etapasDoFunil. Não sugira etapa se o texto não justificar avanço. Não extraia frota de frases como "testar em 2 colhedoras".`,
    user: `Anotação do vendedor:\n${str(input.note, "", 2000)}\n\nEtapas do funil atual:\n${dump(input.stages)}\n\nContexto da conta:\n${dump(input.context)}\n\nRascunho das regras locais:\n${dump(input.fallback)}`,
    maxTokens: 900,
    temperature: 0.2,
    task: "quick_note",
    agentKey: "quick_note",
    promptVersion: AGENTS.quick_note.promptVersion,
  });
  if (!raw) return input.fallback;
  return normalizeQuickNote(raw, input.fallback, input.stages);
}

export async function aiNextStep(input: {
  resultado: string;
  context: unknown;
  fallback: QuickProposal["proximoPasso"];
}): Promise<QuickProposal["proximoPasso"]> {
  if (!aiConfigured()) return input.fallback;
  const raw = await askJSON<{ titulo?: unknown; tipo?: unknown; dueAt?: unknown; prioridade?: unknown }>({
    system: `${TAWPER}
Sugira o próximo passo comercial. JSON: { "titulo": string, "tipo": "Ligação"|"WhatsApp"|"E-mail"|"Visita"|"Reunião"|"Cotação"|"Homologação"|"Cadastro"|"Suporte"|"Outro", "dueAt": string, "prioridade": "Alta"|"Média"|"Baixa" }.`,
    user: `Resultado registrado:\n${str(input.resultado, "", 1500)}\n\nContexto:\n${dump(input.context)}\n\nRascunho:\n${dump(input.fallback)}`,
    maxTokens: 400,
    temperature: 0.25,
    task: "next_step",
    agentKey: "next_step",
    promptVersion: AGENTS.next_step.promptVersion,
  });
  if (!raw) return input.fallback;
  return normalizeNextStep(raw, input.fallback);
}

export async function aiSummarize(input: {
  messages: { from: string; text: string; at?: string }[];
  context: unknown;
  stages: StageOpt[];
  fallback: ConversationSummary;
}): Promise<ConversationSummary> {
  if (!aiConfigured()) return input.fallback;
  const plan = planConversationAgent("summarize");
  const raw = await askJSON<Record<string, unknown>>({
    system: `${TAWPER}
Resuma a conversa de WhatsApp. JSON: {
  "assunto": string,
  "necessidade": string,
  "objecoes": string[],
  "compromissosTawper": string[],
  "compromissosCliente": string[],
  "datas": string[],
  "proximoPasso": string,
  "proximoPassoTipo": "Ligação"|"WhatsApp"|"E-mail"|"Visita"|"Reunião"|"Cotação"|"Homologação"|"Cadastro"|"Suporte"|"Outro",
  "proximoPassoDias": number,
  "confianca": number,
  "etapaSugerida": string,
  "dadosExtraidos": { "colhedoras": number, "modelos": string, "marcaAtual": string, "prensa": string, "concorrente": string }
}
"etapaSugerida" é o id da etapa (ou omita). Só extraia o que o cliente disse de fato.`,
    user: `Plano do agente de Conversas:\n${dump(plan)}\n\nMensagens:\n${dump(input.messages.slice(-40))}\n\nEtapas:\n${dump(input.stages)}\n\nContexto da conta:\n${dump(input.context)}\n\nRascunho:\n${dump(input.fallback)}`,
    maxTokens: 1100,
    temperature: 0.25,
    task: "conversation_summary",
    agentKey: "conversation_summary",
    promptVersion: AGENTS.conversation_summary.promptVersion,
  });
  if (!raw) return input.fallback;
  return normalizeConversationSummary(raw, input.fallback, input.stages);
}

export async function aiRoute(input: {
  regiao: string;
  candidates: { id: string; nome: string; cidade?: string; score: number; motivos: string[]; etapa?: string }[];
  fallbackIds: string[];
}): Promise<{ ids: string[]; descricao: string }> {
  const idsOf = (raw: unknown) => normalizeRouteIds(raw, input.candidates, input.fallbackIds);
  if (!aiConfigured()) return { ids: idsOf(null), descricao: "" };
  const plan = { agent: "visit_route", steps: ["read_route_candidates", "rank_route_candidates"], externalSideEffect: false };
  const raw = await askJSON<{ companyIds?: unknown; descricao?: unknown }>({
    system: `${TAWPER}
Monte uma rota de visitas para o dia. Priorize urgência, atraso, potencial e etapa que pede visita. Use somente as contas enviadas, sem repetir.
JSON: { "companyIds": string[], "descricao": string }
"companyIds" traz os ids na ordem da rota.
"descricao" é o roteiro do dia em texto: uma frase de condução e, em seguida, cada parada numerada com nome, cidade e motivo. Cite todas as empresas de companyIds, nessa ordem.`,
    user: `Plano do especialista de rotas:\n${dump(plan)}\nRegião: ${str(input.regiao, "", 60)}\nCandidatos:\n${dump(input.candidates)}\nRascunho (ordem das regras locais):\n${dump(input.fallbackIds)}`,
    maxTokens: 900,
    temperature: 0.2,
    task: "visit_route",
    agentKey: "visit_route",
    promptVersion: AGENTS.visit_route.promptVersion,
  });
  const ids = idsOf(raw);
  const descricao = typeof raw?.descricao === "string" ? raw.descricao.trim().slice(0, 1200) : "";
  return { ids, descricao };
}

export async function aiExtractLead(input: {
  contatoNome: string;
  telefone: string;
  messages: { from: string; text: string }[];
  fallback: ExtractedLead;
}): Promise<ExtractedLead> {
  if (!aiConfigured()) return input.fallback;
  const plan = planConversationAgent("extract_lead");
  const raw = await askJSON<Record<string, unknown>>({
    system: `${TAWPER}
Extraia o cadastro mínimo de um lead a partir das mensagens do WhatsApp. Não invente empresa ou cidade.
JSON: {
  "empresa": string,
  "cidade": string,
  "uf": "SP"|"MG"|"GO"|"MS"|"PR"|"MT",
  "contatoNome": string,
  "papel": "Decisor"|"Comprador"|"Técnico"|"Mecânico"|"Influenciador"|"Outro",
  "cargo": string,
  "interesse": string,
  "origem": string,
  "indicacao": string,
  "dor": string
}`,
    user: `Plano do agente de Conversas:\n${dump(plan)}\n\nContato: ${str(input.contatoNome, "", 80)} · ${str(input.telefone, "", 20)}\nMensagens:\n${dump(input.messages.slice(-30))}\n\nRascunho:\n${dump(input.fallback)}`,
    maxTokens: 500,
    temperature: 0.15,
    task: "lead_extraction",
    agentKey: "lead_extractor",
    promptVersion: AGENTS.lead_extractor.promptVersion,
  });
  if (!raw) return input.fallback;
  return normalizeExtractedLead(raw, input.fallback);
}

export async function aiBriefing(input: { fallback: DailyBriefing }): Promise<DailyBriefing> {
  if (!aiConfigured()) return input.fallback;
  const raw = await askJSON<{ saudacao?: unknown; resumo?: unknown; prioridades?: { companyId?: unknown; texto?: unknown }[] }>({
    system: `${TAWPER}
Ordene as prioridades do briefing. Preserve literalmente os textos e indicadores fornecidos e todos os companyId.
JSON: { "saudacao": string, "resumo": string, "prioridades": [{ "companyId": string, "texto": string }] }`,
    user: dump(input.fallback),
    maxTokens: 700,
    temperature: 0.35,
    task: "daily_briefing",
    agentKey: "daily_briefing",
    promptVersion: AGENTS.daily_briefing.promptVersion,
  });
  if (!raw) return input.fallback;
  return normalizeDailyBriefing(raw, input.fallback);
}

export async function aiDigest(input: { fallback: ManagerDigest }): Promise<ManagerDigest> {
  if (!aiConfigured()) return input.fallback;
  const raw = await askJSON<{ linhas?: unknown }>({
    system: `${TAWPER}
Ordene as linhas do resumo gerencial pela importância. Copie literalmente as linhas fornecidas, sem reescrever indicadores.
JSON: { "linhas": string[] }`,
    user: dump(input.fallback),
    maxTokens: 400,
    temperature: 0.3,
    task: "manager_digest",
    agentKey: "manager_digest",
    promptVersion: AGENTS.manager_digest.promptVersion,
  });
  return normalizeManagerDigest(raw ?? {}, input.fallback);
}

/** Transcreve um áudio curto em português. `null` se os provedores falharem. */
export async function aiTranscribe(form: FormData): Promise<string | null> {
  if (!aiConfigured()) return null;
  const gatewayEnabled = Boolean(process.env.AI_GATEWAY_API_KEY);
  const openAIKey = process.env.OPENAI_API_KEY;
  const file = form.get("file");
  if ((!gatewayEnabled && !openAIKey) || !(file instanceof File) || !validateTranscriptionFile(file)) return null;
  if (gatewayEnabled) try {
    const result = await transcribe({
      model: gateway.transcriptionModel(process.env.AI_TRANSCRIPTION_MODEL || "openai/gpt-4o-mini-transcribe"),
      audio: new Uint8Array(await file.arrayBuffer()),
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(60_000),
    });
    const transcript = normalizeTranscript(result.text);
    if (transcript) {
      console.info("[ia] transcrição concluída", { agentKey: "transcription", promptVersion: AGENTS.transcription.promptVersion, provider: "vercel-ai-gateway", bytes: file.size });
      return transcript;
    }
  } catch {
    console.error("[ia] falha no gateway de transcrição");
  }
  if (!openAIKey) return null;
  try {
    const body = new FormData();
    body.set("file", file, file.name || "fala.webm");
    body.set("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
    body.set("language", "pt");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAIKey}` },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.error(`[ia] transcrição respondeu ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { text?: string };
    const transcript = normalizeTranscript(data.text);
    if (transcript) console.info("[ia] transcrição concluída", { agentKey: "transcription", promptVersion: AGENTS.transcription.promptVersion, provider: "openai", bytes: file.size });
    return transcript;
  } catch {
    console.error("[ia] falha ao transcrever");
    return null;
  }
}
