import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { AuthError } from "@/server/auth/session";
import { createMember, deactivateMember, reactivateMember, setMemberPassword, teamWithCarteira, updateMember } from "@/server/auth/team-admin";
import { supabaseOn } from "@/server/auth/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function admin(request: Request) {
  const session = await withSession(request);
  if (session.role !== "admin") {
    const denied = new AuthError("Só o administrador mexe na equipe.");
    denied.status = 403;
    throw denied;
  }
  if (!supabaseOn()) throw new Error("O painel Equipe precisa do banco ligado (NEXT_PUBLIC_TAWPER_USE_SUPABASE=true).");
  return session;
}

export async function GET(request: Request) {
  try {
    await admin(request);
    return NextResponse.json({ team: await teamWithCarteira() });
  } catch (error) {
    return jsonAuthError(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao ler a equipe." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await admin(request);
    const body = (await request.json()) as Record<string, unknown>;
    switch (body.acao) {
      case "criar":
        return NextResponse.json({ ok: true, id: await createMember(body) });
      case "editar":
        await updateMember(session.userId, body);
        return NextResponse.json({ ok: true });
      case "desativar":
        return NextResponse.json({ ok: true, ...(await deactivateMember(session.userId, body)) });
      case "reativar":
        await reactivateMember(body);
        return NextResponse.json({ ok: true });
      case "senha":
        await setMemberPassword(body);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (error) {
    return jsonAuthError(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 400 });
  }
}
