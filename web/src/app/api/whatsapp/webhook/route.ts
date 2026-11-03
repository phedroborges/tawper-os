import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { ingestWhatsAppAgentPayload } from "@/server/ai/whatsapp/ingest";
import { processWhatsAppAgentQueue } from "@/server/ai/whatsapp/runtime";
import { webhookToken } from "@/server/integrations/stevo-proof/config";
import { recordInbound } from "@/server/integrations/stevo-proof/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Seen = { at: string; payload: unknown };
const MAX_SEEN = 30;
const holder = globalThis as typeof globalThis & { __tawperWebhookSeen?: Seen[] };
const seen = (holder.__tawperWebhookSeen ??= []);

/** Cópia enxuta para diagnóstico: corta textos longos e arquivos em base64. */
function compact(payload: unknown) {
  return JSON.parse(
    JSON.stringify(payload, (_key, value: unknown) => {
      if (typeof value === "string" && value.length > 160) return `${value.slice(0, 40)}…(${value.length})`;
      if (Array.isArray(value) && value.length > 16 && value.every((v) => typeof v === "number")) return `[bytes ${value.length}]`;
      return value;
    }) ?? "null",
  ) as unknown;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Preferir header; query só por compatibilidade com registros antigos da Stevo. */
function tokenFrom(request: Request) {
  const header = request.headers.get("x-webhook-token") ?? "";
  if (header) return header;
  return new URL(request.url).searchParams.get("token") ?? "";
}

function authorized(request: Request, expected: string) {
  const provided = tokenFrom(request);
  return Boolean(expected) && secureEqual(provided, expected);
}

export async function POST(request: Request) {
  const expected = webhookToken();
  if (!expected) {
    return NextResponse.json({ error: "STEVO_WEBHOOK_TOKEN não configurado." }, { status: 503 });
  }
  if (!authorized(request, expected)) {
    recordInbound({ event: "token" }, false);
    return NextResponse.json({ error: "Token de webhook inválido." }, { status: 401 });
  }
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = { raw: await request.text().catch(() => "") };
  }
  try {
    seen.unshift({ at: new Date().toISOString(), payload: compact(payload) });
    seen.length = Math.min(seen.length, MAX_SEEN);
  } catch {
    // Diagnóstico nunca pode derrubar o recebimento.
  }
  const event = await recordInbound(payload);
  const agent = await ingestWhatsAppAgentPayload(payload);
  if ("queued" in agent && agent.queued) {
    after(async () => {
      await processWhatsAppAgentQueue(3);
    });
  }
  return NextResponse.json({ ok: true, id: event.id, event: event.event, agent });
}

export async function GET(request: Request) {
  const expected = webhookToken();
  if (!expected || !authorized(request, expected)) {
    return NextResponse.json({ error: "Token de webhook inválido." }, { status: 401 });
  }
  // Dump de payloads só em desenvolvimento explícito — nunca em produção.
  if (process.env.NODE_ENV !== "production" && process.env.STEVO_WEBHOOK_DEBUG === "true" && new URL(request.url).searchParams.has("debug")) {
    return NextResponse.json({ ok: true, recent: seen });
  }
  return NextResponse.json({ ok: true, service: "tawper-stevo-proof" });
}
