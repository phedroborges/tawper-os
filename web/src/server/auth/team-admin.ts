import "server-only";

import postgres from "postgres";
import { canonicalWhatsApp, storedWhatsApp } from "@/lib/br-ids";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { getSupabaseAnon } from "@/lib/supabase/anon";
import type { User } from "@/lib/types";
import { invalidateCrmReadCache } from "@/server/crm";
import { invalidateOperators } from "@/server/persist";
import { invalidateTeam, loadTeam, type TeamMember } from "./team";

/** Painel Equipe: criar, editar, desativar (passando a carteira), reativar e trocar senha. Só administrador. */

export type Carteira = { empresas: number; negocios: number; tarefas: number; conversas: number };
export type TeamRow = TeamMember & { carteira: Carteira };

const ROLES: User["role"][] = ["admin", "gestor", "vendedor", "representante"];
const COLORS = ["#123a7b", "#d41624", "#0f7a5a", "#8a5a00", "#5b3fa6", "#2b4a78"];

function fail(message: string): never {
  throw new Error(message);
}

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function role(value: unknown): User["role"] {
  return ROLES.includes(value as User["role"]) ? (value as User["role"]) : fail("Escolha o perfil de acesso.");
}

function password(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  if (raw.length < 8) fail("A senha precisa ter pelo menos 8 caracteres.");
  return raw;
}

/** WhatsApp em E.164 (+55…), ou null se vazio. Dois ativos não podem ter o mesmo número: o agente não saberia quem é. */
function whatsapp(value: unknown, team: TeamMember[], selfId?: string) {
  const raw = text(value, 40);
  if (!raw) return null;
  const stored = storedWhatsApp(raw) ?? fail("WhatsApp inválido. Use um celular com DDD, como (64) 99999-9999.");
  const owner = team.find((member) => member.ativo && member.id !== selfId && canonicalWhatsApp(member.phone) === canonicalWhatsApp(stored));
  if (owner) fail(`Esse WhatsApp já está com ${owner.name}.`);
  return `+${stored}`;
}

function changed() {
  invalidateTeam();
  invalidateOperators();
  invalidateCrmReadCache();
}

export async function teamWithCarteira(): Promise<TeamRow[]> {
  const sb = getSupabaseAdmin();
  const team = await loadTeam(true);
  const [companies, deals, tasks, conversations] = await Promise.all([
    sb.from("companies").select("owner_id").eq("organization_id", TAWPER_ORG_ID).neq("status", "merged"),
    sb.from("opportunities").select("owner_id").eq("organization_id", TAWPER_ORG_ID).eq("status", "open"),
    sb.from("activities").select("owner_id").eq("organization_id", TAWPER_ORG_ID).in("status", ["pending", "in_progress"]),
    sb.from("conversations").select("owner_id").eq("organization_id", TAWPER_ORG_ID),
  ]);
  for (const res of [companies, deals, tasks, conversations]) if (res.error) throw new Error(res.error.message);
  const count = (rows: { owner_id: unknown }[] | null, id: string) => (rows ?? []).filter((row) => row.owner_id === id).length;
  return team.map((member) => ({
    ...member,
    carteira: {
      empresas: count(companies.data, member.id),
      negocios: count(deals.data, member.id),
      tarefas: count(tasks.data, member.id),
      conversas: count(conversations.data, member.id),
    },
  }));
}

