import { NextResponse } from "next/server";
import { USERS } from "@/lib/constants";
import {
  AuthError,
  createSessionForUser,
  encodeSession,
  sessionCookie,
  verifyAppPassword,
} from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string; userId?: string };
    if (!verifyAppPassword(String(body.password ?? ""))) {
      throw new AuthError("Senha do aplicativo incorreta.");
    }
    const userId = typeof body.userId === "string" ? body.userId : USERS[0]?.id;
    const session = createSessionForUser(userId);
    const response = NextResponse.json({
      ok: true,
      user: USERS.find((user) => user.id === session.userId),
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
