// Metas: da meta anual sai o que falta por mês, trimestre e semestre, o ranking e o caminho em atividades.

import type { ActivityTarget, Goals } from "./config";
import type { Activity, Deal, User } from "./types";

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
export function ranking(goals: Goals, users: User[], sales: Sale[], period: GoalPeriod, now: Date): RankRow[] {
  const sellers = sellersOf(users, goals.participantes);
  const range = periodRange(period, now);
  return users
    .map((user) => {
      const meta = periodGoal(annualGoalOf(goals, sellers, user.id), sales, period, now, user.id);
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
export function salesPath(monthlyGoal: number, deals: Deal[]): SalesPath {
  const won = deals.filter((d) => d.status === "ganha");
  const lost = deals.filter((d) => d.status === "perdida");
  const values = won.map((d) => d.valorRealizado ?? d.valor ?? 0).filter((v) => v > 0);
  const enough = values.length >= 3;
  const ticketMedio = enough ? values.reduce((a, b) => a + b, 0) / values.length : DEFAULT_TICKET;
  const conversao = won.length + lost.length >= 5 ? won.length / (won.length + lost.length) : DEFAULT_CONVERSION;
  const vendas = monthlyGoal > 0 ? Math.ceil(monthlyGoal / ticketMedio) : 0;
  return { ticketMedio, vendas, orcamentos: Math.ceil(vendas / Math.max(conversao, 0.05)), conversao, estimado: !enough };
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