export async function createMember(input: Record<string, unknown>) {
  const team = await loadTeam(true);
  const name = text(input.nome) || fail("Informe o nome.");
  const short = text(input.curto, 40) || name.split(" ")[0];
  const email = text(input.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("E-mail inválido.");
  const access = role(input.papel);
  const phone = whatsapp(input.whatsapp, team);
  const pass = password(input.senha);
  const sb = getSupabaseAdmin();

  const created = await sb.auth.admin.createUser({ email, password: pass, email_confirm: true, user_metadata: { full_name: name, short_name: short } });
  if (created.error || !created.data.user) {
    const taken = /already|registered|exists/i.test(created.error?.message ?? "");
    fail(taken ? "Já existe um usuário com esse e-mail. Se ele foi desativado, reative na lista." : (created.error?.message ?? "Não foi possível criar o usuário."));
  }
  const id = created.data.user.id;
  const profile = await sb.from("profiles").upsert(
    { id, email, full_name: name, short_name: short, title: text(input.cargo) || null, phone_e164: phone, avatar_color: COLORS[team.length % COLORS.length], is_active: true },
    { onConflict: "id" },
  );
  if (profile.error) fail(profile.error.message);
  const membership = await sb.from("memberships").upsert({ organization_id: TAWPER_ORG_ID, profile_id: id, role: access, is_active: true }, { onConflict: "organization_id,profile_id" });
  if (membership.error) fail(membership.error.message);
  changed();
  return id;
}

export async function updateMember(actorId: string, input: Record<string, unknown>) {
  const team = await loadTeam(true);
  const id = text(input.id, 40);
  const member = team.find((item) => item.id === id) ?? fail("Pessoa não encontrada.");
  const name = text(input.nome) || fail("Informe o nome.");
  const access = role(input.papel);
  if (id === actorId && access !== "admin") fail("Você não pode tirar o seu próprio acesso de administrador.");
  const sb = getSupabaseAdmin();
  const profile = await sb
    .from("profiles")
    .update({ full_name: name, short_name: text(input.curto, 40) || name.split(" ")[0], title: text(input.cargo) || null, phone_e164: whatsapp(input.whatsapp, team, id) })
    .eq("id", member.id);
  if (profile.error) fail(profile.error.message);
  const membership = await sb.from("memberships").update({ role: access }).eq("organization_id", TAWPER_ORG_ID).eq("profile_id", member.id);
  if (membership.error) fail(membership.error.message);
  changed();
}

/** Desativa e, se a pessoa tem carteira, passa empresas, negócios abertos, tarefas pendentes e conversas para outra, numa transação só. */
export async function deactivateMember(actorId: string, input: Record<string, unknown>) {
  const rows = await teamWithCarteira();
  const id = text(input.id, 40);
  const member = rows.find((item) => item.id === id) ?? fail("Pessoa não encontrada.");
  if (id === actorId) fail("Você não pode desativar o seu próprio acesso.");
  if (!member.ativo) fail(`${member.name} já está desativado.`);
  const { empresas, negocios, tarefas, conversas } = member.carteira;
  const hasCarteira = empresas + negocios + tarefas + conversas > 0;
  const targetId = text(input.transferirPara, 40);
  const target = targetId ? (rows.find((item) => item.id === targetId && item.ativo && item.id !== id) ?? fail("Escolha uma pessoa ativa para receber a carteira.")) : undefined;
  if (hasCarteira && !target) fail(`${member.name} tem carteira. Escolha para quem passar antes de desativar.`);

  const url = process.env.DATABASE_URL ?? fail("DATABASE_URL ausente para desativar com transferência.");
  const sql = postgres(url, { max: 1, ssl: /(?:localhost|127\.0\.0\.1):\d+/.test(url) ? false : "require" });
  try {
    await sql.begin(async (tx) => {
      await tx`select app.crm_begin(${actorId}::uuid, 'user')`;
      if (target) {
        await tx`update public.companies set owner_id = ${target.id}::uuid where organization_id = ${TAWPER_ORG_ID}::uuid and owner_id = ${id}::uuid and status <> 'merged'`;
        await tx`update public.opportunities set owner_id = ${target.id}::uuid where organization_id = ${TAWPER_ORG_ID}::uuid and owner_id = ${id}::uuid and status = 'open'`;
        await tx`update public.activities set owner_id = ${target.id}::uuid where organization_id = ${TAWPER_ORG_ID}::uuid and owner_id = ${id}::uuid and status in ('pending', 'in_progress')`;
        await tx`update public.conversations set owner_id = ${target.id}::uuid where organization_id = ${TAWPER_ORG_ID}::uuid and owner_id = ${id}::uuid`;
      }
      await tx`update public.memberships set is_active = false where organization_id = ${TAWPER_ORG_ID}::uuid and profile_id = ${id}::uuid`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  changed();
  return { nome: member.name, para: target?.name, carteira: member.carteira };
}

export async function reactivateMember(input: Record<string, unknown>) {
  const id = text(input.id, 40);
  const team = await loadTeam(true);
  const member = team.find((item) => item.id === id) ?? fail("Pessoa não encontrada.");
  if (member.phone && team.some((item) => item.ativo && item.id !== id && canonicalWhatsApp(item.phone) === canonicalWhatsApp(member.phone))) {
    fail("O WhatsApp dessa pessoa já está com alguém ativo. Edite o número antes de reativar.");
  }
  const sb = getSupabaseAdmin();
  const [membership, profile] = await Promise.all([
    sb.from("memberships").update({ is_active: true }).eq("organization_id", TAWPER_ORG_ID).eq("profile_id", id),
    sb.from("profiles").update({ is_active: true }).eq("id", id),
  ]);
  if (membership.error) fail(membership.error.message);
  if (profile.error) fail(profile.error.message);
  changed();
}

export async function setMemberPassword(input: Record<string, unknown>) {
  const id = text(input.id, 40);
  const member = (await loadTeam(true)).find((item) => item.id === id) ?? fail("Pessoa não encontrada.");
  const updated = await getSupabaseAdmin().auth.admin.updateUserById(member.id, { password: password(input.senha) });
  if (updated.error) fail(updated.error.message);
}

/** Minha conta: a própria pessoa troca nome, nome curto e WhatsApp. Papel e cargo continuam com o administrador. */
export async function updateOwnProfile(selfId: string, input: Record<string, unknown>) {
  const team = await loadTeam(true);
  const member = team.find((item) => item.id === selfId) ?? fail("Pessoa não encontrada.");
  const name = text(input.nome) || fail("Informe o nome.");
  const profile = await getSupabaseAdmin()
    .from("profiles")
    .update({ full_name: name, short_name: text(input.curto, 40) || name.split(" ")[0], phone_e164: whatsapp(input.whatsapp, team, member.id) })
    .eq("id", member.id);
  if (profile.error) fail(profile.error.message);
  changed();
}

/** Minha conta: troca a própria senha, conferindo a atual antes. */
export async function changeOwnPassword(selfId: string, input: Record<string, unknown>) {
  const member = (await loadTeam(true)).find((item) => item.id === selfId) ?? fail("Pessoa não encontrada.");
  const atual = typeof input.atual === "string" ? input.atual : "";
  const nova = password(input.nova);
  if (!atual) fail("Informe a senha atual.");
  if (nova === atual) fail("A senha nova precisa ser diferente da atual.");
  const check = await getSupabaseAnon().auth.signInWithPassword({ email: member.email, password: atual });
  if (check.error || check.data.user?.id !== member.id) fail("A senha atual não confere.");
  const updated = await getSupabaseAdmin().auth.admin.updateUserById(member.id, { password: nova });
  if (updated.error) fail(updated.error.message);
}
