import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import {
  whatsappAgentBotNumber,
  whatsappAgentEnabled,
  whatsappAgentUsers,
  whatsappAgentWebhookToken,
} from "@/server/ai/whatsapp/config";
import { ingestWhatsAppAgentPayload } from "@/server/ai/whatsapp/ingest";
import { processWhatsAppAgentQueue } from "@/server/ai/whatsapp/runtime";

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

  const result = await ingestWhatsAppAgentPayload(payload);
  if ("queued" in result && result.queued) {
    after(async () => {
      await processWhatsAppAgentQueue(3);
    });
  }
  return NextResponse.json({ ok: true, ...result });
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
