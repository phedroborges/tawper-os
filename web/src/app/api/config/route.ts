import { NextResponse } from "next/server";
import { parseConfig, type AppConfig } from "@/lib/config";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { AuthError } from "@/server/auth/session";
import { loadConfig, saveConfig } from "@/server/config";
import { invalidateCrmReadCache } from "@/server/crm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_KEYS: (keyof AppConfig)[] = ["stageRules", "activityRules", "goals"];

/** Grava uma parte da configuração. Regras e metas: só administrador. Lembrete: cada pessoa liga ou desliga o seu. */
export async function POST(request: Request) {
  try {
    const session = await withSession(request);
    const body = (await request.json()) as { key?: string; value?: unknown; enabled?: unknown };
    if (body.key === "reminder") {
      const current = await loadConfig(true);
      const off = new Set(current.remindersOff);
      if (body.enabled === false) off.add(session.userId);
      else off.delete(session.userId);
      await saveConfig("remindersOff", [...off]);
    } else {
      const key = body.key as keyof AppConfig;
      if (!ADMIN_KEYS.includes(key)) throw new Error("Configuração desconhecida.");
      if (session.role !== "admin") {
        const denied = new AuthError("Só o administrador altera esta configuração.");
        denied.status = 403;
        throw denied;
      }
      const parsed = parseConfig({ [key]: body.value });
      await saveConfig(key, parsed[key]);
    }
    invalidateCrmReadCache();
    return NextResponse.json({ ok: true, config: await loadConfig(true) });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível salvar a configuração." }, { status: 400 });
  }
}
