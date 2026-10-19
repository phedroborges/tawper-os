import "server-only";

import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { ActivityType, Company, Contact, Prioridade } from "@/lib/types";
import { addActivityRecord, addContactRecord, ensureOperators, updateCompanyRecord } from "@/server/persist";

/** Os comandos de negócio rodam no banco (funções crm_*): cada um é uma transação só. */

const ACTIVITY_TO_DB: Record<string, string> = {
  Ligação: "call", WhatsApp: "whatsapp", "E-mail": "email", Visita: "visit", Reunião: "meeting", Cotação: "quote", Homologação: "homologation", Cadastro: "registration", Suporte: "support", Outro: "other",
};
const PRIORITY_TO_DB: Record<string, string> = { Alta: "high", Média: "medium", Baixa: "low" };
const CHANNEL_TO_DB: Record<string, string> = { WhatsApp: "whatsapp", Ligação: "phone", "E-mail": "email", Visita: "visit", Reunião: "meeting", Nota: "note", Sistema: "system", IA: "ai" };
const KIND_TO_DB: Record<string, string> = {
  create: "create", stage: "stage", win: "win", loss: "loss", standby: "standby", quote: "quote", task: "task", note: "note", ai: "ai", contact: "contact", merge: "merge", import: "import", cobranca: "nudge", strategy: "strategy",
};

/** Os ids dos critérios no app (camelCase) viram chaves snake_case no banco. */
export const criterionKey = (id: string) => id.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

