import { NextResponse } from "next/server";
import { getDbHealth } from "@/server/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getDbHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
