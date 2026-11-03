import { NextResponse } from "next/server";
import { USERS } from "@/lib/constants";
import {
  AuthError,
  createSessionForUser,
  encodeSession,
  requireSession,
  sessionCookie,
} from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Troca o perfil da sessão. Só depois do login; o papel vem do servidor, nunca do body. */
export async function POST(request: Request) {
  try {
    requireSession(request);
    const body = (await request.json()) as { userId?: string };
    if (typeof body.userId !== "string") throw new AuthError("Escolha um perfil.");
    const session = createSessionForUser(body.userId);
    const response = NextResponse.json({
      ok: true,
      user: USERS.find((user) => user.id === session.userId),
    });
    const cookie = sessionCookie(encodeSession(session));
    response.cookies.set(cookie.name, cookie.value, cookie);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível trocar o perfil.";
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
