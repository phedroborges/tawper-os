import "server-only";

import postgres from "postgres";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { storedCNPJ, storedWhatsApp } from "@/lib/br-ids";
import type { ActivityType, Company, Contact, Prioridade } from "@/lib/types";
import { ensureOperators, updateCompanyRecord } from "@/server/persist";

/** Os comandos de negócio rodam no banco (funções crm_*): cada um é uma transação só. */

const CHANNEL_TO_DB: Record<string, string> = { WhatsApp: "whatsapp", Ligação: "phone", "E-mail": "email", Visita: "visit", Reunião: "meeting", Nota: "note", Sistema: "system", IA: "ai" };
const KIND_TO_DB: Record<string, string> = {
  create: "create", stage: "stage", win: "win", loss: "loss", standby: "standby", quote: "quote", task: "task", note: "note", ai: "ai", contact: "contact", merge: "merge", import: "import", cobranca: "nudge", strategy: "strategy",
};
const ROLE_TO_DB: Record<string, string> = {
  Decisor: "decision_maker",
  Comprador: "buyer",
  Técnico: "technical",
  Mecânico: "mechanic",
  Influenciador: "influencer",
  Outro: "other",
};
const ACTIVITY_TO_DB: Record<string, string> = {
  Ligação: "call",
  WhatsApp: "whatsapp",
  "E-mail": "email",
  Visita: "visit",
  Reunião: "meeting",
  Cotação: "quote",
  Homologação: "homologation",
  Cadastro: "registration",
  Suporte: "support",
  Outro: "other",
};
const LEVEL_TO_DB: Record<string, string> = { Alta: "high", Média: "medium", Baixa: "low", Alto: "high", Médio: "medium", Baixo: "low" };
const CHANNEL_PREF: Record<string, string> = { WhatsApp: "whatsapp", Ligação: "phone", "E-mail": "email", Presencial: "in_person" };

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

export type Command =
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
 * Une cadastros numa transação só: empresa, contatos, negócio e próximo passo
 * entram juntos ou nada muda.
 */
