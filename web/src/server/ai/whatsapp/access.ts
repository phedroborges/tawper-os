import { canonicalWhatsApp } from "@/lib/br-ids";
import type { User } from "@/lib/types";
import type { WhatsAppAgentIdentity } from "./config";

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function resolveWhatsAppAgentUser(identity: WhatsAppAgentIdentity, users: User[]): { user: User; linked: boolean } {
  const targetName = normalized(identity.name);
  const firstName = targetName.split(" ")[0];
  const byPhone = users.find((user) => canonicalWhatsApp(user.phone) === identity.phone);
  const exactName = users.find((user) => [user.name, user.short].some((name) => normalized(name) === targetName));
  const sameFirstName = users.filter((user) => [user.name, user.short].some((name) => normalized(name).split(" ")[0] === firstName));
  const matched = byPhone ?? exactName ?? (sameFirstName.length === 1 ? sameFirstName[0] : undefined);
  const role = identity.role;
  return {
    linked: Boolean(matched),
    user: {
      id: matched?.id ?? `whatsapp-${identity.phone}`,
      name: identity.name,
      short: identity.name.split(" ")[0] || identity.name,
      role,
      title: matched?.title ?? (role === "admin" ? "Administrador" : role === "gestor" ? "Gestor" : "Vendedor"),
      initials: matched?.initials ?? identity.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      color: matched?.color ?? "#123a7b",
      phone: identity.phone,
      regions: matched?.regions ?? [],
    },
  };
}
