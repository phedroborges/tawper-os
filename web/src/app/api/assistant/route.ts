import OpenAI from "openai";
import { NextResponse } from "next/server";
import { AssistantError, getAssistantAccess, isSameOrigin } from "@/server/assistant/access";
import { runAssistant } from "@/server/assistant/agent";
import { requestSchema } from "@/server/assistant/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const limits = new Map<string, { start: number; count: number; busy: boolean }>();
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AssistantError(400, "Pergunta ausente.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 60000) { await reader.cancel(); throw new AssistantError(413, "Conversa muito longa. Inicie uma nova conversa."); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AssistantError(400, "Formato da pergunta inválido."); }
}

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(170000)]);
  try {
    if (!isSameOrigin(request)) throw new AssistantError(403, "Origem da solicitação não permitida.");
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AssistantError(415, "Envie a pergunta em JSON.");
    const raw = await readBody(request);
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) throw new AssistantError(400, "Pergunta ou histórico inválido. Inicie uma nova conversa se necessário.");
    const access = await getAssistantAccess(request, signal);
    const now = Date.now();
    for (const [key, item] of limits) if (!item.busy && now - item.start > 60000) limits.delete(key);
    let bucket = limits.get(access.actorId);
    if (bucket?.busy) throw new AssistantError(429, "Aguarde a resposta anterior antes de enviar outra pergunta.");
    if (!bucket || now - bucket.start > 60000) { bucket = { start: now, count: 0, busy: false }; limits.set(access.actorId, bucket); }
    if (bucket.count >= 12) throw new AssistantError(429, "Limite temporário de perguntas atingido. Aguarde um minuto.");
    bucket.count++;
    bucket.busy = true;
    release = () => { bucket.busy = false; };
    return response(await runAssistant(parsed.data, access, signal));
  } catch (error) {
    if (error instanceof AssistantError) return response({ error: error.message }, error.status);
    if (signal.aborted) return response({ error: "A consulta demorou além do limite ou foi cancelada. Tente novamente." }, 504);
    if (error instanceof OpenAI.APIError) {
      console.warn("[assistant] provider_error", JSON.stringify({ status: error.status, code: error.code }));
      if (error.status === 429) return response({ error: "A OpenAI atingiu um limite de uso ou saldo. Verifique a conta e tente novamente." }, 503);
      if (error.status === 401 || error.status === 403) return response({ error: "A OpenAI recusou a credencial ou o acesso ao modelo. Revise a configuração do servidor." }, 503);
      return response({ error: "A OpenAI não conseguiu concluir a consulta. Tente novamente." }, 502);
    }
    console.warn("[assistant] request_failed");
    return response({ error: "Não foi possível consultar o assistente. Tente novamente." }, 500);
  } finally { release?.(); }
}
