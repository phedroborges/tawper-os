import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { readCrmBootstrap } from "@/server/crm";
import { ensureLiveWebhook, getStevoStatusCached } from "@/server/integrations/stevo-proof/client";
import { proofEnabled, stevoConfigured } from "@/server/integrations/stevo-proof/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    withSession(request);
    const body = await readCrmBootstrap();
    if (proofEnabled() && stevoConfigured()) {
      void getStevoStatusCached()
        .then((status) => {
          if (status.loggedIn) return ensureLiveWebhook();
        })
        .catch(() => undefined);
    }
    return NextResponse.json(body);
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler o CRM." }, { status: 500 });
  }
}
