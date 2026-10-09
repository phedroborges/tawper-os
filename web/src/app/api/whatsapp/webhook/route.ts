import { NextResponse } from "next/server";
import { webhookToken } from "@/server/integrations/stevo-proof/config";
import { recordInbound } from "@/server/integrations/stevo-proof/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenFrom(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("token") ?? "";
  const header = request.headers.get("x-webhook-token") ?? "";
  return query || header;
}

export async function POST(request: Request) {
  const expected = webhookToken();
  if (!expected) {
    return NextResponse.json({ error: "STEVO_WEBHOOK_TOKEN não configurado." }, { status: 503 });
  }
  if (tokenFrom(request) !== expected) {
    recordInbound({ event: "token" }, false);
    return NextResponse.json({ error: "Token de webhook inválido." }, { status: 401 });
  }
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = { raw: await request.text().catch(() => "") };
  }
  const event = recordInbound(payload);
  return NextResponse.json({ ok: true, id: event.id, event: event.event });
}

export async function GET(request: Request) {
  const expected = webhookToken();
  if (!expected || tokenFrom(request) !== expected) {
    return NextResponse.json({ error: "Token de webhook inválido." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, service: "tawper-stevo-proof" });
}
