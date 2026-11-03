import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { USERS } from "@/lib/constants";
import type { User } from "@/lib/types";

export const SESSION_COOKIE = "tawper_session";
const MAX_AGE_SEC = 60 * 60 * 12;

export type Session = { userId: string; role: User["role"]; exp: number };

export class AuthError extends Error {
  status = 401;
  constructor(message = "Faça login para continuar.") {
    super(message);
    this.name = "AuthError";
  }
}

/** Com Supabase ligado ou senha definida, a borda exige sessão. Demo local sem os dois continua aberta. */
export function authEnforced() {
  return process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE === "true" || Boolean(process.env.TAWPER_APP_PASSWORD);
}

function secret() {
  const value = process.env.TAWPER_APP_SECRET || process.env.TAWPER_APP_PASSWORD;
  if (!value) throw new AuthError("Defina TAWPER_APP_SECRET no servidor (assinatura do cookie de sessão).");
  return value;
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function encodeSession(session: Session) {
  const body = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (!parsed?.userId || !parsed.role || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    const user = USERS.find((item) => item.id === parsed.userId);
    if (!user) return null;
    return { userId: user.id, role: user.role, exp: parsed.exp };
  } catch {
    return null;
  }
}

function cookieValue(header: string | null) {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function sessionFromRequest(request: Request): Session | null {
  return decodeSession(cookieValue(request.headers.get("cookie")));
}

export async function sessionFromCookies(): Promise<Session | null> {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Sessão obrigatória quando o app está fechado; em demo local sem senha assume Murilo. */
export function requireSession(request: Request): Session {
  const current = sessionFromRequest(request);
  if (current) return current;
  if (!authEnforced()) return { userId: "u-murilo", role: "admin", exp: Date.now() + MAX_AGE_SEC * 1000 };
  throw new AuthError();
}

export async function requireSessionCookies(): Promise<Session> {
  const current = await sessionFromCookies();
  if (current) return current;
  if (!authEnforced()) return { userId: "u-murilo", role: "admin", exp: Date.now() + MAX_AGE_SEC * 1000 };
  throw new AuthError();
}

export function verifyAppPassword(password: string) {
  const expected = process.env.TAWPER_APP_PASSWORD ?? "";
  if (!expected) {
    if (authEnforced()) throw new AuthError("Defina TAWPER_APP_PASSWORD no servidor.");
    return true;
  }
  const left = Buffer.from(password);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionForUser(userId: string): Session {
  const user = USERS.find((item) => item.id === userId);
  if (!user) throw new AuthError("Perfil inválido.");
  return { userId: user.id, role: user.role, exp: Date.now() + MAX_AGE_SEC * 1000 };
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}
