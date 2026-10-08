"use client";

// Store da demonstração. Toda a "persistência" é o localStorage do navegador; as ações abaixo
// são o contrato que depois pode ser trocado por chamadas a um backend real (ex.: Supabase).

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FIELD_LABELS, FUNNELS, getStage, isManager } from "./constants";
import { addDays, fmtDateShort, rel } from "./dates";
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
  Notification,
  Prioridade,
  Quote,
  Standby,
  Strategy,
} from "./types";
import { money, quoteTotals, uid } from "./utils";

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

export interface QuoteDraft {
  id?: string;
  companyId: string;
  dealId: string;
  itens: Quote["itens"];
  desconto: number;
  condicao: string;
  validadeDias: number;
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
  mergeIntoCompany: (existingId: string, input: NewCompanyInput) => string;
  updateCompany: (id: string, patch: Partial<Company>, origem?: AuditEntry["origem"]) => void;
  addContact: (c: Omit<Contact, "id">) => string;

  addActivity: (a: ActivityDraft) => string;
  completeActivity: (id: string, input: { resultado: string; next?: ActivityDraft }) => string | undefined;
  rescheduleActivity: (id: string, dueAt: string) => void;

  moveDeal: (
    dealId: string,
    toStageId: string,
    opts?: { checks?: Record<string, boolean>; tarefas?: ActivityDraft[]; nota?: string; origem?: AuditEntry["origem"] },
  ) => void;
  setChecklist: (dealId: string, checks: Record<string, boolean>, origem?: AuditEntry["origem"]) => void;
  winDeal: (dealId: string, input: { valor: number; obs?: string }) => { recurrenceDealId: string; posVendaId: string };
  loseDeal: (dealId: string, input: { motivo: string; obs?: string }) => void;
  setStandby: (companyId: string, s: Omit<Standby, "inicio">) => void;
  resumeStandby: (companyId: string) => void;

  addInteraction: (i: Omit<Interaction, "id" | "at"> & { at?: string }) => void;

  sendMessage: (convId: string, text: string, opts?: { nota?: boolean; attachment?: Message["attachment"] }) => void;
  receiveMessage: (convId: string, text: string) => void;
  markConversationRead: (convId: string) => void;
  setConversationSummary: (convId: string, summary: ConversationSummary) => void;
  startConversation: (companyId: string, contactId: string) => string;

  saveStrategy: (companyId: string, data: Pick<Strategy, "objetivo" | "diagnostico" | "barreira" | "estrategia" | "resultadoEsperado" | "proximaRevisao">, origem?: Strategy["origem"]) => void;
  addSuggestion: (s: Omit<AISuggestion, "id" | "createdAt" | "status">) => string;
  decideSuggestion: (id: string, decision: "aprovada" | "descartada", opts?: { criarAcoes?: boolean }) => void;

  saveQuote: (q: QuoteDraft) => string;
  sendQuote: (quoteId: string) => void;
  setQuoteStatus: (quoteId: string, status: Quote["status"]) => void;

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
  return String(v);
}

// Sem tela de login: a demo já abre como o gestor (Murilo). O seletor no topo troca de perfil.
export const DEFAULT_USER_ID = "u-murilo";

const USE_SUPABASE = process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE === "true";

function mergeById<T extends { id: string }>(server: T[] | undefined, local: T[]): T[] {
  if (!server) return local;
  const ids = new Set(server.map((row) => row.id));
  return [...server, ...local.filter((row) => !ids.has(row.id))];
}

const actorAlias = new Map<string, string>();

export function setActorAliases(map: Record<string, string>) {
  for (const [from, to] of Object.entries(map)) actorAlias.set(from, to);
}

