import "server-only";

import { USERS } from "@/lib/constants";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { User } from "@/lib/types";

/**
 * Quem tem acesso ao sistema sai do banco (profiles + memberships), editado no painel Equipe.
 * A lista USERS do código só vale para a demo local sem Supabase.
 */
export type TeamMember = User & { email: string; ativo: boolean };

const TTL_MS = 30_000;
let cache: { at: number; team: TeamMember[] } | null = null;

export function supabaseOn() {
  return process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE === "true";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ""))).toUpperCase();
}

export async function loadTeam(fresh = false): Promise<TeamMember[]> {
  if (!supabaseOn()) return USERS.map((user) => ({ ...user, email: "", ativo: true }));
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.team;
  const sb = getSupabaseAdmin();
  const [members, profiles] = await Promise.all([
    sb.from("memberships").select("profile_id, role, is_active").eq("organization_id", TAWPER_ORG_ID),
    sb.from("profiles").select("id, email, full_name, short_name, title, phone_e164, avatar_color, is_active"),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (profiles.error) throw new Error(profiles.error.message);
  const byId = new Map((profiles.data ?? []).map((row) => [row.id as string, row]));
  const team = (members.data ?? []).flatMap((m): TeamMember[] => {
    const p = byId.get(m.profile_id as string);
    if (!p) return [];
    const name = (p.full_name as string) || "Usuário";
    const short = (p.short_name as string) || name.split(" ")[0];
    return [
      {
        id: p.id as string,
        name,
        short,
        role: m.role as User["role"],
        title: (p.title as string) ?? "",
        initials: initials(name),
        color: (p.avatar_color as string) ?? "#123a7b",
        phone: (p.phone_e164 as string) ?? "",
        regions: [],
        email: String(p.email ?? ""),
        ativo: Boolean(m.is_active) && p.is_active !== false,
      },
    ];
  });
  team.sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.name.localeCompare(b.name, "pt-BR"));
  cache = { at: Date.now(), team };
  return team;
}

export function invalidateTeam() {
  cache = null;
}

/** Pessoa ativa da equipe; undefined se não existe ou foi desativada. */
export async function activeMember(id: string): Promise<TeamMember | undefined> {
  return (await loadTeam()).find((member) => member.id === id && member.ativo);
}
