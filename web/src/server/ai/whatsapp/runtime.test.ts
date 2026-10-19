import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimJob: vi.fn(),
  finishJob: vi.fn(),
  findReply: vi.fn(),
  history: vi.fn(),
  recordReply: vi.fn(),
  bind: vi.fn(),
  claimAction: vi.fn(),
  finishAction: vi.fn(),
  loadSnapshot: vi.fn(),
  aiAssistant: vi.fn(),
  executeAction: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({ assistantAnswer: vi.fn(() => ({ texto: "fallback" })) }));
vi.mock("@/lib/ai-context", () => ({ systemContext: vi.fn(() => ({})) }));
vi.mock("@/server/crm", () => ({ loadCrmSnapshot: mocks.loadSnapshot }));
vi.mock("../actions", () => ({ aiAssistant: mocks.aiAssistant }));
vi.mock("../action-engine", () => ({ executeAssistantAction: mocks.executeAction }));
vi.mock("./access", () => ({ resolveWhatsAppAgentUser: vi.fn((_identity, snapshotUsers) => ({ user: snapshotUsers[0], linked: true })) }));
vi.mock("./config", () => ({ findWhatsAppAgentIdentity: vi.fn(() => ({ phone: "5517999999999", name: "Murilo", role: "gestor" })) }));
vi.mock("./render", () => ({ renderWhatsAppAnswer: vi.fn((answer) => answer.texto) }));
vi.mock("./stevo", () => ({ sendWhatsAppAgentText: mocks.send }));
vi.mock("./store", () => ({
  bindWhatsAppAgentSessionProfile: mocks.bind,
  claimWhatsAppAgentJob: mocks.claimJob,
  claimPendingWhatsAppAction: mocks.claimAction,
  findWhatsAppAgentReply: mocks.findReply,
  finishPendingWhatsAppAction: mocks.finishAction,
  finishWhatsAppAgentJob: mocks.finishJob,
  loadWhatsAppAgentHistory: mocks.history,
  recordWhatsAppAgentReply: mocks.recordReply,
}));

import { processWhatsAppAgentQueue } from "./runtime";

const actor = { id: "00000000-0000-4000-8000-000000000010", name: "Murilo", short: "Murilo", role: "gestor", title: "", initials: "MU", color: "#000", phone: "", regions: [] };
const action = {
  id: "a1",
  kind: "complete_task" as const,
  status: "awaiting_confirmation" as const,
  title: "Concluir",
  summary: "Concluir tarefa",
  actorId: actor.id,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  payload: { kind: "complete_task" as const, companyId: "c1", activityId: "t1", result: "Feito" },
};

function job(question: string) {
  return { id: crypto.randomUUID(), organization_id: "org", aggregate_id: "session-1", attempts: 0, payload: { session_id: "00000000-0000-4000-8000-000000000090", sender: "5517999999999", external_message_id: crypto.randomUUID(), question } };
}

describe("execução de ações pelo WhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimJob.mockResolvedValueOnce(job("CONFIRMAR")).mockResolvedValue(null);
    mocks.findReply.mockResolvedValue(null);
    mocks.loadSnapshot.mockResolvedValue({ companies: [], contacts: [], deals: [], activities: [], users: [actor], quotes: [], interactions: [], audit: [], strategies: [], strategyHistory: [] });
    mocks.send.mockResolvedValue({ messageId: "out-1" });
    mocks.history.mockResolvedValue([]);
  });

  it("executa a proposta pendente ao receber CONFIRMAR", async () => {
    mocks.claimAction.mockResolvedValue({ id: "message-1", action });
    mocks.executeAction.mockResolvedValue({ ok: true, message: "Tarefa concluída.", action: { ...action, status: "executed" } });
    await expect(processWhatsAppAgentQueue(2)).resolves.toEqual({ processed: 1, failed: 0 });
    expect(mocks.executeAction).toHaveBeenCalledWith({ actorId: actor.id, action });
    expect(mocks.finishAction).toHaveBeenCalledWith("message-1", "executed");
    expect(mocks.aiAssistant).not.toHaveBeenCalled();
  });

  it("não repete a ação quando não existe mais proposta pendente", async () => {
    mocks.claimAction.mockResolvedValue(null);
    await processWhatsAppAgentQueue(2);
    expect(mocks.executeAction).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", expect.stringContaining("Não há uma ação pendente"));
  });

  it("guarda a proposta gerada para uma confirmação posterior", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("Conclua a tarefa da Acme, resultado: cliente pediu proposta")).mockResolvedValue(null);
    mocks.aiAssistant.mockResolvedValue({ texto: "Vou concluir.", acao: action });
    await processWhatsAppAgentQueue(2);
    expect(mocks.aiAssistant).toHaveBeenCalledWith(expect.objectContaining({ actorId: actor.id }));
    expect(mocks.recordReply).toHaveBeenCalledWith(expect.objectContaining({ action }));
  });
});