function pushMutation(body: unknown) {
  if (!USE_SUPABASE || typeof window === "undefined") return;
  void fetch("/api/crm/mutate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

      const notifyManagers = (n: Omit<Notification, "id" | "userId" | "lida" | "at">, exceptId?: string): Notification[] =>
        get()
          .users.filter((u) => isManager(u) && u.id !== exceptId)
          .map((u) => ({ ...n, id: uid("n"), userId: u.id, lida: false, at: nowIso() }));

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
          set((s) => ({
            companies: mergeById(snapshot.companies, s.companies),
            contacts: mergeById(snapshot.contacts, s.contacts),
            deals: mergeById(snapshot.deals, s.deals),
            activities: mergeById(snapshot.activities, s.activities),
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
            status: "ativa",
            ownerId,
            createdAt: now,
            updatedAt: now,
          };
          const contacts: Contact[] = input.contacts.map((c) => ({ ...c, id: uid("ct"), companyId: id }));
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

        mergeIntoCompany: (existingId, input) => {
          const s = get();
          const actor = me();
          const existing = s.companies.find((c) => c.id === existingId);
          if (!existing) return existingId;
          const now = nowIso();
          const patch: Partial<Company> = {};
          (Object.keys(input.company) as (keyof Company)[]).forEach((k) => {
            const v = input.company[k];
            if (v !== undefined && v !== "" && v !== existing[k]) (patch as Record<string, unknown>)[k] = v;
          });
          const merged: Company = { ...existing, ...patch, status: "ativa", importadoDe: existing.importadoDe, updatedAt: now };
          const contacts: Contact[] = input.contacts.map((c) => ({ ...c, id: uid("ct"), companyId: existingId }));
          let deals = s.deals;
          let deal = s.deals.find((d) => d.companyId === existingId && d.status === "aberta");
          const ownerId = merged.ownerId;
          if (!deal) {
            deal = {
              id: uid("d"), companyId: existingId, ownerId, funnel: "aquisicao", stageId: "lead", titulo: `Prospecção — ${merged.nome}`,
              status: "aberta", probabilidade: 5, createdAt: now, stageEnteredAt: now, checklist: {}, history: [{ stageId: "lead", enteredAt: now, byId: actor }], ciclo: 1,
            };
            deals = [deal, ...deals];
          } else {
            // o registro antigo "renasce": reinicia o relógio da etapa e troca o responsável
            deals = deals.map((d) =>
              d.id === deal!.id
                ? { ...d, ownerId, titulo: `Prospecção — ${merged.nome}`, stageEnteredAt: now, history: [...d.history.map((h) => (h.leftAt ? h : { ...h, leftAt: now })), { stageId: d.stageId, enteredAt: now, byId: actor }] }
                : d,
            );
          }
          const firstAct: Activity = {
            id: uid("a"), companyId: existingId, dealId: deal.id, ownerId, status: "pendente", origem: "manual", prioridade: "Média", createdAt: now, ...input.firstActivity,
          };
          const changes = (Object.keys(patch) as (keyof Company)[])
            .filter((k) => FIELD_LABELS[k])
            .map((k) =>
              auditEntry({
                autorId: actor, origem: "usuario", entidade: "Empresa", entidadeId: existingId, companyId: existingId, campo: FIELD_LABELS[k]!,
                de: fmtField(k, existing[k], s.users, s.companies), para: fmtField(k, patch[k], s.users, s.companies),
              }),
            );
          set({
            companies: s.companies.map((c) => (c.id === existingId ? merged : c)),
            contacts: [...contacts, ...s.contacts],
            deals,
            activities: [firstAct, ...s.activities],
            conversations: input.conversationId
              ? s.conversations.map((c) => (c.id === input.conversationId ? { ...c, companyId: existingId, contactId: contacts[0]?.id, contatoNome: contacts[0]?.nome ?? c.contatoNome } : c))
              : s.conversations,
            interactions: [
              interaction({
                companyId: existingId, canal: "Sistema", autorId: actor, kind: "merge", titulo: `Registros unidos: novo cadastro incorporado ao ${existing.codigo}`,
                conteudo: `O cadastro antigo "${existing.nome}" (${existing.importadoDe ? `importado do ${existing.importadoDe}` : "existente"}) foi atualizado com os dados novos. Histórico, contatos e vínculos foram preservados.`,
              }),
              ...s.interactions,
            ],
            audit: [
              auditEntry({ autorId: actor, origem: "usuario", entidade: "Empresa", entidadeId: existingId, companyId: existingId, campo: "duplicidade", de: "cadastro novo", para: `unido a ${existing.codigo}` }),
              ...changes,
              ...s.audit,
            ],
          });
          return existingId;
        },

        updateCompany: (id, patch, origem = "usuario") => {
          const s = get();
          const actor = origem === "ia" ? "ia" : me();
          const c = s.companies.find((x) => x.id === id);
          if (!c) return;
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
          set({
            contacts: [{ ...c, id }, ...s.contacts],
            interactions: [interaction({ companyId: c.companyId, canal: "Sistema", autorId: me(), kind: "contact", titulo: `Contato adicionado: ${c.nome}`, conteudo: `${c.cargo} · ${c.papel}` }), ...s.interactions],
            audit: [auditEntry({ autorId: me(), origem: "usuario", entidade: "Contato", entidadeId: id, companyId: c.companyId, campo: "criado", para: c.nome }), ...s.audit],
          });
          pushMutation({ action: "addContact", contact: c, actorId: me() });
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

        rescheduleActivity: (id, dueAt) => {
          const s = get();
          const a = s.activities.find((x) => x.id === id);
          if (!a) return;
          set({
            activities: s.activities.map((x) => (x.id === id ? { ...x, dueAt } : x)),
            audit: [auditEntry({ autorId: me(), origem: "usuario", entidade: "Atividade", entidadeId: id, companyId: a.companyId, campo: "vencimento", de: fmtDateShort(a.dueAt), para: fmtDateShort(dueAt) }), ...s.audit],
          });
        },

        // -------------------------------------------------------------------
        moveDeal: (dealId, toStageId, opts = {}) => {
          const s = get();
          const deal = s.deals.find((d) => d.id === dealId);
          if (!deal || deal.stageId === toStageId) return;
          const actor = opts.origem === "ia" ? "ia" : me();
          const now = nowIso();
          const from = getStage(deal.funnel, deal.stageId);
          const to = getStage(deal.funnel, toStageId);
          const company = s.companies.find((c) => c.id === deal.companyId)!;
          const checks = { ...deal.checklist, ...(opts.checks ?? {}) };
          const allCriteria = FUNNELS[deal.funnel].stages.flatMap((st) => st.criterios);
          const newlyChecked = Object.entries(opts.checks ?? {}).filter(([k, v]) => v && !deal.checklist[k]);
          const updated: Deal = {
            ...deal,
            stageId: toStageId,
            stageEnteredAt: now,
            probabilidade: to.probabilidade,
            checklist: checks,
            history: [...deal.history.map((h) => (h.leftAt ? h : { ...h, leftAt: now })), { stageId: toStageId, enteredAt: now, byId: actor }],
          };
          const newActs: Activity[] = (opts.tarefas ?? []).map((t) => ({
            id: uid("a"), status: "pendente", origem: "regra", prioridade: "Média", createdAt: now, ownerId: deal.ownerId, dealId, ...t,
          }));
          const dependents = s.companies.filter((c) => c.influenciadoraId === company.id);
          const depInteractions = dependents.map((d) =>
            interaction({ companyId: d.id, canal: "IA", autorId: "ia", kind: "ai", titulo: `Conta influenciadora avançou: ${company.nome}`, conteudo: `${company.nome} passou de ${from.nome} para ${to.nome}. Condição desta conta: ${d.condicaoDependencia ?? "—"} Reavalie a estratégia.` }),
          );
          const depNotifs: Notification[] = dependents.map((d) => ({
            id: uid("n"), userId: d.ownerId, at: now, lida: false, tipo: "alerta", titulo: `Conta influenciadora avançou`,
            texto: `${company.nome} foi para ${to.nome}. Isso afeta ${d.nome}.`, link: `/empresas/${d.id}`,
          }));
          set({
            deals: s.deals.map((d) => (d.id === dealId ? updated : d)),
            activities: [...newActs, ...s.activities],
            interactions: [
              ...depInteractions,
              interaction({ companyId: deal.companyId, dealId, canal: "Sistema", autorId: actor, kind: "stage", titulo: `Etapa alterada: ${from.nome} → ${to.nome}`, conteudo: opts.nota }),
              ...s.interactions,
            ],
            notifications: [...depNotifs, ...s.notifications],
            audit: [
              auditEntry({ autorId: actor, origem: opts.origem ?? "usuario", entidade: "Oportunidade", entidadeId: dealId, companyId: deal.companyId, campo: "etapa", de: from.nome, para: to.nome }),
              ...newlyChecked.map(([k]) =>
                auditEntry({ autorId: actor, origem: opts.origem ?? "usuario", entidade: "Oportunidade", entidadeId: dealId, companyId: deal.companyId, campo: `critério: ${allCriteria.find((c) => c.id === k)?.label ?? k}`, de: "pendente", para: "cumprido" }),
              ),
              ...newActs.map((a) => auditEntry({ autorId: "sistema", origem: "automacao", entidade: "Atividade", entidadeId: a.id, companyId: deal.companyId, campo: "criada pela regra da etapa", para: a.titulo })),
              ...s.audit,
            ],
          });
        },

        setChecklist: (dealId, checks, origem = "usuario") => {
          const s = get();
          const deal = s.deals.find((d) => d.id === dealId);
          if (!deal) return;
          const allCriteria = FUNNELS[deal.funnel].stages.flatMap((st) => st.criterios);
          const changed = Object.entries(checks).filter(([k, v]) => Boolean(deal.checklist[k]) !== v);
          if (!changed.length) return;
          set({
            deals: s.deals.map((d) => (d.id === dealId ? { ...d, checklist: { ...d.checklist, ...checks } } : d)),
            audit: [
              ...changed.map(([k, v]) =>
                auditEntry({ autorId: origem === "ia" ? "ia" : me(), origem, entidade: "Oportunidade", entidadeId: dealId, companyId: deal.companyId, campo: `critério: ${allCriteria.find((c) => c.id === k)?.label ?? k}`, de: v ? "pendente" : "cumprido", para: v ? "cumprido" : "pendente" }),
              ),
              ...s.audit,
            ],
          });
        },

        winDeal: (dealId, { valor, obs }) => {
          const s = get();
          const deal = s.deals.find((d) => d.id === dealId)!;
          const company = s.companies.find((c) => c.id === deal.companyId)!;
          const actor = me();
          const now = nowIso();
          const terminal = deal.funnel === "aquisicao" ? "ganho" : "recompra";
          const from = getStage(deal.funnel, deal.stageId);
          const ciclo = deal.funnel === "aquisicao" ? 1 : deal.ciclo + 1;
          const closed: Deal = {
            ...deal, status: "ganha", stageId: terminal, closedAt: now, valorRealizado: valor, valor: deal.valor ?? valor, probabilidade: 100, stageEnteredAt: now,
            history: [...deal.history.map((h) => (h.leftAt ? h : { ...h, leftAt: now })), { stageId: terminal, enteredAt: now, byId: actor }],
          };
          const recurrenceDealId = uid("d");
          const recurrence: Deal = {
            id: recurrenceDealId, companyId: deal.companyId, ownerId: deal.ownerId, funnel: "recorrencia", stageId: "posvenda", titulo: `Recorrência — ciclo ${ciclo}`,
            status: "aberta", probabilidade: getStage("recorrencia", "posvenda").probabilidade, createdAt: now, stageEnteredAt: now, checklist: {},
            history: [{ stageId: "posvenda", enteredAt: now, byId: "sistema" }], ciclo,
          };
          const posVendaId = uid("a");
          const posVenda: Activity = {
            id: posVendaId, companyId: deal.companyId, dealId: recurrenceDealId, ownerId: deal.ownerId, tipo: "Ligação",
            titulo: "Pós-venda: confirmar entrega e aplicação", dueAt: rel(5, 10), prioridade: "Alta", status: "pendente", origem: "regra", createdAt: now,
          };
          const cancelled = s.activities.map((a) =>
            a.companyId === deal.companyId && a.status === "pendente" && a.dealId === dealId ? { ...a, status: "cancelada" as const, resultado: "Encerrada: venda ganha" } : a,
          );
          const isFirst = deal.funnel === "aquisicao";
          const seller = s.users.find((u) => u.id === deal.ownerId);
          set({
            deals: [recurrence, ...s.deals.map((d) => (d.id === dealId ? closed : d))],
            companies: s.companies.map((c) => (c.id === deal.companyId ? { ...c, status: "ativa", standby: undefined, clienteDesde: c.clienteDesde ?? now, updatedAt: now } : c)),
            quotes: s.quotes.map((q) => (q.dealId === dealId && q.status === "enviado" ? { ...q, status: "aceito" } : q)),
            activities: [posVenda, ...cancelled],
            interactions: [
              interaction({ companyId: deal.companyId, dealId: recurrenceDealId, canal: "IA", autorId: "ia", kind: "ai", titulo: "Previsão de recompra sugerida", conteudo: `Com ${company.colhedoras ?? "—"} colhedoras, o consumo estimado indica nova compra em cerca de 90 dias. A IA vai lembrar o responsável antes da janela, sem cobrar o cliente fora de hora.` }),
              interaction({ companyId: deal.companyId, dealId: recurrenceDealId, canal: "Sistema", autorId: "sistema", kind: "stage", titulo: `Conta movida para Recorrência · ciclo ${ciclo}`, conteudo: `Pós-venda criado automaticamente para ${fmtDateShort(posVenda.dueAt)}.` }),
              interaction({ companyId: deal.companyId, dealId, canal: "Sistema", autorId: actor, kind: "win", titulo: isFirst ? `Primeira venda registrada — ${money(valor)}` : `Recompra registrada — ${money(valor)} (ciclo ${deal.ciclo})`, conteudo: obs }),
              ...s.interactions,
            ],
            notifications: [
              ...notifyManagers({ tipo: "sistema", titulo: isFirst ? `Primeira venda: ${company.nome}` : `Recompra: ${company.nome}`, texto: `${seller?.short ?? "Vendedor"} fechou ${money(valor)}. Recorrência iniciada.`, link: `/empresas/${company.id}` }, actor),
              ...s.notifications,
            ],
            audit: [
              auditEntry({ autorId: "sistema", origem: "automacao", entidade: "Atividade", entidadeId: posVendaId, companyId: deal.companyId, campo: "criada pela regra de pós-venda", para: posVenda.titulo }),
              auditEntry({ autorId: "sistema", origem: "automacao", entidade: "Oportunidade", entidadeId: recurrenceDealId, companyId: deal.companyId, campo: "funil", para: `Recorrência · Pós-venda (ciclo ${ciclo})` }),
              auditEntry({ autorId: actor, origem: "usuario", entidade: "Oportunidade", entidadeId: dealId, companyId: deal.companyId, campo: "status", de: `aberta (${from.nome})`, para: `ganha — ${money(valor)}` }),
              ...s.audit,
            ],
          });
          return { recurrenceDealId, posVendaId };
        },

        loseDeal: (dealId, { motivo, obs }) => {
          const s = get();
          const deal = s.deals.find((d) => d.id === dealId)!;
          const actor = me();
          const now = nowIso();
          const from = getStage(deal.funnel, deal.stageId);
          const closed: Deal = { ...deal, status: "perdida", motivo, closedAt: now, history: deal.history.map((h) => (h.leftAt ? h : { ...h, leftAt: now })) };
          const extraDeals: Deal[] = [];
          const extraActs: Activity[] = [];
          if (deal.funnel === "recorrencia") {
            const nd: Deal = {
              id: uid("d"), companyId: deal.companyId, ownerId: deal.ownerId, funnel: "recorrencia", stageId: "relacionamento", titulo: `Recuperação — ciclo ${deal.ciclo}`,
              status: "aberta", probabilidade: 30, createdAt: now, stageEnteredAt: now, checklist: {}, history: [{ stageId: "relacionamento", enteredAt: now, byId: actor }], ciclo: deal.ciclo,
            };
            extraDeals.push(nd);
            extraActs.push({
              id: uid("a"), companyId: deal.companyId, dealId: nd.id, ownerId: deal.ownerId, tipo: "Reunião", titulo: `Plano de recuperação — motivo: ${motivo}`,
              dueAt: rel(7, 10), prioridade: "Alta", status: "pendente", origem: "regra", createdAt: now,
            });
          }
          set({
            deals: [...extraDeals, ...s.deals.map((d) => (d.id === dealId ? closed : d))],
            companies: deal.funnel === "aquisicao" ? s.companies.map((c) => (c.id === deal.companyId ? { ...c, status: "perdida", motivoPerda: motivo, updatedAt: now } : c)) : s.companies,
            activities: [
              ...extraActs,
              ...s.activities.map((a) => (a.dealId === dealId && a.status === "pendente" ? { ...a, status: "cancelada" as const, resultado: "Encerrada: oportunidade perdida" } : a)),
            ],
            quotes: s.quotes.map((q) => (q.dealId === dealId && q.status === "enviado" ? { ...q, status: "recusado" } : q)),
            interactions: [interaction({ companyId: deal.companyId, dealId, canal: "Sistema", autorId: actor, kind: "loss", titulo: `Oportunidade perdida em ${from.nome}`, conteudo: `Motivo: ${motivo}${obs ? ` — ${obs}` : ""}` }), ...s.interactions],
            audit: [auditEntry({ autorId: actor, origem: "usuario", entidade: "Oportunidade", entidadeId: dealId, companyId: deal.companyId, campo: "status", de: `aberta (${from.nome})`, para: `perdida — ${motivo}` }), ...s.audit],
          });
        },

        setStandby: (companyId, sb) => {
          const s = get();
          const actor = me();
          const now = nowIso();
          const deal = s.deals.find((d) => d.companyId === companyId && d.status === "aberta");
          const reval: Activity = {
            id: uid("a"), companyId, dealId: deal?.id, ownerId: sb.responsavelId, tipo: "Ligação", titulo: `Reavaliar conta em espera — ${sb.motivo.toLowerCase()}`,
            descricao: `Condição de retomada: ${sb.condicao}`, dueAt: sb.reavaliacao, prioridade: "Média", status: "pendente", origem: "regra", createdAt: now,
          };
          set({
            companies: s.companies.map((c) => (c.id === companyId ? { ...c, status: "espera", standby: { ...sb, inicio: now }, updatedAt: now } : c)),
            activities: [reval, ...s.activities.map((a) => (a.companyId === companyId && a.status === "pendente" ? { ...a, status: "cancelada" as const, resultado: "Encerrada: conta em espera" } : a))],
            interactions: [interaction({ companyId, dealId: deal?.id, canal: "Sistema", autorId: actor, kind: "standby", titulo: "Conta colocada em espera", conteudo: `Motivo: ${sb.motivo}. Retomada: ${sb.condicao}. Reavaliação em ${fmtDateShort(sb.reavaliacao)}.` }), ...s.interactions],
            audit: [
              auditEntry({ autorId: actor, origem: "usuario", entidade: "Empresa", entidadeId: companyId, companyId, campo: "Status", de: "ativa", para: "em espera" }),
              auditEntry({ autorId: "sistema", origem: "automacao", entidade: "Atividade", entidadeId: reval.id, companyId, campo: "criada pela regra de espera", para: reval.titulo }),
              ...s.audit,
            ],
          });
        },

        resumeStandby: (companyId) => {
          const s = get();
          const actor = me();
          const now = nowIso();
          set({
            companies: s.companies.map((c) => (c.id === companyId ? { ...c, status: "ativa", standby: undefined, updatedAt: now } : c)),
            activities: s.activities.map((a) =>
              a.companyId === companyId && a.status === "pendente" && a.titulo.startsWith("Reavaliar conta em espera") ? { ...a, status: "concluida" as const, completedAt: now, resultado: "Conta retomada" } : a,
            ),
            deals: s.deals.map((d) => (d.companyId === companyId && d.status === "aberta" ? { ...d, stageEnteredAt: now } : d)),
            interactions: [interaction({ companyId, canal: "Sistema", autorId: actor, kind: "standby", titulo: "Conta retomada — saiu da espera" }), ...s.interactions],
            audit: [auditEntry({ autorId: actor, origem: "usuario", entidade: "Empresa", entidadeId: companyId, companyId, campo: "Status", de: "em espera", para: "ativa" }), ...s.audit],
          });
        },

        addInteraction: (i) => {
          const s = get();
          set({ interactions: [interaction(i), ...s.interactions] });
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
            id, companyId, contactId, contatoNome: contact.nome, telefone: contact.whatsapp ?? "—", ownerId: company.ownerId, messages: [], unread: 0, lastAt: nowIso(),
          };
          set({ conversations: [conv, ...s.conversations] });
          return id;
        },

        // -------------------------------------------------------------------
        saveStrategy: (companyId, data, origem = "manual") => {
          const s = get();
          const actor = me();
          const prev = s.strategies.find((x) => x.companyId === companyId);
          const next: Strategy = { ...data, companyId, definidoPorId: actor, revisadaEm: nowIso(), versao: (prev?.versao ?? 0) + 1, origem };
          set({
            strategies: [next, ...s.strategies.filter((x) => x.companyId !== companyId)],
            strategyHistory: prev ? [prev, ...s.strategyHistory] : s.strategyHistory,
            interactions: [interaction({ companyId, canal: "Nota", autorId: actor, kind: "strategy", titulo: `Estratégia ${prev ? "revisada" : "definida"} (v${next.versao})`, conteudo: next.estrategia }), ...s.interactions],
            audit: [auditEntry({ autorId: actor, origem: "usuario", entidade: "Estratégia", entidadeId: companyId, companyId, campo: "estratégia", de: prev?.estrategia, para: next.estrategia }), ...s.audit],
          });
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
            get().saveStrategy(sg.companyId, {
              objetivo: d.objetivo, diagnostico: d.diagnostico, barreira: d.barreira, estrategia: d.estrategia, resultadoEsperado: d.resultadoEsperado, proximaRevisao: rel(14),
            }, "ia-aprovada");
            if (opts.criarAcoes) {
              const company = get().companies.find((c) => c.id === sg.companyId);
              d.acoes.forEach((a, i) =>
                get().addActivity({ companyId: sg.companyId, tipo: a.tipo, titulo: a.titulo, dueAt: rel(a.prazoDias, 9 + i), prioridade: i === 0 ? "Alta" : "Média", origem: "ia", ownerId: company?.ownerId }),
              );
            }
          }
        },

        // -------------------------------------------------------------------
        saveQuote: (q) => {
          const s = get();
          const actor = me();
          if (q.id) {
            set({ quotes: s.quotes.map((x) => (x.id === q.id ? { ...x, ...q, id: x.id } : x)) });
            return q.id;
          }
          const id = uid("q");
          const numero = `TW-2026-0${s.seq.quote}`;
          const quote: Quote = { ...q, id, numero, status: "rascunho", createdAt: nowIso(), autorId: actor };
          set({
            seq: { ...s.seq, quote: s.seq.quote + 1 },
            quotes: [quote, ...s.quotes],
            audit: [auditEntry({ autorId: actor, origem: "usuario", entidade: "Orçamento", entidadeId: id, companyId: q.companyId, campo: "criado", para: `${numero} (rascunho)` }), ...s.audit],
          });
          return id;
        },

        sendQuote: (quoteId) => {
          const s = get();
          const q = s.quotes.find((x) => x.id === quoteId);
          if (!q) return;
          const actor = me();
          const now = nowIso();
          const { total } = quoteTotals(q.itens, q.desconto);
          const company = s.companies.find((c) => c.id === q.companyId)!;
          const conv = s.conversations.find((c) => c.companyId === q.companyId);
          const follow: Activity = {
            id: uid("a"), companyId: q.companyId, dealId: q.dealId, ownerId: company.ownerId, tipo: "WhatsApp", titulo: `Follow-up do orçamento ${q.numero}`,
            dueAt: rel(3, 10), prioridade: "Média", status: "pendente", origem: "regra", createdAt: now,
          };
          set({
            quotes: s.quotes.map((x) => (x.id === quoteId ? { ...x, status: "enviado", enviadoEm: now, decisaoEsperada: addDays(new Date(), 5).toISOString() } : x)),
            deals: s.deals.map((d) => (d.id === q.dealId ? { ...d, valor: Math.round(total), checklist: { ...d.checklist, orcamento_enviado: true } } : d)),
            activities: [follow, ...s.activities],
            conversations: conv
              ? s.conversations.map((c) =>
                  c.id === conv.id
                    ? {
                        ...c,
                        lastAt: now,
                        messages: [
                          ...c.messages,
                          { id: uid("m"), from: "tawper", at: now, autorId: actor, text: `Segue o orçamento ${q.numero}. Qualquer dúvida estou à disposição.`, attachment: { nome: `Orcamento_${q.numero}.pdf`, tipo: "pdf", detalhe: `${money(total)} · validade ${q.validadeDias} dias` } },
                        ],
                      }
                    : c,
                )
              : s.conversations,
            interactions: [interaction({ companyId: q.companyId, dealId: q.dealId, canal: "WhatsApp", autorId: actor, kind: "quote", titulo: `Orçamento ${q.numero} enviado — ${money(total)}`, conteudo: `${q.itens.length} itens · ${q.condicao} · validade ${q.validadeDias} dias. Follow-up agendado para ${fmtDateShort(follow.dueAt)}.` }), ...s.interactions],
            audit: [
              auditEntry({ autorId: actor, origem: "usuario", entidade: "Orçamento", entidadeId: quoteId, companyId: q.companyId, campo: "status", de: "rascunho", para: "enviado" }),
              auditEntry({ autorId: "sistema", origem: "automacao", entidade: "Atividade", entidadeId: follow.id, companyId: q.companyId, campo: "criada pela regra do orçamento", para: follow.titulo }),
              ...s.audit,
            ],
          });
        },

        setQuoteStatus: (quoteId, status) => {
          const s = get();
          const q = s.quotes.find((x) => x.id === quoteId);
          if (!q) return;
          set({
            quotes: s.quotes.map((x) => (x.id === quoteId ? { ...x, status } : x)),
            audit: [auditEntry({ autorId: me(), origem: "usuario", entidade: "Orçamento", entidadeId: quoteId, companyId: q.companyId, campo: "status", de: q.status, para: status }), ...s.audit],
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
