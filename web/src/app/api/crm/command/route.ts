import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { invalidateCrmReadCache } from "@/server/crm";
import { runCommand, type Command } from "@/server/commands";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Comandos de negócio (mudar etapa, ganho, perda, espera…): executados no banco, com erro claro para a tela. */
export async function POST(request: Request) {
  try {
    const session = withSession(request);
    const body = (await request.json()) as Command;
    const withActor = (
      body.command === "addInteraction"
        ? { ...body, autorId: session.userId }
        : { ...body, actorId: session.userId }
    ) as Command;
    const result = await runCommand(withActor);
    invalidateCrmReadCache();
    return NextResponse.json({ ok: true, result: result ?? null });
  } catch (e) {
    invalidateCrmReadCache();
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível concluir a operação." }, { status: 400 });
  }
}
