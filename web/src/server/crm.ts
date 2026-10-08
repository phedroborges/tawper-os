import "server-only";

import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { Activity, Company, Contact, Deal, DemoData, User } from "@/lib/types";
import { USERS } from "@/lib/constants";

export type DbHealth =
  | { ok: true; organization: string; funnels: number; stages: number; companies: number }
  | { ok: false; reason: "missing_env" | "missing_schema" | "error"; detail: string };

const PRESS: Record<string, Company["prensa"]> = {
  own: "Própria",
  tawper_loan: "Comodato Tawper",
  competitor_loan: "Comodato concorrente",
  none: "Não possui",
};

const STATUS: Record<string, Company["status"]> = {
  active: "ativa",
  standby: "espera",
  lost: "perdida",
  archived: "arquivada",
  merged: "arquivada",
};

const DEAL_STATUS: Record<string, Deal["status"]> = {
  open: "aberta",
  won: "ganha",
  lost: "perdida",
  suspended: "suspensa",
};

const ROLE: Record<string, User["role"]> = {
  admin: "admin",
  gestor: "gestor",
  vendedor: "vendedor",
  representante: "representante",
};

export async function getDbHealth(): Promise<DbHealth> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: "missing_env", detail: "Variáveis do Supabase ausentes." };
  }
  try {
    const sb = getSupabaseAdmin();
    const org = await sb.from("organizations").select("name").eq("id", TAWPER_ORG_ID).maybeSingle();
    if (org.error) {
      if (org.error.code === "PGRST205" || /schema cache|does not exist/i.test(org.error.message)) {
        return { ok: false, reason: "missing_schema", detail: org.error.message };
      }
      return { ok: false, reason: "error", detail: org.error.message };
    }
    if (!org.data) return { ok: false, reason: "missing_schema", detail: "Organização semente não encontrada." };
    const [funnels, stages, companies] = await Promise.all([
      sb.from("funnels").select("id", { count: "exact", head: true }).eq("organization_id", TAWPER_ORG_ID),
      sb.from("stages").select("id", { count: "exact", head: true }).eq("organization_id", TAWPER_ORG_ID),
      sb.from("companies").select("id", { count: "exact", head: true }).eq("organization_id", TAWPER_ORG_ID).neq("status", "merged"),
    ]);
    return {
      ok: true,
      organization: org.data.name,
      funnels: funnels.count ?? 0,
      stages: stages.count ?? 0,
      companies: companies.count ?? 0,
    };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function loadCrmSnapshot(): Promise<Pick<DemoData, "companies" | "contacts" | "deals" | "activities" | "users">> {
  const sb = getSupabaseAdmin();
  const [companiesRes, contactsRes, oppsRes, stagesRes, activitiesRes, membershipsRes, profilesRes, regionsRes] = await Promise.all([
    sb.from("companies").select("*").eq("organization_id", TAWPER_ORG_ID).neq("status", "merged"),
    sb.from("contacts").select("*").eq("organization_id", TAWPER_ORG_ID),
    sb.from("opportunities").select("*").eq("organization_id", TAWPER_ORG_ID),
    sb.from("stages").select("id, key, funnel_id").eq("organization_id", TAWPER_ORG_ID),
    sb.from("activities").select("*").eq("organization_id", TAWPER_ORG_ID),
    sb.from("memberships").select("profile_id, role").eq("organization_id", TAWPER_ORG_ID).eq("is_active", true),
    sb.from("profiles").select("id, full_name, short_name, title, phone_e164, avatar_color"),
    sb.from("regions").select("id, name").eq("organization_id", TAWPER_ORG_ID),
  ]);

  for (const r of [companiesRes, contactsRes, oppsRes, stagesRes, activitiesRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const stageKey = new Map((stagesRes.data ?? []).map((s) => [s.id as string, s.key as string]));
  const regionName = new Map((regionsRes.data ?? []).map((r) => [r.id as string, r.name as string]));
  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id as string, p]));
  const memberships = membershipsRes.data ?? [];

  const users: User[] = memberships.length
    ? memberships.map((m) => {
        const p = profileById.get(m.profile_id as string);
        const name = p?.full_name ?? "Usuário";
        const short = p?.short_name ?? name.split(" ")[0];
        return {
          id: m.profile_id as string,
          name,
          short,
          role: ROLE[(m.role as string) ?? "vendedor"] ?? "vendedor",
          title: p?.title ?? "",
          initials: short.slice(0, 2).toUpperCase(),
          color: p?.avatar_color ?? "#123a7b",
          phone: p?.phone_e164 ?? "",
          regions: [],
        };
      })
    : USERS;

  const ownerToDemo = new Map<string, string>();
  if (!memberships.length) {
    for (const u of USERS) ownerToDemo.set(u.id, u.id);
  }

  const companies: Company[] = (companiesRes.data ?? []).map((row) => ({
    id: row.id as string,
    codigo: row.code as string,
    nome: row.trade_name as string,
    razaoSocial: (row.legal_name as string) ?? "",
    cnpj: (row.cnpj as string) ?? undefined,
    status: STATUS[(row.status as string) ?? "active"] ?? "ativa",
    ownerId: (row.owner_id as string) ?? users[0]?.id,
    regiao: row.region_id ? regionName.get(row.region_id as string) : undefined,
    cidade: (row.city as string) ?? undefined,
    uf: (row.state as string) ?? undefined,
    ramo: (row.industry as string) ?? undefined,
    grupo: (row.economic_group as string) ?? undefined,
    origem: (row.source as string) ?? "manual",
    potencial: row.potential === "high" ? "Alto" : row.potential === "low" ? "Baixo" : row.potential ? "Médio" : undefined,
    potencialMensal: row.monthly_potential != null ? Number(row.monthly_potential) : undefined,
    colhedoras: row.harvesters_count != null ? Number(row.harvesters_count) : undefined,
    modelos: (row.machine_models as string) ?? undefined,
    prensa: PRESS[(row.press_type as string) ?? ""] ?? undefined,
    marcaAtual: (row.current_brand as string) ?? undefined,
    concorrente: (row.competitor as string) ?? undefined,
    urgencia: row.urgency === "high" ? "Alta" : row.urgency === "low" ? "Baixa" : "Média",
    observacoes: (row.notes as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    clienteDesde: (row.customer_since as string) ?? undefined,
    motivoPerda: (row.loss_reason as string) ?? undefined,
  }));

  const PAPEL: Record<string, Contact["papel"]> = {
    decision_maker: "Decisor",
    buyer: "Comprador",
    technical: "Técnico",
    mechanic: "Mecânico",
    influencer: "Influenciador",
    other: "Outro",
  };
  const CHANNEL: Record<string, Contact["canal"]> = {
    whatsapp: "WhatsApp",
    phone: "Ligação",
    email: "E-mail",
    in_person: "Presencial",
  };

  const contacts: Contact[] = (contactsRes.data ?? []).map((row) => ({
    id: row.id as string,
    companyId: row.company_id as string,
    nome: row.name as string,
    cargo: (row.job_title as string) ?? "",
    papel: PAPEL[(row.role as string) ?? "other"] ?? "Outro",
    influencia: (Number(row.influence) as 1 | 2 | 3) || 2,
    whatsapp: (row.whatsapp_e164 as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    canal: CHANNEL[(row.preferred_channel as string) ?? "whatsapp"] ?? "WhatsApp",
    autorizaContato: Boolean(row.contact_allowed),
    ativo: Boolean(row.is_active),
  }));

  const FUNNEL_KEY: Record<string, Deal["funnel"]> = {};
  const funnels = await sb.from("funnels").select("id, key").eq("organization_id", TAWPER_ORG_ID);
  for (const f of funnels.data ?? []) FUNNEL_KEY[f.id as string] = f.key as Deal["funnel"];

  const deals: Deal[] = (oppsRes.data ?? []).map((row) => ({
    id: row.id as string,
    companyId: row.company_id as string,
    ownerId: row.owner_id as string,
    funnel: FUNNEL_KEY[row.funnel_id as string] ?? "aquisicao",
    stageId: stageKey.get(row.stage_id as string) ?? "lead",
    titulo: row.title as string,
    valor: row.estimated_value != null ? Number(row.estimated_value) : undefined,
    probabilidade: Number(row.probability ?? 0),
    previsaoFechamento: (row.expected_close_date as string) ?? undefined,
    status: DEAL_STATUS[(row.status as string) ?? "open"] ?? "aberta",
    motivo: (row.close_reason as string) ?? undefined,
    createdAt: row.created_at as string,
    stageEnteredAt: row.stage_entered_at as string,
    closedAt: (row.closed_at as string) ?? undefined,
    valorRealizado: row.realized_value != null ? Number(row.realized_value) : undefined,
    checklist: {},
    history: [],
    ciclo: Number(row.cycle ?? 1),
    objecao: (row.objection as string) ?? undefined,
  }));

  const ACT_TYPE: Record<string, import("@/lib/types").ActivityType> = {
    call: "Ligação",
    whatsapp: "WhatsApp",
    email: "E-mail",
    visit: "Visita",
    meeting: "Reunião",
    quote: "Cotação",
    homologation: "Homologação",
    registration: "Cadastro",
    support: "Suporte",
    other: "Outro",
  };

  const activities = (activitiesRes.data ?? []).map((row): Activity => ({
    id: row.id as string,
    companyId: row.company_id as string,
    dealId: (row.opportunity_id as string) ?? undefined,
    tipo: ACT_TYPE[(row.type as string) ?? "other"] ?? "Outro",
    titulo: row.title as string,
    descricao: (row.description as string) ?? undefined,
    ownerId: row.owner_id as string,
    dueAt: row.due_at as string,
    prioridade: row.priority === "high" ? "Alta" : row.priority === "low" ? "Baixa" : "Média",
    status: row.status === "done" ? "concluida" : row.status === "cancelled" ? "cancelada" : "pendente",
    origem: (row.origin as "manual" | "regra" | "ia" | "integracao") ?? "manual",
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) ?? undefined,
    resultado: (row.outcome as string) ?? undefined,
  }));

  void ownerToDemo;
  return { companies, contacts, deals, activities, users };
}
