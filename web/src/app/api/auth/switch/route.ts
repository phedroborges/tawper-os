import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Impersonação desligada: cada pessoa entra com o próprio e-mail no Supabase Auth. */
export async function POST(request: Request) {
  try {
    requireSession(request);
    throw new AuthError("Troca de perfil desligada. Saia e entre com o e-mail do operador.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível trocar o perfil.";
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
