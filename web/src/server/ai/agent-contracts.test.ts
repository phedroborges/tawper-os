import { describe, expect, it } from "vitest";
import type { DailyBriefing, ExtractedLead, ManagerDigest, QuickProposal } from "@/lib/ai";
import type { ConversationSummary } from "@/lib/types";
import { planConversationAgent } from "./agent-platform";
import { prepareAutomationEvent } from "./automation-contract";
import { decideConversationRoute } from "./conversation-routing";
import {
  normalizeConversationSummary,
  normalizeDailyBriefing,
  normalizeExtractedLead,
  normalizeManagerDigest,
  normalizeNextStep,
  normalizeQuickNote,
  normalizeTranscript,
  validateTranscriptionFile,
} from "./contracts";

const nextStep: QuickProposal["proximoPasso"] = {
  titulo: "Ligar para o cliente",
  tipo: "Ligação",
  dueAt: "2026-10-20T13:00:00.000Z",
  prioridade: "Alta",
};

const quickFallback: QuickProposal = {
  canal: "Nota",
  resultado: "Conversa registrada",
  resumo: "Cliente pediu retorno.",
  proximoPasso: nextStep,
  checks: { decisor: true },
  dadosExtraidos: {},
  destaques: ["retorno"],
  confianca: 0.7,
  sugereGanho: false,
};

describe("migração individual dos agentes", () => {
  it("1. registro rápido valida a estrutura e não aceita etapa inventada", () => {
    const result = normalizeQuickNote({ canal: "Telegram", etapaSugerida: { stageId: "inventada" }, resultado: "  Falou com compras  ", checks: { admin: true }, dadosExtraidos: { colhedoras: "99" } }, quickFallback, [{ id: "qualificacao", nome: "Qualificação" }]);
    expect(result.canal).toBe("Nota");
    expect(result.resultado).toBe("Falou com compras");
    expect(result.etapaSugerida).toBeUndefined();
    expect(result.checks).toEqual({ decisor: true });
    expect(result.dadosExtraidos.colhedoras).toBeUndefined();
  });

  it("2. próximo passo rejeita tipo, data e prioridade fora do contrato", () => {
    const result = normalizeNextStep({ titulo: "Enviar proposta", tipo: "Hack", dueAt: "ontem talvez", prioridade: "Urgentíssima" }, nextStep);
    expect(result).toEqual({ ...nextStep, titulo: "Enviar proposta" });
    expect(normalizeNextStep({ dueAt: "2026-02-31" }, nextStep).dueAt).toBe(nextStep.dueAt);
  });

  it("3. resumo de conversas limita listas e não inventa etapa", () => {
    const fallback: ConversationSummary = { assunto: "Teste", necessidade: "Mangueira", objecoes: [], compromissosTawper: [], compromissosCliente: [], datas: [], proximoPasso: "Retornar", proximoPassoTipo: "WhatsApp", proximoPassoDias: 2, confianca: 0.7, geradoEm: "2026-10-19T00:00:00.000Z" };
    const result = normalizeConversationSummary({ objecoes: ["1", "2", "3", "4", "5", "6"], etapaSugerida: "fantasma", proximoPassoDias: 99 }, fallback, [{ id: "teste", nome: "Teste" }], new Date("2026-10-19T12:00:00.000Z"));
    expect(result.objecoes).toHaveLength(5);
    expect(result.etapaSugerida).toBeUndefined();
    expect(result.proximoPassoDias).toBe(30);
  });

  it("4. roteamento de conversas usa a carteira e deixa ambiguidades na fila", () => {
    expect(decideConversationRoute({ portfolioCandidates: [{ ownerId: "u1", ownerName: "Ana" }] })).toEqual({ destination: "owner", ownerId: "u1", ownerName: "Ana", reason: "portfolio_match" });
    expect(decideConversationRoute({ portfolioCandidates: [{ ownerId: "u1", ownerName: "Ana" }, { ownerId: "u2", ownerName: "Beto" }] })).toEqual({ destination: "queue", reason: "ambiguous_portfolio" });
  });

  it("5. extração de lead preserva os enums válidos do cadastro", () => {
    const fallback: ExtractedLead = { empresa: "Sem empresa", cidade: "Ribeirão Preto", uf: "SP", contatoNome: "Carlos", papel: "Decisor", cargo: "Diretor", interesse: "Mangueiras", origem: "WhatsApp", indicacao: undefined, dor: undefined };
    const result = normalizeExtractedLead({ empresa: "Usina X", uf: "XX", papel: "Imperador" }, fallback);
    expect(result.empresa).toBe("Usina X");
    expect(result.uf).toBe("SP");
    expect(result.papel).toBe("Decisor");
  });

  it("6. briefing diário remove empresa inventada e mantém prioridades omitidas", () => {
    const fallback = { saudacao: "Bom dia", resumo: "Duas prioridades", prioridades: [{ companyId: "c1", texto: "Ligar" }, { companyId: "c2", texto: "Visitar" }], semProximo: 0 } as DailyBriefing;
    const result = normalizeDailyBriefing({ prioridades: [{ companyId: "fantasma", texto: "Inventada" }, { companyId: "c2", texto: "Visitar hoje" }] }, fallback);
    expect(result.prioridades).toEqual([{ companyId: "c2", texto: "Visitar" }, { companyId: "c1", texto: "Ligar" }]);
  });

  it("7. resumo gerencial devolve no máximo quatro linhas válidas", () => {
    const fallback: ManagerDigest = { linhas: ["A", "B", "C", "D"] };
    const result = normalizeManagerDigest({ linhas: ["A", "B", "C", "D", "E"] }, fallback);
    expect(result.linhas).toEqual(["A", "B", "C", "D"]);
  });

  it("8. transcrição aceita áudio suportado, limita tamanho e limpa o texto", () => {
    expect(validateTranscriptionFile({ size: 1024, type: "audio/webm" })).toBe(true);
    expect(validateTranscriptionFile({ size: 1024, type: "audio/webm;codecs=opus" })).toBe(true);
    expect(validateTranscriptionFile({ size: 26 * 1024 * 1024, type: "audio/webm" })).toBe(false);
    expect(validateTranscriptionFile({ size: 1024, type: "application/pdf" })).toBe(false);
    expect(normalizeTranscript("  olá mundo  ")).toBe("olá mundo");
  });

  it("9. agente de Conversas planeja sem efeito externo automático", () => {
    expect(planConversationAgent("summarize")).toMatchObject({ agent: "conversation", externalSideEffect: false, requiresApproval: false });
    expect(planConversationAgent("draft_reply")).toMatchObject({ externalSideEffect: false, requiresApproval: true });
  });

  it("10. agente de Operações exige aprovação e gera idempotência estável", () => {
    const input = { organizationId: "o1", aggregateType: "company" as const, aggregateId: "c1", action: "send_form" as const, payload: { formId: "f1" }, approvedBy: "u1", approvalId: "a1" };
    const first = prepareAutomationEvent(input);
    const second = prepareAutomationEvent(input);
    expect(first.idempotency_key).toBe(second.idempotency_key);
    expect(first.event_type).toBe("automation.send_form");
    expect(() => prepareAutomationEvent({ ...input, approvalId: "" })).toThrow(/aprovação humana/);
  });
});
