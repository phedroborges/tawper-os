import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { getStevoQr, getStevoStatusCached } from "@/server/integrations/stevo-proof/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noQr = { image: null, pairingCode: null, code: null };

/** Status da Stevo (e QR, se desconectada), fora do caminho que abre a tela de conversas. */
export async function GET(request: Request) {
  try {
    await withSession(request);
    const status = await getStevoStatusCached();
    const qr = status.loggedIn ? noQr : await getStevoQr().catch(() => noQr);
    return NextResponse.json({ status, qr });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar a Stevo." }, { status: 502 });
  }
}
