import "server-only";

import { visibleCompanies, type Data } from "@/lib/selectors";
import type { Activity, Contact, User } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { loadCrmSnapshot } from "@/server/crm";
import { fmtWhen } from "../dates";
import type { AgentContext } from "../types";

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

const SIM = /^(sim|s|pode|pode sim|isso|quero|ok|okay|beleza|blz|manda|manda ver|faz|faca|confirmo|claro|com certeza|bora|exato|isso mesmo)\b/;

/**
 * Trava para o que o modelo não pode fazer por conta própria (cadastrar, tirar da agenda, excluir):
 * vale se o usuário disse com essas palavras, agora ou nas últimas mensagens, ou respondeu "sim" a uma pergunta sobre isso.
 * O padrão é aplicado ao texto sem acento e em minúsculas.
 */
export function userAsked(ctx: Pick<AgentContext, "question" | "history">, pattern: RegExp) {
  const users = ctx.history.filter((turn) => turn.role === "user").slice(-3).map((turn) => normalize(turn.content));
  const question = normalize(ctx.question);
  if ([question, ...users].some((text) => pattern.test(text))) return true;
  const lastAssistant = ctx.history.filter((turn) => turn.role === "assistant").at(-1)?.content ?? "";
  return pattern.test(normalize(lastAssistant.split("[interno")[0])) && SIM.test(question.replace(/[^a-z ]/g, "").trim());
}

/**
 * A tarefa cita um contato da empresa ("Ligar para o Marcelo…") que o usuário não mencionou: falar com o Pedro
 * não conclui a tarefa do Marcelo. Devolve o nome citado, para o erro dizer ao modelo o que perguntar.
 */
export function otherContactInTask(task: Activity, contacts: Contact[], ctx: Pick<AgentContext, "question" | "history">) {
  const said = [ctx.question, ...ctx.history.filter((turn) => turn.role === "user").slice(-3).map((turn) => turn.content)].map(normalize).join(" ");
  const title = normalize(task.titulo);
  for (const contact of contacts.filter((item) => item.companyId === task.companyId)) {
    const first = normalize(contact.nome).split(" ")[0];
    if (first.length >= 3 && new RegExp(`\\b${first}\\b`).test(title) && !new RegExp(`\\b${first}\\b`).test(said)) return contact.nome;
  }
  return undefined;
}

/** Próximo passo igual a uma tarefa que já está pendente não é passo novo: é duplicata. */
export function duplicatesPending(titulo: string, pending: Activity[]) {
  const wanted = normalize(titulo);
  return pending.some((task) => normalize(task.titulo) === wanted);
}

export function pendingTasks(snapshot: Pick<Snapshot, "activities">, companyId: string) {
  return snapshot.activities.filter((item) => item.companyId === companyId && item.status === "pendente").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function taskBrief(task: Activity) {
  return { id: task.id, tipo: task.tipo, titulo: task.titulo, prazo: fmtWhen(task.dueAt), atrasada: new Date(task.dueAt).getTime() < Date.now() };
}
