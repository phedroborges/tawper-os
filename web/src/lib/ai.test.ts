import { describe, expect, it } from "vitest";
import { USERS } from "./constants";
import { assistantAnswer } from "./ai";
import { buildSeed } from "./seed";

describe("assistantAnswer", () => {
  const now = new Date("2026-10-19T12:00:00-03:00");
  const data = buildSeed(now);
  const manager = USERS.find((user) => user.id === "u-murilo")!;

  it("entrega as tarefas do cliente com status visual", () => {
    const answer = assistantAnswer(data, manager, "Quais são as tarefas da Usina Alvorada?", now);
    const block = answer.blocos?.find((item) => item.type === "task_list");
    expect(block?.type).toBe("task_list");
    if (block?.type === "task_list") {
      expect(block.items.length).toBeGreaterThan(0);
      expect(block.items.every((item) => ["pending", "done", "cancelled"].includes(item.status))).toBe(true);
    }
  });

  it("entrega resultado com métrica e gráfico comparativo", () => {
    const answer = assistantAnswer(data, manager, "Como está o resultado de vendas hoje?", now);
    expect(answer.blocos?.some((item) => item.type === "metric")).toBe(true);
    expect(answer.blocos?.some((item) => item.type === "bar_chart")).toBe(true);
  });
});