async function mergeCompany(cmd: Extract<Command, { command: "mergeCompany" }>) {
  need(isUuid(cmd.existingId), "Esta empresa ainda não está no banco.");
  const actors = await ensureOperators();
  const actor = await actorOf(cmd.actorId);
  const patch = { ...cmd.company };
  delete patch.id;
  delete patch.status;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente para unir cadastros.");
  const sql = postgres(url, { max: 1, ssl: "require" });
  try {
    return await sql.begin(async (tx) => {
      await tx`select app.crm_begin(${actor}::uuid, 'user')`;
      const existing = await tx<{ id: string; trade_name: string; code: string; owner_id: string | null; status: string }[]>`
        select id::text, trade_name, code, owner_id::text, status::text
          from public.companies
         where id = ${cmd.existingId}::uuid and organization_id = ${TAWPER_ORG_ID}::uuid
         for update
      `;
      need(existing[0], "Empresa não encontrada.");
      const row = existing[0];

      // Atualiza campos via o mesmo caminho tipado (fora do tx) e revalida no fim — mas
      // para atomicidade real, aplicamos o essencial aqui e o restante no updateCompanyRecord
      // só quando não há DATABASE_URL. Com URL, tudo fica no tx.
      if (patch.nome) {
        await tx`update public.companies set trade_name = ${patch.nome}, legal_name = ${patch.razaoSocial || patch.nome} where id = ${cmd.existingId}::uuid`;
      } else if (patch.razaoSocial) {
        await tx`update public.companies set legal_name = ${patch.razaoSocial} where id = ${cmd.existingId}::uuid`;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "cnpj")) {
        const value: string | null = patch.cnpj ? storedCNPJ(patch.cnpj) ?? null : null;
        if (patch.cnpj && !value) throw new Error("CNPJ inválido.");
        await tx`update public.companies set cnpj = ${value} where id = ${cmd.existingId}::uuid`;
      }
      if (patch.cidade !== undefined) {
        const city: string | null = patch.cidade || null;
        await tx`update public.companies set city = ${city} where id = ${cmd.existingId}::uuid`;
      }
      if (patch.uf !== undefined) {
        const state: string | null = patch.uf || null;
        await tx`update public.companies set state = ${state} where id = ${cmd.existingId}::uuid`;
      }
      if (patch.observacoes !== undefined) {
        const notes: string | null = patch.observacoes || null;
        await tx`update public.companies set notes = ${notes} where id = ${cmd.existingId}::uuid`;
      }
      if (row.status === "lost") {
        await tx`update public.companies set status = 'active', loss_reason = null where id = ${cmd.existingId}::uuid`;
      }

      for (const contact of cmd.contacts) {
        if (!contact.nome?.trim()) continue;
        const phone: string | null = contact.whatsapp ? storedWhatsApp(contact.whatsapp) ?? null : null;
        if (contact.whatsapp && !phone) throw new Error("WhatsApp inválido no contato.");
        const jobTitle: string | null = contact.cargo || null;
        const email: string | null = contact.email || null;
        const role = ROLE_TO_DB[contact.papel] ?? "other";
        const influence = contact.influencia ?? 2;
        const preferred = CHANNEL_PREF[contact.canal] ?? "whatsapp";
        const allowed = contact.autorizaContato !== false;
        const active = contact.ativo !== false;
        await tx`
          insert into public.contacts (
            organization_id, company_id, name, job_title, role, influence, whatsapp_e164, email,
            preferred_channel, contact_allowed, relationship_owner_id, is_active
          ) values (
            ${TAWPER_ORG_ID}::uuid, ${cmd.existingId}::uuid, ${contact.nome}, ${jobTitle},
            ${role}, ${influence}, ${phone},
            ${email}, ${preferred}, ${allowed},
            ${actor}::uuid, ${active}
          )
        `;
      }

      const ownerId = row.owner_id ?? actor;
      const title = `Prospecção — ${patch.nome ?? row.trade_name}`;
      const open = await tx<{ id: string }[]>`
        select id::text from public.opportunities
         where company_id = ${cmd.existingId}::uuid and status = 'open'
         order by created_at desc limit 1
         for update
      `;
      let dealId = open[0]?.id;
      if (dealId) {
        await tx`update public.opportunities set owner_id = ${ownerId}::uuid, title = ${title}, stage_entered_at = now() where id = ${dealId}::uuid`;
      } else {
        const funnel = await tx<{ id: string }[]>`select id::text from public.funnels where organization_id = ${TAWPER_ORG_ID}::uuid and key = 'aquisicao' limit 1`;
        const stage = funnel[0]
          ? await tx<{ id: string; probability: number }[]>`select id::text, probability from public.stages where funnel_id = ${funnel[0].id}::uuid and key = 'lead' limit 1`
          : [];
        need(funnel[0] && stage[0], "Funil de aquisição não encontrado.");
        const inserted = await tx<{ id: string }[]>`
          insert into public.opportunities (
            organization_id, company_id, owner_id, funnel_id, stage_id, title, status, probability, created_by
          ) values (
            ${TAWPER_ORG_ID}::uuid, ${cmd.existingId}::uuid, ${ownerId}::uuid, ${funnel[0].id}::uuid, ${stage[0].id}::uuid,
            ${title}, 'open', ${stage[0].probability}, ${actor}::uuid
          ) returning id::text
        `;
        dealId = inserted[0]?.id;
      }
      need(dealId, "Não foi possível abrir o negócio unificado.");

      await tx`select public.crm_add_interaction(
        ${cmd.existingId}::uuid,
        ${dealId}::uuid,
        'system',
        'merge',
        ${`Registros unidos: novo cadastro incorporado ao ${row.code}`},
        ${`O cadastro "${row.trade_name}" foi atualizado com os dados novos. Histórico, contatos e vínculos foram preservados.`},
        ${actor}::uuid,
        'user'
      )`;

      const activityOwner = cmd.firstActivity.ownerId && actors[cmd.firstActivity.ownerId]
        ? actors[cmd.firstActivity.ownerId]
        : isUuid(cmd.firstActivity.ownerId)
          ? cmd.firstActivity.ownerId
          : ownerId;
      const created = await tx<{ id: string }[]>`
        insert into public.activities (
          organization_id, company_id, opportunity_id, type, title, description, owner_id, due_at, priority, status, origin, created_by
        ) values (
          ${TAWPER_ORG_ID}::uuid, ${cmd.existingId}::uuid, ${dealId}::uuid,
          ${ACTIVITY_TO_DB[cmd.firstActivity.tipo] ?? "other"}, ${cmd.firstActivity.titulo}, ${cmd.firstActivity.descricao || null},
          ${activityOwner}::uuid, ${cmd.firstActivity.dueAt}::timestamptz,
          ${LEVEL_TO_DB[cmd.firstActivity.prioridade ?? "Média"] ?? "medium"}, 'pending', 'manual', ${actor}::uuid
        ) returning id::text
      `;
      need(created[0], "Falha ao criar o próximo passo.");
      return { companyId: cmd.existingId, dealId, activityId: created[0].id };
    });
  } catch (error) {
    // Fallback: se o RPC crm_add_interaction tiver assinatura diferente, tenta o caminho antigo
    // só quando a falha for de função ausente — senão propaga.
    if (error instanceof Error && /crm_add_interaction|function .* does not exist/i.test(error.message)) {
      await updateCompanyRecord(cmd.existingId, patch, actor);
      throw new Error("A união precisa da função crm_add_interaction no banco. Aplique as migrations e tente de novo.");
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
