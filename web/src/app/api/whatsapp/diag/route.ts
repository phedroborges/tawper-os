import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { loadProofSnapshot } from "@/server/integrations/stevo-proof/actions";
import { clearStevoStatusCache, getStevoStatusCached, peekStevoStatus } from "@/server/integrations/stevo-proof/client";
import { webhookPublicUrl } from "@/server/integrations/stevo-proof/config";
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
    // A sincronia de "encaminhada" baixa o /debug do webhook a cada atualização: mede tamanho e custo de ler o JSON.
    await time("debug_webhook_total_ms", async () => {
      const base = webhookPublicUrl();
      if (!base) throw new Error("sem URL pública");
      const url = base.includes("?") ? `${base}&debug=1` : `${base}?debug=1`;
      const t = performance.now();
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      steps.debug_webhook_download_ms = Math.round(performance.now() - t);
      steps.debug_webhook_kb = Math.round(text.length / 1024);
      const tp = performance.now();
      JSON.parse(text);
      steps.debug_webhook_parse_ms = Math.round(performance.now() - tp);
    });
    // Reproduz a abertura da aba: com o cache da Stevo vazio e depois com ele quente.
    clearStevoStatusCache();
    await time("abertura_fria_ms", () => loadProofSnapshot("", { fast: true }));
    await time("abertura_quente_ms", () => loadProofSnapshot("", { fast: true }));
    clearStevoStatusCache();
    await time("abertura_antiga_sem_fast_ms", () => loadProofSnapshot(""));
    steps.total_ms = Math.round(performance.now() - t0);
    return NextResponse.json(steps);
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 });
  }
}
