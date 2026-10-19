import "server-only";
import { AGENTS, type AgentKey } from "./agent-platform";

export type AITask = "fast" | "assistant" | "strategy" | "quick_note" | "next_step" | "conversation_summary" | "visit_route" | "lead_extraction" | "daily_briefing" | "manager_digest";
export type ChatTurn = { role: "user" | "assistant"; content: string };
export const TASK_AGENTS: Record<AITask, AgentKey> = {
  fast: "orchestrator", assistant: "assistant_analytic", strategy: "strategic_copilot",
  quick_note: "quick_note", next_step: "next_step", conversation_summary: "conversation_summary",
  visit_route: "visit_route", lead_extraction: "lead_extractor", daily_briefing: "daily_briefing", manager_digest: "manager_digest",
};
export function aiConfigured() {
  return process.env.TAWPER_MULTI_AGENT_ENABLED === "true" && Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY);
}
export function modelProfileFor(task: AITask) {
  if (task === "strategy" || task === "manager_digest") return "strategy";
  if (["quick_note", "conversation_summary", "lead_extraction"].includes(task)) return "extraction";
  return task === "assistant" ? "assistant" : "fast";
}
function positive(value: unknown, fallback: number, ceiling: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), ceiling) : fallback;
}
function candidates(task: AITask) {
  const result: { provider: string; model: string; key: string; url: string }[] = [];
  if (process.env.AI_GATEWAY_API_KEY) {
    const profile = modelProfileFor(task);
    const defaults = profile === "strategy" ? "openai/gpt-5.6-sol,anthropic/claude-sonnet-4.6" : profile === "extraction" ? "google/gemini-3.5-flash-lite,openai/gpt-5.6-luna" : profile === "assistant" ? "openai/gpt-5.6-luna,google/gemini-3.8-flash" : "openai/gpt-5.6-luna,google/gemini-3.5-flash-lite";
    const configured = process.env[`AI_${profile.toUpperCase()}_MODELS`];
    const models = [...new Set((configured || defaults).split(",").map((value) => value.trim()).filter(Boolean))].slice(0, 3);
    for (const model of models) result.push({ provider: "vercel-ai-gateway", model, key: process.env.AI_GATEWAY_API_KEY, url: "https://ai-gateway.vercel.sh/v1/chat/completions" });
  }
  if (process.env.OPENAI_API_KEY) result.push({ provider: "openai", model: process.env.OPENAI_MODEL || "gpt-4o-mini", key: process.env.OPENAI_API_KEY, url: "https://api.openai.com/v1/chat/completions" });
  return result;
}
export interface JSONRequest {
  system: string; user: string; history?: ChatTurn[]; maxTokens?: number;
  temperature?: number; timeoutMs?: number; task?: AITask; agentKey?: string; promptVersion?: string;
}

/** Limites por execução; logs nunca incluem prompts, conteúdo ou erros brutos do provedor. */
export async function askJSON<T>(opts: JSONRequest): Promise<T | null> {
  if (!aiConfigured()) return null;
  const task = opts.task ?? "fast";
  const agent = AGENTS[TASK_AGENTS[task]];
  const trace = { correlationId: crypto.randomUUID(), agentKey: agent.key, promptVersion: agent.promptVersion, task };
  const messages = [{ role: "system", content: opts.system }, ...(opts.history ?? []).slice(-6), { role: "user", content: opts.user }];
  const maxChars = positive(process.env.AI_MAX_INPUT_CHARS, 160_000, 500_000);
  if (JSON.stringify(messages).length > maxChars) {
    console.warn("[ia] fallback", { ...trace, reason: "input_limit" });
    return null;
  }
  const maxTokens = Math.min(positive(opts.maxTokens, 1200, 20_000), positive(process.env.AI_MAX_OUTPUT_TOKENS, 2400, 20_000));
  const timeout = Math.min(positive(opts.timeoutMs, 45_000, 90_000), positive(process.env.AI_REQUEST_TIMEOUT_MS, 90_000, 90_000));
  const deadline = Date.now() + timeout;
  const routes = candidates(task);
  if (routes.length === 1) routes.push(routes[0]);
  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const startedAt = Date.now();
    const reasoningModel = /^(?:openai\/)?(?:gpt-5|o[134])/.test(route.model);
    try {
      const response = await fetch(route.url, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${route.key}` },
        body: JSON.stringify({
          model: route.model, messages, response_format: { type: "json_object" },
          ...(reasoningModel ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens, temperature: opts.temperature ?? 0.3 }),
        }),
        signal: AbortSignal.timeout(remaining), cache: "no-store",
      });
      if (!response.ok) {
        console.warn("[ia] tentativa falhou", { ...trace, provider: route.provider, model: route.model, status: response.status, attempt: index + 1 });
        if (response.status < 500 && ![408, 429].includes(response.status) && routes[index + 1]?.model === route.model) break;
        continue;
      }
      const body = await response.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
      const choice = body.choices?.[0];
      if (!choice?.message?.content || choice.finish_reason === "length") continue;
      const value: unknown = JSON.parse(choice.message.content);
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      console.info("[ia] chamada concluída", { ...trace, model: route.model, provider: route.provider, latencyMs: Date.now() - startedAt, inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens, totalTokens: body.usage?.total_tokens });
      return value as T;
    } catch {
      console.warn("[ia] tentativa falhou", { ...trace, provider: route.provider, model: route.model, attempt: index + 1, reason: "network_or_invalid_response" });
    }
  }
  console.warn("[ia] fallback", { ...trace, reason: "providers_exhausted" });
  return null;
}
