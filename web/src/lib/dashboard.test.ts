import { describe, expect, it } from "vitest";
import { activitiesByType, cumulativeSales, lossesByReason, salesByMonth, scopeData, sellerDetail } from "./dashboard";
import type { Data } from "./selectors";
import type { Activity, Company, Deal, Interaction, User } from "./types";

const now = new Date(2026, 10, 12, 12);
const user = (id: string, role: User["role"] = "vendedor") => ({ id, name: id, short: id, role }) as User;
const company = (id: string, ownerId: string) => ({ id, ownerId, status: "ativa" }) as Company;
const deal = (p: Partial<Deal>) => ({ status: "aberta", history: [], ...p }) as Deal;
const act = (p: Partial<Activity>) => ({ status: "pendente", tipo: "Ligação", ...p }) as Activity;
const base = (p: Partial<Data>): Data => ({ companies: [], contacts: [], deals: [], activities: [], interactions: [], quotes: [], suggestions: [], strategies: [], users: [], conversations: [], ...p });
const NOV = { from: "2026-11-01", to: "2026-11-30" };

describe("painel", () => {
  it("filtro por vendedor, cliente e faixa de valor recorta tudo junto", () => {
    const d = base({
      companies: [company("c1", "a"), company("c2", "b"), company("c3", "a")],
      deals: [deal({ id: "d1", companyId: "c1", ownerId: "a", valor: 50_000 }), deal({ id: "d2", companyId: "c2", ownerId: "b", valor: 5_000 }), deal({ id: "d3", companyId: "c3", ownerId: "a", valor: 2_000 })],
      activities: [act({ id: "x", companyId: "c1", ownerId: "a" }), act({ id: "y", companyId: "c2", ownerId: "b" })],
    });
    expect(scopeData(d, { ownerId: "a" }).companies.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(scopeData(d, { ownerId: "a" }).activities.map((a) => a.id)).toEqual(["x"]);
    expect(scopeData(d, { companyId: "c2" }).deals.map((x) => x.id)).toEqual(["d2"]);
    expect(scopeData(d, { valorMin: 10_000 }).companies.map((c) => c.id)).toEqual(["c1"]);
    expect(scopeData(d, { valorMax: 4_000 }).deals.map((x) => x.id)).toEqual(["d3"]);
    expect(scopeData(d, {}).companies).toHaveLength(3);
  });

  it("vendas por mês e acumulado do ano", () => {
    const deals = [
      deal({ status: "ganha", closedAt: "2026-11-03T12:00:00", valorRealizado: 30_000, companyId: "c1" }),
      deal({ status: "ganha", closedAt: "2026-10-20T12:00:00", valorRealizado: 10_000, companyId: "c2" }),
      deal({ status: "ganha", closedAt: "2025-11-20T12:00:00", valorRealizado: 99_000, companyId: "c3" }),
    ];
    const months = salesByMonth(deals, now, 3);
    expect(months.map((m) => m.label)).toEqual(["set", "out", "nov"]);
    expect(months.map((m) => m.valor)).toEqual([0, 10_000, 30_000]);
    const acc = cumulativeSales(deals, now);
    expect(acc[9]).toBe(10_000);
    expect(acc[10]).toBe(40_000);
    expect(acc[11]).toBeNull();
  });

  it("atividades por tipo e perdas por motivo respeitam o período", () => {
    const acts = [act({ status: "concluida", completedAt: "2026-11-05T12:00:00" }), act({ status: "concluida", completedAt: "2026-11-06T12:00:00", tipo: "Visita" }), act({ status: "concluida", completedAt: "2026-09-06T12:00:00" })];
    expect(activitiesByType(acts, NOV)).toEqual([{ key: "Ligação", label: "Ligação", value: 1 }, { key: "Visita", label: "Visita", value: 1 }]);
    const lost = [deal({ status: "perdida", closedAt: "2026-11-02T12:00:00", motivo: "Preço — detalhe", companyId: "c1" }), deal({ status: "perdida", closedAt: "2026-11-03T12:00:00", motivo: "Preço", companyId: "c2" })];
    expect(lossesByReason(lost, NOV)[0]).toMatchObject({ label: "Preço", value: 2 });
  });

  it("detalhe por vendedor: prazo, faixas de atraso, participação e venda", () => {
    const d = base({
      users: [user("a"), user("b")],
      activities: [
        act({ ownerId: "a", status: "concluida", dueAt: "2026-11-05T12:00:00", completedAt: "2026-11-05T10:00:00" }),
        act({ ownerId: "a", status: "concluida", dueAt: "2026-11-05T12:00:00", completedAt: "2026-11-07T12:00:00" }),
        act({ ownerId: "a", dueAt: "2026-11-10T12:00:00" }), // 2 dias
        act({ ownerId: "a", dueAt: "2026-11-01T12:00:00" }), // 11 dias
        act({ ownerId: "b", status: "concluida", dueAt: "2026-11-05T12:00:00", completedAt: "2026-11-04T12:00:00" }),
        act({ ownerId: "b", dueAt: "2026-11-20T12:00:00" }), // futura: não é atraso
      ],
      interactions: [{ autorId: "a", at: "2026-11-11T12:00:00" } as Interaction],
      deals: [deal({ ownerId: "b", status: "ganha", closedAt: "2026-11-08T12:00:00", valorRealizado: 20_000 })],
    });
    const [a, b] = sellerDetail(d, d.users, NOV, now);
    expect(a).toMatchObject({ concluidas: 2, noPrazo: 50, atrasadas: [1, 0, 1], atrasoMedio: 2, registros: 1, diasParado: 1, participacao: 67 });
    expect(b).toMatchObject({ concluidas: 1, noPrazo: 100, atrasadas: [0, 0, 0], vendido: 20_000, vendas: 1, participacao: 33 });
  });
});
