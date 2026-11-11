import { describe, expect, it } from "vitest";
import type { Company, Contact } from "@/lib/types";
import { findCompanies } from "./search";

const company = (id: string, nome: string) => ({ id, nome }) as unknown as Company;
const base = {
  companies: [company("1", "USINA"), company("2", "Usina Santa Helena"), company("3", "Ativos de Mineiros")],
  contacts: [] as Contact[],
};
const nomes = (query: string, min = 0.5) => findCompanies(base, query, 5, min).map((match) => match.company.nome);

describe("busca de cliente por nome", () => {
  it("palavra genérica não faz outra usina virar a empresa chamada só 'USINA'", () => {
    expect(nomes("Usina Zzyx Bela Vista")).not.toContain("USINA");
    expect(nomes("A Usina Vale Verde está no CRM?")).not.toContain("USINA");
  });

  it("a empresa chamada só 'USINA' ainda é achada quando é o que o usuário diz", () => {
    expect(nomes("USINA")).toContain("USINA");
    expect(nomes("usina")).toContain("USINA");
  });

  it("nome completo dentro de uma frase continua achando", () => {
    expect(nomes("liguei na Usina Santa Helena hoje")).toContain("Usina Santa Helena");
    expect(nomes("Ativos de Mineiros")).toEqual(["Ativos de Mineiros"]);
  });
});
