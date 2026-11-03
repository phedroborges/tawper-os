import { NextResponse } from "next/server";
import { USERS } from "@/lib/constants";
import { authEnforced, sessionFromRequest } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = sessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false, enforced: authEnforced() });
  }
  const user = USERS.find((item) => item.id === session.userId) ?? null;
  return NextResponse.json({ authenticated: true, enforced: authEnforced(), user, session: { userId: session.userId, role: session.role } });
}
