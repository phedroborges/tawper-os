// Painel: recorte dos dados pelos filtros e os números de detalhe (quem atua, quem atrasa, quem registra).

import { dayDiff, inPeriod, type Period } from "./dates";
import { dealValue, type Data } from "./selectors";
import type { Activity, Deal, User } from "./types";

export interface DashFilter {
  ownerId?: string;
  companyId?: string;
  /** Faixa do valor negociado (negócio aberto ou venda), em reais. */
  valorMin?: number;
  valorMax?: number;
}

/** Aplica os filtros uma vez; todos os indicadores e gráficos leem o mesmo recorte. */
export function scopeData<T extends Data>(d: T, f: DashFilter): T {
  const hasRange = f.valorMin !== undefined || f.valorMax !== undefined;
  const inRange = (deal: Deal) => {
    const v = dealValue(deal);
    return (f.valorMin === undefined || v >= f.valorMin) && (f.valorMax === undefined || v <= f.valorMax);
  };
  const deals = d.deals.filter((x) => (!f.ownerId || x.ownerId === f.ownerId) && (!f.companyId || x.companyId === f.companyId) && (!hasRange || inRange(x)));
  const withDeal = new Set(deals.map((x) => x.companyId));
  const companies = d.companies.filter((c) => (!f.ownerId || c.ownerId === f.ownerId) && (!f.companyId || c.id === f.companyId) && (!hasRange || withDeal.has(c.id)));
  const ids = new Set(companies.map((c) => c.id));
  const keep = <X extends { companyId?: string }>(xs: X[]) => xs.filter((x) => x.companyId !== undefined && ids.has(x.companyId));
  return {
    ...d,
    companies,
    deals: deals.filter((x) => ids.has(x.companyId)),
    contacts: keep(d.contacts),
    activities: keep(d.activities).filter((a) => !f.ownerId || a.ownerId === f.ownerId),
    interactions: keep(d.interactions),
    quotes: keep(d.quotes),
    suggestions: keep(d.suggestions),
    strategies: keep(d.strategies),
    conversations: keep(d.conversations),
  };
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Valor vendido em cada um dos últimos `months` meses (o atual por último). */
export function salesByMonth(deals: Deal[], now: Date, months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const from = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const won = deals.filter((d) => d.status === "ganha" && d.closedAt && new Date(d.closedAt) >= from && new Date(d.closedAt) < to);
    return { key: `${from.getFullYear()}-${from.getMonth()}`, label: MONTHS[from.getMonth()], valor: won.reduce((sum, d) => sum + dealValue(d), 0), vendas: won.length, companyIds: won.map((d) => d.companyId) };
  });
}

/** Vendido acumulado mês a mês no ano; meses futuros ficam vazios (a linha para em hoje). */
export function cumulativeSales(deals: Deal[], now: Date): (number | null)[] {
  let total = 0;
  return MONTHS.map((_, m) => {
    if (m > now.getMonth()) return null;
    total += deals.filter((d) => d.status === "ganha" && d.closedAt && new Date(d.closedAt).getFullYear() === now.getFullYear() && new Date(d.closedAt).getMonth() === m).reduce((sum, d) => sum + dealValue(d), 0);
    return total;
  });
}

export const MONTH_LABELS = MONTHS;

export function activitiesByType(activities: Activity[], period: Period) {
  const acc = new Map<string, number>();
  for (const a of activities) if (a.status === "concluida" && inPeriod(a.completedAt, period)) acc.set(a.tipo, (acc.get(a.tipo) ?? 0) + 1);
  return [...acc].map(([tipo, n]) => ({ key: tipo, label: tipo, value: n }));
}

