import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { whatsappAgentWorkerToken } from "@/server/ai/whatsapp/config";
import { sendDailyReminders } from "@/server/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = Buffer.from(whatsappAgentWorkerToken());
  const got = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  return expected.length > 0 && expected.length === got.length && timingSafeEqual(expected, got);
}

/**
 * Dispara o lembrete diário. Chamado pelo agendador (seg a sex, 07:30) com o mesmo token do worker do agente:
 * POST /api/internal/lembretes  ·  Authorization: Bearer TAWPER_AI_WORKER_TOKEN
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await sendDailyReminders()) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao enviar os lembretes." }, { status: 500 });
  }
}
