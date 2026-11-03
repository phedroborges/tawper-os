import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeReply, runAgent } from "./engine";
import type { AgentContext, AgentTool } from "./types";

const ctx = { actor: {}, question: "oi", history: [], consultar: vi.fn() } as unknown as AgentContext;
const model = (message: unknown) => ({ ok: true, json: async () => ({ choices: [{ message }] }) }) as Response;
const call = (name: string, args: object, id = "call_1") => ({ content: null, tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }] });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "k");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const writer = (run: AgentTool["run"]): AgentTool => ({ name: "gravar", description: "", writes: true, parameters: { type: "object" }, run });
const run = (tools: AgentTool[]) => runAgent({ system: "s", question: "faça", history: [], tools, ctx });
const sentBody = (index: number) => JSON.parse(fetchMock.mock.calls[index][1].body as string) as { messages: { role: string; content: string }[] };

describe("runAgent", () => {
  it("devolve o resultado real da ferramenta ao modelo e responde", async () => {
    const tool = writer(vi.fn(async () => ({ wrote: true, data: { ok: true } })));
    fetchMock.mockResolvedValueOnce(model(call("gravar", { a: 1 }))).mockResolvedValueOnce(model({ content: "Pronto, criei." }));
    const result = await run([tool]);
    expect(result).toMatchObject({ texto: "Pronto, criei.", gravou: ["gravar"] });
    expect(sentBody(1).messages.at(-1)).toMatchObject({ role: "tool", content: JSON.stringify({ ok: true }) });
  });

  it("o comprovante vem do resultado da ferramenta, antes do texto do modelo", async () => {
    const tool = writer(async () => ({ wrote: true, recibo: "✅ Registrado.", memo: "empresa_id=1", data: { ok: true } }));
    fetchMock.mockResolvedValueOnce(model(call("gravar", {}))).mockResolvedValueOnce(model({ content: "Concluo a tarefa X também?" }));
    const result = await run([tool]);
    expect(result?.texto).toBe("✅ Registrado.\n\nConcluo a tarefa X também?");
    expect(result?.contexto).toEqual(["empresa_id=1"]);
  });

  it("depois de gravar, descarta o texto do modelo que só repete o comprovante; pergunta e aviso ficam", () => {
    const texto = "Registrei a ligação com o Pedro e agendei a visita.\n\n⚠️ O Pedro não tem WhatsApp cadastrado.\n\nConcluo a tarefa do Marcelo também?\n\nSe precisar de mais alguma coisa, é só avisar!";
    expect(composeReply(texto, ["✅ Registrado."])).toBe("✅ Registrado.\n\n⚠️ O Pedro não tem WhatsApp cadastrado.\n\nConcluo a tarefa do Marcelo também?");
    expect(composeReply("A Colorado é do Paulo.", [])).toBe("A Colorado é do Paulo.");
  });

  it("sem nada a acrescentar, responde só com o comprovante", async () => {
    const tool = writer(async () => ({ wrote: true, recibo: "✅ Registrado.", data: { ok: true } }));
    fetchMock.mockResolvedValueOnce(model(call("gravar", {}))).mockResolvedValueOnce(model({ content: "" }));
    expect((await run([tool]))?.texto).toBe("✅ Registrado.");
  });

  it("não conta como gravado nem mostra comprovante quando a ferramenta recusa, e marca para revisão", async () => {
    const tool = writer(async () => ({ data: { ok: false, erro: "CNPJ inválido" }, recibo: "✅ não deveria aparecer" }));
    fetchMock.mockResolvedValueOnce(model(call("gravar", {}))).mockResolvedValueOnce(model({ content: "O CNPJ não confere." }));
    const result = await run([tool]);
    expect(result?.gravou).toEqual([]);
    expect(result?.texto).toBe("O CNPJ não confere.");
    expect(result?.marcas).toEqual(["recusou:gravar"]);
  });

  it("guarda cada passo para a revisão, com o modelo usado e os tokens", async () => {
    const tool = writer(async () => ({ wrote: true, data: { ok: true } }));
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: call("gravar", { a: 1 }) }], usage: { prompt_tokens: 100, completion_tokens: 10 } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 120, completion_tokens: 5 } }) } as Response);
    const result = await run([tool]);
    expect(result?.passos.map((step) => [step.kind, step.tool, step.ok])).toEqual([
      ["model", undefined, true],
      ["tool", "gravar", true],
      ["model", undefined, true],
    ]);
    expect(result?.passos[1].request).toEqual({ a: 1 });
    expect(result?.tokens).toEqual({ entrada: 220, saida: 15 });
    expect(result?.modelo).toBe("gpt-4o-mini");
  });

  it("transforma exceção da ferramenta em erro para o modelo, sem derrubar", async () => {
    const tool = writer(async () => {
      throw new Error("banco fora");
    });
    fetchMock.mockResolvedValueOnce(model(call("gravar", {}))).mockResolvedValueOnce(model({ content: "Deu erro: banco fora." }));
    const result = await run([tool]);
    expect(result?.texto).toBe("Deu erro: banco fora.");
    expect(sentBody(1).messages.at(-1)?.content).toContain("banco fora");
    expect(result?.marcas).toEqual(["excecao:gravar"]);
  });

  it("não grava duas vezes a mesma chamada na mesma rodada", async () => {
    const exec = vi.fn(async () => ({ wrote: true, data: { ok: true } }));
    fetchMock
      .mockResolvedValueOnce(model(call("gravar", { x: 1 }, "a")))
      .mockResolvedValueOnce(model(call("gravar", { x: 1 }, "b")))
      .mockResolvedValueOnce(model({ content: "ok" }));
    const result = await run([writer(exec)]);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(result?.gravou).toEqual(["gravar"]);
  });

  it("encerra com a resposta pronta da ferramenta, sem nova rodada do modelo", async () => {
    const tool: AgentTool = { name: "ler", description: "", writes: false, parameters: { type: "object" }, run: async () => ({ data: {}, reply: "Resposta pronta" }) };
    fetchMock.mockResolvedValueOnce(model(call("ler", {})));
    expect(await run([tool])).toMatchObject({ texto: "Resposta pronta" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("devolve null se o modelo não responde de primeira (cai no fluxo antigo)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    expect(await run([])).toBeNull();
  });

  it("recusa ferramenta inexistente", async () => {
    fetchMock.mockResolvedValueOnce(model(call("fantasma", {}))).mockResolvedValueOnce(model({ content: "Não consigo." }));
    expect((await run([]))?.texto).toBe("Não consigo.");
    expect(sentBody(1).messages.at(-1)?.content).toContain("desconhecida");
  });
});
