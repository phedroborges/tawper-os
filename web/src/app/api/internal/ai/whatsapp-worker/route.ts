import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { whatsappAgentEnabled, whatsappAgentWorkerToken } from "@/server/ai/whatsapp/config";
import { processWhatsAppAgentQueue } from "@/server/ai/whatsapp/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function authorized(request: Request) {
  const expected = whatsappAgentWorkerToken();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(expected) && secureEqual(bearer, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });
  if (!whatsappAgentEnabled()) return NextResponse.json({ ok: true, disabled: true });
  const result = await processWhatsAppAgentQueue(10);
  return NextResponse.json({ ok: true, ...result });
}
