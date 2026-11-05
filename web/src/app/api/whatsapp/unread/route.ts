import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { proofEnabled, stevoConfigured } from "@/server/integrations/stevo-proof/config";
import { listLiveConversations } from "@/server/integrations/stevo-proof/live-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Leitura leve para o contador do botão do WhatsApp: só as conversas com mensagem não lida. */
export async function GET(request: Request) {
  try {
    await withSession(request);
    if (!proofEnabled() || !stevoConfigured()) return NextResponse.json({ live: false, conversations: [] });
    const conversations = await listLiveConversations().catch(() => null);
    return NextResponse.json({
      live: true,
      conversations: (conversations ?? []).filter((c) => c.unread > 0).map((c) => ({ peer: c.peer, ownerId: c.ownerId, unread: c.unread })),
    });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler não lidas." }, { status: 500 });
  }
}
