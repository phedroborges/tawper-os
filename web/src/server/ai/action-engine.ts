import "server-only";

import { ACTIVITY_TYPES } from "@/lib/constants";
import type { AssistantAnswer } from "@/lib/ai";
import type {
  AssistantActionExecution,
  AssistantActionPayload,
  AssistantActionProposal,
} from "@/lib/assistant-actions";
import { stageKeyToDb } from "@/lib/crm-map";
import { visibleCompanies, type Data } from "@/lib/selectors";
import type { ActivityType, Prioridade, User } from "@/lib/types";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { addActivityRecord, completeActivityRecord, moveDealRecord } from "@/server/persist";
import { invalidateCrmReadCache, loadCrmSnapshot } from "@/server/crm";
import { askJSON, type ChatTurn } from "./openai";

const ACTION_WINDOW_MS = 15 * 60 * 1000;
const PRIORITIES = ["Alta", "Média", "Baixa"] as const;

type RawActionPlan = {
  kind?: unknown;
  companyId?: unknown;
  dealId?: unknown;
  targetStageKey?: unknown;
  confirmedRequirementKeys?: unknown;
  activityId?: unknown;
  result?: unknown;
  title?: unknown;
  dueAt?: unknown;
  activityType?: unknown;
  priority?: unknown;
  ownerId?: unknown;
};

type StageRow = {
  id: string;
  funnel_id: string;
  key: string;
  name: string;
  position: number;
  is_terminal: boolean;
};

type RequirementRow = {
  id: string;
  stage_id: string;
  key: string;
  label: string;
  kind: "field" | "check" | "contact" | "quote";
  field_name: string | null;
};

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map((item) => text(item, 100)).filter(Boolean).slice(0, 20) : [];
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validActionPayload(action: AssistantActionProposal) {
  const payload = action.payload;
  if (!payload || payload.kind !== action.kind || !uuid(payload.companyId)) return false;
  if (payload.kind === "move_stage") {
    return uuid(payload.dealId) && typeof payload.targetStageKey === "string" && payload.targetStageKey.length <= 100 && Array.isArray(payload.confirmedRequirementKeys) && payload.confirmedRequirementKeys.every((key) => typeof key === "string" && key.length <= 100);
  }
  if (payload.kind === "complete_task") {
    return uuid(payload.activityId) && typeof payload.result === "string" && payload.result.trim().length > 0 && payload.result.length <= 1000;
  }
  return uuid(payload.ownerId) && (!payload.dealId || uuid(payload.dealId)) && typeof payload.title === "string" && payload.title.trim().length > 0 && payload.title.length <= 180 && !Number.isNaN(new Date(payload.dueAt).getTime()) && ACTIVITY_TYPES.includes(payload.activityType) && PRIORITIES.includes(payload.priority);
}

export function isAssistantActionRequest(question: string) {
  const value = normalize(question);
  return (
    /\b(mov[ae]|mover|avanc[ea]|avancar|mud[ea]|alter[ea]|coloque|pass[ae])\b.{0,80}\b(etapa|fase|funil)\b/.test(value) ||
    /\b(mov[ae]|mover|avanc[ea]|avancar|mud[ea]|alter[ea]|coloque|pass[ae])\b.{0,80}\b(lead|qualificacao|apresentacao|cadastro|homologacao|aprovado|orcamento|negociacao|pos-venda|suporte|relacionamento|previsao|recompra)\b/.test(value) ||
    /\b(conclu[ai]|concluir|finaliz[ea]|finalizar|efetiv[ea]|efetivar|dar baixa|de baixa|marque)\b.{0,80}\b(tarefa|atividade)\b/.test(value) ||
    /\b(cri[ea]|criar|cadastre|cadastrar|agende|agendar)\b.{0,80}\b(tarefa|atividade|proximo passo|follow-up|ligacao|visita|reuniao)\b/.test(value)
  );
}

function proposal(input: Omit<AssistantActionProposal, "id" | "createdAt" | "expiresAt">): AssistantActionProposal {
  const now = Date.now();
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ACTION_WINDOW_MS).toISOString(),
  };
}

