import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { sendProofText } from "@/server/integrations/stevo-proof/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Envio de texto pela Central. Rota em vez de ação do servidor: em produção o Next esconde a mensagem
 * de qualquer erro lançado numa ação ("Minified React error #441"); aqui o atendente vê o motivo real.
 */
export async function POST(request: Request) {
  try {
    await withSession(request);
    const body = (await request.json().catch(() => null)) as { to?: unknown; text?: unknown } | null;
    if (typeof body?.to !== "string" || typeof body.text !== "string") {
      return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
    }
    const sent = await sendProofText(body.to, body.text);
    return NextResponse.json({ ok: true, ...sent });
  } catch (cause) {
    return jsonAuthError(cause) ?? NextResponse.json({ error: cause instanceof Error ? cause.message : "Não foi possível enviar." }, { status: 400 }); // não 502: o proxy troca respostas 502 pela página dele
  }
}
