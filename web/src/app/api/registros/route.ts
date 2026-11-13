import { NextResponse } from "next/server";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { AgentRecord } from "@/lib/registros";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { AuthError } from "@/server/auth/session";
import { supabaseOn } from "@/server/auth/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Auditoria do agente do WhatsApp: o que cada pessoa informou e o que o sistema gravou. Só gestor. */
export async function GET(request: Request) {
  try {
    const session = await withSession(request);
    if (session.role !== "admin" && session.role !== "gestor") {
      const denied = new AuthError("Os registros são só para gestores.");
      denied.status = 403;
      throw denied;
    }
    if (!supabaseOn()) return NextResponse.json({ records: [] });
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const rows = await getSupabaseAdmin()
      .from("ai_agent_runs")
      .select("id, actor_profile_id, company_id, created_at, input_summary, output_summary")
      .eq("organization_id", TAWPER_ORG_ID)
      .eq("agent_key", "whatsapp_agent")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (rows.error) throw new Error(rows.error.message);
    const records: AgentRecord[] = (rows.data ?? []).map((row) => {
      const input = obj(row.input_summary);
      const output = obj(row.output_summary);
      return {
        id: row.id as string,
        at: row.created_at as string,
        userId: (row.actor_profile_id as string) ?? "",
        companyId: (row.company_id as string) ?? undefined,
        pergunta: String(input.pergunta ?? ""),
        audio: Boolean(input.audio),
        resposta: String(output.resposta ?? ""),
        gravou: list(output.gravou),
        marcas: list(output.marcas),
      };
    });
    return NextResponse.json({ records });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler os registros." }, { status: 500 });
  }
}
