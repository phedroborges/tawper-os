import { describe, expect, it } from "vitest";
import {
  analyzeRunWithEvaluator,
  classifySessionIntervention,
  evaluateSellerOrderQuality,
  summarizeIaSessions,
  type IaSessionBlock,
} from "./ia-sessions";

describe("ia-sessions", () => {
  it("classifica corretamente necessidade de intervenção humana, atenção, auto-correção e revisão", () => {
    const baseRun = {
      id: "r1",
      at: "2026-11-14T14:00:00.000Z",
      status: "completed",
      caminho: "ferramentas" as const,
      latencyMs: 1200,
      tokens: 300,
      pergunta: "Visita feita na Usina Santa Helena com o Marcos, retorno dia 20/11",
      resposta: "Registrado",
      audio: false,
      companyId: "c1",
      gravou: ["registrar_atividade"],
      marcas: [],
      steps: [],
    };

    expect(classifySessionIntervention({ runs: [baseRun], messages: [] }).level).toBe("normal");

    const erroDiag = classifySessionIntervention({
      runs: [{ ...baseRun, gravou: [], marcas: ["errou"] }],
      messages: [],
    });
    expect(erroDiag.level).toBe("intervencao");
    expect(erroDiag.pendingOwner).toBe("ia");
    expect(erroDiag.reasons.length).toBeGreaterThan(0);

    const autoHealedDiag = classifySessionIntervention({
      runs: [
        {
          ...baseRun,
          marcas: [
            "errou",
            "auto_corrigido:Tarefa criada pela IA Avaliadora",
            "acao_corretora:criar_tarefa",
          ],
        },
      ],
      messages: [],
    });
    expect(autoHealedDiag.level).toBe("revisado");
    expect(autoHealedDiag.autoHealedCount).toBe(1);
    expect(autoHealedDiag.conversationState).toBe("auto_corrigida");

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
    expect(pendingDiag.pendingOwner).toBe("equipe");
  });

  it("separa erro da IA de pedido vago/incompleto da equipe", () => {
    const completeOrder = evaluateSellerOrderQuality({
      question: "Visitei a Agroindustrial Rio das Pedras hoje com o Marcos e agendei retorno para sexta-feira",
      hasCompanyId: true,
      gravou: ["registrar_atividade", "criar_tarefa"],
      marcas: [],
      resposta: "Gravado!",
    });
    expect(completeOrder.grade).toBe("completo");
    expect(completeOrder.score).toBeGreaterThanOrEqual(85);
    expect(completeOrder.missing).toHaveLength(0);

    const vagueOrder = evaluateSellerOrderQuality({
      question: "falei lá hoje",
      hasCompanyId: false,
      gravou: [],
      marcas: ["recusado:cliente_nao_identificado"],
      resposta: "Qual cliente você visitou e qual o próximo passo?",
    });
    expect(vagueOrder.grade).toBe("vago");
    expect(vagueOrder.missing.length).toBeGreaterThan(0);

    const teamCause = analyzeRunWithEvaluator({
      id: "r-vago",
      at: "2026-11-14T14:00:00.000Z",
      status: "completed",
      caminho: "ferramentas",
      latencyMs: 900,
      tokens: 200,
      pergunta: "falei lá hoje",
      resposta: "Qual é a empresa?",
      audio: true,
      gravou: [],
      marcas: ["recusado:cliente_nao_identificado"],
      steps: [],
      orderQuality: vagueOrder,
    });
    expect(teamCause.rootCause).toBe("pedido_incompleto_equipe");
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
        conversationState: "fechada_com_registro",
        pendingOwner: "nenhuma",
        fluencyScorePct: 96,
        sellerOrderScorePct: 95,
        autoHealedCount: 1,
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
        conversationState: "em_aberto_ia",
        pendingOwner: "ia",
        fluencyScorePct: 70,
        sellerOrderScorePct: 80,
        autoHealedCount: 0,
        runs: [{ id: "r2", at: "2026-11-14T13:00:00.000Z", status: "failed", caminho: "ferramentas", latencyMs: 2000, tokens: 100, pergunta: "a", resposta: "", audio: false, gravou: [], marcas: ["errou"], steps: [] }],
        messages: [],
      },
    ];

    const summary = summarizeIaSessions(sessions);
    expect(summary.totalSessions).toBe(2);
    expect(summary.needsIntervention).toBe(1);
    expect(summary.totalMessages).toBe(16);
    expect(summary.totalWrites).toBe(5);
    expect(summary.iaScorePct).toBe(50);
    expect(summary.avgLatencyMs).toBe(1500);
    expect(summary.closedWithRecordCount).toBe(1);
    expect(summary.iaPendingCount).toBe(1);
    expect(summary.autoHealedCount).toBe(1);
  });
});
