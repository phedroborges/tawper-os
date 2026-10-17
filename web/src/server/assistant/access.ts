import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { querySchema, TABLES, type CrmReader, type CrmQuery } from "./schema";

export class AssistantError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const protocol = `${request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1)}:`;
  try { return new URL(origin).host === host && new URL(origin).protocol === protocol && ["http:", "https:"].includes(protocol); } catch { return false; }
}

export function isLocalPreview(request: Request, env = process.env) {
  const url = new URL(request.url);
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  return env.NODE_ENV === "development" && env.ASSISTANT_LOCAL_PREVIEW === "true"
    && localHosts.includes(url.hostname)
    && (!request.headers.has("x-forwarded-for") || ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.headers.get("x-forwarded-for")!))
    && isSameOrigin(request)
    && !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "");
}

class SupabaseReader implements CrmReader {
  constructor(private sb: SupabaseClient, private signal: AbortSignal) {}
  async query(raw: CrmQuery) {
    const input = querySchema.parse(raw);
    const config = TABLES[input.table];
    let query = this.sb.from(input.table).select(config.columns, { count: "exact" });
    if (input.table === "profiles") {
      const members = await this.sb.from("memberships").select("profile_id").eq("organization_id", TAWPER_ORG_ID).eq("is_active", true).limit(1001).abortSignal(this.signal);
      if (members.error || (members.data?.length ?? 0) > 1000) throw new AssistantError(503, "Não foi possível verificar as pessoas desta organização.");
      const ids = (members.data ?? []).map((m) => m.profile_id as string);
      if (!ids.length) return { rows: [], total: 0, hasMore: false };
      query = query.in("id", ids);
    } else query = query.eq("organization_id", TAWPER_ORG_ID);
    if (input.table === "companies") query = query.neq("status", "merged");
    for (const filter of input.filters) {
      if (filter.op === "ilike") query = query.ilike(filter.field, `%${filter.value}%`);
      else if (filter.op === "eq") query = query.eq(filter.field, filter.value);
      else if (filter.op === "gte") query = query.gte(filter.field, filter.value);
      else query = query.lte(filter.field, filter.value);
    }
    const order = input.orderBy ?? config.order;
    query = query.order(order, { ascending: !input.descending, nullsFirst: false });
    if (order !== "id") query = query.order("id");
    const result = await query.range(input.offset, input.offset + input.limit - 1).abortSignal(this.signal);
    if (result.error) throw new AssistantError(503, "A consulta ao CRM falhou. Não foi possível confirmar os dados solicitados.");
    const rows = result.data as unknown as Record<string, unknown>[];
    return { rows, total: result.count ?? rows.length, hasMore: input.offset + rows.length < (result.count ?? rows.length) };
  }
}

export type AssistantAccess = { mode: "authenticated" | "local_preview"; actorId: string; actorName: string; reader: CrmReader | null };

export async function getAssistantAccess(request: Request, signal: AbortSignal): Promise<AssistantAccess> {
  if (process.env.ASSISTANT_ENABLED !== "true") throw new AssistantError(503, "O assistente está desativado neste ambiente.");
  const authorization = request.headers.get("authorization");
  const url = process.env.ASSISTANT_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (authorization) {
    const publicKey = process.env.ASSISTANT_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publicKey || !authorization.startsWith("Bearer ")) throw new AssistantError(401, "Sessão inválida. Entre novamente.");
    const sb = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization }, fetch: (input, init) => fetch(input, { ...init, signal }) } });
    const { data, error } = await sb.auth.getUser(authorization.slice(7));
    if (error || !data.user) throw new AssistantError(401, "Sessão inválida. Entre novamente.");
    const membership = await sb.from("memberships").select("role").eq("organization_id", TAWPER_ORG_ID).eq("profile_id", data.user.id).eq("is_active", true).abortSignal(signal).maybeSingle();
    if (membership.error || !membership.data) throw new AssistantError(403, "Você não tem acesso a esta organização.");
    const profile = await sb.from("profiles").select("full_name").eq("id", data.user.id).abortSignal(signal).maybeSingle();
    return { mode: "authenticated", actorId: data.user.id, actorName: profile.data?.full_name ?? "Usuário autenticado", reader: new SupabaseReader(sb, signal) };
  }
  if (!isLocalPreview(request)) throw new AssistantError(401, "Entre com uma sessão autenticada para usar o assistente. A troca de perfil da demonstração não autentica o usuário.");
  const key = process.env.ASSISTANT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return { mode: "local_preview", actorId: "local-preview", actorName: "Prévia local (sem identidade autenticada)", reader: sb ? new SupabaseReader(sb, signal) : null };
}
