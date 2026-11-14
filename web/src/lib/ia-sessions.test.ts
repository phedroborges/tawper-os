import { describe, expect, it } from "vitest";
import { classifySessionIntervention, summarizeIaSessions, type IaSessionBlock } from "./ia-sessions";

describe("ia-sessions", () => {
  it("classifica corretamente necessidade de intervenção humana, atenção e revisão", () => {
    const baseRun = {
      id: "r1",
      at: "2026-11-14T14:00:00.000Z",
      status: "completed",
      caminho: "ferramentas" as const,
      latencyMs: 1200,
      tokens: 300,
      pergunta: "Visita feita na empresa X",
      resposta: "Registrado",
      audio: false,
      gravou: ["registrar_atividade"],
      marcas: [],
      steps: [],
    };

    expect(classifySessionIntervention({ runs: [baseRun], messages: [] }).level).toBe("normal");

    const erroDiag = classifySessionIntervention({
      runs: [{ ...baseRun, marcas: ["errou"] }],
      messages: [],
    });
    expect(erroDiag.level).toBe("intervencao");
    expect(erroDiag.reasons.length).toBeGreaterThan(0);

    const revDiag = classifySessionIntervention({
      runs: [{ ...baseRun, marcas: ["errou", "revisado:Murilo"] }],
      messages: [],
    });
    expect(revDiag.level).toBe("revisado");
    expect(revDiag.reviewedBy).toBe("Murilo");

    const pendingDiag = classifySessionIntervention({
      runs: [baseRun],
      messages: [{ id: "m1", at: "2026-11-14T14:05:00.000Z", direction: "out", body: "Confirma?", actionPending: true }],
    });
    expect(pendingDiag.level).toBe("atencao");
  });

  it("resume totais da equipe corretamente", () => {
    const sessions: IaSessionBlock[] = [
      {
        id: "s1",
        sellerId: "u1",
        sellerName: "Fernando",
        sellerShort: "Fernando",
        phone: "5534999990001",
        status: "active",
        attendant: "Agente Tawper IA",
        modelLabel: "gpt-4o-mini",
        intervention: "normal",
        interventionReasons: [],
        messagesTotal: 10,
        messagesFromSeller: 5,
        messagesFromIa: 5,
        audioCount: 2,
        writesCount: 4,
        consultsCount: 1,
        errorsCount: 0,
        pendingActionsCount: 0,
        iaScorePct: 100,
        avgLatencyMs: 1000,
        lastActivityAt: "2026-11-14T14:00:00.000Z",
        lastQuestion: "ok",
        lastReply: "gravado",
        lastGravou: ["registrar_atividade"],
        runs: [{ id: "r1", at: "2026-11-14T14:00:00.000Z", status: "completed", caminho: "ferramentas", latencyMs: 1000, tokens: 100, pergunta: "a", resposta: "b", audio: false, gravou: ["registrar_atividade"], marcas: [], steps: [] }],
        messages: [],
      },
      {
        id: "s2",
        sellerId: "u2",
        sellerName: "Gustavo",
        sellerShort: "Gustavo",
        phone: "5534999990002",
        status: "active",
        attendant: "Escalar para gestor",
        modelLabel: "gpt-4o-mini",
        intervention: "intervencao",
        interventionReasons: ["Falha"],
        messagesTotal: 6,
        messagesFromSeller: 3,
        messagesFromIa: 3,
        audioCount: 0,
        writesCount: 1,
        consultsCount: 0,
        errorsCount: 1,
        pendingActionsCount: 0,
        iaScorePct: 50,
        avgLatencyMs: 2000,
        lastActivityAt: "2026-11-14T13:00:00.000Z",
        lastQuestion: "errou",
        lastReply: "erro",
        lastGravou: [],
        runs: [{ id: "r2", at: "2026-11-14T13:00:00.000Z", status: "failed", caminho: "ferramentas", latencyMs: 2000, tokens: 100, pergunta: "a", resposta: "", audio: false, gravou: [], marcas: ["errou"], steps: [] }],
        messages: [],
      },
    ];

    const summary = summarizeIaSessions(sessions);
    expect(summary.totalSessions).toBe(2);
    expect(summary.needsIntervention).toBe(1);
    expect(summary.totalMessages).toBe(16);
    expect(summary.totalWrites).toBe(5);
    expect(summary.avgLatencyMs).toBe(1500);
    expect(summary.iaScorePct).toBe(50);
  });
});
