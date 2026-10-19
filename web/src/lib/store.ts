"use client";

// Store da demonstração. Toda a "persistência" é o localStorage do navegador; as ações abaixo
// são o contrato que depois pode ser trocado por chamadas a um backend real (ex.: Supabase).

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FIELD_LABELS, getStage } from "./constants";
import { fmtDateShort, rel } from "./dates";
import { buildSeed, DATA_VERSION } from "./seed";
import type {
  Activity,
  ActivityType,
  AISuggestion,
  AuditEntry,
  Canal,
  Company,
  Contact,
  Conversation,
  ConversationSummary,
  Deal,
  DemoData,
  Interaction,
  Message,
  Prioridade,
  Quote,
  Standby,
  Strategy,
} from "./types";
import { formatCNPJ, storedCNPJ, storedWhatsApp } from "./br-ids";
import { money, quoteTotals, uid } from "./utils";
import { useUI } from "./ui-store";

export const STORAGE_KEY = "tawper-os-demo";

export interface ActivityDraft {
  companyId: string;
  dealId?: string;
  tipo: ActivityType;
  titulo: string;
  descricao?: string;
  ownerId?: string;
  dueAt: string;
  prioridade?: Prioridade;
  origem?: Activity["origem"];
}

export interface NewCompanyInput {
  company: Partial<Company> & { nome: string };
  contacts: Omit<Contact, "id" | "companyId">[];
  firstActivity: Omit<ActivityDraft, "companyId">;
  conversationId?: string;
}

interface Session {
  currentUserId: string | null;
}

interface Actions {
  login: (userId: string) => void;
  logout: () => void;
  resetDemo: () => void;
  hydrateCrm: (snapshot: Partial<DemoData>) => void;
  adoptSaved: (saved: { company: Company; contacts: Contact[]; deal: Deal; activity: Activity }) => void;
  removeCompany: (id: string) => void;

  createCompany: (input: NewCompanyInput) => string;
  mergeIntoCompany: (existingId: string, input: NewCompanyInput) => Promise<string>;
  updateCompany: (id: string, patch: Partial<Company>, origem?: AuditEntry["origem"]) => void;
  addContact: (c: Omit<Contact, "id">) => string;

  addActivity: (a: ActivityDraft) => string;
  completeActivity: (id: string, input: { resultado: string; next?: ActivityDraft }) => string | undefined;
  rescheduleActivity: (id: string, dueAt: string) => Promise<void>;

  /** Estas ações rodam no banco e só voltam depois de gravadas; em caso de recusa, lançam o erro. */
  moveDeal: (
    dealId: string,
    toStageId: string,
    opts?: { checks?: Record<string, boolean>; tarefas?: ActivityDraft[]; nota?: string; origem?: AuditEntry["origem"]; companyPatch?: Partial<Company>; newContact?: Omit<Contact, "id"> },
  ) => Promise<void>;
  setChecklist: (dealId: string, checks: Record<string, boolean>, origem?: AuditEntry["origem"]) => Promise<void>;
  winDeal: (dealId: string, input: { valor: number; obs?: string }) => Promise<{ recurrenceDealId: string; posVendaId: string }>;
  loseDeal: (dealId: string, input: { motivo: string; obs?: string }) => Promise<void>;
  setStandby: (companyId: string, s: Omit<Standby, "inicio">) => Promise<void>;
  resumeStandby: (companyId: string) => Promise<void>;

  addInteraction: (i: Omit<Interaction, "id" | "at"> & { at?: string }) => Promise<void>;

  sendMessage: (convId: string, text: string, opts?: { nota?: boolean; attachment?: Message["attachment"] }) => void;
  receiveMessage: (convId: string, text: string) => void;
  markConversationRead: (convId: string) => void;
  setConversationSummary: (convId: string, summary: ConversationSummary) => void;
  startConversation: (companyId: string, contactId: string) => string;

