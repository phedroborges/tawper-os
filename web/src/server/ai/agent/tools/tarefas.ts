import { ACTIVITY_TYPES } from "@/lib/constants";
import type { Activity, ActivityType, Company, Contact, Deal } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { runCommand } from "@/server/commands";
import { invalidateCrmReadCache } from "@/server/crm";
import { addActivityRecord, completeActivityRecord } from "@/server/persist";
import { dueFrom, fmtWhen, isPastDay, pastDayError } from "../dates";
import type { AgentContext, AgentTool } from "../types";
import { cancelActivityRow, type UndoOp } from "../undo";
import { companyInScope, duplicatesPending, isUuid, loadScope, otherContactInTask, str, userAsked } from "./shared";

const PEDIU_TIRAR = /cancel|desmarc|\b(tira|tirar|tire|remove|remover|apaga|apagar|exclui|excluir)\b|nao vai (ter|rolar|mais|acontecer)|nao precisa mais|desisti/;

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
      desfazer: id ? { ops: [{ op: "cancelar_tarefa", id }], resumo: `tarefa "${plan.titulo}"` } : undefined,
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
      desfazer: { ops: [{ op: "prazo_tarefa", id: plan.task.id, dueAt: plan.task.dueAt }], resumo: `reagendamento de "${plan.task.titulo}"` },
      data: { ok: true, tarefa: plan.task.titulo, de: fmtWhen(plan.task.dueAt), para: when },
    };
  },
};

const proximoPasso = {
  type: "object",
  description: "O que vem depois, se o usuário disse. Obrigatório quando era a última tarefa pendente do cliente.",
  properties: {
    tipo: { type: "string", enum: ACTIVITY_TYPES },
    titulo: { type: "string" },
    ...quando,
  },
  required: ["tipo", "titulo", "data"],
  additionalProperties: false,
};

/**
 * Concluir ou tirar uma tarefa. Toda empresa precisa de um próximo passo: se era a última pendente
 * e o usuário não disse o que vem depois, pergunta antes de gravar.
 */
export function planFechar(
  args: Record<string, unknown>,
  base: Base & { contacts?: Contact[] },
  visible: Set<string>,
  /** Só para concluir: o que o usuário disse, para não concluir a tarefa de um contato que ele nem citou. */
  said?: Pick<AgentContext, "question" | "history">,
  now = new Date(),
) {
  const task = isUuid(args.tarefa_id) ? base.activities.find((item) => item.id === args.tarefa_id) : undefined;
  if (!task) return { ok: false as const, erro: "tarefa_id inválido. Use o id de tarefas_pendentes do buscar_cliente." };
  if (!visible.has(task.companyId)) return { ok: false as const, erro: "Essa tarefa não está na sua carteira." };
  if (task.status !== "pendente") return { ok: false as const, erro: `A tarefa "${task.titulo}" já não está pendente.` };
  const outro = said ? otherContactInTask(task, base.contacts ?? [], said) : undefined;
  if (outro) return { ok: false as const, erro: `A tarefa "${task.titulo}" é com ${outro}, e o usuário não falou de ${outro.split(" ")[0]}. Não conclua: pergunte se ela foi feita.` };
  const company = base.companies.find((item) => item.id === task.companyId)!;
  let next: { tipo: ActivityType; titulo: string; dueAt: string } | undefined;
  const passo = args.proximo_passo && typeof args.proximo_passo === "object" ? (args.proximo_passo as Record<string, unknown>) : null;
  if (passo) {
    const titulo = str(passo.titulo, 160);
    const due = dueFrom(passo.data, passo.hora);
    if (!titulo) return { ok: false as const, erro: "proximo_passo sem título." };
    if ("erro" in due) return { ok: false as const, erro: `proximo_passo: ${due.erro}` };
    if (isPastDay(due.iso, now)) return { ok: false as const, erro: `proximo_passo: ${pastDayError(due.iso, now)}` };
    const raw = normalize(str(passo.tipo, 30));
    next = { tipo: (ACTIVITY_TYPES.find((item) => normalize(item) === raw) ?? "Ligação") as ActivityType, titulo, dueAt: due.iso };
  }
  const restantes = base.activities.filter((item) => item.companyId === task.companyId && item.status === "pendente" && item.id !== task.id);
  if (next && duplicatesPending(next.titulo, [task, ...restantes])) next = undefined;
  if (!next && !restantes.length && company?.status === "ativa") {
    return {
      ok: false as const,
      faltando: ["proximo_passo"],
      dica: `Era a última tarefa pendente da ${company.nome}, que ficaria sem próximo passo. Sugira um que faça sentido e pergunte se pode ser esse. Nada foi gravado ainda.`,
    };
  }
  const deal = base.deals.find((item) => item.companyId === task.companyId && item.status === "aberta");
  return { ok: true as const, task, company, dealId: deal?.id, next };
}

