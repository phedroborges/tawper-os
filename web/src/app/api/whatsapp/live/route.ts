import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { listMessages, syncForwardedFlagsFromDebug } from "@/server/integrations/stevo-proof/events";
import { listLiveConversations, listLiveConversationsFor, listLiveMessagesFor, peerVariants } from "@/server/integrations/stevo-proof/live-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Leitura leve do chat: só banco, sem status da Stevo. A tela polla isto ~3s. */
export async function GET(request: Request) {
  try {
    await withSession(request);
    syncForwardedFlagsFromDebug().catch(() => undefined);
    const peers = [
      ...new Set(
        (new URL(request.url).searchParams.get("peers")?.split(",") ?? [])
          .map((item) => item.replace(/\D/g, ""))
          .filter(Boolean)
          .flatMap(peerVariants),
      ),
    ];
    if (peers.length) {
      const [events, conversations] = await Promise.all([
        listLiveMessagesFor(peers).catch(() => []),
        listLiveConversationsFor(peers).catch(() => []),
      ]);
      return NextResponse.json({ events: events ?? [], conversations: conversations ?? [] });
    }
    const [events, conversations] = await Promise.all([listMessages(), listLiveConversations().catch(() => [])]);
    return NextResponse.json({ events, conversations: conversations ?? [] });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler o chat." }, { status: 500 });
  }
}
