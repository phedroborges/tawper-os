import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import { AuthError, createSessionForUser, encodeSession, sessionCookie } from "@/server/auth/session";
import { invalidateTeam, loadTeam } from "@/server/auth/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const rawNext = reqUrl.searchParams.get("next") || "/meu-dia";
  const next = rawNext.startsWith("/") ? rawNext : "/meu-dia";
  const origin = reqUrl.origin;

  try {
    const auth = getSupabaseAnon();
    const redirectTo = `${origin}/entrar?next=${encodeURIComponent(next)}`;
    const { data, error } = await auth.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error || !data?.url) {
      const msg = error?.message || "OAuth do Google ainda não está habilitado no painel do Supabase.";
      return NextResponse.redirect(
        `${origin}/entrar?next=${encodeURIComponent(next)}&oauth_error=${encodeURIComponent(msg)}`
      );
    }

    return NextResponse.redirect(data.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Não foi possível iniciar o login com Google.";
    return NextResponse.redirect(
      `${origin}/entrar?next=${encodeURIComponent(next)}&oauth_error=${encodeURIComponent(msg)}`
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      accessToken?: string;
      code?: string;
    };

    const accessToken = String(body.accessToken ?? "").trim();
    const code = String(body.code ?? "").trim();

    if (!accessToken && !code) {
      throw new AuthError("Token de autenticação do Google ausente.");
    }

    const auth = getSupabaseAnon();
    let authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null = null;

    if (accessToken) {
      const { data, error } = await auth.auth.getUser(accessToken);
      if (error || !data.user) {
        throw new AuthError("Sessão Google inválida ou expirada. Tente novamente.");
      }
      authUser = data.user;
    } else if (code) {
      const { data, error } = await auth.auth.exchangeCodeForSession(code);
      if (error || !data.user) {
        throw new AuthError("Código de autorização Google inválido ou expirado.");
      }
      authUser = data.user;
    }

    if (!authUser) {
      throw new AuthError("Não foi possível validar sua conta Google.");
    }

    const emailLower = String(authUser.email ?? "").trim().toLowerCase();
    const team = await loadTeam(true);
    const member = team.find(
      (item) =>
        item.id === authUser.id ||
        (emailLower.length > 0 && item.email.trim().toLowerCase() === emailLower)
    );

    if (!member) {
      throw new AuthError(
        `A conta Google (${emailLower || "sem e-mail"}) foi autenticada, mas ainda aguarda cadastro/aprovação do Administrador na Equipe do Tawper OS.`
      );
    }

    if (!member.ativo) {
      throw new AuthError(
        `O acesso de ${member.name} (${emailLower}) está desativado. Solicite a aprovação ao Administrador.`
      );
    }

    const googleAvatar =
      typeof authUser.user_metadata?.avatar_url === "string"
        ? authUser.user_metadata.avatar_url
        : typeof authUser.user_metadata?.picture === "string"
          ? authUser.user_metadata.picture
          : "";
    if (!member.avatarUrl && googleAvatar.startsWith("https://")) {
      await getSupabaseAdmin()
        .from("profiles")
        .update({ avatar_url: googleAvatar })
        .eq("id", member.id)
        .then(() => invalidateTeam(), () => undefined);
    }

    const session = createSessionForUser(member.id, member);
    const response = NextResponse.json({
      ok: true,
      user: {
        id: member.id,
        name: member.name,
        short: member.short,
        role: member.role,
      },
      profileId: member.id,
    });
    const cookie = sessionCookie(encodeSession(session));
    response.cookies.set(cookie.name, cookie.value, cookie);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível autenticar com o Google.";
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