export function lossesByReason(deals: Deal[], period: Period) {
  const acc = new Map<string, string[]>();
  for (const d of deals) {
    if (d.status !== "perdida" || !inPeriod(d.closedAt, period)) continue;
    const motivo = (d.motivo ?? "Sem motivo").split(" — ")[0];
    acc.set(motivo, [...(acc.get(motivo) ?? []), d.companyId]);
  }
  return [...acc].map(([motivo, companyIds]) => ({ key: motivo, label: motivo, value: companyIds.length, companyIds }));
}

const DAY = 86_400_000;
const lateDays = (a: Activity, until: Date) => Math.floor((until.getTime() - new Date(a.dueAt).getTime()) / DAY);

export interface SellerDetail {
  user: User;
  /** Atividades concluídas no período. */
  concluidas: number;
  /** % das concluídas que saíram até o prazo (null sem nenhuma concluída). */
  noPrazo: number | null;
  /** Atrasadas agora, por idade do atraso: 1 a 3 dias, 4 a 7, mais de 7. */
  atrasadas: [number, number, number];
  /** Média de dias de atraso das que foram concluídas depois do prazo, no período. */
  atrasoMedio: number;
  /** Registros que a pessoa escreveu no histórico dos clientes, no período. */
  registros: number;
  /** Dias desde a última ação (atividade concluída ou registro); null = nunca agiu. */
  diasParado: number | null;
  /** Parte das atividades concluídas da equipe, em %. */
  participacao: number;
  avancos: number;
  vendido: number;
  vendas: number;
}

/** Linha por pessoa: quem mais atua, quem mais registra, quem atrasa e quanto vendeu no período. */
export function sellerDetail(d: Data, users: User[], period: Period, now: Date): SellerDetail[] {
  const rows = users.map((user) => {
    const mine = d.activities.filter((a) => a.ownerId === user.id);
    const done = mine.filter((a) => a.status === "concluida" && inPeriod(a.completedAt, period));
    // No prazo = concluída até o fim do dia marcado (mesma régua do indicador de Execução).
    const late = done.filter((a) => dayDiff(a.completedAt!, a.dueAt) > 0);
    const overdue = mine.filter((a) => a.status === "pendente" && lateDays(a, now) >= 1).map((a) => lateDays(a, now));
    const notes = d.interactions.filter((i) => i.autorId === user.id && inPeriod(i.at, period));
    const lastAction = [...mine.filter((a) => a.completedAt).map((a) => a.completedAt!), ...d.interactions.filter((i) => i.autorId === user.id).map((i) => i.at)].sort().pop();
    const won = d.deals.filter((x) => x.ownerId === user.id && x.status === "ganha" && inPeriod(x.closedAt, period));
    return {
      user,
      concluidas: done.length,
      noPrazo: done.length ? Math.round(((done.length - late.length) / done.length) * 100) : null,
      atrasadas: [overdue.filter((n) => n <= 3).length, overdue.filter((n) => n > 3 && n <= 7).length, overdue.filter((n) => n > 7).length] as [number, number, number],
      atrasoMedio: late.length ? Math.round((late.reduce((sum, a) => sum + dayDiff(a.completedAt!, a.dueAt), 0) / late.length) * 10) / 10 : 0,
      registros: notes.length,
      diasParado: lastAction ? Math.max(0, Math.floor((now.getTime() - new Date(lastAction).getTime()) / DAY)) : null,
      participacao: 0,
      avancos: d.deals.filter((x) => x.ownerId === user.id).reduce((sum, x) => sum + x.history.filter((h, i) => i > 0 && inPeriod(h.enteredAt, period)).length, 0),
      vendido: won.reduce((sum, x) => sum + dealValue(x), 0),
      vendas: won.length,
    };
  });
  const total = rows.reduce((sum, r) => sum + r.concluidas, 0);
  return rows.map((r) => ({ ...r, participacao: total ? Math.round((r.concluidas / total) * 100) : 0 })).filter((r) => r.concluidas + r.registros + r.vendas + r.atrasadas.reduce((a, b) => a + b, 0) > 0 || r.user.role === "vendedor" || r.user.role === "representante");
}
