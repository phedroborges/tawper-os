import { ACTIVITY_TYPES } from "@/lib/constants";
import type { Activity, ActivityType, Company, Deal } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { runCommand } from "@/server/commands";
import { invalidateCrmReadCache } from "@/server/crm";
import { addActivityRecord } from "@/server/persist";
import { dueFrom, fmtWhen, isPastDay, pastDayError } from "../dates";
import type { AgentTool } from "../types";
import { companyInScope, isUuid, loadScope, str } from "./shared";

type Base = { companies: Company[]; deals: Deal[]; activities: Activity[] };

const quando = {
  data: { type: "string", description: "AAAA-MM-DD, já convertida a partir de hoje (amanhã, sexta, dia 22…)." },
  hora: { type: "string", description: "HH:MM, se o usuário disse. Sem hora: 09:00." },
};

export function planTarefa(args: Record<string, unknown>, base: Base, visible: Set<string>, now = new Date()) {
  const found = companyInScope(args.empresa_id, base, visible);
  if ("erro" in found) return { ok: false as const, erro: found.erro };
  const titulo = str(args.titulo, 160);
  if (!titulo) return { ok: false as const, faltando: ["titulo"] };
  const due = dueFrom(args.data, args.hora);
  if ("erro" in due) return { ok: false as const, erro: due.erro };
  if (isPastDay(due.iso, now)) return { ok: false as const, erro: pastDayError(due.iso, now) };
  const raw = normalize(str(args.tipo, 30));
  const tipo = (ACTIVITY_TYPES.find((item) => normalize(item) === raw) ?? "Ligação") as ActivityType;
  const deal = base.deals.find((item) => item.companyId === found.company.id && item.status === "aberta");
  return { ok: true as const, company: found.company, dealId: deal?.id, tipo, titulo, dueAt: due.iso, descricao: str(args.descricao, 500) || undefined };
}

export const criarTarefa: AgentTool = {
  name: "criar_tarefa",
  description: "Agenda uma tarefa futura para um cliente: lembrete, ligação, visita, envio de orçamento. Use quando o usuário pede para lembrar ou marcar algo que ainda vai fazer. Para algo que ele já fez, use registrar_atividade.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      empresa_id: { type: "string", description: "id que veio de buscar_cliente." },
      tipo: { type: "string", enum: ACTIVITY_TYPES },
      titulo: { type: "string", description: "Ex.: Ligar para o João e ver se recebeu o orçamento." },
      descricao: { type: "string", description: "Opcional. Detalhes que o usuário deu." },
      ...quando,
    },
    required: ["empresa_id", "tipo", "titulo", "data"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planTarefa(args, snapshot, visible);
    if (!plan.ok) return { data: plan };
    const id = await addActivityRecord(
      { companyId: plan.company.id, dealId: plan.dealId, tipo: plan.tipo, titulo: plan.titulo, descricao: plan.descricao, dueAt: plan.dueAt, ownerId: plan.company.ownerId, origem: "ia" },
      { actorId: ctx.actor.id, actorType: "ai", requestId: ctx.requestId ? `${ctx.requestId}:tarefa:${plan.titulo}:${plan.dueAt}` : undefined },
    );
    invalidateCrmReadCache();
    const when = fmtWhen(plan.dueAt);
    return {
      wrote: true,
      empresaId: plan.company.id,
      recibo: `📅 Agendado na ${plan.company.nome}: ${plan.titulo} (${plan.tipo}), ${when}.`,
      memo: `${plan.company.nome} empresa_id=${plan.company.id}: criada tarefa_id=${id ?? "?"} "${plan.titulo}" ${when}`,
      data: { ok: true, tarefa: { id, titulo: plan.titulo, tipo: plan.tipo, quando: when }, empresa: plan.company.nome },
    };
  },
};

export function planReagendar(args: Record<string, unknown>, base: Base, visible: Set<string>, now = new Date()) {
  const task = isUuid(args.tarefa_id) ? base.activities.find((item) => item.id === args.tarefa_id) : undefined;
  if (!task) return { ok: false as const, erro: "tarefa_id inválido. Use o id de tarefas_pendentes do buscar_cliente." };
  if (!visible.has(task.companyId)) return { ok: false as const, erro: "Essa tarefa não está na sua carteira." };
  if (task.status !== "pendente") return { ok: false as const, erro: `A tarefa "${task.titulo}" já não está pendente.` };
  const due = dueFrom(args.data, args.hora);
  if ("erro" in due) return { ok: false as const, erro: due.erro };
  if (isPastDay(due.iso, now)) return { ok: false as const, erro: pastDayError(due.iso, now) };
  const company = base.companies.find((item) => item.id === task.companyId);
  return { ok: true as const, task, company, dueAt: due.iso };
}

export const reagendarTarefa: AgentTool = {
  name: "reagendar_tarefa",
  description: "Muda a data (e hora) de uma tarefa pendente. Use quando o usuário pede para adiar, antecipar ou passar uma tarefa para outro dia.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      tarefa_id: { type: "string", description: "id de tarefas_pendentes do buscar_cliente." },
      ...quando,
    },
    required: ["tarefa_id", "data"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planReagendar(args, snapshot, visible);
    if (!plan.ok) return { data: plan };
    await runCommand({ command: "reschedule", activityId: plan.task.id, dueAt: plan.dueAt, actorId: ctx.actor.id });
    invalidateCrmReadCache();
    const when = fmtWhen(plan.dueAt);
    const empresa = plan.company?.nome ?? "cliente";
    return {
      wrote: true,
      empresaId: plan.task.companyId,
      recibo: `📅 Reagendado na ${empresa}: ${plan.task.titulo}, de ${fmtWhen(plan.task.dueAt)} para ${when}.`,
      memo: `${empresa}: tarefa_id=${plan.task.id} "${plan.task.titulo}" reagendada para ${when}`,
      data: { ok: true, tarefa: plan.task.titulo, de: fmtWhen(plan.task.dueAt), para: when },
    };
  },
};
