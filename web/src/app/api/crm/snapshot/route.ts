import { NextResponse } from "next/server";
import { getDbHealth, loadActorAliases, loadCrmSnapshot } from "@/server/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getDbHealth();
  if (!health.ok) {
    return NextResponse.json({ health, snapshot: null, actorMap: null }, { status: 200 });
  }
  try {
    const [actorMap, snapshot] = await Promise.all([loadActorAliases(), loadCrmSnapshot()]);
    return NextResponse.json({ health, snapshot, actorMap });
  } catch (e) {
    return NextResponse.json(
      { health: { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) }, snapshot: null, actorMap: null },
      { status: 200 },
    );
  }
}
