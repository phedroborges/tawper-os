// Metas: da meta anual sai o que falta por mês, trimestre e semestre, o ranking e o caminho em atividades.

import type { ActivityTarget, AwardWeightsConfig, Goals, RecordGoalConfig } from "./config";
import type { Activity, Deal, Interaction, User } from "./types";

export type GoalPeriod = "mes" | "trimestre" | "semestre" | "ano";

export const PERIOD_LABEL: Record<GoalPeriod, string> = { mes: "Mês", trimestre: "Trimestre", semestre: "Semestre", ano: "Ano" };
const MONTHS_IN: Record<GoalPeriod, number> = { mes: 1, trimestre: 3, semestre: 6, ano: 12 };

export interface Sale {
  ownerId: string;
  valor: number;
  at: Date;
}

export function salesOf(deals: Deal[]): Sale[] {
  return deals.filter((d) => d.status === "ganha" && d.closedAt).map((d) => ({ ownerId: d.ownerId, valor: d.valorRealizado ?? d.valor ?? 0, at: new Date(d.closedAt!) }));
}

/** Início e fim (exclusivo) do período que contém `now`. */
export function periodRange(period: GoalPeriod, now: Date): { from: Date; to: Date } {
  const size = MONTHS_IN[period];
  const start = Math.floor(now.getMonth() / size) * size;
  return { from: new Date(now.getFullYear(), start, 1), to: new Date(now.getFullYear(), start + size, 1) };
}

export function sold(sales: Sale[], range: { from: Date; to: Date }, ownerId?: string) {
  return sales.filter((s) => s.at >= range.from && s.at < range.to && (!ownerId || s.ownerId === ownerId)).reduce((sum, s) => sum + s.valor, 0);
}

/** Quem tem meta de venda: vendedores, representantes e os gestores marcados como "também vendem" (ex.: o diretor). */
export function sellersOf(users: User[], participantes: string[] = []) {
  return users.filter((u) => u.role === "vendedor" || u.role === "representante" || participantes.includes(u.id));
}

/** Meta anual de uma pessoa: a que o administrador digitou; sem ela, o que sobra da meta da empresa dividido por igual. */
export function annualGoalOf(goals: Goals, sellers: User[], userId: string): number {
  const explicit = goals.porVendedor[userId];
  if (typeof explicit === "number" && explicit > 0) return explicit;
  if (!sellers.some((s) => s.id === userId)) return 0;
  const withGoal = sellers.filter((s) => (goals.porVendedor[s.id] ?? 0) > 0);
  const rest = sellers.length - withGoal.length;
  const taken = withGoal.reduce((sum, s) => sum + goals.porVendedor[s.id], 0);
  return rest > 0 ? Math.max(0, goals.anual - taken) / rest : 0;
}

/** Meta proporcional do período (anual dividida pelo número de períodos no ano). */
export function basePeriodGoal(annual: number, period: GoalPeriod): number {
  const size = MONTHS_IN[period];
  return (annual * size) / 12;
}

/**
 * Meta regressiva do período atual: o que falta no ano (descontado o que já foi vendido ANTES deste período)
 * dividido pelos períodos que restam, contando o atual. Vendeu pouco num mês, os próximos sobem sozinhos.
 */
export function periodGoal(annual: number, sales: Sale[], period: GoalPeriod, now: Date, ownerId?: string): number {
  if (period === "ano") return annual;
  const size = MONTHS_IN[period];
  const range = periodRange(period, now);
  const before = sold(sales, { from: new Date(now.getFullYear(), 0, 1), to: range.from }, ownerId);
  const left = (12 - range.from.getMonth()) / size;
  return Math.max(0, annual - before) / left;
}

/** Quanto do período já passou (0 a 1): o ritmo esperado para hoje. */
export function elapsed(range: { from: Date; to: Date }, now: Date) {
  return Math.min(1, Math.max(0, (now.getTime() - range.from.getTime()) / (range.to.getTime() - range.from.getTime())));
}

export interface RankRow {
  user: User;
  vendido: number;
  meta: number;
  pct: number;
}

/** Ranking por valor vendido no período; empate fica com quem está mais perto da própria meta. */
export function ranking(goals: Goals, users: User[], sales: Sale[], period: GoalPeriod, now: Date, useBase = false): RankRow[] {
  const sellers = sellersOf(users, goals.participantes);
  const range = periodRange(period, now);
  return users
    .map((user) => {
      const annual = annualGoalOf(goals, sellers, user.id);
      const meta = useBase ? basePeriodGoal(annual, period) : periodGoal(annual, sales, period, now, user.id);
      const vendido = sold(sales, range, user.id);
      return { user, vendido, meta, pct: meta > 0 ? (vendido / meta) * 100 : 0 };
    })
    .filter((r) => r.meta > 0 || r.vendido > 0)
    .sort((a, b) => b.vendido - a.vendido || b.pct - a.pct);
}

