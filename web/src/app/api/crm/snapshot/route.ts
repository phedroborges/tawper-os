import { NextResponse } from "next/server";
import { readCrmBootstrap } from "@/server/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  const body = await readCrmBootstrap();
  return NextResponse.json(body);
}
