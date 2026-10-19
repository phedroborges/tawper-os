import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import {
  findWhatsAppAgentIdentity,
  whatsappAgentBotNumber,
  whatsappAgentEnabled,
  whatsappAgentUsers,
  whatsappAgentWebhookToken,
} from "@/server/ai/whatsapp/config";
import { parseWhatsAppAgentInbound } from "@/server/ai/whatsapp/inbound";
import { processWhatsAppAgentQueue } from "@/server/ai/whatsapp/runtime";
import { enqueueWhatsAppAgentMessage } from "@/server/ai/whatsapp/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function suppliedToken(request: Request) {
  const url = new URL(request.url);
  return request.headers.get("x-webhook-token") || url.searchParams.get("token") || "";
}
function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request) {
  const expected = whatsappAgentWebhookToken();
  return Boolean(expected) && secureEqual(suppliedToken(request), expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Webhook não autorizado." }, { status: 401 });
  if (!whatsappAgentEnabled()) return NextResponse.json({ ok: true, disabled: true });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid_json" });
  }

  const message = parseWhatsAppAgentInbound(payload);
  if (!message) return NextResponse.json({ ok: true, ignored: "unsupported_event" });
  const identity = findWhatsAppAgentIdentity(message.sender);
  if (!identity) return NextResponse.json({ ok: true, ignored: "unauthorized_sender" });

  const queued = await enqueueWhatsAppAgentMessage({ ...message, displayName: identity.name });
  if (!queued.duplicate) {
    after(async () => {
      await processWhatsAppAgentQueue(3);
    });
  }
  return NextResponse.json({ ok: true, duplicate: queued.duplicate, queued: !queued.duplicate });
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Webhook não autorizado." }, { status: 401 });
  try {
    return NextResponse.json({
      ok: true,
      enabled: whatsappAgentEnabled(),
      botNumberConfigured: Boolean(whatsappAgentBotNumber()),
      authorizedUsers: whatsappAgentUsers().length,
      service: "tawper-whatsapp-internal-agent",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Configuração inválida." }, { status: 503 });
  }
}
