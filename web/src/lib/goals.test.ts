import { describe, expect, it } from "vitest";
import type { Goals } from "./config";
import { annualGoalOf, elapsed, periodGoal, periodRange, ranking, salesPath, sellersOf, sold, targetDone, type Sale } from "./goals";
import type { Activity, Deal, User } from "./types";

const user = (id: string, role: User["role"] = "vendedor"): User => ({ id, name: id, short: id, role, title: "", initials: "X", color: "#000", phone: "", regions: [] });
const users = [user("a"), user("b"), user("c"), user("chefe", "admin")];
const goals: Goals = { ano: 2026, anual: 1_200_000, porVendedor: { a: 600_000 }, atividades: [] };
const sale = (ownerId: string, valor: number, at: string): Sale => ({ ownerId, valor, at: new Date(at) });
const now = new Date(2026, 10, 12); // 12/11/2026

describe("metas", () => {
  it("meta por vendedor: a digitada vale; o resto divide o que sobra por igual; gestor não tem meta", () => {
    const sellers = users.filter((u) => u.role === "vendedor");
    expect(annualGoalOf(goals, sellers, "a")).toBe(600_000);
    expect(annualGoalOf(goals, sellers, "b")).toBe(300_000);
    expect(annualGoalOf(goals, sellers, "chefe")).toBe(0);
  });

  it("o diretor (admin) entra nas metas quando marcado como participante", () => {
    expect(sellersOf(users).map((u) => u.id)).toEqual(["a", "b", "c"]);
    expect(sellersOf(users, ["chefe"]).map((u) => u.id)).toEqual(["a", "b", "c", "chefe"]);
    const comChefe = { ...goals, participantes: ["chefe"] };
    // 1.200.000 − 600.000 (de "a") = 600.000 para b, c e chefe: 200.000 cada
    expect(annualGoalOf(comChefe, sellersOf(users, ["chefe"]), "chefe")).toBe(200_000);
    expect(ranking(comChefe, users, [sale("chefe", 10_000, "2026-11-04")], "mes", now).find((r) => r.user.id === "chefe")?.meta).toBeGreaterThan(0);
  });

  it("meta regressiva: o que falta antes do período, dividido pelos períodos que restam", () => {
    const sales = [sale("a", 500_000, "2026-06-10"), sale("a", 100_000, "2026-11-05")];
    // novembro: faltam 1.200.000 − 500.000 = 700.000 para 2 meses (nov e dez). A venda de novembro não muda a meta do mês.
    expect(periodGoal(1_200_000, sales, "mes", now)).toBe(350_000);
    // 4º trimestre: 700.000 para 1 trimestre
    expect(periodGoal(1_200_000, sales, "trimestre", now)).toBe(700_000);
    expect(periodGoal(1_200_000, sales, "ano", now)).toBe(1_200_000);
    // já bateu: nunca negativa
    expect(periodGoal(100_000, sales, "mes", now)).toBe(0);
  });

  it("período e ritmo", () => {
    const r = periodRange("trimestre", now);
    expect(r.from.getMonth()).toBe(9);
    expect(r.to.getFullYear()).toBe(2027);
    expect(elapsed(periodRange("mes", now), now)).toBeCloseTo(11 / 30, 2);
    expect(sold([sale("a", 10, "2026-11-01T12:00:00"), sale("b", 5, "2026-11-30T12:00:00"), sale("a", 99, "2026-10-31T12:00:00")], periodRange("mes", now))).toBe(15);
  });

  it("ranking ordena por valor vendido e ignora quem não tem meta nem venda", () => {
    const sales = [sale("b", 90_000, "2026-11-03"), sale("a", 40_000, "2026-11-04"), sale("chefe", 10_000, "2026-11-04")];
    const rows = ranking(goals, users, sales, "mes", now);
    expect(rows.map((r) => r.user.id)).toEqual(["b", "a", "chefe", "c"]);
    expect(rows[0].pct).toBeGreaterThan(rows[1].pct);
  });

  it("caminho da meta: vendas pelo ticket médio e orçamentos pela conversão; sem histórico usa o padrão e avisa", () => {
    const deal = (status: Deal["status"], valor: number) => ({ status, valorRealizado: valor }) as Deal;
    const path = salesPath(100_000, [deal("ganha", 20_000), deal("ganha", 30_000), deal("ganha", 25_000), deal("perdida", 0), deal("perdida", 0)]);
    expect(path.ticketMedio).toBe(25_000);
    expect(path.vendas).toBe(4);
    expect(path.conversao).toBeCloseTo(0.6);
    expect(path.orcamentos).toBe(7);
    expect(path.estimado).toBe(false);
    expect(salesPath(100_000, []).estimado).toBe(true);
  });

  it("meta de atividade conta só o que a pessoa concluiu na janela", () => {
    const act = (completedAt: string, extra: Partial<Activity> = {}) => ({ ownerId: "a", tipo: "Ligação", status: "concluida", completedAt, ...extra }) as Activity;
    const acts = [act("2026-11-12T10:00:00"), act("2026-11-11T10:00:00"), act("2026-11-12T11:00:00", { ownerId: "b" }), act("2026-11-12T11:00:00", { tipo: "Visita" })];
    expect(targetDone({ tipo: "Ligação", quantidade: 10, por: "dia" }, acts, "a", new Date(2026, 10, 12, 15))).toBe(1);
    expect(targetDone({ tipo: "Ligação", quantidade: 10, por: "semana" }, acts, "a", new Date(2026, 10, 12, 15))).toBe(2);
  });
});
