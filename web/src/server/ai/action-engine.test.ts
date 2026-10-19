import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { askJSON, loadCrmSnapshot, addActivityRecord, completeActivityRecord, moveDealRecord, invalidateCrmReadCache, from } = vi.hoisted(() => ({
  askJSON: vi.fn(),
  loadCrmSnapshot: vi.fn(),
  addActivityRecord: vi.fn(),
  completeActivityRecord: vi.fn(),
  moveDealRecord: vi.fn(),
  invalidateCrmReadCache: vi.fn(),
  from: vi.fn(),
}));

vi.mock("./openai", () => ({ askJSON }));
vi.mock("@/server/crm", () => ({ loadCrmSnapshot, invalidateCrmReadCache }));
vi.mock("@/server/persist", () => ({ addActivityRecord, completeActivityRecord, moveDealRecord }));
vi.mock("@/lib/supabase/admin", () => ({ TAWPER_ORG_ID: "00000000-0000-4000-8000-000000000001", getSupabaseAdmin: () => ({ from }) }));

import { executeAssistantAction, isAssistantActionRequest, planAssistantAction } from "./action-engine";
import type { AssistantActionProposal } from "@/lib/assistant-actions";

const actor = { id: "00000000-0000-4000-8000-000000000010", name: "Murilo", short: "Murilo", role: "gestor", title: "", initials: "MU", color: "#000", phone: "", regions: [] } as const;
const company = { id: "00000000-0000-4000-8000-000000000020", codigo: "E1", nome: "Usina Acme", status: "ativa", ownerId: actor.id, origem: "manual", urgencia: "Média", createdAt: "2026-10-01", updatedAt: "2026-10-01" } as const;
const deal = { id: "00000000-0000-4000-8000-000000000030", companyId: company.id, ownerId: actor.id, funnel: "aquisicao", stageId: "apresentacao", titulo: "Venda Acme", probabilidade: 20, status: "aberta", createdAt: "2026-10-01", stageEnteredAt: "2026-10-01", checklist: {}, history: [], ciclo: 1 } as const;
const task = { id: "00000000-0000-4000-8000-000000000040", companyId: company.id, dealId: deal.id, tipo: "Ligação", titulo: "Ligar para Carlos", ownerId: actor.id, dueAt: "2026-10-20T12:00:00Z", prioridade: "Alta", status: "pendente", origem: "manual", createdAt: "2026-10-01" } as const;
const actionId = "00000000-0000-4000-8000-000000000050";

function snapshot() {
  return { companies: [company], contacts: [], deals: [deal], activities: [task], users: [actor], quotes: [], interactions: [], audit: [], strategies: [], strategyHistory: [] };
}

