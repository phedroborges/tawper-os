import { NextResponse } from "next/server";
import { readCrmBootstrap } from "@/server/crm";
import { ensureLiveWebhook, getStevoStatusCached } from "@/server/integrations/stevo-proof/client";
import { proofEnabled, stevoConfigured } from "@/server/integrations/stevo-proof/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const body = await readCrmBootstrap();
  if (proofEnabled() && stevoConfigured()) {
    void getStevoStatusCached()
      .then((status) => {
        if (status.loggedIn) return ensureLiveWebhook();
      })
      .catch(() => undefined);
  }
  return NextResponse.json(body);
}