async function addNext(plan: Extract<ReturnType<typeof planFechar>, { ok: true }>, ctx: Parameters<AgentTool["run"]>[1], suffix: string) {
  if (!plan.next) return null;
  return addActivityRecord(
    { ...plan.next, companyId: plan.company.id, dealId: plan.dealId, ownerId: plan.company.ownerId, origem: "ia" },
    { actorId: ctx.actor.id, actorType: "ai", requestId: ctx.requestId ? `${ctx.requestId}:${suffix}:${plan.task.id}` : undefined },
  );
}

export const concluirTarefa: AgentTool = {
  name: "concluir_tarefa",
  description:
    "Marca como feita uma tarefa pendente, com o resultado. Use quando o usuário diz que fez aquela tarefa. Se ele também contou como foi uma conversa ou visita, prefira registrar_atividade com concluir_tarefa_id.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      tarefa_id: { type: "string", description: "id de tarefas_pendentes do buscar_cliente." },
      resultado: { type: "string", description: "O que aconteceu, em poucas palavras, do que o usuário contou." },
      proximo_passo: proximoPasso,
    },
    required: ["tarefa_id", "resultado"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planFechar(args, snapshot, visible, ctx);
    if (!plan.ok) return { data: plan };
    const resultado = str(args.resultado, 500) || "Feito";
    await completeActivityRecord(plan.task.id, resultado, undefined, { actorId: ctx.actor.id, actorType: "ai", requestId: ctx.requestId ? `${ctx.requestId}:concluir:${plan.task.id}` : undefined });
    const nextId = await addNext(plan, ctx, "depois");
    invalidateCrmReadCache();
    const ops: UndoOp[] = [{ op: "reabrir_tarefa", id: plan.task.id }];
    if (nextId) ops.push({ op: "cancelar_tarefa", id: nextId });
    return {
      wrote: true,
      empresaId: plan.company.id,
      recibo: [
        `✅ Tarefa concluída na ${plan.company.nome}: ${plan.task.titulo}.`,
        plan.next && `📅 Próximo passo: ${plan.next.titulo} (${plan.next.tipo}), ${fmtWhen(plan.next.dueAt)}.`,
      ].filter(Boolean).join("\n"),
      memo: `${plan.company.nome} empresa_id=${plan.company.id}: concluída tarefa_id=${plan.task.id} "${plan.task.titulo}"${nextId ? `; próximo passo tarefa_id=${nextId}` : ""}`,
      desfazer: { ops, resumo: `conclusão de "${plan.task.titulo}"` },
      data: { ok: true, concluida: plan.task.titulo, proximo_passo: plan.next ? { id: nextId, titulo: plan.next.titulo, quando: fmtWhen(plan.next.dueAt) } : undefined },
    };
  },
};

export const cancelarTarefa: AgentTool = {
  name: "cancelar_tarefa",
  description:
    "Tira uma tarefa pendente da agenda sem ela ter sido feita. Só quando o usuário pediu com todas as letras para cancelar, desmarcar ou tirar aquela tarefa. Nunca use por conta própria porque algo que ele contou parece resolver a tarefa: nesse caso, pergunte. Para tarefa que foi feita, use concluir_tarefa.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      tarefa_id: { type: "string", description: "id de tarefas_pendentes do buscar_cliente." },
      motivo: { type: "string", description: "Por que saiu da agenda, do que o usuário disse." },
      proximo_passo: proximoPasso,
    },
    required: ["tarefa_id", "motivo"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    if (!userAsked(ctx, PEDIU_TIRAR)) {
      return { data: { ok: false, erro: "O usuário não pediu para tirar essa tarefa. Não cancele: se o que ele contou parece resolver a tarefa, pergunte se pode concluir." } };
    }
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planFechar(args, snapshot, visible);
    if (!plan.ok) return { data: plan };
    const motivo = str(args.motivo, 300) || "Removida a pedido do usuário";
    await cancelActivityRow(ctx.actor.id, plan.task.id, `Removida: ${motivo}`);
    const nextId = await addNext(plan, ctx, "substitui");
    invalidateCrmReadCache();
    const ops: UndoOp[] = [{ op: "reabrir_tarefa", id: plan.task.id }];
    if (nextId) ops.push({ op: "cancelar_tarefa", id: nextId });
    return {
      wrote: true,
      empresaId: plan.company.id,
      recibo: [
        `🗑️ Tirei da agenda da ${plan.company.nome}: ${plan.task.titulo}.`,
        plan.next && `📅 Próximo passo: ${plan.next.titulo} (${plan.next.tipo}), ${fmtWhen(plan.next.dueAt)}.`,
      ].filter(Boolean).join("\n"),
      memo: `${plan.company.nome} empresa_id=${plan.company.id}: cancelada tarefa_id=${plan.task.id} "${plan.task.titulo}"${nextId ? `; próximo passo tarefa_id=${nextId}` : ""}`,
      desfazer: { ops, resumo: `remoção de "${plan.task.titulo}"` },
      data: { ok: true, removida: plan.task.titulo, proximo_passo: plan.next ? { id: nextId, titulo: plan.next.titulo, quando: fmtWhen(plan.next.dueAt) } : undefined },
    };
  },
};
