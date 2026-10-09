import { NextResponse } from "next/server";
import { getDbHealth } from "@/server/crm";
import { proofEnabled, stevoConfigured } from "@/server/integrations/stevo-proof/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getDbHealth();
  return NextResponse.json(
    {
      ...health,
      whatsappProof: {
        enabled: proofEnabled(),
        configured: stevoConfigured(),
      },
    },
    { status: health.ok ? 200 : 503 },
  );
}