function query(result: { data: unknown; error: null }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "in", "order", "limit"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function mockDatabase(options: { missingRequirement?: boolean } = {}) {
  let stageCalls = 0;
  let requirementCalls = 0;
  from.mockImplementation((table: string) => {
    if (table === "stages") {
      stageCalls += 1;
      if (stageCalls === 1) return query({ data: [
        { id: "stage-current", funnel_id: "funnel-1", key: "apresentacao_empresa", name: "Apresentação", position: 3, is_terminal: false },
        { id: "stage-target", funnel_id: "funnel-1", key: "cadastro", name: "Cadastro", position: 5, is_terminal: false },
      ], error: null });
      if (stageCalls % 2 === 0) return query({ data: { id: "stage-current", key: "apresentacao_empresa", name: "Apresentação", position: 3, is_terminal: false }, error: null });
      return query({ data: { id: "stage-target", key: "cadastro", name: "Cadastro", position: 5, is_terminal: false }, error: null });
    }
    if (table === "stage_requirements") {
      requirementCalls += 1;
      const rows = [{ id: "req-1", stage_id: "stage-current", key: "presentation_done", label: "Apresentação realizada", kind: "check", field_name: null }];
      return query({ data: requirementCalls === 1 ? rows : rows, error: null });
    }
    if (table === "funnels") return query({ data: [{ id: "funnel-1", key: "aquisicao" }], error: null });
    if (table === "opportunities") return query({ data: { id: deal.id, company_id: company.id, funnel_id: "funnel-1", stage_id: "stage-current", status: "open" }, error: null });
    if (table === "opportunity_requirement_values") return query({ data: options.missingRequirement ? [] : [{ requirement_id: "req-1", is_met: true }], error: null });
    if (table === "companies") return query({ data: { id: company.id }, error: null });
    if (table === "contacts" || table === "quotes") return query({ data: [], error: null });
    throw new Error(`Tabela inesperada: ${table}`);
  });
}

describe("ações confirmadas do assistente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadCrmSnapshot.mockResolvedValue(snapshot());
    mockDatabase();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("separa consulta de pedido real de ação", () => {
    expect(isAssistantActionRequest("Quais tarefas estão atrasadas?")).toBe(false);
    expect(isAssistantActionRequest("Conclua a tarefa de ligar para Carlos")).toBe(true);
    expect(isAssistantActionRequest("Mova a Acme para a etapa Cadastro")).toBe(true);
  });

  it("pergunta o requisito ausente antes de propor mudança de etapa", async () => {
    from.mockReset();
    mockDatabase({ missingRequirement: true });
    askJSON.mockResolvedValue({ kind: "move_stage", companyId: company.id, dealId: deal.id, targetStageKey: "cadastro", confirmedRequirementKeys: [] });
    const answer = await planAssistantAction({ actorId: actor.id, question: "Mova a Acme para a etapa Cadastro" });
    expect(answer?.acao).toMatchObject({ status: "needs_input", missing: ["Apresentação realizada"] });
    expect(moveDealRecord).not.toHaveBeenCalled();
  });

  it("continua a coleta de requisitos na mensagem seguinte", async () => {
    from.mockReset();
    mockDatabase({ missingRequirement: true });
    askJSON.mockResolvedValue({ kind: "move_stage", companyId: company.id, dealId: deal.id, targetStageKey: "cadastro", confirmedRequirementKeys: ["presentation_done"] });
    const answer = await planAssistantAction({
      actorId: actor.id,
      question: "Sim, a apresentação foi realizada",
      history: [{ role: "assistant", content: "Antes de mover Usina Acme de Apresentação para Cadastro, confirme: Apresentação realizada." }],
    });
    expect(answer?.acao).toMatchObject({ status: "awaiting_confirmation", kind: "move_stage" });
    expect(moveDealRecord).not.toHaveBeenCalled();
  });

  it("prepara conclusão de tarefa com resultado e exige confirmação", async () => {
    askJSON.mockResolvedValue({ kind: "complete_task", companyId: company.id, activityId: task.id, result: "Cliente atendeu e pediu proposta" });
    const answer = await planAssistantAction({ actorId: actor.id, question: "Conclua a tarefa da Acme: cliente pediu proposta" });
    expect(answer?.acao).toMatchObject({ status: "awaiting_confirmation", kind: "complete_task" });
    expect(completeActivityRecord).not.toHaveBeenCalled();
  });

  it("não grava enquanto a flag de escrita estiver desligada", async () => {
    vi.stubEnv("TAWPER_AGENT_WRITES_ENABLED", "false");
    const action = { id: actionId, kind: "complete_task", status: "awaiting_confirmation", title: "Concluir", summary: "Resumo", actorId: actor.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), payload: { kind: "complete_task", companyId: company.id, activityId: task.id, result: "Feito" } } satisfies AssistantActionProposal;
    const result = await executeAssistantAction({ actorId: actor.id, action });
    expect(result.ok).toBe(false);
    expect(completeActivityRecord).not.toHaveBeenCalled();
  });

  it("conclui a tarefa só depois da confirmação e registra origem IA", async () => {
    vi.stubEnv("TAWPER_AGENT_WRITES_ENABLED", "true");
    const action = { id: actionId, kind: "complete_task", status: "awaiting_confirmation", title: "Concluir", summary: "Resumo", actorId: actor.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), payload: { kind: "complete_task", companyId: company.id, activityId: task.id, result: "Feito" } } satisfies AssistantActionProposal;
    const result = await executeAssistantAction({ actorId: actor.id, action });
    expect(result.ok).toBe(true);
    expect(completeActivityRecord).toHaveBeenCalledWith(task.id, "Feito", undefined, { actorId: actor.id, actorType: "ai", requestId: actionId });
    expect(invalidateCrmReadCache).toHaveBeenCalledOnce();
  });

  it("recusa confirmação feita por outro usuário", async () => {
    vi.stubEnv("TAWPER_AGENT_WRITES_ENABLED", "true");
    const action = { id: actionId, kind: "complete_task", status: "awaiting_confirmation", title: "Concluir", summary: "Resumo", actorId: actor.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), payload: { kind: "complete_task", companyId: company.id, activityId: task.id, result: "Feito" } } satisfies AssistantActionProposal;
    const result = await executeAssistantAction({ actorId: "00000000-0000-4000-8000-000000000099", action });
    expect(result.ok).toBe(false);
    expect(completeActivityRecord).not.toHaveBeenCalled();
  });
});