export interface SalesPath {
  ticketMedio: number;
  /** Vendas necessárias no mês para a meta. */
  vendas: number;
  /** Orçamentos necessários, pela taxa de orçamento que vira venda. */
  orcamentos: number;
  conversao: number;
  /** true quando não há histórico suficiente e os números são os padrões. */
  estimado: boolean;
}

const DEFAULT_TICKET = 25_000;
const DEFAULT_CONVERSION = 0.4;

/** Caminho da meta do mês em vendas e orçamentos, pelo histórico de negócios fechados. */
export function salesPath(monthlyGoal: number, deals: Deal[], ownerId?: string): SalesPath {
  const scoped = ownerId ? deals.filter((d) => d.ownerId === ownerId) : deals;
  const scopedWon = scoped.filter((d) => d.status === "ganha");
  const pool = ownerId && scopedWon.length < 3 ? deals : scoped;
  const won = pool.filter((d) => d.status === "ganha");
  const lost = pool.filter((d) => d.status === "perdida");
  const values = won.map((d) => d.valorRealizado ?? d.valor ?? 0).filter((v) => v > 0);
  const enough = values.length >= 3;
  const ticketMedio = enough ? values.reduce((a, b) => a + b, 0) / values.length : DEFAULT_TICKET;
  const conversao = won.length + lost.length >= 5 && lost.length > 0 ? won.length / (won.length + lost.length) : DEFAULT_CONVERSION;
  const vendas = monthlyGoal > 0 ? Math.ceil(monthlyGoal / ticketMedio) : 0;
  return { ticketMedio, vendas, orcamentos: Math.ceil(vendas / Math.max(conversao, 0.05)), conversao, estimado: !enough || lost.length === 0 };
}

/** Início do dia, da semana (segunda) ou do mês de `now`. */
export function targetWindowStart(por: ActivityTarget["por"], now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (por === "semana") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (por === "mes") d.setDate(1);
  return d;
}

/** Atividades do tipo concluídas pela pessoa na janela da meta (hoje, esta semana ou este mês). */
export function targetDone(target: ActivityTarget, activities: Activity[], ownerId: string, now: Date) {
  const from = targetWindowStart(target.por, now);
  return activities.filter((a) => a.ownerId === ownerId && a.tipo === target.tipo && a.status === "concluida" && a.completedAt && new Date(a.completedAt) >= from).length;
}

export const TARGET_UNIT: Record<ActivityTarget["por"], string> = { dia: "por dia", semana: "por semana", mes: "por mês" };
export const TARGET_WINDOW: Record<ActivityTarget["por"], string> = { dia: "hoje", semana: "nesta semana", mes: "neste mês" };

export const DEFAULT_RECORD_GOAL: RecordGoalConfig = { meta: 40, por: "mes" };

