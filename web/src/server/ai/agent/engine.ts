import "server-only";

import { candidates, type ChatTurn } from "../openai";
import type { AgentContext, AgentResult, AgentTool, ToolOutput } from "./types";

const MAX_STEPS = 8;
const TOTAL_TIMEOUT_MS = 80_000;

type ToolCall = { id: string; function: { name: string; arguments: string } };
type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** O texto diz que alterou algo no CRM? Usado para barrar "feito!" sem ferramenta de escrita bem-sucedida. */
const CLAIMS_DONE = /\b(criei|cadastrei|registrei|alterei|atualizei|movi|conclu[ií]|agendei|salvei|gravei|adicionei|j[aá] est[aá] (criad|cadastrad|registrad|atualizad|salv))/i;

export function guardClaim(texto: string, gravou: string[]) {
  if (gravou.length || !CLAIMS_DONE.test(texto)) return texto;
  return `${texto}\n\n⚠️ Atenção: nenhuma alteração foi gravada no sistema nesta conversa. Se você precisa disso, peça de novo.`;
}

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function callModel(messages: Message[], tools: AgentTool[], deadline: number) {
  const routes = candidates("assistant");
  if (routes.length === 1) routes.push(routes[0]);
  for (const route of routes) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const reasoning = /^(?:openai\/)?(?:gpt-5|o[134])/.test(route.model);
    try {
      const response = await fetch(route.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${route.key}` },
        body: JSON.stringify({
          model: route.model,
          messages,
          tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })),
          tool_choice: "auto",
          ...(reasoning ? { max_completion_tokens: 2000 } : { max_tokens: 1200, temperature: 0.2 }),
        }),
        signal: AbortSignal.timeout(remaining),
        cache: "no-store",
      });
      if (!response.ok) {
        console.warn("[agente] modelo falhou", { model: route.model, status: response.status });
        continue;
      }
      const body = (await response.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
      const message = body.choices?.[0]?.message;
      if (message) return message;
    } catch {
      console.warn("[agente] modelo sem resposta", { model: route.model });
    }
  }
  return null;
}

export async function runAgent(input: {
  system: string;
  question: string;
  history: ChatTurn[];
  tools: AgentTool[];
  ctx: AgentContext;
}): Promise<AgentResult | null> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  const messages: Message[] = [
    { role: "system", content: input.system },
    ...input.history.map((turn) => ({ role: turn.role, content: turn.content }) as Message),
    { role: "user", content: input.question },
  ];
  const byName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const gravou: string[] = [];
  const done = new Map<string, ToolOutput>();

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const message = await callModel(messages, input.tools, deadline);
    if (!message) {
      if (step === 0) return null;
      const texto = gravou.length
        ? "A alteração foi gravada, mas não consegui montar a resposta final. Confira no sistema."
        : "Não consegui concluir agora. Tente de novo em instantes.";
      return { texto, acao: input.ctx.acao, gravou };
    }
    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      const texto = (message.content ?? "").trim() || "Não entendi o pedido. Pode repetir?";
      return { texto: guardClaim(texto, gravou), acao: input.ctx.acao, gravou };
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    let direct: string | undefined;
    for (const call of calls) {
      const tool = byName.get(call.function.name);
      let output: ToolOutput;
      const args = parseArgs(call.function.arguments);
      if (!tool) output = { data: { erro: `Ferramenta desconhecida: ${call.function.name}.` } };
      else if (!args) output = { data: { erro: "Argumentos inválidos. Chame de novo com um JSON válido." } };
      else {
        // Mesma ferramenta de escrita com os mesmos argumentos na mesma rodada: devolve o resultado anterior, não grava duas vezes.
        const key = tool.writes ? `${tool.name}:${call.function.arguments}` : "";
        const previous = key ? done.get(key) : undefined;
        if (previous) output = previous;
        else {
          try {
            output = await tool.run(args, input.ctx);
            console.info("[agente] ferramenta", { nome: tool.name, ok: (output.data as { ok?: unknown } | null)?.ok ?? null });
          } catch (error) {
            console.warn("[agente] ferramenta falhou", { nome: tool.name, erro: error instanceof Error ? error.message : String(error) });
            output = { data: { ok: false, erro: error instanceof Error ? error.message : "Falha ao executar a ferramenta." } };
          }
          if (key) done.set(key, output);
          if (tool.writes && output.wrote) gravou.push(tool.name);
        }
        if (output.reply && calls.length === 1) direct = output.reply;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output.data).slice(0, 12_000) });
    }
    if (direct) return { texto: direct, acao: input.ctx.acao, gravou };
  }
  return {
    texto: gravou.length ? "Executei parte do pedido, mas ele ficou grande demais. Confira no sistema e me diga o que falta." : "O pedido ficou complexo demais. Pode dividir em partes menores?",
    acao: input.ctx.acao,
    gravou,
  };
}
