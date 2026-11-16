import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WidgetGridPrefs, WidgetSize } from "@/lib/types";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { supabaseOn } from "@/server/auth/team";
import { invalidateCrmReadCache } from "@/server/crm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_BOARDS = new Set(["dashboard", "metas"]);
const VALID_SIZES = new Set<WidgetSize>(["sm", "md", "lg"]);

function sanitizePrefs(raw: unknown): WidgetGridPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const order = Array.isArray(obj.order)
    ? obj.order.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64).slice(0, 30)
    : [];
  const hidden = Array.isArray(obj.hidden)
    ? obj.hidden.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64).slice(0, 30)
    : [];
  const sizes: Record<string, WidgetSize> = {};
  if (obj.sizes && typeof obj.sizes === "object") {
    for (const [k, v] of Object.entries(obj.sizes as Record<string, unknown>)) {
      if (k.length <= 64 && VALID_SIZES.has(v as WidgetSize)) {
        sizes[k] = v as WidgetSize;
      }
    }
  }
  return { order, sizes, hidden };
}

export async function POST(request: Request) {
  try {
    const session = await withSession(request);
    if (!supabaseOn()) return NextResponse.json({ ok: true, localOnly: true });

    const body = (await request.json()) as { board?: string; prefs?: unknown };
    const board = String(body.board ?? "").trim();
    if (!VALID_BOARDS.has(board)) {
      return NextResponse.json({ error: "Painel inválido." }, { status: 400 });
    }

    const prefs = sanitizePrefs(body.prefs);
    const sb = getSupabaseAdmin();
    const { data: current } = await sb.from("profiles").select("dashboard_layout").eq("id", session.userId).maybeSingle();
    const prevLayout =
      current?.dashboard_layout && typeof current.dashboard_layout === "object"
        ? (current.dashboard_layout as Record<string, WidgetGridPrefs>)
        : {};

    const nextLayout = { ...prevLayout, [board]: prefs };
    const { error } = await sb.from("profiles").update({ dashboard_layout: nextLayout }).eq("id", session.userId);
    if (error) throw new Error(error.message);
    invalidateCrmReadCache();
    return NextResponse.json({ ok: true, dashboardLayout: nextLayout });
  } catch (error) {
    return jsonAuthError(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar layout." }, { status: 400 });
  }
}
