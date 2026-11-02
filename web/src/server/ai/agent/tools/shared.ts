import "server-only";

import { visibleCompanies, type Data } from "@/lib/selectors";
import type { User } from "@/lib/types";
import { loadCrmSnapshot } from "@/server/crm";

/** Dados atuais do CRM e o que o usuário pode ver. Sempre relê (o cache do CRM é invalidado após cada gravação). */
export async function loadScope(actor: User) {
  const snapshot = await loadCrmSnapshot();
  const data: Data = { ...snapshot, suggestions: [], conversations: [] };
  const visible = new Set(visibleCompanies(data, actor).map((company) => company.id));
  const ownerName = (id: string) => snapshot.users.find((user) => user.id === id)?.short ?? "sem responsável";
  return { snapshot, visible, ownerName };
}

export function str(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
