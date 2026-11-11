import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { getStevoStatusCached, peekStevoStatus } from "@/server/integrations/stevo-proof/client";
import { syncForwardedFlagsFromDebug } from "@/server/integrations/stevo-proof/events";
import { listLiveConversations, listLivePreviews, pingLiveDb } from "@/server/integrations/stevo-proof/live-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Diagnóstico de lentidão da central: tempo de cada etapa no servidor. Só administrador. */
export async function GET(request: Request) {
  try {
    const t0 = performance.now();
    const session = await withSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Só administrador." }, { status: 403 });
    const steps: Record<string, number | string> = { sessao_ms: Math.round(performance.now() - t0) };
    const time = async (name: string, task: () => Promise<unknown>) => {
      const t = performance.now();
      try {
        await task();
        steps[name] = Math.round(performance.now() - t);
      } catch (e) {
        steps[name] = `erro: ${e instanceof Error ? e.message : "falha"}`;
      }
    };
    steps.status_em_cache = peekStevoStatus() ? "sim" : "nao";
    await time("banco_select1_ms", pingLiveDb);
    await time("banco_select1_de_novo_ms", pingLiveDb);
    await time("banco_previas_ms", listLivePreviews);
    await time("banco_conversas_ms", listLiveConversations);
    await time("sincronia_encaminhadas_ms", syncForwardedFlagsFromDebug);
    await time("stevo_status_ms", getStevoStatusCached);
    steps.total_ms = Math.round(performance.now() - t0);
    return NextResponse.json(steps);
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 });
  }
}
