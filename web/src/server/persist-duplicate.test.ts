import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("duplicateDueWindow", () => {
  it("abre 12 h para cada lado do prazo", async () => {
    const { duplicateDueWindow } = await import("./persist");
    expect(duplicateDueWindow("2026-11-05T13:00:00.000Z")).toEqual({ from: "2026-11-05T01:00:00.000Z", to: "2026-11-06T01:00:00.000Z" });
  });
  it("prazo inválido não gera janela (não deduplica)", async () => {
    const { duplicateDueWindow } = await import("./persist");
    expect(duplicateDueWindow("sem data")).toBeNull();
  });
});
