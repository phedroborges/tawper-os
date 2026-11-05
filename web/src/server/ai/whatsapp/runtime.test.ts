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
  ensureOperators: vi.fn(),
  resolveUser: vi.fn(),
  aiAssistant: vi.fn(),
  executeAction: vi.fn(),
  send: vi.fn(),
  recordRun: vi.fn(),
  flagRun: vi.fn(),
  toolsOn: vi.fn(() => false),
  runTool: vi.fn(),
  claimUndo: vi.fn(),
  finishUndo: vi.fn(),
  runUndo: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({ ASSISTANT_HELP: "ajuda", assistantAnswer: vi.fn(() => ({ texto: "fallback" })) }));
vi.mock("@/lib/ai-context", () => ({ systemContext: vi.fn(() => ({})) }));
vi.mock("@/server/crm", () => ({ loadCrmSnapshot: mocks.loadSnapshot, invalidateCrmReadCache: vi.fn() }));
vi.mock("@/server/persist", () => ({ ensureOperators: mocks.ensureOperators }));
vi.mock("../actions", () => ({ aiAssistant: mocks.aiAssistant }));
vi.mock("../action-engine", () => ({ executeAssistantAction: mocks.executeAction }));
vi.mock("../agent", () => ({ AGENT_VERSION: "teste", agentToolsEnabled: mocks.toolsOn, runToolAgent: mocks.runTool }));
vi.mock("../agent/undo", () => ({ runUndo: mocks.runUndo }));
vi.mock("./access", () => ({ resolveWhatsAppAgentUser: mocks.resolveUser }));
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
  recordWhatsAppAgentRun: mocks.recordRun,
  flagLastWhatsAppAgentRun: mocks.flagRun,
  claimWhatsAppUndo: mocks.claimUndo,
  finishWhatsAppUndo: mocks.finishUndo,
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
    mocks.ensureOperators.mockResolvedValue({});
    mocks.resolveUser.mockImplementation((_identity: unknown, users: unknown[]) => ({ user: users[0], linked: true }));
  });

  it("executa a proposta pendente ao receber CONFIRMAR", async () => {
    mocks.claimAction.mockResolvedValue({ id: "message-1", action });
    mocks.executeAction.mockResolvedValue({ ok: true, message: "Tarefa concluída.", action: { ...action, status: "executed" } });
    await expect(processWhatsAppAgentQueue(2)).resolves.toEqual({ processed: 1, failed: 0 });
    expect(mocks.executeAction).toHaveBeenCalledWith({ actorId: actor.id, action });
    expect(mocks.finishAction).toHaveBeenCalledWith("message-1", "executed");
    expect(mocks.aiAssistant).not.toHaveBeenCalled();
  });

  it("sem proposta pendente, CONFIRMAR é resposta a uma pergunta do agente e segue para a conversa", async () => {
    mocks.claimAction.mockResolvedValue(null);
    mocks.aiAssistant.mockResolvedValue({ texto: "Certo, seguindo com o cadastro." });
    await processWhatsAppAgentQueue(2);
    expect(mocks.executeAction).not.toHaveBeenCalled();
    expect(mocks.aiAssistant).toHaveBeenCalledWith(expect.objectContaining({ question: "CONFIRMAR" }));
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", "Certo, seguindo com o cadastro.");
  });

  it("guarda a proposta gerada para uma confirmação posterior", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("Conclua a tarefa da Acme, resultado: cliente pediu proposta")).mockResolvedValue(null);
    mocks.aiAssistant.mockResolvedValue({ texto: "Vou concluir.", acao: action });
    await processWhatsAppAgentQueue(2);
    expect(mocks.aiAssistant).toHaveBeenCalledWith(expect.objectContaining({ actorId: actor.id }));
    expect(mocks.recordReply).toHaveBeenCalledWith(expect.objectContaining({ action }));
  });

  it("entende CONFIRMAR dito em áudio, com pontuação", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("[áudio] Confirmar.")).mockResolvedValue(null);
    mocks.claimAction.mockResolvedValue({ id: "message-1", action });
    mocks.executeAction.mockResolvedValue({ ok: true, message: "Tarefa concluída.", action: { ...action, status: "executed" } });
    await processWhatsAppAgentQueue(2);
    expect(mocks.executeAction).toHaveBeenCalledWith({ actorId: actor.id, action });
  });

  it("avisa que não ouviu quando o áudio não foi transcrito, sem chamar a IA", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("[áudio sem transcrição]")).mockResolvedValue(null);
    await expect(processWhatsAppAgentQueue(2)).resolves.toEqual({ processed: 1, failed: 0 });
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", expect.stringContaining("Não consegui ouvir"));
    expect(mocks.aiAssistant).not.toHaveBeenCalled();
  });

  it("responde o áudio direto, passando só a transcrição à IA", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("[áudio] Quais tarefas tenho hoje?")).mockResolvedValue(null);
    mocks.aiAssistant.mockResolvedValue({ texto: "Você tem 3 tarefas." });
    await processWhatsAppAgentQueue(2);
    expect(mocks.aiAssistant).toHaveBeenCalledWith(expect.objectContaining({ question: "Quais tarefas tenho hoje?" }));
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", "Você tem 3 tarefas.");
  });

  it("cria os perfis que faltam e tenta de novo quando o número ainda não tem perfil", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("Quais tarefas tenho hoje?")).mockResolvedValue(null);
    mocks.aiAssistant.mockResolvedValue({ texto: "Você tem 3 tarefas." });
    mocks.resolveUser
      .mockReturnValueOnce({ user: { ...actor, id: "whatsapp-5564999430898" }, linked: false })
      .mockReturnValueOnce({ user: actor, linked: true });
    await processWhatsAppAgentQueue(2);
    expect(mocks.ensureOperators).toHaveBeenCalledTimes(1);
    expect(mocks.aiAssistant).toHaveBeenCalledWith(expect.objectContaining({ actorId: actor.id }));
  });

  it("guarda o atendimento para a revisão, marcando quando caiu no fluxo antigo", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("[áudio] Quais tarefas tenho hoje?")).mockResolvedValue(null);
    mocks.toolsOn.mockReturnValue(true);
    mocks.runTool.mockResolvedValue(null);
    mocks.aiAssistant.mockResolvedValue({ texto: "Você tem 3 tarefas." });
    await processWhatsAppAgentQueue(2);
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ question: "Quais tarefas tenho hoje?", audio: true, caminho: "fluxo_antigo", resposta: "Você tem 3 tarefas.", marcas: ["caiu_no_fluxo_antigo"], versao: "teste" }),
    );
    mocks.toolsOn.mockReturnValue(false);
  });

  it("sem a IA e sem palavra-chave: avisa do problema técnico em vez de mandar o texto de ajuda", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("Qual etapa ela está?")).mockResolvedValue(null);
    mocks.toolsOn.mockReturnValue(true);
    mocks.runTool.mockResolvedValue(null);
    mocks.aiAssistant.mockResolvedValue({ texto: "ajuda" });
    await processWhatsAppAgentQueue(2);
    expect(mocks.send).toHaveBeenLastCalledWith("5517999999999", expect.stringContaining("problema técnico"));
    expect(mocks.recordRun).toHaveBeenLastCalledWith(expect.objectContaining({ marcas: ["caiu_no_fluxo_antigo"] }));
    mocks.toolsOn.mockReturnValue(false);
  });

  it("com ferramentas: guarda os passos e a anotação interna, que volta na próxima mensagem", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("liguei pro Pedro da Ativos")).mockResolvedValue(null);
    mocks.toolsOn.mockReturnValue(true);
    mocks.history.mockResolvedValue([{ role: "assistant", content: "Qual cliente?", contexto: "Ativos empresa_id=c1" }]);
    const passos = [{ kind: "tool", tool: "registrar_atividade", ok: true, request: {}, response: {}, ms: 5 }];
    mocks.runTool.mockResolvedValue({ texto: "✅ Registrado.", gravou: ["registrar_atividade"], passos, contexto: ["Ativos empresa_id=c1: registrada Ligação"], marcas: [], empresaId: "c1", modelo: "gpt", tokens: { entrada: 1, saida: 1 } });
    await processWhatsAppAgentQueue(2);
    expect(mocks.runTool).toHaveBeenCalledWith(expect.objectContaining({ history: [{ role: "assistant", content: "Qual cliente?\n[interno: Ativos empresa_id=c1]" }] }));
    expect(mocks.recordReply).toHaveBeenCalledWith(expect.objectContaining({ body: "✅ Registrado.", contexto: "Ativos empresa_id=c1: registrada Ligação" }));
    expect(mocks.recordRun).toHaveBeenCalledWith(expect.objectContaining({ caminho: "ferramentas", gravou: ["registrar_atividade"], passos, companyId: "c1" }));
    mocks.toolsOn.mockReturnValue(false);
  });

  it("\"errou\" marca o atendimento anterior para revisão, sem chamar a IA", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("Errou!")).mockResolvedValue(null);
    mocks.flagRun.mockResolvedValue(true);
    await processWhatsAppAgentQueue(2);
    expect(mocks.flagRun).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000090", "usuario_marcou_erro");
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", expect.stringContaining("revisão"));
    expect(mocks.aiAssistant).not.toHaveBeenCalled();
  });

  it("gravação sai com a opção DESFAZER, guardada junto da resposta", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("cadastra a Pitangueiras em Pitangueiras")).mockResolvedValue(null);
    mocks.toolsOn.mockReturnValue(true);
    const desfazer = [{ ops: [{ op: "apagar_empresa", id: "c9" }], resumo: "cadastro da Pitangueiras" }];
    mocks.runTool.mockResolvedValue({ texto: "✅ Cliente cadastrado.", gravou: ["criar_cliente"], passos: [], contexto: [], desfazer, marcas: [], tokens: { entrada: 1, saida: 1 } });
    await processWhatsAppAgentQueue(2);
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", "✅ Cliente cadastrado.\n\n↩️ Errei? Responda DESFAZER.");
    expect(mocks.recordReply).toHaveBeenCalledWith(expect.objectContaining({ desfazer }));
    mocks.toolsOn.mockReturnValue(false);
  });

  it("DESFAZER aplica o contrário da última gravação, sem chamar a IA", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("Desfazer.")).mockResolvedValue(null);
    const desfazer = [{ ops: [{ op: "apagar_empresa", id: "c9" }], resumo: "cadastro da Pitangueiras" }];
    mocks.claimUndo.mockResolvedValue({ id: "m1", desfazer });
    await processWhatsAppAgentQueue(2);
    expect(mocks.runUndo).toHaveBeenCalledWith(actor.id, desfazer);
    expect(mocks.finishUndo).toHaveBeenCalledWith("m1", "done");
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", "↩️ Desfeito: cadastro da Pitangueiras.");
    expect(mocks.aiAssistant).not.toHaveBeenCalled();
  });

  it("DESFAZER que falha no banco avisa e deixa para tentar de novo", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("desfaz")).mockResolvedValue(null);
    mocks.claimUndo.mockResolvedValue({ id: "m1", desfazer: [{ ops: [], resumo: "x" }] });
    mocks.runUndo.mockRejectedValueOnce(new Error("banco fora"));
    await processWhatsAppAgentQueue(2);
    expect(mocks.finishUndo).toHaveBeenCalledWith("m1", "failed");
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", expect.stringContaining("Não consegui desfazer: banco fora"));
  });

  it("DESFAZER sem nada recente responde sem mexer no banco", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("desfazer")).mockResolvedValue(null);
    mocks.claimUndo.mockResolvedValue(null);
    await processWhatsAppAgentQueue(2);
    expect(mocks.runUndo).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith("5517999999999", expect.stringContaining("nada recente"));
  });

  it("não tenta criar perfis quando o número já está vinculado", async () => {
    mocks.claimJob.mockReset();
    mocks.claimJob.mockResolvedValueOnce(job("Quais tarefas tenho hoje?")).mockResolvedValue(null);
    mocks.aiAssistant.mockResolvedValue({ texto: "ok" });
    await processWhatsAppAgentQueue(2);
    expect(mocks.ensureOperators).not.toHaveBeenCalled();
  });
});
