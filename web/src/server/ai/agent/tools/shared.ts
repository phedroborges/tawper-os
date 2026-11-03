import "server-only";

import { visibleCompanies, type Data } from "@/lib/selectors";
import type { Activity, User } from "@/lib/types";
import { loadCrmSnapshot } from "@/server/crm";
import { fmtWhen } from "../dates";

type Snapshot = Awaited<ReturnType<typeof loadCrmSnapshot>>;

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

/** Empresa pelo id que veio de buscar_cliente, desde que o usuário possa mexer nela. */
export function companyInScope(id: unknown, snapshot: Pick<Snapshot, "companies">, visible: Set<string>) {
  const company = isUuid(id) ? snapshot.companies.find((item) => item.id === id) : undefined;
  if (!company) return { erro: "empresa_id inválido. Chame buscar_cliente e use o id que ele devolver." } as const;
  if (!visible.has(company.id)) return { erro: `${company.nome} não está na sua carteira.` } as const;
  return { company } as const;
}

export function pendingTasks(snapshot: Pick<Snapshot, "activities">, companyId: string) {
  return snapshot.activities.filter((item) => item.companyId === companyId && item.status === "pendente").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function taskBrief(task: Activity) {
  return { id: task.id, tipo: task.tipo, titulo: task.titulo, prazo: fmtWhen(task.dueAt), atrasada: new Date(task.dueAt).getTime() < Date.now() };
}
