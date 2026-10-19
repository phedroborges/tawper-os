import { describe, expect, it } from "vitest";
import { renderWhatsAppAnswer } from "./render";

describe("formatação da resposta para WhatsApp", () => {
  it("transforma blocos visuais em texto legível sem HTML ou markdown solto", () => {
    const text = renderWhatsAppAnswer({
      texto: "Resultado da Acme.",
      blocos: [
        { type: "metric", label: "Vendas", value: "R$ 25 mil", comparison: "+12% vs. ontem", trend: "up" },
        { type: "task_list", title: "Tarefas", items: [
          { title: "Enviar proposta", status: "done" },
          { title: "Ligar para Carlos", status: "pending", meta: "vence hoje" },
        ] },
        { type: "bar_chart", title: "Comparativo", items: [
          { label: "Hoje", value: 25000, display: "R$ 25 mil" },
          { label: "Ontem", value: 20000, display: "R$ 20 mil" },
        ] },
      ],
    });
    expect(text).toContain("📊 Vendas: R$ 25 mil");
    expect(text).toContain("✅ Enviar proposta");
    expect(text).toContain("⬜ Ligar para Carlos — vence hoje");
    expect(text).toContain("▰");
    expect(text).not.toContain("<div");
    expect(text).not.toContain("**");
  });

  it("respeita o limite de uma mensagem", () => {
    const text = renderWhatsAppAnswer({ texto: "a".repeat(5000) }, 500);
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).toContain("resposta encurtada");
  });

  it("pede confirmação explícita para uma ação mutável", () => {
    const text = renderWhatsAppAnswer({
      texto: "Vou concluir a tarefa.",
      acao: {
        id: "a1",
        kind: "complete_task",
        status: "awaiting_confirmation",
        title: "Concluir tarefa",
        summary: "Vou concluir a tarefa.",
        confirmationText: "Confirmar conclusão",
        actorId: "u1",
        createdAt: "2026-10-19T20:00:00Z",
        expiresAt: "2026-10-19T20:15:00Z",
        payload: { kind: "complete_task", companyId: "c1", activityId: "t1", result: "Feito" },
      },
    });
    expect(text).toContain("CONFIRMAR");
    expect(text).toContain("CANCELAR");
  });
});
