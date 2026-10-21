import { describe, expect, it } from "vitest";
import { composeRouteDescription, visitRouteDescription } from "./route-text";

const stops = [
  { nome: "Empresa teste", cidade: "Portelândia", uf: "GO", motivo: "pós-venda" },
  { nome: "USINA", cidade: "Mineiros", uf: "GO", motivo: "atividade atrasada" },
];

describe("descrição da rota", () => {
  it("entrega a rota numerada quando a IA não escreve", () => {
    expect(composeRouteDescription("", stops, 86)).toBe(
      "Rota de 2 paradas, cerca de 86 km.\n1. Empresa teste (Portelândia/GO) — pós-venda\n2. USINA (Mineiros/GO) — atividade atrasada",
    );
  });

  it("completa a descrição da IA se faltar alguma parada", () => {
    const text = composeRouteDescription("Comece por Empresa teste.", stops);
    expect(text).toContain("Comece por Empresa teste.");
    expect(text).toContain("2. USINA (Mineiros/GO)");
  });

  it("mantém o texto da IA quando ele já cita todas as paradas", () => {
    const written = "1. Empresa teste em Portelândia. 2. USINA em Mineiros.";
    expect(composeRouteDescription(written, stops)).toBe(written);
  });

  it("marca a parada atual na descrição da visita", () => {
    expect(visitRouteDescription("1. Empresa teste", 0, 2)).toBe("Parada 1 de 2.\n1. Empresa teste");
  });
});