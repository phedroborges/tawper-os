import "server-only";

import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { Activity, AuditEntry, Canal, Company, Contact, Deal, DemoData, Interaction, InteractionKind, Strategy, User } from "@/lib/types";
import { FUNNELS, USERS } from "@/lib/constants";
import { criterionKey } from "@/server/commands";
import { ensureOperators } from "@/server/persist";
import { listQuotes } from "@/server/quotes";

/** Tudo que a tela precisa do banco; vem sempre inteiro, nunca guardado no navegador. */
export type CrmSlice = Pick<DemoData, "companies" | "contacts" | "deals" | "activities" | "users" | "quotes" | "interactions" | "audit" | "strategies" | "strategyHistory">;

const CHANNEL_FROM_DB: Record<string, Canal> = { whatsapp: "WhatsApp", phone: "Ligação", email: "E-mail", visit: "Visita", meeting: "Reunião", note: "Nota", system: "Sistema", ai: "IA" };
const KIND_FROM_DB: Record<string, InteractionKind> = { nudge: "cobranca", message: "note" };
const ENTITY_LABEL: Record<string, string> = {
  companies: "Empresa", contacts: "Contato", opportunities: "Oportunidade", activities: "Atividade", standby_periods: "Espera", quotes: "Orçamento", strategy_versions: "Estratégia",
  opportunity_requirement_values: "Critério", sales: "Venda", company_relationships: "Vínculo", ai_suggestions: "Sugestão", route_plans: "Rota", stages: "Etapa", funnels: "Funil", stage_requirements: "Critério de etapa",
};
const FIELD_LABEL: Record<string, string> = {
  created: "criado(a)", deleted: "excluído(a)", status: "Status", stage_id: "Etapa", owner_id: "Responsável", due_at: "Prazo", is_met: "Cumprido", trade_name: "Nome fantasia", legal_name: "Razão social",
  estimated_value: "Valor estimado", realized_value: "Valor realizado", close_reason: "Motivo de encerramento", outcome: "Resultado", title: "Título", priority: "Prioridade", city: "Cidade", state: "UF",
  discount_pct: "Desconto %", payment_terms: "Pagamento", validity_days: "Validade (dias)", review_at: "Reavaliação", ended_at: "Fim da espera", end_outcome: "Desfecho da espera",
};

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
    const [org, funnels, stages, companies] = await Promise.all([
      sb.from("organizations").select("name").eq("id", TAWPER_ORG_ID).maybeSingle(),
      sb.from("funnels").select("id", { count: "exact", head: true }).eq("organization_id", TAWPER_ORG_ID),
      sb.from("stages").select("id", { count: "exact", head: true }).eq("organization_id", TAWPER_ORG_ID),
      sb.from("companies").select("id", { count: "exact", head: true }).eq("organization_id", TAWPER_ORG_ID).neq("status", "merged"),
    ]);
    if (org.error) {
      if (org.error.code === "PGRST205" || /schema cache|does not exist/i.test(org.error.message)) {
        return { ok: false, reason: "missing_schema", detail: org.error.message };
      }
      return { ok: false, reason: "error", detail: org.error.message };
    }
    if (!org.data) return { ok: false, reason: "missing_schema", detail: "Organização semente não encontrada." };
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