  saveStrategy: (companyId: string, data: Pick<Strategy, "objetivo" | "diagnostico" | "barreira" | "estrategia" | "resultadoEsperado" | "proximaRevisao">, origem?: Strategy["origem"]) => Promise<void>;
  addSuggestion: (s: Omit<AISuggestion, "id" | "createdAt" | "status">) => string;
  decideSuggestion: (id: string, decision: "aprovada" | "descartada", opts?: { criarAcoes?: boolean }) => void;

  /** Coloca no store um orçamento já gravado no banco (a gravação acontece em /api/quotes). */
  upsertQuote: (q: Quote) => void;
  /** Efeitos locais depois que o servidor confirmou o envio: valor do negócio, follow-up e histórico. */
  afterQuoteSent: (q: Quote) => void;

  sendCobranca: (input: { companyId: string; toUserId: string; texto: string }) => void;
  markNotificationsRead: (userId: string) => void;
  confirmRoute: (routeId: string) => void;
}

export type AppState = DemoData & Session & Actions;

const nowIso = () => new Date().toISOString();

const CANAL_BY_TIPO: Partial<Record<ActivityType, Canal>> = {
  Ligação: "Ligação",
  WhatsApp: "WhatsApp",
  "E-mail": "E-mail",
  Visita: "Visita",
  Reunião: "Reunião",
};

export const canalFromTipo = (t: ActivityType): Canal => CANAL_BY_TIPO[t] ?? "Nota";

function auditEntry(p: Omit<AuditEntry, "id" | "at"> & { at?: string }): AuditEntry {
  return { id: uid("au"), at: p.at ?? nowIso(), ...p };
}

function interaction(p: Omit<Interaction, "id" | "at"> & { at?: string }): Interaction {
  return { id: uid("i"), at: p.at ?? nowIso(), ...p };
}

function fmtField(key: keyof Company, v: unknown, users: DemoData["users"], companies: Company[]) {
  if (v === undefined || v === null || v === "") return undefined;
  if (key === "ownerId") return users.find((u) => u.id === v)?.name ?? String(v);
  if (key === "influenciadoraId") return companies.find((c) => c.id === v)?.nome ?? String(v);
  if (key === "potencialMensal") return money(v as number);
  if (key === "cnpj") return formatCNPJ(String(v));
  return String(v);
}

// Sem tela de login: a demo já abre como o gestor (Murilo). O seletor no topo troca de perfil.
export const DEFAULT_USER_ID = "u-murilo";

const USE_SUPABASE = process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE === "true";

const actorAlias = new Map<string, string>();

export function setActorAliases(map: Record<string, string>) {
  for (const [from, to] of Object.entries(map)) actorAlias.set(from, to);
}

/** Mostra o erro para quem usou. Nenhuma gravação falha em silêncio. */
export function reportError(e: unknown, prefix = "Não foi possível concluir") {
  const message = e instanceof Error ? e.message : String(e);
  useUI.getState().toast(prefix, { tone: "warn", sub: message });
}

let refreshSeq = 0;

/** Relê o banco e troca os dados da tela pelo que está gravado. */
export async function refreshCrm(): Promise<boolean> {
  if (!USE_SUPABASE || typeof window === "undefined") return false;
  const mine = ++refreshSeq;
  const res = await fetch("/api/crm/snapshot", { cache: "no-store" });
  const body = (await res.json()) as { health?: { ok: boolean; detail?: string; reason?: string }; snapshot?: Partial<DemoData> | null; actorMap?: Record<string, string> | null };
  if (!body.health?.ok || !body.snapshot) throw new Error(body.health?.detail || "O banco não respondeu.");
  if (body.actorMap) setActorAliases(body.actorMap);
  if (mine === refreshSeq) useStore.getState().hydrateCrm(body.snapshot);
  return true;
}

