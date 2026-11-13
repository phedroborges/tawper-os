import "server-only";

import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { RoutePlan } from "@/lib/types";
import { ensureOperators, resolveOwner } from "@/server/persist";

const isUuid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Rotas do banco. Nunca derruba a leitura do CRM: sem a migration 0023 ou sem rotas, volta lista vazia. */
export async function loadRoutes(): Promise<RoutePlan[]> {
  try {
    const sb = getSupabaseAdmin();
    const [plans, stops] = await Promise.all([
      sb.from("route_plans").select("*").eq("organization_id", TAWPER_ORG_ID).neq("status", "cancelled").order("planned_date", { ascending: false }).limit(200),
      sb.from("route_stops").select("*").eq("organization_id", TAWPER_ORG_ID),
    ]);
    if (plans.error || stops.error) return [];
    const byPlan = new Map<string, typeof stops.data>();
    for (const stop of stops.data ?? []) byPlan.set(stop.route_plan_id as string, [...(byPlan.get(stop.route_plan_id as string) ?? []), stop]);
    return (plans.data ?? []).map((p) => ({
      id: p.id as string,
      ownerId: p.owner_id as string,
      regiao: (p.region_label as string) || "Todas as regiões",
      data: p.planned_date as string,
      kmEstimado: Number(p.estimated_km ?? 0),
      status: p.status === "planned" ? ("planejada" as const) : ("confirmada" as const),
      descricao: (p.notes as string) ?? undefined,
      paradas: (byPlan.get(p.id as string) ?? [])
        .sort((a, b) => Number(a.position) - Number(b.position))
        .map((s) => ({ companyId: s.company_id as string, objetivo: s.objective as string, motivo: (s.reason as string) ?? "", horario: (s.scheduled_at as string) ?? undefined })),
    }));
  } catch {
    return [];
  }
}

export interface RouteInput {
  regiao: string;
  /** Início da primeira visita (ISO). */
  data: string;
  paradas: { companyId: string; objetivo: string; motivo: string; horario?: string }[];
  kmEstimado: number;
  descricao?: string;
  confirm?: boolean;
}

/** Grava a rota e as paradas. Se as paradas falharem, a rota não fica pela metade. */
export async function saveRouteRecord(input: RouteInput, ownerId: string | undefined, actorId?: string): Promise<string> {
  if (!input.paradas.length) throw new Error("A rota precisa de pelo menos uma parada.");
  if (input.paradas.some((p) => !isUuid(p.companyId))) throw new Error("Há cliente da rota que ainda não está no banco.");
  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const day = new Date(input.data);
  if (Number.isNaN(day.getTime())) throw new Error("Data da rota inválida.");
  const plan = await sb
    .from("route_plans")
    .insert({
      organization_id: TAWPER_ORG_ID,
      owner_id: await resolveOwner(ownerId ?? actorId, actors),
      // Dia de calendário de Brasília, não o dia em UTC.
      planned_date: day.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      status: input.confirm ? "confirmed" : "planned",
      estimated_km: Math.max(0, input.kmEstimado || 0),
      notes: input.descricao?.slice(0, 4000) || null,
      region_label: input.regiao.slice(0, 80),
      created_by: actorId ? await resolveOwner(actorId, actors) : null,
    })
    .select("id")
    .single();
  if (plan.error || !plan.data) throw new Error(plan.error?.message ?? "Falha ao gravar a rota.");
  const planId = plan.data.id as string;
  const stops = await sb.from("route_stops").insert(
    input.paradas.map((p, i) => ({ organization_id: TAWPER_ORG_ID, route_plan_id: planId, company_id: p.companyId, position: i + 1, objective: p.objetivo, reason: p.motivo || null, scheduled_at: p.horario ?? null })),
  );
  if (stops.error) {
    await sb.from("route_plans").delete().eq("id", planId);
    throw new Error(stops.error.message);
  }
  return planId;
}

export async function confirmRouteRecord(id: string) {
  if (!isUuid(id)) throw new Error("Esta rota ainda não está no banco.");
  const upd = await getSupabaseAdmin().from("route_plans").update({ status: "confirmed" }).eq("id", id).eq("organization_id", TAWPER_ORG_ID).eq("status", "planned");
  if (upd.error) throw new Error(upd.error.message);
}
