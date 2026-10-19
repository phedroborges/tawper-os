import { canonicalWhatsApp, storedWhatsApp } from "@/lib/br-ids";

export type WhatsAppAgentRole = "admin" | "gestor" | "vendedor";

export type WhatsAppAgentIdentity = {
  phone: string;
  name: string;
  role: WhatsAppAgentRole;
};

type RawIdentity = { phone?: unknown; name?: unknown; role?: unknown };

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
    identities.set(canonicalWhatsApp(phone), { phone: canonicalWhatsApp(phone), name, role });
  }
  return [...identities.values()];
}

export function whatsappAgentEnabled() {
  return process.env.TAWPER_WHATSAPP_AGENT_ENABLED === "true";
}

export function whatsappAgentUsers() {
  return parseWhatsAppAgentUsers(process.env.TAWPER_WHATSAPP_AGENT_USERS_JSON);
}

export function whatsappAgentBotNumber() {
  const phone = storedWhatsApp(process.env.TAWPER_WHATSAPP_AGENT_BOT_NUMBER);
  return phone ? canonicalWhatsApp(phone) : "";
}

export function findWhatsAppAgentIdentity(sender: string) {
  const phone = canonicalWhatsApp(sender);
  if (!phone || phone === whatsappAgentBotNumber()) return null;
  return whatsappAgentUsers().find((identity) => identity.phone === phone) ?? null;
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