/** Executa uma regra de negócio no banco (transação única) e relê o que ficou gravado. */
async function sendCommand<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/crm/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; result?: T };
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  await refreshCrm().catch(() => undefined);
  return data.result as T;
}

/**
 * Gravações simples (empresa, contato, atividade): a tela mostra na hora, mas se o banco recusar
 * o usuário é avisado e a tela volta ao que está gravado.
 */
function pushMutation(body: unknown) {
  if (!USE_SUPABASE || typeof window === "undefined") return;
  void (async () => {
    try {
      const res = await fetch("/api/crm/mutate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "O banco recusou a gravação.");
      await refreshCrm();
    } catch (e) {
      reportError(e, "Não foi possível salvar");
      await refreshCrm().catch(() => undefined);
    }
  })();
}

function emptyCrm(): DemoData & Session {
  const seed = buildSeed();
  return {
    ...seed,
    companies: [],
    contacts: [],
    deals: [],
    strategies: [],
    strategyHistory: [],
    suggestions: [],
    activities: [],
    interactions: [],
    conversations: [],
    quotes: [],
    audit: [],
    notifications: [],
    routes: [],
    seq: { codigo: 1, quote: 1 },
    currentUserId: DEFAULT_USER_ID,
  };
}

function freshState(): DemoData & Session {
  return USE_SUPABASE ? emptyCrm() : { ...buildSeed(), currentUserId: DEFAULT_USER_ID };
}

const memoryStorage: Storage = {
  get length() {
    return 0;
  },
  clear() {},
  getItem() {
    return null;
  },
  key() {
    return null;
  },
  removeItem() {},
  setItem() {},
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const me = () => get().currentUserId ?? DEFAULT_USER_ID;

      return {
        ...freshState(),

        // -------------------------------------------------------------------
        login: (userId) => set({ currentUserId: actorAlias.get(userId) ?? userId }),
        logout: () => set({ currentUserId: DEFAULT_USER_ID }),
        resetDemo: () => {
          const keepUser = get().currentUserId ?? DEFAULT_USER_ID;
          set({ ...(USE_SUPABASE ? emptyCrm() : buildSeed()), currentUserId: keepUser });
        },
        hydrateCrm: (snapshot) => {
          // O banco é a única fonte: o que a tela mostra é substituído pelo que está gravado.
          set((s) => ({
            companies: snapshot.companies ?? s.companies,
            contacts: snapshot.contacts ?? s.contacts,
            deals: snapshot.deals ?? s.deals,
            activities: snapshot.activities ?? s.activities,
            quotes: snapshot.quotes ?? s.quotes,
            interactions: snapshot.interactions ?? s.interactions,
            audit: snapshot.audit ?? s.audit,
            strategies: snapshot.strategies ?? s.strategies,
            strategyHistory: snapshot.strategyHistory ?? s.strategyHistory,
            users: snapshot.users?.length ? snapshot.users : s.users,
          }));
        },
        adoptSaved: ({ company, contacts, deal, activity }) => {
          set((s) => ({
            companies: [company, ...s.companies.filter((c) => c.id !== company.id)],
            contacts: [...contacts, ...s.contacts],
            deals: [deal, ...s.deals],
            activities: [activity, ...s.activities],
          }));
        },
        removeCompany: (id) => {
          set((s) => ({
            companies: s.companies.filter((c) => c.id !== id),
            contacts: s.contacts.filter((c) => c.companyId !== id),
            deals: s.deals.filter((d) => d.companyId !== id),
            activities: s.activities.filter((a) => a.companyId !== id),
            interactions: s.interactions.filter((i) => i.companyId !== id),
            conversations: s.conversations.filter((c) => c.companyId !== id),
            quotes: s.quotes.filter((q) => q.companyId !== id),
            suggestions: s.suggestions.filter((x) => x.companyId !== id),
            strategies: s.strategies.filter((x) => x.companyId !== id),
          }));
        },

        // -------------------------------------------------------------------
        createCompany: (input) => {
          const s = get();
          const actor = me();
          const id = uid("c");
          const codigo = `TW-0${s.seq.codigo}`;
          const now = nowIso();
          const ownerId = input.company.ownerId ?? actor;
          const company: Company = {
            urgencia: "Média",
            origem: "WhatsApp",
            ...input.company,
            id,
            codigo,
            razaoSocial: input.company.razaoSocial || input.company.nome,
            cnpj: storedCNPJ(input.company.cnpj),
            status: "ativa",
            ownerId,
            createdAt: now,
            updatedAt: now,
          };
          const contacts: Contact[] = input.contacts.map((c) => ({ ...c, id: uid("ct"), companyId: id, whatsapp: storedWhatsApp(c.whatsapp) }));
          const dealId = uid("d");
          const deal: Deal = {
            id: dealId,
            companyId: id,
            ownerId,
            funnel: "aquisicao",
            stageId: "lead",
            titulo: `Prospecção — ${company.nome}`,
            status: "aberta",
            probabilidade: getStage("aquisicao", "lead").probabilidade,
            createdAt: now,
            stageEnteredAt: now,
            checklist: {},
            history: [{ stageId: "lead", enteredAt: now, byId: actor }],
            ciclo: 1,
          };
          const firstAct: Activity = {
            id: uid("a"),
            companyId: id,
            dealId,
            ownerId,
            status: "pendente",
            origem: "manual",
            prioridade: "Média",
            createdAt: now,
            ...input.firstActivity,
          };
          const convs = input.conversationId
            ? s.conversations.map((c) =>
                c.id === input.conversationId ? { ...c, companyId: id, contactId: contacts[0]?.id, contatoNome: contacts[0]?.nome ?? c.contatoNome } : c,
              )
            : s.conversations;
          set({
            seq: { ...s.seq, codigo: s.seq.codigo + 1 },
            companies: [company, ...s.companies],
            contacts: [...contacts, ...s.contacts],
            deals: [deal, ...s.deals],
            activities: [firstAct, ...s.activities],
            conversations: convs,
            interactions: [
              interaction({ companyId: id, dealId, canal: "Sistema", autorId: actor, kind: "create", titulo: `Empresa cadastrada — origem: ${company.origem}`, conteudo: `Oportunidade criada em Lead desconhecido. Primeiro próximo passo: ${firstAct.titulo}.` }),
              ...s.interactions,
            ],
            audit: [
              auditEntry({ autorId: actor, origem: "usuario", entidade: "Empresa", entidadeId: id, companyId: id, campo: "criada", para: company.nome }),
              auditEntry({ autorId: actor, origem: "usuario", entidade: "Oportunidade", entidadeId: dealId, companyId: id, campo: "etapa", para: "Lead desconhecido" }),
              auditEntry({ autorId: actor, origem: "usuario", entidade: "Atividade", entidadeId: firstAct.id, companyId: id, campo: "criada", para: firstAct.titulo }),
              ...s.audit,
            ],
          });
          return id;
        },

        mergeIntoCompany: async (existingId, input) => {
          await sendCommand({ command: "mergeCompany", existingId, company: input.company, contacts: input.contacts, firstActivity: input.firstActivity, actorId: me() });
          return existingId;
        },

        updateCompany: (id, patch, origem = "usuario") => {
          const s = get();
          const actor = origem === "ia" ? "ia" : me();
          const c = s.companies.find((x) => x.id === id);
          if (!c) return;
          if (patch.cnpj !== undefined) patch = { ...patch, cnpj: storedCNPJ(patch.cnpj) };
          const changed = (Object.keys(patch) as (keyof Company)[]).filter((k) => patch[k] !== c[k]);
          if (!changed.length) return;
          const entries = changed
            .filter((k) => FIELD_LABELS[k])
            .map((k) =>
              auditEntry({
                autorId: actor, origem, entidade: "Empresa", entidadeId: id, companyId: id, campo: FIELD_LABELS[k]!,
                de: fmtField(k, c[k], s.users, s.companies), para: fmtField(k, patch[k], s.users, s.companies),
              }),
            );
          set({
            companies: s.companies.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: nowIso() } : x)),
            deals: patch.ownerId ? s.deals.map((d) => (d.companyId === id && d.status === "aberta" ? { ...d, ownerId: patch.ownerId! } : d)) : s.deals,
            audit: [...entries, ...s.audit],
          });
          pushMutation({ action: "updateCompany", id, patch, actorId: me() });
        },

        addContact: (c) => {
          const s = get();
          const id = uid("ct");
          const contact = { ...c, id, whatsapp: storedWhatsApp(c.whatsapp) };
          set({
            contacts: [contact, ...s.contacts],
            interactions: [interaction({ companyId: c.companyId, canal: "Sistema", autorId: me(), kind: "contact", titulo: `Contato adicionado: ${c.nome}`, conteudo: `${c.cargo} · ${c.papel}` }), ...s.interactions],
            audit: [auditEntry({ autorId: me(), origem: "usuario", entidade: "Contato", entidadeId: id, companyId: c.companyId, campo: "criado", para: c.nome }), ...s.audit],
          });
          pushMutation({ action: "addContact", contact, actorId: me() });
          return id;
        },

        // -------------------------------------------------------------------
        addActivity: (a) => {
          const s = get();
          const id = uid("a");
          const deal = a.dealId ?? s.deals.find((d) => d.companyId === a.companyId && d.status === "aberta")?.id;
          const company = s.companies.find((c) => c.id === a.companyId);
          const act: Activity = {
            id, status: "pendente", origem: "manual", prioridade: "Média", createdAt: nowIso(), ownerId: company?.ownerId ?? me(), ...a, dealId: deal,
          };
          set({
            activities: [act, ...s.activities],
            audit: [auditEntry({ autorId: act.origem === "ia" ? "ia" : me(), origem: act.origem === "regra" ? "automacao" : act.origem === "ia" ? "ia" : "usuario", entidade: "Atividade", entidadeId: id, companyId: a.companyId, campo: "criada", para: act.titulo }), ...s.audit],
          });
          pushMutation({ action: "addActivity", activity: { ...a, dealId: deal, ownerId: act.ownerId } });
          return id;
        },

        completeActivity: (id, { resultado, next }) => {
          const s = get();
          const a = s.activities.find((x) => x.id === id);
          if (!a) return;
          const now = nowIso();
          let nextId: string | undefined;
          let activities = s.activities.map((x) => (x.id === id ? { ...x, status: "concluida" as const, completedAt: now, resultado } : x));
          const entries = [auditEntry({ autorId: me(), origem: "usuario", entidade: "Atividade", entidadeId: id, companyId: a.companyId, campo: "status", de: "pendente", para: "concluída" })];
          if (next) {
            nextId = uid("a");
            const n: Activity = {
              id: nextId, status: "pendente", origem: "manual", prioridade: "Média", createdAt: now, ownerId: a.ownerId, dealId: a.dealId, ...next,
            };
            activities = [n, ...activities.map((x) => (x.id === id ? { ...x, nextActivityId: nextId } : x))];
            entries.unshift(auditEntry({ autorId: n.origem === "ia" ? "ia" : me(), origem: n.origem === "ia" ? "ia" : "usuario", entidade: "Atividade", entidadeId: nextId, companyId: a.companyId, campo: "próximo passo", para: n.titulo }));
          }
          set({ activities, audit: [...entries, ...s.audit] });
          pushMutation({
            action: "completeActivity",
            id,
            resultado,
            next: next ? { ...next, companyId: a.companyId, dealId: a.dealId, ownerId: next.ownerId ?? a.ownerId } : undefined,
          });
          return nextId;
        },

        rescheduleActivity: async (id, dueAt) => {
          await sendCommand({ command: "reschedule", activityId: id, dueAt, actorId: me() });
        },

        // -------------------------------------------------------------------
        moveDeal: async (dealId, toStageId, opts = {}) => {
          const deal = get().deals.find((d) => d.id === dealId);
          if (!deal) throw new Error("Negócio não encontrado.");
          if (deal.stageId === toStageId) return;
          await sendCommand({
            command: "moveStage", dealId, toStageId, actorId: me(), checks: opts.checks, tarefas: opts.tarefas, nota: opts.nota,
            origem: opts.origem === "ia" ? "ia" : "usuario", companyPatch: opts.companyPatch, newContact: opts.newContact,
          });
        },

        setChecklist: async (dealId, checks, origem = "usuario") => {
          const deal = get().deals.find((d) => d.id === dealId);
          if (!deal) throw new Error("Negócio não encontrado.");
          if (!Object.entries(checks).some(([k, v]) => Boolean(deal.checklist[k]) !== v)) return;
          await sendCommand({ command: "setChecks", dealId, checks, actorId: me(), origem: origem === "ia" ? "ia" : "usuario" });
        },

        winDeal: async (dealId, { valor, obs }) => {
          const r = await sendCommand<{ recurrence_id: string; activity_id: string }>({ command: "winDeal", dealId, valor, obs, actorId: me() });
          return { recurrenceDealId: r.recurrence_id, posVendaId: r.activity_id };
        },

        loseDeal: async (dealId, { motivo, obs }) => {
          await sendCommand({ command: "loseDeal", dealId, motivo, obs, actorId: me() });
        },

        setStandby: async (companyId, sb) => {
          await sendCommand({ command: "setStandby", companyId, motivo: sb.motivo, condicao: sb.condicao, reavaliacao: sb.reavaliacao, responsavelId: sb.responsavelId, actorId: me() });
        },

        resumeStandby: async (companyId) => {
          await sendCommand({ command: "resumeStandby", companyId, actorId: me() });
        },

        addInteraction: async (i) => {
          await sendCommand({ command: "addInteraction", companyId: i.companyId, dealId: i.dealId, canal: i.canal, kind: i.kind, titulo: i.titulo, conteudo: i.conteudo, autorId: i.autorId });
        },

        // -------------------------------------------------------------------
        sendMessage: (convId, text, opts = {}) => {
          const s = get();
          const m: Message = { id: uid("m"), from: opts.nota ? "nota" : "tawper", text, at: nowIso(), autorId: me(), attachment: opts.attachment };
          set({ conversations: s.conversations.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, m], lastAt: m.at } : c)) });
        },

        receiveMessage: (convId, text) => {
          const s = get();
          const m: Message = { id: uid("m"), from: "cliente", text, at: nowIso() };
          set({ conversations: s.conversations.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, m], lastAt: m.at, unread: c.unread + 1 } : c)) });
        },

        markConversationRead: (convId) => {
          const s = get();
          if (!s.conversations.find((c) => c.id === convId)?.unread) return;
          set({ conversations: s.conversations.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)) });
        },

        setConversationSummary: (convId, summary) => {
          const s = get();
          const conv = s.conversations.find((c) => c.id === convId);
          set({
            conversations: s.conversations.map((c) => (c.id === convId ? { ...c, summary } : c)),
            interactions: conv?.companyId
              ? [
                  interaction({
                    companyId: conv.companyId, canal: "IA", autorId: "ia", kind: "ai", titulo: `Resumo da conversa com ${conv.contatoNome}`,
                    conteudo: `Assunto: ${summary.assunto}. Necessidade: ${summary.necessidade}${summary.compromissosCliente.length ? ` Compromisso do cliente: ${summary.compromissosCliente.join("; ")}.` : ""} Próximo passo sugerido: ${summary.proximoPasso}.`,
                  }),
                  ...s.interactions,
                ]
              : s.interactions,
          });
        },

        startConversation: (companyId, contactId) => {
          const s = get();
          const existing = s.conversations.find((c) => c.contactId === contactId);
          if (existing) return existing.id;
          const contact = s.contacts.find((c) => c.id === contactId)!;
          const company = s.companies.find((c) => c.id === companyId)!;
          const id = uid("conv");
          const conv: Conversation = {
            id, companyId, contactId, contatoNome: contact.nome, telefone: storedWhatsApp(contact.whatsapp) ?? contact.whatsapp ?? "—", ownerId: company.ownerId, messages: [], unread: 0, lastAt: nowIso(),
          };
          set({ conversations: [conv, ...s.conversations] });
          return id;
        },

        // -------------------------------------------------------------------
        saveStrategy: async (companyId, data, origem = "manual") => {
          await sendCommand({ command: "saveStrategy", companyId, data, origem, actorId: me() });
        },

        addSuggestion: (sg) => {
          const s = get();
          const id = uid("s");
          set({
            suggestions: [{ ...sg, id, createdAt: nowIso(), status: "pendente" }, ...s.suggestions.filter((x) => !(x.companyId === sg.companyId && x.status === "pendente" && x.tipo === sg.tipo))],
            audit: [auditEntry({ autorId: "ia", origem: "ia", entidade: "Sugestão", entidadeId: id, companyId: sg.companyId, campo: "sugestão gerada", para: sg.titulo }), ...s.audit],
          });
          return id;
        },

        decideSuggestion: (id, decision, opts = {}) => {
          const s = get();
          const sg = s.suggestions.find((x) => x.id === id);
          if (!sg) return;
          const actor = me();
          const now = nowIso();
          set({
            suggestions: s.suggestions.map((x) => (x.id === id ? { ...x, status: decision, decididoPorId: actor, decididoEm: now } : x)),
            audit: [auditEntry({ autorId: actor, origem: "usuario", entidade: "Sugestão", entidadeId: id, companyId: sg.companyId, campo: "decisão humana", de: "pendente", para: decision }), ...s.audit],
          });
          if (decision === "aprovada" && sg.detalhes) {
            const d = sg.detalhes;
            get()
              .saveStrategy(sg.companyId, {
                objetivo: d.objetivo, diagnostico: d.diagnostico, barreira: d.barreira, estrategia: d.estrategia, resultadoEsperado: d.resultadoEsperado, proximaRevisao: rel(14),
              }, "ia-aprovada")
              .catch((e) => reportError(e, "Não foi possível salvar a estratégia"));
            if (opts.criarAcoes) {
              const company = get().companies.find((c) => c.id === sg.companyId);
              d.acoes.forEach((a, i) =>
                get().addActivity({ companyId: sg.companyId, tipo: a.tipo, titulo: a.titulo, dueAt: rel(a.prazoDias, 9 + i), prioridade: i === 0 ? "Alta" : "Média", origem: "ia", ownerId: company?.ownerId }),
              );
            }
          }
        },

        // -------------------------------------------------------------------
        upsertQuote: (q) => {
          set((s) => ({ quotes: [q, ...s.quotes.filter((x) => x.id !== q.id)].sort((x, y) => y.createdAt.localeCompare(x.createdAt)) }));
        },

        afterQuoteSent: (q) => {
          const s = get();
          const actor = me();
          const now = q.enviadoEm ?? nowIso();
          const { total } = quoteTotals(q.itens, q.desconto);
          const company = s.companies.find((c) => c.id === q.companyId);
          const via = q.enviadoPara?.via === "manual" ? "fora do sistema" : "pelo WhatsApp";
          const followId = get().addActivity({
            companyId: q.companyId, dealId: q.dealId, ownerId: company?.ownerId, tipo: "WhatsApp", titulo: `Follow-up do orçamento ${q.numero}`,
            dueAt: rel(3, 10), prioridade: "Média", origem: "regra",
          });
          const follow = get().activities.find((a) => a.id === followId);
          set({
            deals: get().deals.map((d) => (d.id === q.dealId ? { ...d, valor: Math.round(total), checklist: { ...d.checklist, orcamento_enviado: true } } : d)),
            interactions: [
              interaction({ companyId: q.companyId, dealId: q.dealId, canal: "WhatsApp", autorId: actor, kind: "quote", titulo: `Orçamento ${q.numero} enviado — ${money(total)}`, conteudo: `${q.itens.length} itens · ${q.condicao} · validade ${q.validadeDias} dias. Enviado ${via}.${follow ? ` Follow-up agendado para ${fmtDateShort(follow.dueAt)}.` : ""}` }),
              ...get().interactions,
            ],
            audit: [auditEntry({ autorId: actor, origem: "usuario", entidade: "Orçamento", entidadeId: q.id, companyId: q.companyId, campo: "status", de: "rascunho", para: `enviado (${now.slice(0, 10)})` }), ...get().audit],
          });
        },

        // -------------------------------------------------------------------
        sendCobranca: ({ companyId, toUserId, texto }) => {
          const s = get();
          const actor = me();
          const company = s.companies.find((c) => c.id === companyId);
          const from = s.users.find((u) => u.id === actor);
          set({
            notifications: [
              { id: uid("n"), userId: toUserId, at: nowIso(), lida: false, tipo: "cobranca", deId: actor, titulo: `${from?.short ?? "Gestor"} comentou em ${company?.nome ?? "uma conta"}`, texto, link: `/empresas/${companyId}` },
              ...s.notifications,
            ],
            interactions: [interaction({ companyId, canal: "Nota", autorId: actor, kind: "cobranca", titulo: "Comentário do gestor", conteudo: texto }), ...s.interactions],
            audit: [auditEntry({ autorId: actor, origem: "usuario", entidade: "Comentário", entidadeId: companyId, companyId, campo: "cobrança", para: texto }), ...s.audit],
          });
        },

        markNotificationsRead: (userId) => {
          const s = get();
          set({ notifications: s.notifications.map((n) => (n.userId === userId ? { ...n, lida: true } : n)) });
        },

        confirmRoute: (routeId) => {
          const s = get();
          const r = s.routes.find((x) => x.id === routeId);
          if (!r) return;
          const acts: Activity[] = r.paradas.map((p, i) => ({
            id: uid("a"), companyId: p.companyId, ownerId: r.ownerId, tipo: "Visita", titulo: `Visita: ${p.objetivo}`, dueAt: new Date(new Date(r.data).getTime() + i * 2.5 * 3_600_000).toISOString(),
            prioridade: "Média", status: "pendente", origem: "regra", createdAt: nowIso(), dealId: s.deals.find((d) => d.companyId === p.companyId && d.status === "aberta")?.id,
          }));
          set({
            routes: s.routes.map((x) => (x.id === routeId ? { ...x, status: "confirmada" } : x)),
            activities: [...acts, ...s.activities],
            audit: [auditEntry({ autorId: me(), origem: "usuario", entidade: "Rota", entidadeId: routeId, campo: "status", de: "planejada", para: `confirmada (${acts.length} visitas)` }), ...s.audit],
          });
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: DATA_VERSION,
      storage: createJSONStorage(() => (USE_SUPABASE ? memoryStorage : localStorage)),
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { login, logout, resetDemo, ...rest } = s;
        const out: Record<string, unknown> = {};
        Object.entries(rest).forEach(([k, v]) => {
          if (typeof v !== "function") out[k] = v;
        });
        return out as unknown as AppState;
      },
      migrate: () => freshState() as unknown as AppState,
    },
  ),
);

export function useCurrentUser() {
  return useStore((s) => s.users.find((u) => u.id === (s.currentUserId ?? DEFAULT_USER_ID)) ?? s.users[0]);
}
