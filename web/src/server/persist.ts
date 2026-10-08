import "server-only";

import postgres from "postgres";
import { USERS } from "@/lib/constants";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { Activity, ActivityType, Company, Contact, Deal, Papel, Prensa, Prioridade, Urgencia } from "@/lib/types";

const PRESS_TO_DB: Record<string, string> = {
  Própria: "own",
  "Comodato Tawper": "tawper_loan",
  "Comodato concorrente": "competitor_loan",
  "Não possui": "none",
};

const LEVEL_TO_DB: Record<string, string> = { Alta: "high", Média: "medium", Baixa: "low", Alto: "high", Médio: "medium", Baixo: "low" };

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

const CHANNEL_TO_DB: Record<string, string> = {
  WhatsApp: "whatsapp",
  Ligação: "phone",
  "E-mail": "email",
  Presencial: "in_person",
};

let operatorCache: Record<string, string> | null = null;

export async function ensureOperators(): Promise<Record<string, string>> {
  if (operatorCache) return operatorCache;
  const sb = getSupabaseAdmin();
  const map: Record<string, string> = {};

  for (const user of USERS) {
    const email = `${user.id.replace("u-", "")}@usuarios.tawper.local`;
    const existing = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
    let id = existing.data?.id as string | undefined;

    if (!id) {
      const created = await sb.auth.admin.createUser({
        email,
        password: `Tawper#2026.${user.short}`,
        email_confirm: true,
        user_metadata: { full_name: user.name, short_name: user.short },
      });
      if (created.error || !created.data.user) {
        const again = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
        id = again.data?.id as string | undefined;
        if (!id) throw new Error(created.error?.message ?? "Não foi possível criar o usuário operador.");
      } else {
        id = created.data.user.id;
      }
    }

    await sb.from("profiles").update({
      full_name: user.name,
      short_name: user.short,
      title: user.title,
      avatar_color: user.color,
    }).eq("id", id);

    await sb.from("memberships").upsert(
      { organization_id: TAWPER_ORG_ID, profile_id: id, role: user.role, is_active: true },
      { onConflict: "organization_id,profile_id" },
    );

    map[user.id] = id;
    map[id] = id;
  }

  operatorCache = map;
  return map;
}

export async function resolveOwner(ownerId: string | undefined, actors: Record<string, string>): Promise<string> {
  if (ownerId && actors[ownerId]) return actors[ownerId];
  if (ownerId && /^[0-9a-f-]{36}$/i.test(ownerId)) return ownerId;
  return actors["u-murilo"];
}

function e164(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return null;
}