function actorFrom(snapshot: Awaited<ReturnType<typeof loadCrmSnapshot>>, actorId: string) {
  return snapshot.users.find((user) => user.id === actorId);
}

function dataFrom(snapshot: Awaited<ReturnType<typeof loadCrmSnapshot>>): Data {
  return { ...snapshot, suggestions: [], conversations: [] };
}

function isActionContinuation(history: ChatTurn[] | undefined) {
  const lastAssistant = [...(history ?? [])].reverse().find((turn) => turn.role === "assistant")?.content ?? "";
  const value = normalize(lastAssistant);
  return /antes de mover|para mover|requisitos? de|informe .*(resultado|tarefa|prazo|titulo)|acao.*confirm/.test(value);
}

async function actionCatalog(snapshot: Awaited<ReturnType<typeof loadCrmSnapshot>>, actor: User) {
  const sb = getSupabaseAdmin();
  const [stagesResult, requirementsResult, funnelsResult] = await Promise.all([
    sb.from("stages").select("id, funnel_id, key, name, position, is_terminal").eq("organization_id", TAWPER_ORG_ID).order("position"),
    sb.from("stage_requirements").select("id, stage_id, key, label, kind, field_name").eq("organization_id", TAWPER_ORG_ID).order("position"),
    sb.from("funnels").select("id, key").eq("organization_id", TAWPER_ORG_ID),
  ]);
  for (const result of [stagesResult, requirementsResult, funnelsResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const stages = (stagesResult.data ?? []) as StageRow[];
  const requirements = (requirementsResult.data ?? []) as RequirementRow[];
  const funnelKey = new Map((funnelsResult.data ?? []).map((row) => [row.id as string, row.key as string]));
  const companies = visibleCompanies(dataFrom(snapshot), actor);
  const visible = new Set(companies.map((company) => company.id));
  const funnelIdByKey = new Map(Array.from(funnelKey.entries()).map(([id, key]) => [key, id]));
  return {
    stages,
    requirements,
    companies: companies.map((company) => ({
      id: company.id,
      name: company.nome,
      ownerId: company.ownerId,
      deals: snapshot.deals
        .filter((deal) => deal.companyId === company.id && deal.status === "aberta")
        .map((deal) => {
          const funnelId = funnelIdByKey.get(deal.funnel);
          const current = stages.find((stage) => stage.funnel_id === funnelId && (stage.key === deal.stageId || stage.key === stageKeyToDb(deal.stageId)));
          return {
            id: deal.id,
            title: deal.titulo,
            funnel: deal.funnel,
            currentStage: current ? { key: current.key, name: current.name } : { key: deal.stageId, name: deal.stageId },
            currentRequirements: current
              ? requirements.filter((item) => item.stage_id === current.id).map((item) => ({ key: item.key, label: item.label, kind: item.kind }))
              : [],
          };
        }),
      pendingTasks: snapshot.activities
        .filter((activity) => activity.companyId === company.id && activity.status === "pendente")
        .slice(0, 30)
        .map((activity) => ({ id: activity.id, title: activity.titulo, dueAt: activity.dueAt, ownerId: activity.ownerId })),
    })),
    users: snapshot.users.map((user) => ({ id: user.id, name: user.name, role: user.role })),
    funnels: Array.from(new Set(stages.map((stage) => stage.funnel_id))).map((funnelId) => ({
      key: funnelKey.get(funnelId) ?? funnelId,
      stages: stages.filter((stage) => stage.funnel_id === funnelId).map((stage) => ({ id: stage.id, key: stage.key, name: stage.name, position: stage.position, terminal: stage.is_terminal })),
    })),
    visible,
  };
}

async function inspectMove(input: {
  actor: User;
  companyId: string;
  dealId: string;
  targetStageKey: string;
  confirmedRequirementKeys: string[];
}) {
  const snapshot = await loadCrmSnapshot();
  const visible = new Set(visibleCompanies(dataFrom(snapshot), input.actor).map((company) => company.id));
  if (!visible.has(input.companyId)) throw new Error("A empresa não está no seu escopo de acesso.");
  const sb = getSupabaseAdmin();
  const opportunityResult = await sb
    .from("opportunities")
    .select("id, company_id, funnel_id, stage_id, status")
    .eq("organization_id", TAWPER_ORG_ID)
    .eq("id", input.dealId)
    .maybeSingle();
  if (opportunityResult.error) throw new Error(opportunityResult.error.message);
  const opportunity = opportunityResult.data;
  if (!opportunity || opportunity.company_id !== input.companyId) throw new Error("A oportunidade não pertence à empresa informada.");
  if (opportunity.status !== "open") throw new Error("A oportunidade já não está aberta.");

  const wantedKeys = Array.from(new Set([input.targetStageKey, stageKeyToDb(input.targetStageKey)]));
  const [currentResult, targetResult, requirementsResult, valuesResult, companyResult, contactsResult, quotesResult] = await Promise.all([
    sb.from("stages").select("id, key, name, position, is_terminal").eq("id", opportunity.stage_id).maybeSingle(),
    sb.from("stages").select("id, key, name, position, is_terminal").eq("funnel_id", opportunity.funnel_id).in("key", wantedKeys).order("position").limit(1).maybeSingle(),
    sb.from("stage_requirements").select("id, stage_id, key, label, kind, field_name").eq("stage_id", opportunity.stage_id).eq("is_required", true).order("position"),
    sb.from("opportunity_requirement_values").select("requirement_id, is_met").eq("organization_id", TAWPER_ORG_ID).eq("opportunity_id", input.dealId),
    sb.from("companies").select("*").eq("organization_id", TAWPER_ORG_ID).eq("id", input.companyId).maybeSingle(),
    sb.from("contacts").select("id").eq("organization_id", TAWPER_ORG_ID).eq("company_id", input.companyId).eq("is_active", true).limit(1),
    sb.from("quotes").select("id, status").eq("organization_id", TAWPER_ORG_ID).eq("opportunity_id", input.dealId).in("status", ["sent", "accepted"]).limit(1),
  ]);
  for (const result of [currentResult, targetResult, requirementsResult, valuesResult, companyResult, contactsResult, quotesResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const current = currentResult.data;
  const target = targetResult.data;
  if (!current) throw new Error("Etapa atual não encontrada.");
  if (!target) throw new Error("A etapa solicitada não existe neste funil.");
  if (target.id === current.id) throw new Error(`A oportunidade já está na etapa ${current.name}.`);
  if (target.is_terminal) throw new Error("A etapa final exige registrar a venda e o valor; use o fluxo de ganho.");
  if (Number(target.position) < Number(current.position)) throw new Error("Não é permitido voltar etapa.");

  const metIds = new Set((valuesResult.data ?? []).filter((row) => row.is_met).map((row) => row.requirement_id as string));
  const confirmed = new Set(input.confirmedRequirementKeys);
  const acceptedChecks: string[] = [];
  const missing: string[] = [];
  for (const requirement of (requirementsResult.data ?? []) as RequirementRow[]) {
    let met = false;
    if (requirement.kind === "check") {
      met = metIds.has(requirement.id) || confirmed.has(requirement.key);
      if (!metIds.has(requirement.id) && confirmed.has(requirement.key)) acceptedChecks.push(requirement.key);
    } else if (requirement.kind === "contact") {
      met = Boolean(contactsResult.data?.length);
    } else if (requirement.kind === "quote") {
      met = Boolean(quotesResult.data?.length);
    } else {
      const row = companyResult.data as Record<string, unknown> | null;
      const field = requirement.field_name ?? "";
      const value = row?.[field];
      met = value !== null && value !== undefined && value !== "" && value !== 0;
      if (field === "city") met = met && Boolean(row?.state);
    }
    if (!met) missing.push(requirement.label);
  }
  return { current, target, missing, acceptedChecks };
}

function actionAnswer(action: AssistantActionProposal): AssistantAnswer {
  return { texto: action.summary, acao: action };
}

export async function planAssistantAction(input: {
  question: string;
  history?: ChatTurn[];
  actorId?: string;
}): Promise<AssistantAnswer | null> {
  if (!isAssistantActionRequest(input.question) && !isActionContinuation(input.history)) return null;
  if (!input.actorId) return { texto: "Eu entendi que você quer alterar o CRM, mas não consegui identificar quem está operando. Entre novamente e tente de novo." };
  const snapshot = await loadCrmSnapshot();
  const actor = actorFrom(snapshot, input.actorId);
  if (!actor) return { texto: "Seu perfil não foi encontrado na equipe ativa. Não vou alterar o CRM sem identificar o responsável." };
  const catalog = await actionCatalog(snapshot, actor);
  const raw = await askJSON<RawActionPlan>({
    system: `Você é o planejador de ações do CRM Tawper. Interprete o pedido e o histórico, mas nunca execute nada.
Use somente IDs e chaves presentes no catálogo. Não invente IDs, resultados, requisitos cumpridos, datas ou nomes.
Tipos aceitos: move_stage, complete_task, create_task ou none.
- move_stage: escolha companyId, dealId, targetStageKey. Em confirmedRequirementKeys inclua SOMENTE requisitos do tipo check que o humano afirmou explicitamente nesta conversa como já realizados.
- complete_task: escolha companyId, activityId e copie em result o resultado informado pelo humano. Sem resultado explícito, deixe vazio.
- create_task: escolha companyId, ownerId e, se aplicável, dealId; extraia title, dueAt ISO, activityType e priority. Sem título ou prazo explícito, deixe vazio.
Responda apenas JSON: {"kind":string,"companyId":string,"dealId":string,"targetStageKey":string,"confirmedRequirementKeys":string[],"activityId":string,"result":string,"title":string,"dueAt":string,"activityType":string,"priority":string,"ownerId":string}.`,
    user: `Agora: ${new Date().toISOString()}\nPedido: ${text(input.question, 2000)}\nCatálogo permitido: ${JSON.stringify({ companies: catalog.companies, users: catalog.users, funnels: catalog.funnels, requirements: catalog.requirements.map((item) => ({ stageId: item.stage_id, key: item.key, label: item.label, kind: item.kind })) })}`,
    history: (input.history ?? []).slice(-8),
    maxTokens: 900,
    temperature: 0,
    task: "assistant",
    agentKey: "operations",
    promptVersion: "crm-actions-v1",
  });
  if (!raw) return { texto: "Eu entendi a ação, mas não consegui montar uma proposta segura. Diga a empresa, a ação e os dados necessários em uma frase." };
  const kind = text(raw.kind, 30);
  if (kind === "none") return null;
  const companyId = text(raw.companyId, 80);
  const company = catalog.companies.find((item) => item.id === companyId);
  if (!company) {
    const action = proposal({ kind: kind === "complete_task" ? "complete_task" : kind === "create_task" ? "create_task" : "move_stage", status: "needs_input", title: "Identificar empresa", summary: "Qual é a empresa exata? Eu só posso agir em uma conta visível para você.", missing: ["Empresa"], actorId: actor.id });
    return actionAnswer(action);
  }

  if (kind === "move_stage") {
    const dealId = text(raw.dealId, 80) || (company.deals.length === 1 ? company.deals[0].id : "");
    const targetStageKey = text(raw.targetStageKey, 100);
    const missingInput = [!dealId ? "Oportunidade" : "", !targetStageKey ? "Etapa de destino" : ""].filter(Boolean);
    if (missingInput.length) {
      return actionAnswer(proposal({ kind: "move_stage", status: "needs_input", title: `Mover ${company.name}`, summary: `Para mover ${company.name}, informe ${missingInput.join(" e ").toLowerCase()}.`, missing: missingInput, actorId: actor.id }));
    }
    try {
      const inspected = await inspectMove({ actor, companyId, dealId, targetStageKey, confirmedRequirementKeys: list(raw.confirmedRequirementKeys) });
      if (inspected.missing.length) {
        const summary = `Antes de mover ${company.name} de ${inspected.current.name} para ${inspected.target.name}, confirme o que realmente já aconteceu: ${inspected.missing.join("; ")}.`;
        return actionAnswer(proposal({ kind: "move_stage", status: "needs_input", title: `Requisitos de ${inspected.current.name}`, summary, missing: inspected.missing, actorId: actor.id }));
      }
      const payload: AssistantActionPayload = { kind: "move_stage", companyId, dealId, targetStageKey: inspected.target.key, confirmedRequirementKeys: inspected.acceptedChecks };
      return actionAnswer(proposal({ kind: "move_stage", status: "awaiting_confirmation", title: `Mover ${company.name}`, summary: `Tudo pronto para mover ${company.name} de ${inspected.current.name} para ${inspected.target.name}.`, confirmationText: `Confirmar mudança para ${inspected.target.name}`, actorId: actor.id, payload }));
    } catch (error) {
      return { texto: error instanceof Error ? error.message : "Não foi possível validar a mudança de etapa." };
    }
  }

  if (kind === "complete_task") {
    const activityId = text(raw.activityId, 80);
    const activity = snapshot.activities.find((item) => item.id === activityId && item.companyId === companyId);
    const result = text(raw.result, 1000);
    if (!activity || !result) {
      const missingInput = [!activity ? "Tarefa" : "", !result ? "Resultado da tarefa" : ""].filter(Boolean);
      const pending = company.pendingTasks.slice(0, 5).map((task) => task.title).join("; ");
      return actionAnswer(proposal({ kind: "complete_task", status: "needs_input", title: `Concluir tarefa de ${company.name}`, summary: `Informe ${missingInput.join(" e ").toLowerCase()}.${pending ? ` Pendentes: ${pending}.` : ""}`, missing: missingInput, actorId: actor.id }));
    }
    if (activity.status !== "pendente") return { texto: `A tarefa “${activity.titulo}” já não está pendente.` };
    const payload: AssistantActionPayload = { kind: "complete_task", companyId, activityId, result };
    return actionAnswer(proposal({ kind: "complete_task", status: "awaiting_confirmation", title: `Concluir “${activity.titulo}”`, summary: `Vou concluir a tarefa “${activity.titulo}” de ${company.name} com o resultado: ${result}.`, confirmationText: "Confirmar conclusão", actorId: actor.id, payload }));
  }

  if (kind === "create_task") {
    const title = text(raw.title, 180);
    const dueAtText = text(raw.dueAt, 80);
    const due = new Date(dueAtText);
    const dueAt = Number.isNaN(due.getTime()) ? "" : due.toISOString();
    const missingInput = [!title ? "Título" : "", !dueAt ? "Prazo" : ""].filter(Boolean);
    if (missingInput.length) {
      return actionAnswer(proposal({ kind: "create_task", status: "needs_input", title: `Criar tarefa para ${company.name}`, summary: `Informe ${missingInput.join(" e ").toLowerCase()} para eu preparar a tarefa.`, missing: missingInput, actorId: actor.id }));
    }
    const ownerId = text(raw.ownerId, 80) || actor.id;
    const owner = snapshot.users.find((user) => user.id === ownerId);
    if (!owner) return { texto: "O responsável indicado não faz parte da equipe ativa." };
    if (actor.role === "vendedor" && owner.id !== actor.id) return { texto: "Vendedores podem criar tarefas apenas para si próprios. Peça a um gestor para atribuir a outra pessoa." };
    const activityType = ACTIVITY_TYPES.includes(raw.activityType as ActivityType) ? (raw.activityType as ActivityType) : "Outro";
    const priority = PRIORITIES.includes(raw.priority as Prioridade) ? (raw.priority as Prioridade) : "Média";
    const dealId = text(raw.dealId, 80);
    const payload: AssistantActionPayload = { kind: "create_task", companyId, dealId: company.deals.some((deal) => deal.id === dealId) ? dealId : undefined, ownerId, title, dueAt, activityType, priority };
    const formatted = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(due);
    return actionAnswer(proposal({ kind: "create_task", status: "awaiting_confirmation", title: `Criar tarefa para ${company.name}`, summary: `Vou criar “${title}” para ${owner.name}, com prazo em ${formatted}.`, confirmationText: "Confirmar criação", actorId: actor.id, payload }));
  }
  return null;
}

export async function executeAssistantAction(input: { actorId: string; action: AssistantActionProposal }): Promise<AssistantActionExecution> {
  const fail = (message: string): AssistantActionExecution => ({ ok: false, message, action: { ...input.action, status: "failed" } });
  if (process.env.TAWPER_AGENT_WRITES_ENABLED !== "true") return fail("As ações da IA ainda estão desabilitadas no servidor. Ative TAWPER_AGENT_WRITES_ENABLED=true e faça um novo deploy.");
  if (!uuid(input.action.id) || !uuid(input.actorId) || !validActionPayload(input.action)) return fail("A proposta de ação é inválida. Peça a ação novamente.");
  if (input.action.status !== "awaiting_confirmation" || !input.action.payload) return fail("Esta ação ainda não está pronta para confirmação.");
  if (input.action.actorId !== input.actorId) return fail("A confirmação precisa ser feita pelo mesmo usuário que pediu a ação.");
  if (Date.now() > new Date(input.action.expiresAt).getTime()) return fail("Esta confirmação expirou. Peça a ação novamente para revalidar os dados.");

  const snapshot = await loadCrmSnapshot();
  const actor = actorFrom(snapshot, input.actorId);
  if (!actor) return fail("O usuário não pertence mais à equipe ativa.");
  const visible = new Set(visibleCompanies(dataFrom(snapshot), actor).map((company) => company.id));
  const payload = input.action.payload;
  if (!visible.has(payload.companyId)) return fail("A empresa não está no seu escopo de acesso.");

  try {
    let message = "Ação concluída.";
    if (payload.kind === "move_stage") {
      const checked = await inspectMove({ actor, companyId: payload.companyId, dealId: payload.dealId, targetStageKey: payload.targetStageKey, confirmedRequirementKeys: payload.confirmedRequirementKeys });
      if (checked.missing.length) return fail(`A etapa não foi alterada. Ainda falta: ${checked.missing.join("; ")}.`);
      await moveDealRecord({ dealId: payload.dealId, toStageId: payload.targetStageKey, actorId: actor.id, actorType: "ai", requestId: input.action.id, checks: Object.fromEntries(checked.acceptedChecks.map((key) => [key, true])), nota: `Ação confirmada no assistente (${input.action.id}).` });
      message = `Pronto: a oportunidade foi movida para ${checked.target.name}.`;
    } else if (payload.kind === "complete_task") {
      const task = snapshot.activities.find((activity) => activity.id === payload.activityId && activity.companyId === payload.companyId);
      if (!task) return fail("A tarefa não foi encontrada nesta empresa.");
      if (task.status === "concluida") {
        message = `A tarefa “${task.titulo}” já estava concluída.`;
      } else if (task.status !== "pendente") {
        return fail("A tarefa já não está pendente e não foi alterada.");
      } else {
        await completeActivityRecord(payload.activityId, payload.result, undefined, { actorId: actor.id, actorType: "ai", requestId: input.action.id });
        message = `Pronto: a tarefa “${task.titulo}” foi concluída.`;
      }
    } else {
      const owner = snapshot.users.find((user) => user.id === payload.ownerId);
      if (!owner) return fail("O responsável não pertence mais à equipe ativa.");
      if (actor.role === "vendedor" && owner.id !== actor.id) return fail("Vendedores podem criar tarefas apenas para si próprios.");
      if (payload.dealId && !snapshot.deals.some((deal) => deal.id === payload.dealId && deal.companyId === payload.companyId && deal.status === "aberta")) return fail("A oportunidade vinculada não está mais aberta nesta empresa.");
      await addActivityRecord({ companyId: payload.companyId, dealId: payload.dealId, ownerId: owner.id, titulo: payload.title, tipo: payload.activityType, dueAt: payload.dueAt, prioridade: payload.priority, origem: "ia" }, { actorId: actor.id, actorType: "ai", requestId: input.action.id });
      message = `Pronto: a tarefa “${payload.title}” foi criada para ${owner.name}.`;
    }
    invalidateCrmReadCache();
    return { ok: true, message, action: { ...input.action, status: "executed" } };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível executar a ação.");
  }
}