function isUuid(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function friendly(error: { message: string; code?: string }): string {
  switch (error.code) {
    case "23505":
      return /opportunities_one_open/.test(error.message) ? "Esta empresa já tem um negócio aberto neste funil." : "Esse registro já existe.";
    case "23503":
      return "O registro depende de outro que não existe mais. Atualize a página e tente de novo.";
    case "23514":
      return `Dado inválido: ${error.message}`;
    case "42501":
      return "O servidor não tem permissão para fazer isso no banco.";
    case "PGRST202":
      return "O banco ainda não tem os comandos desta versão. Aplique as migrations 0019 e 0020.";
    default:
      return error.message;
  }
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await getSupabaseAdmin().rpc(name, args);
  if (res.error) throw new Error(friendly(res.error));
  return res.data as T;
}

/** Quem está agindo: precisa ser um usuário real do banco. */
async function actorOf(actorId: unknown): Promise<string> {
  const actors = await ensureOperators();
  if (typeof actorId === "string") {
    if (actors[actorId]) return actors[actorId];
    if (isUuid(actorId)) return actorId;
  }
  throw new Error("Escolha seu perfil no topo da tela antes de continuar.");
}

async function profileOf(id: unknown, what: string): Promise<string> {
  const actors = await ensureOperators();
  if (typeof id === "string") {
    if (actors[id]) return actors[id];
    if (isUuid(id)) return id;
  }
  throw new Error(`Escolha ${what}.`);
}

function need(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function checksToDb(checks: Record<string, boolean> | undefined) {
  return Object.fromEntries(Object.entries(checks ?? {}).map(([k, v]) => [criterionKey(k), Boolean(v)]));
}

type TaskIn = { titulo: string; tipo: ActivityType; dueAt: string; prioridade?: Prioridade; descricao?: string };
const tasksToDb = (tasks: TaskIn[] | undefined) =>
  (tasks ?? []).map((t) => ({ title: t.titulo, type: ACTIVITY_TO_DB[t.tipo] ?? "other", dueAt: t.dueAt, priority: PRIORITY_TO_DB[t.prioridade ?? "Média"] ?? "medium", description: t.descricao ?? "" }));

export type Command =
  | { command: "moveStage"; dealId: string; toStageId: string; actorId: string; checks?: Record<string, boolean>; tarefas?: TaskIn[]; nota?: string; origem?: "ia" | "usuario"; companyPatch?: Partial<Company>; newContact?: Omit<Contact, "id"> }
  | { command: "setChecks"; dealId: string; checks: Record<string, boolean>; actorId: string; origem?: "ia" | "usuario" }
  | { command: "winDeal"; dealId: string; valor: number; obs?: string; actorId: string }
  | { command: "loseDeal"; dealId: string; motivo: string; obs?: string; actorId: string }
  | { command: "setStandby"; companyId: string; motivo: string; condicao: string; reavaliacao: string; responsavelId: string; actorId: string }
  | { command: "resumeStandby"; companyId: string; actorId: string }
  | { command: "reschedule"; activityId: string; dueAt: string; actorId: string }
  | { command: "saveStrategy"; companyId: string; data: { objetivo: string; diagnostico?: string; barreira?: string; estrategia: string; resultadoEsperado?: string; proximaRevisao?: string }; origem?: "manual" | "ia-aprovada"; actorId: string }
  | { command: "addInteraction"; companyId: string; dealId?: string; canal: string; kind: string; titulo: string; conteudo?: string; autorId: string }
  | { command: "mergeCompany"; existingId: string; company: Partial<Company>; contacts: Omit<Contact, "id" | "companyId">[]; firstActivity: { tipo: ActivityType; titulo: string; dueAt: string; prioridade?: Prioridade; descricao?: string; ownerId?: string }; actorId: string };

export async function runCommand(cmd: Command): Promise<unknown> {
  switch (cmd.command) {
    case "moveStage": {
      const actor = await actorOf(cmd.actorId);
      need(isUuid(cmd.dealId), "Este negócio ainda não está no banco.");
      const deal = await getSupabaseAdmin().from("opportunities").select("company_id").eq("id", cmd.dealId).maybeSingle();
      if (deal.error) throw new Error(deal.error.message);
      need(deal.data, "Negócio não encontrado.");
      // Dados informados na própria janela (campos da empresa, contato) entram antes, para os critérios enxergarem.
      if (cmd.companyPatch && Object.keys(cmd.companyPatch).length) await updateCompanyRecord(deal.data.company_id as string, cmd.companyPatch, actor);
      if (cmd.newContact?.nome) await addContactRecord({ ...cmd.newContact, companyId: deal.data.company_id as string }, cmd.actorId);
      return rpc("crm_move_stage", {
        p_opportunity: cmd.dealId, p_to_stage: cmd.toStageId, p_actor: actor, p_checks: checksToDb(cmd.checks), p_tasks: tasksToDb(cmd.tarefas),
        p_note: cmd.nota ?? null, p_origin: cmd.origem === "ia" ? "ai" : "user",
      });
    }
    case "setChecks": {
      need(isUuid(cmd.dealId), "Este negócio ainda não está no banco.");
      return rpc("crm_set_checks", { p_opportunity: cmd.dealId, p_checks: checksToDb(cmd.checks), p_actor: await actorOf(cmd.actorId), p_origin: cmd.origem === "ia" ? "ai" : "user" });
    }
    case "winDeal": {
      need(isUuid(cmd.dealId), "Este negócio ainda não está no banco.");
      return rpc("crm_win_deal", { p_opportunity: cmd.dealId, p_value: cmd.valor, p_note: cmd.obs ?? null, p_actor: await actorOf(cmd.actorId) });
    }
    case "loseDeal": {
      need(isUuid(cmd.dealId), "Este negócio ainda não está no banco.");
      return rpc("crm_lose_deal", { p_opportunity: cmd.dealId, p_reason: cmd.motivo, p_note: cmd.obs ?? null, p_actor: await actorOf(cmd.actorId) });
    }
    case "setStandby": {
      need(isUuid(cmd.companyId), "Esta empresa ainda não está no banco.");
      return rpc("crm_set_standby", {
        p_company: cmd.companyId, p_reason: cmd.motivo, p_condition: cmd.condicao, p_responsible: await profileOf(cmd.responsavelId, "o responsável pela reavaliação"),
        p_review_at: cmd.reavaliacao, p_actor: await actorOf(cmd.actorId),
      });
    }
    case "resumeStandby": {
      need(isUuid(cmd.companyId), "Esta empresa ainda não está no banco.");
      return rpc("crm_resume_standby", { p_company: cmd.companyId, p_actor: await actorOf(cmd.actorId) });
    }
    case "reschedule": {
      need(isUuid(cmd.activityId), "Esta atividade ainda não está no banco.");
      return rpc("crm_reschedule_activity", { p_activity: cmd.activityId, p_due: cmd.dueAt, p_actor: await actorOf(cmd.actorId) });
    }
    case "saveStrategy": {
      need(isUuid(cmd.companyId), "Esta empresa ainda não está no banco.");
      const d = cmd.data;
      return rpc("crm_save_strategy", {
        p_company: cmd.companyId, p_objective: d.objetivo, p_diagnosis: d.diagnostico ?? null, p_barrier: d.barreira ?? null, p_strategy: d.estrategia,
        p_expected: d.resultadoEsperado ?? null, p_origin: cmd.origem === "ia-aprovada" ? "ai_approved" : "manual", p_next_review: d.proximaRevisao || null, p_actor: await actorOf(cmd.actorId),
      });
    }
    case "addInteraction": {
      need(isUuid(cmd.companyId), "Esta empresa ainda não está no banco.");
      const fromAi = cmd.autorId === "ia";
      return rpc("crm_add_interaction", {
        p_company: cmd.companyId, p_opportunity: isUuid(cmd.dealId) ? cmd.dealId : null, p_channel: CHANNEL_TO_DB[cmd.canal] ?? "note", p_kind: KIND_TO_DB[cmd.kind] ?? "note",
        p_title: cmd.titulo, p_content: cmd.conteudo ?? null, p_actor: fromAi ? null : await actorOf(cmd.autorId), p_origin: fromAi ? "ai" : "user",
      });
    }
    case "mergeCompany":
      return mergeCompany(cmd);
  }
}

/**
 * Une um cadastro novo a uma empresa que já existe: atualiza os dados, acrescenta os contatos,
 * reinicia o negócio aberto (ou abre um) e cria o primeiro próximo passo. Cada passo é gravado e
 * confirmado em ordem; o próximo passo vem por último, então a conta nunca fica "unida" sem ele.
 */
async function mergeCompany(cmd: Extract<Command, { command: "mergeCompany" }>) {
  need(isUuid(cmd.existingId), "Esta empresa ainda não está no banco.");
  const sb = getSupabaseAdmin();
  const actor = await actorOf(cmd.actorId);
  const existing = await sb.from("companies").select("id, trade_name, code, owner_id, status").eq("id", cmd.existingId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  need(existing.data, "Empresa não encontrada.");

  const patch = { ...cmd.company };
  delete patch.id;
  delete patch.status;
  await updateCompanyRecord(cmd.existingId, patch, actor);
  if (existing.data.status === "lost") {
    const up = await sb.from("companies").update({ status: "active", loss_reason: null }).eq("id", cmd.existingId);
    if (up.error) throw new Error(friendly(up.error));
  }
  for (const c of cmd.contacts) {
    if (c.nome?.trim()) await addContactRecord({ ...c, companyId: cmd.existingId }, cmd.actorId);
  }

  const open = await sb.from("opportunities").select("id, owner_id").eq("company_id", cmd.existingId).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (open.error) throw new Error(open.error.message);
  const ownerId = (existing.data.owner_id as string) ?? actor;
  let dealId = open.data?.id as string | undefined;
  if (dealId) {
    const up = await sb.from("opportunities").update({ owner_id: ownerId, title: `Prospecção — ${patch.nome ?? existing.data.trade_name}`, stage_entered_at: new Date().toISOString() }).eq("id", dealId);
    if (up.error) throw new Error(friendly(up.error));
  } else {
    const funnel = await sb.from("funnels").select("id").eq("organization_id", TAWPER_ORG_ID).eq("key", "aquisicao").single();
    const stage = funnel.data ? await sb.from("stages").select("id, probability").eq("funnel_id", funnel.data.id).eq("key", "lead").single() : null;
    need(funnel.data && stage?.data, "Funil de aquisição não encontrado.");
    const ins = await sb
      .from("opportunities")
      .insert({ organization_id: TAWPER_ORG_ID, company_id: cmd.existingId, owner_id: ownerId, funnel_id: funnel.data.id, stage_id: stage.data.id, title: `Prospecção — ${patch.nome ?? existing.data.trade_name}`, status: "open", probability: stage.data.probability, created_by: actor })
      .select("id")
      .single();
    if (ins.error || !ins.data) throw new Error(ins.error ? friendly(ins.error) : "Falha ao abrir o negócio.");
    dealId = ins.data.id as string;
  }

  await rpc("crm_add_interaction", {
    p_company: cmd.existingId, p_opportunity: dealId, p_channel: "system", p_kind: "merge",
    p_title: `Registros unidos: novo cadastro incorporado ao ${existing.data.code}`,
    p_content: `O cadastro "${existing.data.trade_name}" foi atualizado com os dados novos. Histórico, contatos e vínculos foram preservados.`, p_actor: actor, p_origin: "user",
  });
  const activityId = await addActivityRecord({ ...cmd.firstActivity, companyId: cmd.existingId, dealId, ownerId: cmd.firstActivity.ownerId ?? ownerId });
  return { companyId: cmd.existingId, dealId, activityId };
}