function cnpj(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

async function regionId(name?: string | null): Promise<string | null> {
  if (!name) return null;
  const sb = getSupabaseAdmin();
  const row = await sb.from("regions").select("id").eq("organization_id", TAWPER_ORG_ID).eq("name", name).maybeSingle();
  return (row.data?.id as string) ?? null;
}

export async function registerCompany(input: {
  actorId?: string;
  company: Partial<Company> & { nome: string };
  contacts: Omit<Contact, "id" | "companyId">[];
  firstActivity: { tipo: ActivityType; titulo: string; dueAt: string; prioridade?: Prioridade; descricao?: string; ownerId?: string };
}): Promise<{ company: Company; contacts: Contact[]; deal: Deal; activity: Activity }> {
  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const ownerId = await resolveOwner(input.company.ownerId ?? input.actorId, actors);
  const funnel = await sb.from("funnels").select("id").eq("organization_id", TAWPER_ORG_ID).eq("key", "aquisicao").single();
  if (funnel.error || !funnel.data) throw new Error(funnel.error?.message ?? "Funil de aquisição não encontrado.");
  const stage = await sb.from("stages").select("id, probability").eq("funnel_id", funnel.data.id).eq("key", "lead").single();
  if (stage.error || !stage.data) throw new Error(stage.error?.message ?? "Etapa Lead não encontrada.");

  const inserted = await sb
    .from("companies")
    .insert({
      organization_id: TAWPER_ORG_ID,
      trade_name: input.company.nome,
      legal_name: input.company.razaoSocial || input.company.nome,
      cnpj: cnpj(input.company.cnpj),
      status: "active",
      owner_id: ownerId,
      region_id: await regionId(input.company.regiao),
      city: input.company.cidade || null,
      state: input.company.uf || null,
      industry: input.company.ramo || null,
      economic_group: input.company.grupo || null,
      source: input.company.origem || "manual",
      potential: input.company.potencial ? LEVEL_TO_DB[input.company.potencial] : null,
      monthly_potential: input.company.potencialMensal ?? null,
      harvesters_count: input.company.colhedoras ?? null,
      machine_models: input.company.modelos || null,
      press_type: input.company.prensa ? PRESS_TO_DB[input.company.prensa] : null,
      current_brand: input.company.marcaAtual || null,
      competitor: input.company.concorrente || null,
      urgency: LEVEL_TO_DB[input.company.urgencia ?? "Média"] ?? "medium",
      notes: input.company.observacoes || null,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "Falha ao gravar a empresa.");

  const companyId = inserted.data.id as string;
  const contacts: Contact[] = [];
  for (const c of input.contacts) {
    const row = await sb
      .from("contacts")
      .insert({
        organization_id: TAWPER_ORG_ID,
        company_id: companyId,
        name: c.nome,
        job_title: c.cargo || null,
        role: ROLE_TO_DB[c.papel] ?? "other",
        influence: c.influencia ?? 2,
        whatsapp_e164: e164(c.whatsapp),
        email: c.email || null,
        preferred_channel: CHANNEL_TO_DB[c.canal] ?? "whatsapp",
        contact_allowed: c.autorizaContato,
        is_active: c.ativo,
      })
      .select("id")
      .single();
    if (row.error || !row.data) throw new Error(row.error?.message ?? "Falha ao gravar o contato.");
    contacts.push({ ...c, id: row.data.id as string, companyId });
  }

  const dealRow = await sb
    .from("opportunities")
    .insert({
      organization_id: TAWPER_ORG_ID,
      company_id: companyId,
      owner_id: ownerId,
      funnel_id: funnel.data.id,
      stage_id: stage.data.id,
      title: `Prospecção — ${input.company.nome}`,
      status: "open",
      probability: stage.data.probability,
      currency: "BRL",
    })
    .select("id, created_at, stage_entered_at")
    .single();
  if (dealRow.error || !dealRow.data) throw new Error(dealRow.error?.message ?? "Falha ao gravar a oportunidade.");

  const activityOwner = await resolveOwner(input.firstActivity.ownerId ?? input.actorId, actors);
  const actRow = await sb
    .from("activities")
    .insert({
      organization_id: TAWPER_ORG_ID,
      company_id: companyId,
      opportunity_id: dealRow.data.id,
      type: ACTIVITY_TO_DB[input.firstActivity.tipo] ?? "other",
      title: input.firstActivity.titulo,
      description: input.firstActivity.descricao || null,
      owner_id: activityOwner,
      due_at: input.firstActivity.dueAt,
      priority: LEVEL_TO_DB[input.firstActivity.prioridade ?? "Média"] ?? "medium",
      status: "pending",
      origin: "manual",
    })
    .select("id, created_at")
    .single();
  if (actRow.error || !actRow.data) throw new Error(actRow.error?.message ?? "Falha ao gravar o próximo passo.");

  const now = inserted.data.created_at as string;
  const company: Company = {
    id: companyId,
    codigo: inserted.data.code as string,
    nome: input.company.nome,
    razaoSocial: input.company.razaoSocial || input.company.nome,
    cnpj: cnpj(input.company.cnpj) ?? undefined,
    status: "ativa",
    ownerId,
    regiao: input.company.regiao,
    cidade: input.company.cidade,
    uf: input.company.uf,
    ramo: input.company.ramo,
    origem: input.company.origem || "manual",
    urgencia: (input.company.urgencia ?? "Média") as Urgencia,
    colhedoras: input.company.colhedoras,
    prensa: input.company.prensa as Prensa | undefined,
    marcaAtual: input.company.marcaAtual,
    observacoes: input.company.observacoes,
    createdAt: now,
    updatedAt: inserted.data.updated_at as string,
  };

  const deal: Deal = {
    id: dealRow.data.id as string,
    companyId,
    ownerId,
    funnel: "aquisicao",
    stageId: "lead",
    titulo: `Prospecção — ${input.company.nome}`,
    status: "aberta",
    probabilidade: Number(stage.data.probability ?? 5),
    createdAt: dealRow.data.created_at as string,
    stageEnteredAt: dealRow.data.stage_entered_at as string,
    checklist: {},
    history: [{ stageId: "lead", enteredAt: dealRow.data.stage_entered_at as string, byId: ownerId }],
    ciclo: 1,
  };

  const activity: Activity = {
    id: actRow.data.id as string,
    companyId,
    dealId: deal.id,
    tipo: input.firstActivity.tipo,
    titulo: input.firstActivity.titulo,
    descricao: input.firstActivity.descricao,
    ownerId: activityOwner,
    dueAt: input.firstActivity.dueAt,
    prioridade: input.firstActivity.prioridade ?? "Média",
    status: "pendente",
    origem: "manual",
    createdAt: actRow.data.created_at as string,
  };

  return { company, contacts, deal, activity };
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function updateCompanyRecord(id: string, patch: Partial<Company>, actorId?: string) {
  if (!isUuid(id)) return;
  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const row: Record<string, unknown> = {};
  if (patch.nome != null) row.trade_name = patch.nome;
  if (patch.razaoSocial != null) row.legal_name = patch.razaoSocial;
  if (patch.cnpj !== undefined) row.cnpj = cnpj(patch.cnpj);
  if (patch.cidade !== undefined) row.city = patch.cidade || null;
  if (patch.uf !== undefined) row.state = patch.uf || null;
  if (patch.ramo !== undefined) row.industry = patch.ramo || null;
  if (patch.origem != null) row.source = patch.origem;
  if (patch.urgencia) row.urgency = LEVEL_TO_DB[patch.urgencia] ?? "medium";
  if (patch.colhedoras !== undefined) row.harvesters_count = patch.colhedoras;
  if (patch.prensa) row.press_type = PRESS_TO_DB[patch.prensa] ?? null;
  if (patch.marcaAtual !== undefined) row.current_brand = patch.marcaAtual || null;
  if (patch.concorrente !== undefined) row.competitor = patch.concorrente || null;
  if (patch.observacoes !== undefined) row.notes = patch.observacoes || null;
  if (patch.potencial) row.potential = LEVEL_TO_DB[patch.potencial] ?? null;
  if (patch.regiao !== undefined) row.region_id = await regionId(patch.regiao);
  if (patch.ownerId) row.owner_id = await resolveOwner(patch.ownerId, actors);
  if (!Object.keys(row).length) return;
  const upd = await sb.from("companies").update(row).eq("id", id).eq("organization_id", TAWPER_ORG_ID);
  if (upd.error) throw new Error(upd.error.message);
  void actorId;
}

export async function addContactRecord(contact: Omit<Contact, "id">, actorId?: string) {
  if (!isUuid(contact.companyId)) return null;
  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const row = await sb
    .from("contacts")
    .insert({
      organization_id: TAWPER_ORG_ID,
      company_id: contact.companyId,
      name: contact.nome,
      job_title: contact.cargo || null,
      role: ROLE_TO_DB[contact.papel as Papel] ?? "other",
      influence: contact.influencia ?? 2,
      whatsapp_e164: e164(contact.whatsapp),
      email: contact.email || null,
      preferred_channel: CHANNEL_TO_DB[contact.canal] ?? "whatsapp",
      contact_allowed: contact.autorizaContato,
      relationship_owner_id: actorId ? await resolveOwner(actorId, actors) : null,
      is_active: contact.ativo,
    })
    .select("id")
    .single();
  if (row.error || !row.data) throw new Error(row.error?.message ?? "Falha ao gravar o contato.");
  return row.data.id as string;
}

export async function addActivityRecord(activity: {
  companyId: string;
  dealId?: string;
  tipo: ActivityType;
  titulo: string;
  descricao?: string;
  ownerId?: string;
  dueAt: string;
  prioridade?: Prioridade;
  origem?: Activity["origem"];
}) {
  if (!isUuid(activity.companyId)) return null;
  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const origin = activity.origem === "ia" ? "ai" : activity.origem === "regra" ? "rule" : activity.origem === "integracao" ? "integration" : "manual";
  const row = await sb
    .from("activities")
    .insert({
      organization_id: TAWPER_ORG_ID,
      company_id: activity.companyId,
      opportunity_id: activity.dealId && isUuid(activity.dealId) ? activity.dealId : null,
      type: ACTIVITY_TO_DB[activity.tipo] ?? "other",
      title: activity.titulo,
      description: activity.descricao || null,
      owner_id: await resolveOwner(activity.ownerId, actors),
      due_at: activity.dueAt,
      priority: LEVEL_TO_DB[activity.prioridade ?? "Média"] ?? "medium",
      status: "pending",
      origin,
    })
    .select("id")
    .single();
  if (row.error || !row.data) throw new Error(row.error?.message ?? "Falha ao gravar a atividade.");
  return row.data.id as string;
}

export async function deleteCompanyRecord(id: string, actorId: string, reason: string) {
  const motivo = reason.trim();
  if (!isUuid(id)) throw new Error("Esta empresa ainda não está no banco.");
  if (motivo.length < 3) throw new Error("Informe o motivo da exclusão.");

  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const muriloId = actors["u-murilo"];
  const profileId = actors[actorId];
  if (!muriloId || !profileId || profileId !== muriloId) {
    throw new Error("Somente Murilo Louis pode excluir uma empresa.");
  }
  const profile = await sb.from("profiles").select("full_name").eq("id", profileId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (profile.data?.full_name !== "Murilo Louis") throw new Error("Somente Murilo Louis pode excluir uma empresa.");

  const company = await sb.from("companies").select("trade_name").eq("id", id).eq("organization_id", TAWPER_ORG_ID).maybeSingle();
  if (company.error) throw new Error(company.error.message);
  if (!company.data) throw new Error("Empresa não encontrada.");
  const tradeName = company.data.trade_name;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente para exclusão administrativa.");
  const sql = postgres(url, { max: 1, ssl: "require" });
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('app.admin_correction', 'on', true)`;
      await tx`select set_config('app.actor_type', 'user', true)`;
      const deleted = await tx`
        delete from public.companies
        where id = ${id} and organization_id = ${TAWPER_ORG_ID}
        returning id
      `;
      if (!deleted.length) throw new Error("Empresa não encontrada.");
      await tx`
        insert into public.audit_events (
          organization_id, actor_id, actor_type, entity_type, entity_id, company_id, field, old_value, new_value
        ) values (
          ${TAWPER_ORG_ID}, ${profileId}, 'user', 'companies', ${id}, ${id}, 'exclusao_administrativa', ${tradeName}, ${motivo}
        )
      `;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function completeActivityRecord(id: string, resultado: string, next?: { tipo: ActivityType; titulo: string; dueAt: string; prioridade?: Prioridade; ownerId?: string; companyId: string; dealId?: string }) {
  if (!isUuid(id)) return null;
  const sb = getSupabaseAdmin();
  const upd = await sb.from("activities").update({ status: "done", outcome: resultado, completed_at: new Date().toISOString() }).eq("id", id);
  if (upd.error) throw new Error(upd.error.message);
  if (!next) return null;
  return addActivityRecord(next);
}
