import { canonicalWhatsApp } from "@/lib/br-ids";
import type { User } from "@/lib/types";
import type { WhatsAppAgentIdentity } from "./config";

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Vincula o remetente a um usuário do CRM. O papel efetivo é sempre o do perfil
 * no Tawper — a allowlist só autoriza o número, não promove gestor.
 */
export function resolveWhatsAppAgentUser(identity: WhatsAppAgentIdentity, users: User[]): { user: User; linked: boolean } {
  const targetName = normalized(identity.name);
  const firstName = targetName.split(" ")[0];
  const byPhone = users.find((user) => canonicalWhatsApp(user.phone) === identity.phone);
  const exactName = users.find((user) => [user.name, user.short].some((name) => normalized(name) === targetName));
  const sameFirstName = users.filter((user) => [user.name, user.short].some((name) => normalized(name).split(" ")[0] === firstName));
  const byProfile = identity.profileId ? users.find((user) => user.id === identity.profileId) : undefined;
  const matched = byProfile ?? byPhone ?? exactName ?? (sameFirstName.length === 1 ? sameFirstName[0] : undefined);
  if (matched) {
    return { linked: true, user: matched };
  }
  return {
    linked: false,
    user: {
      id: `whatsapp-${identity.phone}`,
      name: identity.name,
      short: identity.name.split(" ")[0] || identity.name,
      role: identity.role,
      title: identity.role === "admin" ? "Administrador" : identity.role === "gestor" ? "Gestor" : "Vendedor",
      initials: identity.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      color: "#123a7b",
      phone: identity.phone,
      regions: [],
    },
  };
}
