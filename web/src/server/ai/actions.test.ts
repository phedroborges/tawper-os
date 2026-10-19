import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickProposal } from "@/lib/ai";
import type { ConversationSummary } from "@/lib/types";

const { askJSON, transcribe } = vi.hoisted(() => ({ askJSON: vi.fn(), transcribe: vi.fn() }));
vi.mock("./openai", () => ({ askJSON, aiConfigured: () => true }));
vi.mock("ai", () => ({ experimental_transcribe: transcribe }));
vi.mock("@ai-sdk/gateway", () => ({ gateway: { transcriptionModel: (model: string) => model } }));
vi.mock("@/server/integrations/stevo-proof/live-store", () => ({ listLiveCorpus: vi.fn().mockResolvedValue([]) }));

import { aiAssistant, aiBriefing, aiCopilot, aiDigest, aiExtractLead, aiNextStep, aiQuickNote, aiRoute, aiSummarize, aiTranscribe } from "./actions";

const step: QuickProposal["proximoPasso"] = { titulo: "Ligar", tipo: "Ligação", dueAt: "2026-10-20T13:00:00.000Z", prioridade: "Alta" };
const quick: QuickProposal = { canal: "Nota", resultado: "Registrado", resumo: "Resumo", proximoPasso: step, checks: {}, dadosExtraidos: {}, destaques: [], confianca: 0.7, sugereGanho: false };

describe("ações dos especialistas", () => {
  beforeEach(() => {
    vi.stubEnv("TAWPER_MULTI_AGENT_ENABLED", "true");
    askJSON.mockReset();
    transcribe.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("assistente entrega blocos seguros e remove markdown", async () => {
    askJSON.mockResolvedValue({ texto: "### **Hoje** *", blocos: [{ type: "task_list", title: "Tarefas", items: [{ title: "Ligar", status: "done", href: "/empresas/c1" }] }] });
    const result = await aiAssistant({ question: "tarefas", sistema: {}, fallback: { texto: "fallback" }, allowedCompanyIds: ["c1"] });
    expect(result.texto).toBe("Hoje");
    expect(result.blocos?.[0]).toMatchObject({ type: "task_list" });
    expect(askJSON.mock.calls[0][0]).toMatchObject({ task: "assistant", agentKey: "assistant_analytic" });
  });

  it("delega perguntas estratégicas ao copiloto sem liberar ações", async () => {
    askJSON.mockResolvedValue({ texto: "Plano seguro", blocos: [] });
    await aiAssistant({ question: "Crie uma estratégia para esta negociação", sistema: {}, fallback: { texto: "fallback" }, allowedCompanyIds: [] });
    expect(askJSON.mock.calls[0][0]).toMatchObject({ task: "strategy", agentKey: "strategic_copilot" });
    expect(askJSON.mock.calls[0][0].system).toContain("ferramentas seguras");
  });

  it("copiloto respeita o decisor cadastrado", async () => {
    askJSON.mockResolvedValue({ titulo: "Descobrir decisor", acoes: [{ titulo: "Identificar decisor", tipo: "Ligação", prazoDias: 2 }], faltantes: ["Quem decide a compra?"] });
    const fallback = { titulo: "Plano", texto: "Texto", detalhes: { diagnostico: "D", hipoteses: [], acoes: [{ titulo: "Ligar", tipo: "Ligação" as const, prazoDias: 1 }], perguntas: [], rascunho: "Oi", objetivo: "O", barreira: "B", estrategia: "E", resultadoEsperado: "R" }, base: [], faltantes: [] };
    const result = await aiCopilot({ context: { contatos: [{ nome: "Carlos", papel: "Decisor" }] }, fallback });
    expect(result.base[0]).toContain("Carlos");
    expect(result.faltantes).toEqual([]);
  });

  it("registro rápido usa o contrato do especialista", async () => {
    askJSON.mockResolvedValue({ resultado: "Falou", canal: "WhatsApp" });
    expect((await aiQuickNote({ note: "falou", context: {}, stages: [], fallback: quick })).resultado).toBe("Falou");
    expect(askJSON.mock.calls[0][0].task).toBe("quick_note");
  });

  it("próximo passo usa o contrato do especialista", async () => {
    askJSON.mockResolvedValue({ titulo: "Enviar proposta", tipo: "E-mail", dueAt: "2026-10-21", prioridade: "Média" });
    expect((await aiNextStep({ resultado: "ok", context: {}, fallback: step })).titulo).toBe("Enviar proposta");
    expect(askJSON.mock.calls[0][0].task).toBe("next_step");
  });

  it("resumo usa o agente de Conversas", async () => {
    const fallback: ConversationSummary = { assunto: "A", necessidade: "N", objecoes: [], compromissosTawper: [], compromissosCliente: [], datas: [], proximoPasso: "P", proximoPassoTipo: "WhatsApp", proximoPassoDias: 1, confianca: 0.7, geradoEm: "2026-10-19T00:00:00Z" };
    askJSON.mockResolvedValue({ assunto: "Mangueiras" });
    expect((await aiSummarize({ messages: [], context: {}, stages: [], fallback })).assunto).toBe("Mangueiras");
    expect(askJSON.mock.calls[0][0].task).toBe("conversation_summary");
  });

  it("rota de visitas não aceita empresa inventada", async () => {
    askJSON.mockResolvedValue({ companyIds: ["inventada", "c2", "c1"] });
    await expect(aiRoute({ regiao: "SP", candidates: [{ id: "c1", nome: "A", score: 1, motivos: [] }, { id: "c2", nome: "B", score: 2, motivos: [] }], fallbackIds: ["c1"] })).resolves.toEqual(["c2", "c1"]);
    expect(askJSON.mock.calls[0][0]).toMatchObject({ task: "visit_route", agentKey: "visit_route" });
  });

  it("extração de lead valida o cadastro proposto", async () => {
    const fallback = { empresa: "X", cidade: "Ribeirão", uf: "SP", contatoNome: "Ana", papel: "Comprador" as const, cargo: "", interesse: "", origem: "WhatsApp", indicacao: undefined, dor: undefined };
    askJSON.mockResolvedValue({ empresa: "Y", uf: "XX" });
    const result = await aiExtractLead({ contatoNome: "Ana", telefone: "5511", messages: [], fallback });
    expect(result).toMatchObject({ empresa: "Y", uf: "SP" });
  });

  it("briefing e resumo gerencial preservam fatos canônicos", async () => {
    const briefing = { saudacao: "Bom dia", resumo: "R$ 10", prioridades: [{ companyId: "c1", texto: "Ligar para A" }], cobranca: undefined, semProximo: 0, equipe: undefined };
    askJSON.mockResolvedValueOnce({ saudacao: "Inventado", resumo: "R$ 999", prioridades: [{ companyId: "c1", texto: "Vendeu R$ 999" }] }).mockResolvedValueOnce({ linhas: ["Inventado"] });
    expect(await aiBriefing({ fallback: briefing })).toEqual(briefing);
    expect(await aiDigest({ fallback: { linhas: ["Venda real: R$ 10"] } })).toEqual({ linhas: ["Venda real: R$ 10"] });
  });

  it("transcrição valida o arquivo e normaliza o texto do Gateway", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    transcribe.mockResolvedValue({ text: "  Teste   Tawper  " });
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "fala.webm", { type: "audio/webm;codecs=opus" }));
    await expect(aiTranscribe(form)).resolves.toBe("Teste Tawper");
    expect(transcribe).toHaveBeenCalledOnce();
  });
});
