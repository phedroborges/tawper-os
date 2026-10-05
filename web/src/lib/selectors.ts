// Regras de negócio derivadas (RN-01 a RN-08): próximo passo, estagnação, qualidade cadastral,
// alertas e indicadores. Funções puras sobre os dados — reutilizáveis com um backend real.

import { FUNNELS, getStage, isManager, type StageDef } from "./constants";
import { dayDiff, daysSince, dueState } from "./dates";
import type { Activity, Company, Deal, DemoData, Interaction, Quote, User } from "./types";
import { quoteTotals } from "./utils";

export type Data = Pick<
  DemoData,
  "companies" | "contacts" | "deals" | "activities" | "interactions" | "quotes" | "suggestions" | "strategies" | "users" | "conversations"
>;

export const byDueAsc = (a: Activity, b: Activity) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();

export function openDealOf(d: Data, companyId: string): Deal | undefined {
  return d.deals
    .filter((x) => x.companyId === companyId && x.status === "aberta")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export function currentDealOf(d: Data, companyId: string): Deal | undefined {
  return (
    openDealOf(d, companyId) ??
    d.deals.filter((x) => x.companyId === companyId).sort((a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime())[0]
  );
}

export function pendingOf(d: Data, companyId: string) {
  return d.activities.filter((a) => a.companyId === companyId && a.status === "pendente").sort(byDueAsc);
}

export function nextStepOf(d: Data, companyId: string) {
  return pendingOf(d, companyId)[0];
}

export function daysInStage(deal: Deal, now = new Date()) {
  return daysSince(deal.stageEnteredAt, now);
}

export function stageOf(deal: Deal): StageDef {
  return getStage(deal.funnel, deal.stageId);
}

export function isStagnant(deal: Deal, now = new Date()) {
  const st = stageOf(deal);
  return deal.status === "aberta" && !st.terminal && st.limiteDias > 0 && daysInStage(deal, now) > st.limiteDias;
}

export function stagnationLevel(deal: Deal, now = new Date()): "ok" | "atencao" | "estagnada" {
  const st = stageOf(deal);
  if (st.terminal || !st.limiteDias) return "ok";
  const d = daysInStage(deal, now);
  if (d > st.limiteDias) return "estagnada";
  if (d >= st.limiteDias * 0.75) return "atencao";
  return "ok";
}

export function lastInteractionAt(d: Data, companyId: string) {
  const times = [
    ...d.interactions.filter((i) => i.companyId === companyId && i.kind !== "ai").map((i) => i.at),
    ...d.activities.filter((a) => a.companyId === companyId && a.status === "concluida" && a.completedAt).map((a) => a.completedAt!),
  ];
  return times.sort().at(-1);
}

// ---------------------------------------------------------------------------
// Qualidade cadastral
// ---------------------------------------------------------------------------
export function qualityOf(d: Data, c: Company) {
  const contacts = d.contacts.filter((x) => x.companyId === c.id && x.ativo);
  const checks: [string, boolean][] = [
    ["CNPJ", Boolean(c.cnpj)],
    ["Cidade/UF", Boolean(c.cidade && c.uf)],
    ["Região", Boolean(c.regiao)],
    ["Ramo", Boolean(c.ramo)],
    ["Nº de colhedoras", Boolean(c.colhedoras)],
    ["Tipo de prensa", Boolean(c.prensa)],
    ["Marca atual", Boolean(c.marcaAtual)],
    ["Potencial", Boolean(c.potencial)],
    ["Contato decisor ou comprador", contacts.some((x) => x.papel === "Decisor" || x.papel === "Comprador")],
    ["Contato técnico", contacts.some((x) => x.papel === "Técnico" || x.papel === "Mecânico")],
    ["WhatsApp de contato", contacts.some((x) => Boolean(x.whatsapp))],
  ];
  const ok = checks.filter(([, v]) => v).length;
  return { score: Math.round((ok / checks.length) * 100), missing: checks.filter(([, v]) => !v).map(([k]) => k) };
}

// ---------------------------------------------------------------------------
// Critérios de etapa (RN-03)
// ---------------------------------------------------------------------------
export function criterionMet(d: Data, deal: Deal, c: Company, crit: StageDef["criterios"][number]) {
  switch (crit.kind) {
    case "field": {
      if (crit.field === "cidade") return Boolean(c.cidade && c.uf);
      const v = crit.field ? c[crit.field] : undefined;
      return v !== undefined && v !== null && v !== "" && v !== 0;
    }
    case "contact":
      return d.contacts.some((x) => x.companyId === c.id && x.ativo);
    case "quote":
      return d.quotes.some((q) => q.dealId === deal.id && (q.status === "enviado" || q.status === "aceito"));
    case "check":
    default:
      return Boolean(deal.checklist[crit.id]);
  }
}

export function missingCriteria(d: Data, deal: Deal, c: Company) {
  return stageOf(deal).criterios.filter((cr) => !criterionMet(d, deal, c, cr));
}

// ---------------------------------------------------------------------------
// Visibilidade por perfil
// ---------------------------------------------------------------------------
export function canSeeCompany(user: User | undefined, c: Company) {
  if (!user) return false;
  if (isManager(user)) return true;
  return c.ownerId === user.id;
}

export function visibleCompanies(d: Data, user: User | undefined) {
  return d.companies.filter((c) => canSeeCompany(user, c));
}

// ---------------------------------------------------------------------------
// Alertas (gestão por exceção)
// ---------------------------------------------------------------------------
export type AlertType =
  | "atraso"
  | "sem_proximo_passo"
  | "estagnacao"
  | "dados"
  | "recorrencia"
  | "espera_vencida"
  | "orcamento"
  | "sugestao"
  | "dependencia";

export interface Alert {
  id: string;
  tipo: AlertType;
  severidade: "alta" | "media" | "baixa";
  companyId: string;
  ownerId: string;
  titulo: string;
  texto: string;
  activityId?: string;
}

export const ALERT_LABEL: Record<AlertType, string> = {
  atraso: "Atraso",
  sem_proximo_passo: "Sem próximo passo",
  estagnacao: "Estagnação",
  dados: "Dados incompletos",
  recorrencia: "Recorrência",
  espera_vencida: "Espera vencida",
  orcamento: "Orçamento",
  sugestao: "Sugestão da IA",
  dependencia: "Dependência",
};

export function quoteExpiresAt(q: Quote) {
  const base = q.enviadoEm ?? q.createdAt;
  return new Date(new Date(base).getTime() + q.validadeDias * 86_400_000).toISOString();
}

export function alertsOf(d: Data, opts: { ownerId?: string; now?: Date } = {}): Alert[] {
  const now = opts.now ?? new Date();
  const out: Alert[] = [];
  const companies = d.companies.filter((c) => (c.status === "ativa" || c.status === "espera") && (!opts.ownerId || c.ownerId === opts.ownerId));
  const ids = new Set(companies.map((c) => c.id));
  const byId = new Map(companies.map((c) => [c.id, c]));

  d.activities
    .filter((a) => a.status === "pendente" && ids.has(a.companyId) && dueState(a.dueAt, now) === "atrasada")
    .forEach((a) => {
      const late = -dayDiff(a.dueAt, now);
      out.push({
        id: `al-atr-${a.id}`, tipo: "atraso", severidade: late >= 3 || a.prioridade === "Alta" ? "alta" : "media", companyId: a.companyId, ownerId: a.ownerId,
        titulo: `${a.titulo}`, texto: `Vencida há ${late} ${late === 1 ? "dia" : "dias"}`, activityId: a.id,
      });
    });

  companies.forEach((c) => {
    const deal = openDealOf(d, c.id);
    const pend = pendingOf(d, c.id);
    if (c.status === "ativa" && deal && pend.length === 0) {
      out.push({ id: `al-snp-${c.id}`, tipo: "sem_proximo_passo", severidade: "alta", companyId: c.id, ownerId: c.ownerId, titulo: "Conta ativa sem próximo passo", texto: `${stageOf(deal).nome} · nenhuma atividade aberta` });
    }
    if (deal && c.status === "ativa" && isStagnant(deal, now)) {
      const days = daysInStage(deal, now);
      const inf = c.influenciadoraId ? byId.get(c.influenciadoraId) ?? d.companies.find((x) => x.id === c.influenciadoraId) : undefined;
      if (inf) {
        out.push({ id: `al-dep-${c.id}`, tipo: "dependencia", severidade: "baixa", companyId: c.id, ownerId: c.ownerId, titulo: `Aguardando ${inf.nome}`, texto: `${days} dias em ${stageOf(deal).nome} — cobrança suspensa por dependência` });
      } else {
        out.push({ id: `al-est-${c.id}`, tipo: "estagnacao", severidade: days > stageOf(deal).limiteDias * 1.5 ? "alta" : "media", companyId: c.id, ownerId: c.ownerId, titulo: `Parada em ${stageOf(deal).nome}`, texto: `${days} dias na etapa (limite ${stageOf(deal).limiteDias})` });
      }
    }
    const q = qualityOf(d, c);
    if (q.score < 60) {
      out.push({ id: `al-dad-${c.id}`, tipo: "dados", severidade: "baixa", companyId: c.id, ownerId: c.ownerId, titulo: "Cadastro incompleto", texto: `${q.score}% · falta ${q.missing.slice(0, 3).join(", ").toLowerCase()}` });
    }
    if (c.status === "espera" && c.standby && dayDiff(c.standby.reavaliacao, now) < 0) {
      out.push({ id: `al-esp-${c.id}`, tipo: "espera_vencida", severidade: "media", companyId: c.id, ownerId: c.ownerId, titulo: "Data de reavaliação passou", texto: c.standby.motivo });
    }
    if (deal?.funnel === "recorrencia" && deal.stageId === "previsao" && deal.previsaoFechamento && dayDiff(deal.previsaoFechamento, now) < 0) {
      const lastWin = d.deals.filter((x) => x.companyId === c.id && x.status === "ganha").map((x) => x.closedAt!).sort().at(-1);
      out.push({
        id: `al-rec-${c.id}`, tipo: "recorrencia", severidade: "alta", companyId: c.id, ownerId: c.ownerId, titulo: "Recorrente sem compra",
        texto: `Janela prevista passou há ${-dayDiff(deal.previsaoFechamento, now)} dias${lastWin ? ` · último pedido há ${daysSince(lastWin, now)} dias` : ""}`,
      });
    }
  });

  d.quotes
    .filter((q) => q.status === "enviado" && ids.has(q.companyId))
    .forEach((q) => {
      const deal = d.deals.find((x) => x.id === q.dealId);
      if (!deal || deal.status !== "aberta") return;
      const left = dayDiff(quoteExpiresAt(q), now);
      if (left < 0) {
        out.push({ id: `al-orc-${q.id}`, tipo: "orcamento", severidade: "media", companyId: q.companyId, ownerId: deal.ownerId, titulo: `Orçamento ${q.numero} vencido`, texto: `Venceu há ${-left} dias sem decisão` });
      } else if (left <= 5) {
        out.push({ id: `al-orc-${q.id}`, tipo: "orcamento", severidade: "media", companyId: q.companyId, ownerId: deal.ownerId, titulo: `Orçamento ${q.numero} vence em ${left} ${left === 1 ? "dia" : "dias"}`, texto: "Sem retorno do cliente" });
      }
    });

  d.suggestions
    .filter((s) => s.status === "pendente" && ids.has(s.companyId))
    .forEach((s) => {
      const c = byId.get(s.companyId)!;
      out.push({ id: `al-sug-${s.id}`, tipo: "sugestao", severidade: "media", companyId: s.companyId, ownerId: c.ownerId, titulo: s.titulo, texto: "Sugestão estratégica aguardando aprovação" });
    });

  const sev = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => sev[a.severidade] - sev[b.severidade]);
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------
export interface TimelineItem {
  id: string;
  at: string;
  source: "interaction" | "activity";
  interaction?: Interaction;
  activity?: Activity;
}

export function timelineOf(d: Data, companyId: string): TimelineItem[] {
  const items: TimelineItem[] = [
    ...d.interactions.filter((i) => i.companyId === companyId).map((i) => ({ id: i.id, at: i.at, source: "interaction" as const, interaction: i })),
    ...d.activities
      .filter((a) => a.companyId === companyId && a.status === "concluida" && a.completedAt)
      .map((a) => ({ id: a.id, at: a.completedAt!, source: "activity" as const, activity: a })),
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// ---------------------------------------------------------------------------
// Indicadores (RN-08: todo número abre os registros que o compõem)
// ---------------------------------------------------------------------------
export interface Metric {
  key: string;
  label: string;
  value: string;
  sub?: string;
  companyIds: string[];
  tone?: "neutral" | "bad" | "good" | "warn";
}

export function dealValue(deal: Deal) {
  return deal.valorRealizado ?? deal.valor ?? 0;
}

const NEGOTIATION_STAGES = new Set(["orcamento", "negociacao", "orcamento_r"]);

export function executionRate(d: Data, ownerId: string | undefined, now = new Date(), days = 30) {
  const from = now.getTime() - days * 86_400_000;
  const due = d.activities.filter(
    (a) => a.status !== "cancelada" && (!ownerId || a.ownerId === ownerId) && new Date(a.dueAt).getTime() >= from && dayDiff(a.dueAt, now) < 0,
  );
  const onTime = due.filter((a) => a.status === "concluida" && a.completedAt && dayDiff(a.completedAt, a.dueAt) <= 0);
  return { rate: due.length ? onTime.length / due.length : 1, onTime: onTime.length, total: due.length };
}

export function computeMetrics(d: Data, opts: { ownerId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const scope = (c: Company) => !opts.ownerId || c.ownerId === opts.ownerId;
  const active = d.companies.filter((c) => (c.status === "ativa" || c.status === "espera") && scope(c));
  const activeIds = new Set(active.map((c) => c.id));
  const al = alertsOf(d, { ownerId: opts.ownerId, now });
  const idsOf = (t: Alert["tipo"]) => Array.from(new Set(al.filter((a) => a.tipo === t).map((a) => a.companyId)));
  const overdue = al.filter((a) => a.tipo === "atraso");
  const openDeals = d.deals.filter((x) => x.status === "aberta" && activeIds.has(x.companyId));
  const negotiating = openDeals.filter((x) => NEGOTIATION_STAGES.has(x.stageId));
  const since30 = now.getTime() - 30 * 86_400_000;
  const since90 = now.getTime() - 90 * 86_400_000;
  const inScope = (x: Deal) => {
    const c = d.companies.find((cc) => cc.id === x.companyId);
    return c ? scope(c) : false;
  };
  const won30 = d.deals.filter((x) => x.status === "ganha" && x.closedAt && new Date(x.closedAt).getTime() >= since30 && inScope(x));
  const lost30 = d.deals.filter((x) => x.status === "perdida" && x.closedAt && new Date(x.closedAt).getTime() >= since30 && inScope(x));
  const won90 = d.deals.filter((x) => x.status === "ganha" && x.closedAt && new Date(x.closedAt).getTime() >= since90 && inScope(x));
  const lost90 = d.deals.filter((x) => x.status === "perdida" && x.closedAt && new Date(x.closedAt).getTime() >= since90 && inScope(x));
  const openQuotes = d.quotes.filter((q) => q.status === "enviado" && activeIds.has(q.companyId) && openDeals.some((x) => x.id === q.dealId));
  const exec = executionRate(d, opts.ownerId, now);
  const done30 = d.activities.filter((a) => a.status === "concluida" && a.completedAt && new Date(a.completedAt).getTime() >= since30 && (!opts.ownerId || a.ownerId === opts.ownerId));
  const sum = (xs: Deal[]) => xs.reduce((acc, x) => acc + dealValue(x), 0);
  const uniq = (xs: string[]) => Array.from(new Set(xs));

  const metrics: Record<string, Metric> = {
    ativas: { key: "ativas", label: "Contas ativas", value: String(active.length), sub: `${active.filter((c) => c.status === "espera").length} em espera`, companyIds: active.map((c) => c.id) },
    semProximo: { key: "semProximo", label: "Sem próximo passo", value: String(idsOf("sem_proximo_passo").length), sub: "sem ação definida", companyIds: idsOf("sem_proximo_passo"), tone: idsOf("sem_proximo_passo").length ? "bad" : "good" },
    atrasadas: { key: "atrasadas", label: "Tarefas atrasadas", value: String(overdue.length), sub: `${uniq(overdue.map((a) => a.companyId)).length} contas`, companyIds: uniq(overdue.map((a) => a.companyId)), tone: overdue.length ? "bad" : "good" },
    estagnadas: { key: "estagnadas", label: "Contas estagnadas", value: String(idsOf("estagnacao").length), sub: "acima do limite", companyIds: idsOf("estagnacao"), tone: idsOf("estagnacao").length ? "warn" : "good" },
    propostas: { key: "propostas", label: "Propostas abertas", value: String(openQuotes.length), sub: `R$ ${Math.round(openQuotes.reduce((acc, q) => acc + quoteTotals(q.itens, q.desconto).total, 0) / 1000)} mil`, companyIds: uniq(openQuotes.map((q) => q.companyId)) },
    negociacao: { key: "negociacao", label: "Em orçamento/negociação", value: `R$ ${Math.round(sum(negotiating) / 1000)} mil`, sub: `${negotiating.length} oportunidades`, companyIds: uniq(negotiating.map((x) => x.companyId)) },
    ganhos: { key: "ganhos", label: "Ganhos (30d)", value: String(won30.length), sub: `R$ ${Math.round(sum(won30) / 1000)} mil`, companyIds: uniq(won30.map((x) => x.companyId)), tone: "good" },
    perdas: { key: "perdas", label: "Perdas (30d)", value: String(lost30.length), sub: lost30[0]?.motivo?.split(" — ")[0] ?? "—", companyIds: uniq(lost30.map((x) => x.companyId)) },
    conversao: { key: "conversao", label: "Conversão 90d", value: `${won90.length + lost90.length ? Math.round((won90.length / (won90.length + lost90.length)) * 100) : 0}%`, sub: `${won90.length} ganhas / ${won90.length + lost90.length} encerradas`, companyIds: uniq([...won90, ...lost90].map((x) => x.companyId)) },
    execucao: { key: "execucao", label: "Execução", value: `${Math.round(exec.rate * 100)}%`, sub: `${exec.onTime} de ${exec.total} no prazo`, companyIds: [], tone: exec.rate >= 0.8 ? "good" : exec.rate >= 0.6 ? "warn" : "bad" },
    feitas: { key: "feitas", label: "Feitas (30d)", value: String(done30.length), companyIds: uniq(done30.map((a) => a.companyId)) },
    recorrencia: { key: "recorrencia", label: "Sem recompra", value: String(idsOf("recorrencia").length), sub: "passou da janela", companyIds: idsOf("recorrencia"), tone: idsOf("recorrencia").length ? "warn" : "good" },
    dados: { key: "dados", label: "Cadastro incompleto", value: String(idsOf("dados").length), sub: "faltam dados", companyIds: idsOf("dados") },
  };
  return metrics;
}

export function stageDistribution(d: Data, funnel: "aquisicao" | "recorrencia", opts: { ownerId?: string } = {}) {
  const stages = FUNNELS[funnel].stages.filter((s) => !s.terminal);
  return stages.map((st) => {
    const deals = d.deals.filter((x) => {
      if (x.status !== "aberta" || x.funnel !== funnel || x.stageId !== st.id) return false;
      const c = d.companies.find((cc) => cc.id === x.companyId);
      return c && (c.status === "ativa" || c.status === "espera") && (!opts.ownerId || c.ownerId === opts.ownerId);
    });
    return { stage: st, count: deals.length, valor: deals.reduce((a, x) => a + (x.valor ?? 0), 0), companyIds: deals.map((x) => x.companyId) };
  });
}

/** Tempo médio por etapa com base nas passagens já concluídas (entrada → saída). */
export function avgTimeByStage(d: Data, funnel: "aquisicao" | "recorrencia") {
  const acc = new Map<string, { total: number; n: number }>();
  d.deals
    .filter((x) => x.funnel === funnel)
    .forEach((x) =>
      x.history.forEach((h) => {
        if (!h.leftAt) return;
        const days = (new Date(h.leftAt).getTime() - new Date(h.enteredAt).getTime()) / 86_400_000;
        const cur = acc.get(h.stageId) ?? { total: 0, n: 0 };
        acc.set(h.stageId, { total: cur.total + days, n: cur.n + 1 });
      }),
    );
  return FUNNELS[funnel].stages
    .filter((s) => !s.terminal)
    .map((s) => {
      const v = acc.get(s.id);
      return { stage: s, media: v ? Math.round(v.total / v.n) : 0, amostras: v?.n ?? 0 };
    });
}

export function sellerStats(d: Data, now = new Date()) {
  const since30 = now.getTime() - 30 * 86_400_000;
  return d.users
    .filter((u) => u.role === "vendedor" || u.role === "admin")
    .map((u) => {
      const companies = d.companies.filter((c) => c.ownerId === u.id && (c.status === "ativa" || c.status === "espera"));
      const al = alertsOf(d, { ownerId: u.id, now });
      const exec = executionRate(d, u.id, now);
      const done = d.activities.filter((a) => a.ownerId === u.id && a.status === "concluida" && a.completedAt && new Date(a.completedAt).getTime() >= since30).length;
      const advances = d.deals
        .filter((x) => x.ownerId === u.id)
        .reduce((acc, x) => acc + x.history.filter((h, i) => i > 0 && new Date(h.enteredAt).getTime() >= since30).length, 0);
      const won = d.deals.filter((x) => x.ownerId === u.id && x.status === "ganha" && x.closedAt && new Date(x.closedAt).getTime() >= since30);
      return {
        user: u,
        contas: companies.length,
        feitas: done,
        execucao: exec,
        avancos: advances,
        ganhos: won.length,
        valorGanho: won.reduce((a, x) => a + dealValue(x), 0),
        atrasadas: al.filter((a) => a.tipo === "atraso").length,
        semProximo: al.filter((a) => a.tipo === "sem_proximo_passo").length,
        estagnadas: al.filter((a) => a.tipo === "estagnacao").length,
      };
    });
}
