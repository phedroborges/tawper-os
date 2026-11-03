import { NextResponse } from "next/server";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { findUserByOperatorEmail } from "@/server/auth/operators";
import { AuthError, createSessionForUser, encodeSession, sessionCookie } from "@/server/auth/session";
import { ensureOperators } from "@/server/persist";

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

    // Garante que os operadores existem no Auth com e-mail/senha atuais.
    const actors = await ensureOperators();

    const auth = getSupabaseAnon();
    const signed = await auth.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.user) {
      throw new AuthError("E-mail ou senha incorretos.");
    }

    const appUser = findUserByOperatorEmail(signed.data.user.email ?? email);
    if (!appUser) throw new AuthError("Este usuário não está autorizado no Tawper OS.");

    const profileId = actors[appUser.id] ?? signed.data.user.id;
    const session = createSessionForUser(appUser.id);
    const response = NextResponse.json({
      ok: true,
      user: appUser,
      profileId,
    });
    const cookie = sessionCookie(encodeSession(session));
    response.cookies.set(cookie.name, cookie.value, cookie);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível entrar.";
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
