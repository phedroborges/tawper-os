import { NextResponse } from "next/server";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { AuthError, createSessionForUser, encodeSession, sessionCookie } from "@/server/auth/session";
import { loadTeam } from "@/server/auth/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) throw new AuthError("Informe e-mail e senha.");

    const auth = getSupabaseAnon();
    const signed = await auth.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.user) {
      throw new AuthError("E-mail ou senha incorretos.");
    }

    // Quem entra é quem está ativo no painel Equipe (o id do Auth é o id do perfil).
    const member = (await loadTeam(true)).find((item) => item.id === signed.data.user.id);
    if (!member?.ativo) throw new AuthError("Este usuário não tem acesso ao Tawper OS. Fale com o administrador.");

    const session = createSessionForUser(member.id, member);
    const response = NextResponse.json({ ok: true, user: { id: member.id, name: member.name, short: member.short, role: member.role }, profileId: member.id });
    const cookie = sessionCookie(encodeSession(session));
    response.cookies.set(cookie.name, cookie.value, cookie);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível entrar.";
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