export async function loadCrmSnapshot(): Promise<CrmSlice> {
  const sb = getSupabaseAdmin();
  const [companiesRes, contactsRes, oppsRes, stagesRes, activitiesRes, membershipsRes, profilesRes, regionsRes, funnelsRes] = await Promise.all([
    sb.from("companies").select("*").eq("organization_id", TAWPER_ORG_ID).neq("status", "merged"),
    sb.from("contacts").select("*").eq("organization_id", TAWPER_ORG_ID),
    sb.from("opportunities").select("*").eq("organization_id", TAWPER_ORG_ID),
    sb.from("stages").select("id, key, funnel_id").eq("organization_id", TAWPER_ORG_ID),
    sb.from("activities").select("*").eq("organization_id", TAWPER_ORG_ID),
    sb.from("memberships").select("profile_id, role").eq("organization_id", TAWPER_ORG_ID).eq("is_active", true),
    sb.from("profiles").select("id, full_name, short_name, title, phone_e164, avatar_color"),
    sb.from("regions").select("id, name").eq("organization_id", TAWPER_ORG_ID),
    sb.from("funnels").select("id, key").eq("organization_id", TAWPER_ORG_ID),
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
  for (const f of funnelsRes.data ?? []) FUNNEL_KEY[f.id as string] = f.key as Deal["funnel"];

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
  const quotes = await listQuotes();
  const extra = await loadDealDetails({ companies, deals, users, stageKey, stagesRows: stagesRes.data ?? [] });
  return { companies: extra.companies, contacts, deals: extra.deals, activities, users, quotes, interactions: extra.interactions, audit: extra.audit, strategies: extra.strategies, strategyHistory: extra.strategyHistory };
}

export type CrmBootstrap = {
  health: DbHealth;
  snapshot: CrmSlice | null;
  actorMap: Record<string, string> | null;
};

const SNAPSHOT_TTL_MS = 5_000;
let snapshotGen = 0;
let snapshotCache: { gen: number; at: number; body: CrmBootstrap } | null = null;
let snapshotPending: { gen: number; promise: Promise<CrmBootstrap> } | null = null;

export function invalidateCrmReadCache() {
  snapshotGen += 1;
  snapshotCache = null;
}

async function buildCrmBootstrap(): Promise<CrmBootstrap> {
  const healthPromise = getDbHealth();
  const operatorsPromise = ensureOperators();
  const snapshotPromise = loadCrmSnapshot();
  const health = await healthPromise;
  if (!health.ok) {
    void operatorsPromise.catch(() => undefined);
    void snapshotPromise.catch(() => undefined);
    return { health, snapshot: null, actorMap: null };
  }
  try {
    const [actorMap, snapshot] = await Promise.all([operatorsPromise, snapshotPromise]);
    return { health, snapshot, actorMap };
  } catch (e) {
    return {
      health: { ok: false, reason: "error", detail: e instanceof Error ? e.message : String(e) },
      snapshot: null,
      actorMap: null,
    };
  }
}

/** Saúde + operadores + snapshot em paralelo, reutilizados por alguns segundos. */
export function readCrmBootstrap(): Promise<CrmBootstrap> {
  const now = Date.now();
  if (snapshotCache && snapshotCache.gen === snapshotGen && now - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return Promise.resolve(snapshotCache.body);
  }
  if (snapshotPending && snapshotPending.gen === snapshotGen) return snapshotPending.promise;
  const gen = snapshotGen;
  const promise = buildCrmBootstrap()
    .then((body) => {
      if (gen === snapshotGen && body.health.ok) snapshotCache = { gen, at: Date.now(), body };
      return body;
    })
    .finally(() => {
      if (snapshotPending?.gen === gen) snapshotPending = null;
    });
  snapshotPending = { gen, promise };
  return promise;
}

type Row = Record<string, unknown>;

/** O banco devolve no máximo 1000 linhas por consulta: lê em páginas até acabar. */
async function selectPaged(table: string, columns: string, opts: { order: string; onlyMet?: boolean }): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const out: Row[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    let q = sb.from(table).select(columns).eq("organization_id", TAWPER_ORG_ID);
    if (opts.onlyMet) q = q.eq("is_met", true);
    const res = await q.order(opts.order).range(from, from + 999);
    if (res.error) throw new Error(res.error.message);
    const rows = (res.data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/** Histórico de etapas, critérios cumpridos, espera, estratégia, linha do tempo e auditoria: tudo vem do banco. */
async function loadDealDetails(input: { companies: Company[]; deals: Deal[]; users: User[]; stageKey: Map<string, string>; stagesRows: Row[] }) {
  const { stageKey } = input;
  const org = TAWPER_ORG_ID;
  const [history, values, reqs, standbys, strategies, versions, interactions, audit] = await Promise.all([
    selectPaged("opportunity_stage_history", "opportunity_id, stage_id, entered_at, left_at, entered_by, actor_type", { order: "entered_at" }),
    selectPaged("opportunity_requirement_values", "opportunity_id, requirement_id, is_met", { order: "opportunity_id", onlyMet: true }),
    getSupabaseAdmin().from("stage_requirements").select("id, key").eq("organization_id", org),
    getSupabaseAdmin().from("standby_periods").select("*").eq("organization_id", org).is("ended_at", null),
    getSupabaseAdmin().from("strategies").select("id, company_id, current_version_id").eq("organization_id", org),
    getSupabaseAdmin().from("strategy_versions").select("*").eq("organization_id", org).order("version", { ascending: false }),
    getSupabaseAdmin().from("interactions").select("*").eq("organization_id", org).order("occurred_at", { ascending: false }).limit(1500),
    getSupabaseAdmin().from("audit_events").select("*").eq("organization_id", org).order("occurred_at", { ascending: false }).limit(800),
  ]);
  for (const r of [reqs, standbys, strategies, versions, interactions, audit]) if (r.error) throw new Error(r.error.message);

  // critério do app (camelCase) a partir da chave do banco (snake_case)
  const idByKey = new Map<string, string>();
  for (const f of Object.values(FUNNELS)) for (const st of f.stages) for (const c of st.criterios) idByKey.set(criterionKey(c.id), c.id);
  const reqKey = new Map((reqs.data ?? []).map((r) => [r.id as string, r.key as string]));

  const checklist = new Map<string, Record<string, boolean>>();
  for (const v of values) {
    const key = reqKey.get(v.requirement_id as string);
    const id = key ? idByKey.get(key) : undefined;
    if (!id) continue;
    const cur = checklist.get(v.opportunity_id as string) ?? {};
    cur[id] = true;
    checklist.set(v.opportunity_id as string, cur);
  }
  const historyBy = new Map<string, Deal["history"]>();
  for (const h of history) {
    const list = historyBy.get(h.opportunity_id as string) ?? [];
    list.push({
      stageId: stageKey.get(h.stage_id as string) ?? "lead",
      enteredAt: h.entered_at as string,
      leftAt: (h.left_at as string) ?? undefined,
      byId: (h.entered_by as string) ?? (h.actor_type === "ai" ? "ia" : "sistema"),
    });
    historyBy.set(h.opportunity_id as string, list);
  }
  const deals = input.deals.map((d) => ({ ...d, checklist: checklist.get(d.id) ?? {}, history: historyBy.get(d.id) ?? [] }));

  const standbyBy = new Map((standbys.data ?? []).map((s) => [s.company_id as string, s]));
  const companies = input.companies.map((c) => {
    const s = standbyBy.get(c.id);
    return s ? { ...c, standby: { motivo: s.reason as string, inicio: s.started_at as string, reavaliacao: s.review_at as string, responsavelId: s.responsible_id as string, condicao: s.resume_condition as string } } : c;
  });

  const toStrategy = (v: Row, companyId: string): Strategy => ({
    companyId,
    objetivo: v.objective as string,
    diagnostico: (v.diagnosis as string) ?? "",
    barreira: (v.barrier as string) ?? "",
    estrategia: v.strategy as string,
    resultadoEsperado: (v.expected_result as string) ?? "",
    definidoPorId: (v.defined_by as string) ?? "sistema",
    revisadaEm: v.reviewed_at as string,
    proximaRevisao: (v.next_review_at as string) ?? "",
    versao: Number(v.version),
    origem: v.origin === "ai_approved" ? "ia-aprovada" : "manual",
  });
  const companyOfStrategy = new Map((strategies.data ?? []).map((s) => [s.id as string, s]));
  const strategiesOut: Strategy[] = [];
  const historyOut: Strategy[] = [];
  for (const v of versions.data ?? []) {
    const parent = companyOfStrategy.get(v.strategy_id as string);
    if (!parent) continue;
    (parent.current_version_id === v.id ? strategiesOut : historyOut).push(toStrategy(v, parent.company_id as string));
  }

  const interactionsOut: Interaction[] = (interactions.data ?? []).map((i) => ({
    id: i.id as string,
    companyId: i.company_id as string,
    dealId: (i.opportunity_id as string) ?? undefined,
    canal: CHANNEL_FROM_DB[i.channel as string] ?? "Sistema",
    at: i.occurred_at as string,
    autorId: (i.author_id as string) ?? (i.actor_type === "ai" ? "ia" : "sistema"),
    titulo: i.title as string,
    conteudo: (i.content as string) ?? undefined,
    kind: (KIND_FROM_DB[i.kind as string] ?? i.kind) as InteractionKind,
  }));

  const stageName = new Map(input.stagesRows.map((s) => [s.id as string, (s.key as string)]));
  const userName = new Map(input.users.map((u) => [u.id, u.name]));
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pretty = (field: string, value: unknown) => {
    if (value == null) return undefined;
    const text = String(value);
    if (field === "stage_id") return stageName.get(text) ?? text;
    if (uuidLike.test(text)) return userName.get(text) ?? text;
    if (text === "true") return "sim";
    if (text === "false") return "não";
    return text;
  };
  const auditOut: AuditEntry[] = (audit.data ?? []).map((a) => ({
    id: `db-${a.id}`,
    at: a.occurred_at as string,
    autorId: (a.actor_id as string) ?? (a.actor_type === "ai" ? "ia" : "sistema"),
    origem: a.actor_type === "ai" ? "ia" : a.actor_type === "integration" ? "integracao" : a.actor_type === "user" ? "usuario" : "automacao",
    entidade: ENTITY_LABEL[a.entity_type as string] ?? (a.entity_type as string),
    entidadeId: a.entity_id as string,
    companyId: (a.company_id as string) ?? undefined,
    campo: FIELD_LABEL[a.field as string] ?? (a.field as string),
    de: pretty(a.field as string, a.old_value),
    para: pretty(a.field as string, a.new_value),
  }));

  return { companies, deals, interactions: interactionsOut, audit: auditOut, strategies: strategiesOut, strategyHistory: historyOut };
}
