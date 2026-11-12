import { describe, expect, it } from "vitest";
import { matchesRegionFilter, regionForUf, UFS } from "./regions";

describe("regiões do Brasil pela UF", () => {
  it("toda UF tem região", () => {
    expect(UFS).toHaveLength(27);
    for (const uf of UFS) expect(regionForUf(uf)).not.toBe("");
  });
  it("aceita minúscula e ignora UF desconhecida", () => {
    expect(regionForUf("go")).toBe("Centro-Oeste");
    expect(regionForUf(" sp ")).toBe("Sudeste");
    expect(regionForUf("XX")).toBe("");
    expect(regionForUf(undefined)).toBe("");
  });
  it("filtro por região inteira ou por estado", () => {
    expect(matchesRegionFilter("", "SP")).toBe(true);
    expect(matchesRegionFilter("Sudeste", "MG")).toBe(true);
    expect(matchesRegionFilter("Sudeste", "GO")).toBe(false);
    expect(matchesRegionFilter("uf:GO", "GO")).toBe(true);
    expect(matchesRegionFilter("uf:GO", "MS")).toBe(false);
  });
});
