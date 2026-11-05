import { NextResponse } from "next/server";
import { authEnforced, sessionFromRequest } from "@/server/auth/session";
import { activeMember } from "@/server/auth/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = sessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false, enforced: authEnforced() });
  }
  const member = await activeMember(session.userId).catch(() => undefined);
  // Desativado no painel Equipe: a sessão deixa de valer na próxima conferência.
  if (!member) return NextResponse.json({ authenticated: false, enforced: authEnforced() });
  const { email: _email, ativo: _ativo, ...user } = member;
  void _email;
  void _ativo;
  return NextResponse.json({ authenticated: true, enforced: authEnforced(), user, session: { userId: session.userId, role: member.role } });
}
