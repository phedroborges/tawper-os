import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { supabaseOn } from "@/server/auth/team";
import { changeOwnPassword, updateOwnProfile } from "@/server/auth/team-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Minha conta: só mexe na pessoa da sessão. Nenhum id vem do navegador. */
export async function POST(request: Request) {
  try {
    const session = await withSession(request);
    if (!supabaseOn()) throw new Error("Minha conta precisa do banco ligado.");
    const body = (await request.json()) as Record<string, unknown>;
    if (body.acao === "perfil") await updateOwnProfile(session.userId, body);
    else if (body.acao === "senha") await changeOwnPassword(session.userId, body);
    else return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonAuthError(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 400 });
  }
}
