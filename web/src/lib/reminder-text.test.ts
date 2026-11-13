import { describe, expect, it } from "vitest";
import { buildReminder, twoBusinessDaysAhead } from "./reminder-text";
import type { Activity } from "./types";

const act = (id: string, dueAt: string, extra: Partial<Activity> = {}): Activity => ({
  id, companyId: "c1", tipo: "Ligação", titulo: `Tarefa ${id}`, ownerId: "u1", dueAt, prioridade: "Média", status: "pendente", origem: "manual", createdAt: dueAt, ...extra,
});
const base = { nome: "Paulo", ownerId: "u1", companyName: () => "Usina Teste", now: new Date("2026-11-12T10:30:00Z") }; // quinta, 7h30 em Brasília

describe("lembrete diário", () => {
  it("sem nada pendente não manda mensagem", () => {
    expect(buildReminder({ ...base, activities: [] })).toBeNull();
    expect(buildReminder({ ...base, activities: [act("a", "2026-11-12T15:00:00Z", { status: "concluida" })] })).toBeNull();
    expect(buildReminder({ ...base, activities: [act("a", "2026-11-12T15:00:00Z", { ownerId: "outro" })] })).toBeNull();
  });

  it("separa hoje, atrasadas e daqui a 2 dias úteis", () => {
    const text = buildReminder({
      ...base,
      activities: [act("hoje", "2026-11-12T15:00:00Z"), act("velha", "2026-11-10T15:00:00Z"), act("segunda", "2026-11-16T12:00:00Z"), act("longe", "2026-11-30T12:00:00Z")],
    })!;
    expect(text).toContain("Bom dia, Paulo!");
    expect(text).toContain("*Hoje (1)*");
    expect(text).toContain("12:00 Ligação — Usina Teste: Tarefa hoje");
    expect(text).toContain("*Atrasadas (1)*");
    expect(text).toContain("Tarefa segunda");
    expect(text).not.toContain("Tarefa longe");
  });

  it("quinta olha a segunda; sexta e fim de semana não contam como os 2 dias", () => {
    expect(twoBusinessDaysAhead("2026-11-12")).toBe("2026-11-16");
    expect(twoBusinessDaysAhead("2026-11-16")).toBe("2026-11-18");
  });

  it("tarefa tarde da noite continua no dia certo de Brasília", () => {
    const text = buildReminder({ ...base, activities: [act("noite", "2026-11-13T01:30:00Z")] })!; // 22h30 de quinta em Brasília
    expect(text).toContain("*Hoje (1)*");
  });
});
