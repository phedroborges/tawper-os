import { describe, expect, it } from "vitest";
import { AGENTS, canExecuteTool, planConversationAgent, planForQuestion } from "./agent-platform";
import { prepareAutomationEvent } from "./automation-contract";
import { decideConversationRoute } from "./conversation-routing";

describe("plataforma multiagente", () => {
  it("registra os 14 agentes com limites e versões", () => {
    expect(Object.keys(AGENTS)).toHaveLength(14);
    for (const [key, agent] of Object.entries(AGENTS)) {
      expect(agent.key).toBe(key);
      expect(agent.maxSteps).toBeGreaterThan(0);
      expect(agent.promptVersion).toMatch(/-v\d$|rule-v\d$/);
    }
  });

  it("delega pergunta e automação ao especialista correto", () => {
    expect(planForQuestion("Quais tarefas do cliente?").agent).toBe("assistant_analytic");
    expect(planForQuestion("Monte uma estratégia").agent).toBe("strategic_copilot");
    expect(planForQuestion("Envie o formulário por WhatsApp")).toMatchObject({ agent: "operations", requiresApproval: true });
  });

  it("nunca libera escrita ou efeito externo sem autenticação e aprovação", () => {
    expect(canExecuteTool("read", { serverAuthenticated: true, humanApproved: false })).toBe(true);
    expect(canExecuteTool("write", { serverAuthenticated: true, humanApproved: false })).toBe(false);
    expect(canExecuteTool("external", { serverAuthenticated: false, humanApproved: true })).toBe(false);
    expect(canExecuteTool("external", { serverAuthenticated: true, humanApproved: true })).toBe(true);
  });

  it("agente de Conversas apenas propõe resposta e exige aprovação", () => {
    expect(planConversationAgent("draft_reply")).toMatchObject({ agent: "conversation", externalSideEffect: false, requiresApproval: true });
  });

  it("roteia pelo dono canônico e envia ambiguidades para a fila", () => {
    expect(decideConversationRoute({ existingOwner: { ownerId: "u1", ownerName: "Ana" }, portfolioCandidates: [] })).toMatchObject({ destination: "owner", ownerId: "u1" });
    expect(decideConversationRoute({ portfolioCandidates: [{ ownerId: "u1", ownerName: "Ana" }, { ownerId: "u2", ownerName: "Bia" }] })).toEqual({ destination: "queue", reason: "ambiguous_portfolio" });
  });

  it("automação aprovada gera evento idempotente sem executar o envio", () => {
    const event = prepareAutomationEvent({ organizationId: "o1", aggregateType: "company", aggregateId: "c1", action: "send_form", payload: { form: "f1" }, approvedBy: "u1", approvalId: "a1" });
    expect(event).toMatchObject({ event_type: "automation.send_form", status: "pending", idempotency_key: "automation:send_form:c1:a1" });
    expect(() => prepareAutomationEvent({ organizationId: "o1", aggregateType: "company", aggregateId: "c1", action: "send_form", payload: {}, approvedBy: "", approvalId: "" })).toThrow(/aprovação humana/);
  });
});
