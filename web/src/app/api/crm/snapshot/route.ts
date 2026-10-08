import { NextResponse } from "next/server";
import { getDbHealth, loadCrmSnapshot } from "@/server/crm";
import { ensureOperators } from "@/server/persist";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getDbHealth();
  if (!health.ok) {
    return NextResponse.json({ health, snapshot: null, actorMap: null }, { status: 200 });
  }
  try {
    const actorMap = await ensureOperators();
    const snapshot = await loadCrmSnapshot();
    return NextResponse.json({ health, snapshot, actorMap });
  } catch (e) {
    return NextResponse.json(
      { health: { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) }, snapshot: null, actorMap: null },
      { status: 200 },
    );
  }
}
