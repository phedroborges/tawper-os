import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardClaim, runAgent } from "./engine";
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

  it("não deixa o modelo dizer que fez quando nada foi gravado", async () => {
    fetchMock.mockResolvedValueOnce(model({ content: "Pronto, cadastrei o cliente!" }));
    const result = await run([]);
    expect(result?.gravou).toEqual([]);
    expect(result?.texto).toContain("nenhuma alteração foi gravada");
  });

  it("não conta como gravado quando a ferramenta falha", async () => {
    const tool = writer(async () => ({ data: { ok: false, erro: "CNPJ inválido" } }));
    fetchMock.mockResolvedValueOnce(model(call("gravar", {}))).mockResolvedValueOnce(model({ content: "Criei o cliente." }));
    const result = await run([tool]);
    expect(result?.gravou).toEqual([]);
    expect(result?.texto).toContain("nenhuma alteração foi gravada");
  });

  it("transforma exceção da ferramenta em erro para o modelo, sem derrubar", async () => {
    const tool = writer(async () => {
      throw new Error("banco fora");
    });
    fetchMock.mockResolvedValueOnce(model(call("gravar", {}))).mockResolvedValueOnce(model({ content: "Deu erro: banco fora." }));
    const result = await run([tool]);
    expect(result?.texto).toBe("Deu erro: banco fora.");
    expect(sentBody(1).messages.at(-1)?.content).toContain("banco fora");
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

describe("guardClaim", () => {
  it("deixa passar texto sem promessa de alteração", () => {
    expect(guardClaim("Qual a cidade da usina?", [])).toBe("Qual a cidade da usina?");
  });
  it("deixa passar promessa quando houve gravação", () => {
    expect(guardClaim("Cadastrei a Usina X.", ["criar_cliente"])).toBe("Cadastrei a Usina X.");
  });
});
