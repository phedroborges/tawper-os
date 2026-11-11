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
/** cache: quantos tokens de entrada a OpenAI reaproveitou (cobrados a uma fração do preço). */
type ModelReply = { message: { content?: string | null; tool_calls?: ToolCall[] }; model: string; entrada: number; saida: number; cache: number };

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function callModel(messages: Message[], tools: AgentTool[], deadline: number): Promise<ModelReply | null> {
  const routes = candidates("assistant");
  if (routes.length === 1) routes.push(routes[0]);
  for (const route of routes) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    // Modelo só do agente (AGENT_MODEL), para trocar sem mexer nas outras funções de IA. Vale na rota direta da OpenAI.
    const model = route.provider === "openai" && process.env.AGENT_MODEL?.trim() ? process.env.AGENT_MODEL.trim() : route.model;
    const reasoning = /^(?:openai\/)?(?:gpt-[5-9]|o[134])/.test(model);
    // Com ferramentas, os modelos gpt-5.6 e gpt-6.x só aceitam raciocínio desligado (a API devolve 400 sem isso).
    const effort = process.env.AGENT_REASONING_EFFORT || (/^(?:openai\/)?gpt-(?:5\.(?:[6-9]|\d{2,})|[6-9])/.test(model) ? "none" : undefined);
    try {
      const response = await fetch(route.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${route.key}` },
        body: JSON.stringify({
          model,
          messages,
          tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })),
          tool_choice: "auto",
          ...(reasoning ? { max_completion_tokens: 4000, ...(effort ? { reasoning_effort: effort } : {}) } : { max_tokens: 1200, temperature: 0.2 }),
        }),
        signal: AbortSignal.timeout(remaining),
        cache: "no-store",
      });
      if (!response.ok) {
        console.warn("[agente] modelo falhou", { model, status: response.status });
        // Limite de requisições ou instabilidade da OpenAI: espera um pouco antes da próxima tentativa.
        if (response.status === 429 || response.status >= 500) await new Promise((resolve) => setTimeout(resolve, Math.min(4000, Math.max(0, deadline - Date.now() - 1000))));
        continue;
      }
      const body = (await response.json()) as {
        choices?: { message?: ModelReply["message"] }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
      };
      const message = body.choices?.[0]?.message;
      if (message)
        return { message, model, entrada: body.usage?.prompt_tokens ?? 0, saida: body.usage?.completion_tokens ?? 0, cache: body.usage?.prompt_tokens_details?.cached_tokens ?? 0 };
    } catch {
      console.warn("[agente] modelo sem resposta", { model });
    }
  }
  return null;
}

/**
 * O histórico mostra cada resposta anterior com a anotação "[interno: …]" (ids) e o modelo às vezes a copia na resposta nova
 * (visto no teste real, com ids de empresas e contatos indo para o WhatsApp). Nunca sai para o usuário: corta da anotação em diante,
 * e tira também a linha "Errei? Responda DESFAZER", que o sistema mesmo acrescenta.
 */
export function stripInternal(texto: string) {
  const cut = texto.split(/\[\s*interno/i)[0] ?? "";
  return cut.replace(/^.*Errei\?\s*Responda DESFAZER.*$/gim, "").replace(/\n{3,}/g, "\n\n").trim();
}

const FILLER =/mais alguma coisa|precisar de (mais )?(algo|alguma)|(é|e) só (avisar|chamar|falar|mandar)|estou à disposição/i;
/** "⚠️ A cidade foi atualizada…", "⚠️ Lembre-se de ligar amanhã": aviso que só repete o comprovante. */
const RESTATE =
  /\b(registrei|agendei|cadastrei|criei|reagendei|anotei|atualizei|adicionei|exclu[ií]|removi|conclu[ií]|marquei|cancelei|tirei)\b|\b(foi|foram|est[aá]|est[aã]o|fica|ficou|ficam)\s+(\S+\s+)?(registrad|agendad|cadastrad|reagendad|criad|atualizad|adicionad|exclu[ií]d|removid|conclu[ií]d|marcad|cancelad)[oa]s?\b|\b(alterad|atualizad|registrad|adicionad|cancelad|agendad|reagendad|conclu[ií]d|exclu[ií]d|removid|feit)[oa]s?\b|^⚠️\s*(lembre|n[aã]o esque)/i;

/**
 * Comprovantes primeiro (o que o banco confirmou), depois o que o modelo tem a acrescentar.
 * Depois de gravar, só sobra do texto do modelo o que é pergunta ou aviso novo (⚠️): o resto repetiria o comprovante.
 */
export function composeReply(texto: string, recibos: string[]) {
  if (!recibos.length) return texto.trim();
  const extra = texto
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => (part.includes("?") || (part.startsWith("⚠️") && !RESTATE.test(part))) && !FILLER.test(part))
    .join("\n\n");
  return [recibos.join("\n"), extra].filter(Boolean).join("\n\n");
}

function short(value: unknown, max = 4000) {
  const text = JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}…` : JSON.parse(text);
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
  const done = new Map<string, ToolOutput>();
  const result: AgentResult = { texto: "", gravou: [], passos: [], contexto: [], desfazer: [], marcas: [], tokens: { entrada: 0, saida: 0 } };
  const recibos: string[] = [];
  const finish = (texto: string): AgentResult => ({ ...result, acao: input.ctx.acao, acoes: input.ctx.acoes, texto: composeReply(stripInternal(texto), recibos) });

  let vazias = 0;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const started = Date.now();
    const reply = await callModel(messages, input.tools, deadline);
    if (!reply) {
      if (step === 0) return null;
      result.marcas.push("modelo_caiu");
      return finish(result.gravou.length ? "Não consegui terminar a resposta. Confira no sistema o que ficou gravado acima." : "Não consegui concluir agora. Tente de novo em instantes.");
    }
    const { message } = reply;
    result.modelo = reply.model;
    result.tokens.entrada += reply.entrada;
    result.tokens.saida += reply.saida;
    if (reply.cache) result.tokens.cache = (result.tokens.cache ?? 0) + reply.cache;
    const calls = message.tool_calls ?? [];
    result.passos.push({
      kind: "model",
      ok: true,
      request: { passo: step + 1 },
      response: { texto: message.content ?? null, ferramentas: calls.map((call) => call.function.name) },
      ms: Date.now() - started,
    });
    if (!calls.length) {
      const texto = (message.content ?? "").trim();
      // Às vezes o modelo devolve vazio, sem texto e sem ferramenta, a uma frase perfeitamente clara (visto no teste real). Pergunta de novo antes de desistir.
      if (!texto && !recibos.length && vazias < 2) {
        vazias += 1;
        result.marcas.push("resposta_vazia_repetida");
        continue;
      }
      return finish(texto || (recibos.length ? "" : "Não entendi o pedido. Pode repetir?"));
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    let direct: string | undefined;
    for (const call of calls) {
      const tool = byName.get(call.function.name);
      const args = parseArgs(call.function.arguments);
      const toolStarted = Date.now();
      let output: ToolOutput;
      let failed = false;
      if (!tool) output = { data: { ok: false, erro: `Ferramenta desconhecida: ${call.function.name}.` } };
      else if (!args) output = { data: { ok: false, erro: "Argumentos inválidos. Chame de novo com um JSON válido." } };
      else {
        // Mesma ferramenta de escrita com os mesmos argumentos na mesma rodada: devolve o resultado anterior, não grava duas vezes.
        const key = tool.writes ? `${tool.name}:${call.function.arguments}` : "";
        const previous = key ? done.get(key) : undefined;
        if (previous) {
          output = { data: previous.data };
          result.marcas.push("escrita_repetida");
        } else {
          try {
            output = await tool.run(args, input.ctx);
            console.info("[agente] ferramenta", { nome: tool.name, ok: (output.data as { ok?: unknown } | null)?.ok ?? null });
          } catch (error) {
            failed = true;
            console.warn("[agente] ferramenta falhou", { nome: tool.name, erro: error instanceof Error ? error.message : String(error) });
            output = { data: { ok: false, erro: error instanceof Error ? error.message : "Falha ao executar a ferramenta." } };
          }
          if (key) done.set(key, output);
          if (tool.writes && output.wrote) {
            result.gravou.push(tool.name);
            if (output.recibo) recibos.push(output.recibo);
            if (output.desfazer?.ops.length) result.desfazer.push(output.desfazer);
          }
          if (output.memo) result.contexto.push(output.memo);
          if (output.empresaId && (!result.empresaId || output.wrote)) result.empresaId = output.empresaId;
        }
        if (output.reply && calls.length === 1) direct = output.reply;
      }
      const data = output.data as { ok?: unknown; erro?: unknown } | null;
      const ok = !failed && data?.ok !== false;
      if (failed) result.marcas.push(`excecao:${call.function.name}`);
      else if (!ok && data?.erro) result.marcas.push(`recusou:${call.function.name}`);
      result.passos.push({ kind: "tool", tool: call.function.name, ok, request: args ?? call.function.arguments, response: short(output.data), ms: Date.now() - toolStarted });
      // A instrução vai junto do resultado, que é onde o modelo decide o que escrever: sem ela, ele reescreve o comprovante.
      const forModel = ok && output.wrote && output.recibo
        ? { ...(output.data as object), comprovante_ja_enviado_ao_usuario: output.recibo, instrucao: "O usuário já recebe esse comprovante. Não repita nada dele, nem com outras palavras. Na resposta final, escreva só o que falta: uma pergunta, ou um aviso começando com ⚠️. Se não falta nada, deixe vazia." }
        : output.data;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(forModel).slice(0, 12_000) });
    }
    if (direct) return finish(direct);
  }
  result.marcas.push("limite_passos");
  return finish(result.gravou.length ? "Fiz parte do pedido (acima), mas ele ficou grande demais. Me diga o que falta." : "O pedido ficou complexo demais. Pode dividir em partes menores?");
}
