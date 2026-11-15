import "server-only";

import { storedWhatsApp } from "@/lib/br-ids";

type RawIdentity = { phone?: unknown; name?: unknown; profileId?: unknown };

function norm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Fallback seguro para preencher o WhatsApp comercial do consultor a partir
 * da lista oficial autorizada (TAWPER_WHATSAPP_AGENT_USERS_JSON) quando
 * `profiles.phone_e164` ainda está vazio no banco.
 */
export function buildAgentPhoneLookup(): (member: { id: string; name: string; short?: string }) => string {
  const raw = process.env.TAWPER_WHATSAPP_AGENT_USERS_JSON;
  if (!raw?.trim()) return () => "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return () => "";
  }
  if (!Array.isArray(parsed)) return () => "";

  const entries = (parsed as RawIdentity[])
    .map((item) => {
      const phone = typeof item?.phone === "string" ? storedWhatsApp(item.phone) : undefined;
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      const profileId = typeof item?.profileId === "string" ? item.profileId.trim() : "";
      return phone && name ? { phone, name, normName: norm(name), first: norm(name).split(" ")[0] ?? "", profileId } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (!entries.length) return () => "";

  return ({ id, name, short }) => {
    const byId = entries.find((e) => e.profileId && e.profileId === id);
    if (byId) return byId.phone;

    const targetFull = norm(name);
    const targetShort = norm(short || name.split(" ")[0] || "");
    const exact = entries.find((e) => e.normName === targetFull || (targetShort && e.normName === targetShort));
    if (exact) return exact.phone;

    const firstMatches = targetShort ? entries.filter((e) => e.first === targetShort) : [];
    if (firstMatches.length === 1) return firstMatches[0].phone;

    return "";
  };
}
