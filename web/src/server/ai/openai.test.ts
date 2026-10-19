import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askJSON, aiConfigured, TASK_AGENTS } from "./openai";

describe("roteador de modelos", () => {
  beforeEach(() => {
    vi.stubEnv("TAWPER_MULTI_AGENT_ENABLED", "true");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("possui um agente registrado para cada tarefa de modelo", () => {
    expect(Object.values(TASK_AGENTS)).not.toContain(undefined);
  });

  it("desliga todas as chamadas pela feature flag", async () => {
    vi.stubEnv("TAWPER_MULTI_AGENT_ENABLED", "false");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(aiConfigured()).toBe(false);
    expect(await askJSON({ system: "s", user: "u" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permanece desligado quando a feature flag não foi configurada", () => {
    vi.stubEnv("TAWPER_MULTI_AGENT_ENABLED", "");
    expect(aiConfigured()).toBe(false);
  });

  it("repete uma falha temporária e valida o JSON final", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("indisponível", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: { total_tokens: 8 } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(askJSON<{ ok: boolean }>({ system: "s", user: "u", task: "next_step", timeoutMs: 5000 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("usa OpenAI como fallback quando o Gateway esgota", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
    vi.stubEnv("AI_FAST_MODELS", "provider/model");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("falha", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"source":"direct"}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(askJSON<{ source: string }>({ system: "s", user: "u", task: "fast" })).resolves.toEqual({ source: "direct" });
    expect(fetchMock.mock.calls[0][0]).toContain("ai-gateway");
    expect(fetchMock.mock.calls[1][0]).toContain("api.openai.com");
  });

  it("recusa resposta truncada ou que não seja objeto JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '[1,2]' } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(askJSON({ system: "s", user: "u" })).resolves.toBeNull();
  });
});
