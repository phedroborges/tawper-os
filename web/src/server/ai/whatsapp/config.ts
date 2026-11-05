import { canonicalWhatsApp, storedWhatsApp } from "@/lib/br-ids";
import { loadTeam, supabaseOn } from "@/server/auth/team";

export type WhatsAppAgentRole = "admin" | "gestor" | "vendedor";

export type WhatsAppAgentIdentity = {
  phone: string;
  name: string;
  role: WhatsAppAgentRole;
  /** Perfil do Tawper (profiles.id) a que este número pertence. Vence qualquer busca por telefone ou nome. */
  profileId?: string;
};

type RawIdentity = { phone?: unknown; name?: unknown; role?: unknown; profileId?: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function roleOf(value: unknown): WhatsAppAgentRole | null {
  if (value === "admin" || value === "gestor" || value === "vendedor") return value;
  if (value === "desenvolvedor") return "admin";
  if (value === "vendedor_gestor" || value === "vendedor e gestor") return "gestor";
  return null;
}
export function parseWhatsAppAgentUsers(raw: string | undefined): WhatsAppAgentIdentity[] {
  if (!raw?.trim()) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("TAWPER_WHATSAPP_AGENT_USERS_JSON precisa ser um JSON válido.");
  }
  if (!Array.isArray(value)) throw new Error("TAWPER_WHATSAPP_AGENT_USERS_JSON precisa ser uma lista.");

  const identities = new Map<string, WhatsAppAgentIdentity>();
  for (const item of value as RawIdentity[]) {
    const phone = typeof item?.phone === "string" ? storedWhatsApp(item.phone) : undefined;
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 120) : "";
    const role = roleOf(item?.role);
    if (!phone || !name || !role) throw new Error("Cada usuário do agente precisa de phone, name e role válidos.");
    const profileId = typeof item?.profileId === "string" ? item.profileId.trim() : "";
    if (profileId && !UUID.test(profileId)) throw new Error("profileId do agente precisa ser o UUID do perfil no Tawper.");
    identities.set(canonicalWhatsApp(phone), { phone: canonicalWhatsApp(phone), name, role, ...(profileId ? { profileId } : {}) });
  }
  return [...identities.values()];
}

export function whatsappAgentEnabled() {
  return process.env.TAWPER_WHATSAPP_AGENT_ENABLED === "true";
}

/**
 * Quem pode falar com o agente: quem está ativo no painel Equipe e tem WhatsApp cadastrado.
 * A lista TAWPER_WHATSAPP_AGENT_USERS_JSON só vale enquanto ninguém da equipe tem WhatsApp no banco (ou na demo).
 */
export async function whatsappAgentUsers(): Promise<WhatsAppAgentIdentity[]> {
  if (supabaseOn()) {
    const team = (await loadTeam()).filter((member) => member.ativo && canonicalWhatsApp(member.phone));
    if (team.length) return team.map((member) => ({ phone: canonicalWhatsApp(member.phone), name: member.name, role: roleOf(member.role) ?? "vendedor", profileId: member.id }));
  }
  return parseWhatsAppAgentUsers(process.env.TAWPER_WHATSAPP_AGENT_USERS_JSON);
}

export function whatsappAgentBotNumber() {
  const phone = storedWhatsApp(process.env.TAWPER_WHATSAPP_AGENT_BOT_NUMBER);
  return phone ? canonicalWhatsApp(phone) : "";
}

export async function findWhatsAppAgentIdentity(sender: string) {
  const phone = canonicalWhatsApp(sender);
  if (!phone || phone === whatsappAgentBotNumber()) return null;
  return (await whatsappAgentUsers()).find((identity) => identity.phone === phone) ?? null;
}

export function whatsappAgentWebhookToken() {
  return process.env.TAWPER_WHATSAPP_AGENT_WEBHOOK_TOKEN || process.env.STEVO_WEBHOOK_TOKEN || "";
}

export function whatsappAgentWorkerToken() {
  return process.env.TAWPER_AI_WORKER_TOKEN || "";
}

export function whatsappAgentStevoConfig() {
  return {
    baseUrl: (process.env.STEVO_AGENT_API_URL || process.env.STEVO_SERVER_URL || process.env.STEVO_API_URL || "").replace(/\/$/, ""),
    apiKey: process.env.STEVO_AGENT_API_KEY || process.env.STEVO_API_KEY || "",
  };
}