/** Conta dias úteis (segunda a sexta) em [from, to). */
export function workdaysInRange(from: Date, to: Date): number {
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let count = 0;
  while (cur < end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Meta de registros convertida para o período selecionado (`mes`, `trimestre`, `semestre`, `ano`). */
export function recordGoalForSeller(goals: Goals | null | undefined, sellerId: string, period: GoalPeriod, now: Date): { meta: number; custom: boolean; cfg: RecordGoalConfig } {
  const cfg = goals?.registros && goals.registros.meta > 0 ? goals.registros : DEFAULT_RECORD_GOAL;
  const override = cfg.porVendedor?.[sellerId];
  const base = typeof override === "number" && override > 0 ? override : cfg.meta;
  const range = periodRange(period, now);
  const workdays = Math.max(1, workdaysInRange(range.from, range.to));
  const size = MONTHS_IN[period];
  let meta = base;
  if (cfg.por === "dia") meta = Math.round(base * workdays);
  else if (cfg.por === "semana") meta = Math.round(base * (workdays / 5));
  else meta = Math.round(base * size);
  return { meta: Math.max(1, meta), custom: typeof override === "number" && override > 0, cfg };
}

/** Registros comerciais realizados por um vendedor no período (atividades concluídas + relatos no histórico, excluindo cobrança de gestor). */
export function sellerRecordsDone(activities: Activity[], interactions: Interaction[], sellerId: string, range: { from: Date; to: Date }): number {
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const actCount = activities.filter((a) => {
    if (a.ownerId !== sellerId || a.status !== "concluida") return false;
    const stamp = a.completedAt ?? a.dueAt;
    const t = new Date(stamp).getTime();
    return t >= fromMs && t < toMs;
  }).length;
  const intCount = interactions.filter((i) => {
    if (i.autorId !== sellerId || i.kind === "cobranca") return false;
    const t = new Date(i.at).getTime();
    return t >= fromMs && t < toMs;
  }).length;
  return actCount + intCount;
}

export interface RecordRegressionPace {
  done: number;
  target: number;
  pct: number;
  expectedToday: number;
  paceGap: number;
  missing: number;
  remainingWorkdays: number;
  basePerWorkday: number;
  neededPerWorkday: number;
  status: "batida" | "no_ritmo" | "atrasado";
}

/**
 * Regressão da meta de registros: compara o realizado até hoje com o ritmo esperado nos dias úteis
 * decorridos e recalcula quantos registros por dia útil restante são necessários para fechar o período.
 */
export function recordRegressionPace(done: number, target: number, range: { from: Date; to: Date }, now: Date): RecordRegressionPace {
  const totalWorkdays = Math.max(1, workdaysInRange(range.from, range.to));
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsedEnd = todayStart < range.from ? range.from : todayStart > range.to ? range.to : new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);
  const elapsedWorkdays = Math.min(totalWorkdays, workdaysInRange(range.from, elapsedEnd));
  const remainingStart = todayStart < range.from ? range.from : todayStart;
  const remainingWorkdays = Math.max(1, workdaysInRange(remainingStart, range.to));

  const safeTarget = Math.max(1, target);
  const pct = (done / safeTarget) * 100;
  const expectedToday = Math.round((safeTarget * elapsedWorkdays) / totalWorkdays);
  const paceGap = done - expectedToday;
  const missing = Math.max(0, safeTarget - done);
  const basePerWorkday = Number((safeTarget / totalWorkdays).toFixed(1));
  const neededPerWorkday = Number((missing / remainingWorkdays).toFixed(1));
  const status: RecordRegressionPace["status"] = done >= safeTarget ? "batida" : done >= expectedToday ? "no_ritmo" : "atrasado";

  return {
    done,
    target: safeTarget,
    pct,
    expectedToday,
    paceGap,
    missing,
    remainingWorkdays,
    basePerWorkday,
    neededPerWorkday,
    status,
  };
}

export const DEFAULT_AWARD_CONFIG: AwardWeightsConfig = {
  pesoVendas: 40,
  pesoAtividades: 20,
  pesoRegistros: 20,
  pesoQualidadeIA: 20,
  metaQualidadeIA: 80,
  metaConversasWhatsApp: 15,
  metaPontualidade: 80,
  premioDescricao: "Premiação Integral Tawper (Vendas + Execução + Registros + Qualidade IA)",
};

export interface SellerIaSnapshot {
  whatsappGravados: number;
  /** Média de clareza dos pedidos à IA (0..100) ou null se não houve pedidos auditados. */
  qualidadeMedia: number | null;
}

export interface MultidimensionalRankRow {
  user: User;
  vendido: number;
  metaVenda: number;
  vendasScore: number;
  atividadesConcluidas: number;
  pontualidadePct: number;
  atividadesScore: number;
  registrosFeitos: number;
  metaRegistros: number;
  registrosScore: number;
  whatsappGravados: number;
  qualidadeIaPct: number | null;
  qualidadeIaScore: number;
  scoreGeral: number;
  elegivelPremio: boolean;
}

function clamp100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Ranking multidimensional de metas e premiação:
 * combina Vendas, Atividades + Pontualidade, Registros no CRM e Conversas/Qualidade com a IA.
 */
export function multidimensionalRanking(params: {
  goals: Goals;
  users: User[];
  sales: Sale[];
  activities: Activity[];
  interactions: Interaction[];
  iaByUser?: Record<string, SellerIaSnapshot>;
  period: GoalPeriod;
  now: Date;
}): MultidimensionalRankRow[] {
  const { goals, users, sales, activities, interactions, iaByUser = {}, period, now } = params;
  const cfg: AwardWeightsConfig = { ...DEFAULT_AWARD_CONFIG, ...(goals.premiacao ?? {}) };
  const totalWeight = Math.max(1, cfg.pesoVendas + cfg.pesoAtividades + cfg.pesoRegistros + cfg.pesoQualidadeIA);
  const sellers = sellersOf(users, goals.participantes);
  const range = periodRange(period, now);
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const monthsScale = MONTHS_IN[period];

  const expectedActivitiesBase = Math.max(
    1,
    goals.atividades.reduce((sum, t) => {
      if (t.por === "dia") return sum + t.quantidade * 20 * monthsScale;
      if (t.por === "semana") return sum + t.quantidade * 4 * monthsScale;
      return sum + t.quantidade * monthsScale;
    }, 0) || 20 * monthsScale,
  );
  const expectedWhatsapp = Math.max(1, cfg.metaConversasWhatsApp * monthsScale);

  return sellers
    .map((user) => {
      const annual = annualGoalOf(goals, sellers, user.id);
      const metaVenda = basePeriodGoal(annual, period);
      const vendido = sold(sales, range, user.id);
      const vendasScore = metaVenda > 0 ? clamp100((vendido / metaVenda) * 100) : vendido > 0 ? 100 : 0;

      const userDoneActs = activities.filter((a) => {
        if (a.ownerId !== user.id || a.status !== "concluida") return false;
        const stamp = new Date(a.completedAt ?? a.dueAt).getTime();
        return stamp >= fromMs && stamp < toMs;
      });
      const onTimeActs = userDoneActs.filter((a) => {
        if (!a.completedAt) return true;
        return new Date(a.completedAt).getTime() <= new Date(a.dueAt).getTime();
      }).length;
      const pontualidadePct = userDoneActs.length > 0 ? Math.round((onTimeActs / userDoneActs.length) * 100) : 0;
      const actVolumeScore = clamp100((userDoneActs.length / expectedActivitiesBase) * 100);
      const atividadesScore = clamp100(actVolumeScore * 0.6 + pontualidadePct * 0.4);

      const registrosFeitos = sellerRecordsDone(activities, interactions, user.id, range);
      const metaRegistros = recordGoalForSeller(goals, user.id, period, now).meta;
      const registrosScore = clamp100((registrosFeitos / Math.max(1, metaRegistros)) * 100);

      const ia = iaByUser[user.id];
      const whatsappGravados = ia?.whatsappGravados ?? 0;
      const qualidadeIaPct = ia?.qualidadeMedia ?? null;
      const waVolumeScore = clamp100((whatsappGravados / expectedWhatsapp) * 100);
      const qualidadeIaScore =
        qualidadeIaPct !== null ? clamp100(qualidadeIaPct * 0.65 + waVolumeScore * 0.35) : waVolumeScore;

      const scoreGeral = Math.round(
        (vendasScore * cfg.pesoVendas +
          atividadesScore * cfg.pesoAtividades +
          registrosScore * cfg.pesoRegistros +
          qualidadeIaScore * cfg.pesoQualidadeIA) /
          totalWeight,
      );

      const elegivelPremio =
        scoreGeral >= 70 &&
        (userDoneActs.length === 0 || pontualidadePct >= cfg.metaPontualidade * 0.8) &&
        (qualidadeIaPct === null || qualidadeIaPct >= cfg.metaQualidadeIA * 0.8);

      return {
        user,
        vendido,
        metaVenda,
        vendasScore,
        atividadesConcluidas: userDoneActs.length,
        pontualidadePct,
        atividadesScore,
        registrosFeitos,
        metaRegistros,
        registrosScore,
        whatsappGravados,
        qualidadeIaPct,
        qualidadeIaScore,
        scoreGeral,
        elegivelPremio,
      };
    })
    .sort((a, b) => b.scoreGeral - a.scoreGeral || b.vendido - a.vendido);
}

/**
 * Matriz diária (últimos `days` dias) de ações por vendedor (atividades concluídas + registros),
 * pronta para alimentar o gráfico de pontinhos (DotMatrixChart).
 */
export function sellerDailyActivityMatrix(params: {
  sellers: User[];
  activities: Activity[];
  interactions: Interaction[];
  now: Date;
  days?: number;
}) {
  const { sellers, activities, interactions, now, days = 14 } = params;
  const dayBuckets: { key: string; label: string; from: number; to: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const key = d.toISOString().slice(0, 10);
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    dayBuckets.push({ key, label, from: d.getTime(), to: next.getTime() });
  }

  return sellers.map((seller) => {
    let total = 0;
    const cells = dayBuckets.map((b) => {
      const actCount = activities.filter((a) => {
        if (a.ownerId !== seller.id || a.status !== "concluida") return false;
        const t = new Date(a.completedAt ?? a.dueAt).getTime();
        return t >= b.from && t < b.to;
      }).length;
      const intCount = interactions.filter((i) => {
        if (i.autorId !== seller.id || i.kind === "cobranca") return false;
        const t = new Date(i.at).getTime();
        return t >= b.from && t < b.to;
      }).length;
      const value = actCount + intCount;
      total += value;
      return { key: b.key, label: b.label, value };
    });
    return {
      key: seller.id,
      label: seller.short || seller.name.split(" ")[0],
      total,
      cells,
    };
  });
}
