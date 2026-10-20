import { normalize } from "./utils";

/** Cidade (normalizada) → região comercial Tawper. */
export const CITY_REGION: Record<string, string> = {
  "pereira barreto": "Noroeste Paulista",
  "monte aprazivel": "Noroeste Paulista",
  "sao jose do rio preto": "Noroeste Paulista",
  "novo horizonte": "Noroeste Paulista",
  catanduva: "Noroeste Paulista",
  votuporanga: "Noroeste Paulista",
  olimpia: "Norte Paulista",
  bebedouro: "Norte Paulista",
  guaraci: "Norte Paulista",
  severinia: "Norte Paulista",
  assis: "Paranapanema",
  ourinhos: "Paranapanema",
  "candido mota": "Paranapanema",
  "paraguacu paulista": "Paranapanema",
  frutal: "Triângulo Mineiro",
  uberaba: "Triângulo Mineiro",
  iturama: "Triângulo Mineiro",
  mineiros: "Goiás",
  jatai: "Goiás",
  quirinopolis: "Goiás",
  "rio verde": "Goiás",
  goiania: "Goiás",
  anapolis: "Goiás",
  "rio brilhante": "Mato Grosso do Sul",
  "nova andradina": "Mato Grosso do Sul",
  navirai: "Mato Grosso do Sul",
  martinopolis: "Oeste Paulista",
  "presidente venceslau": "Oeste Paulista",
};

/** Região comercial → UF principal (para invalidar região incompatível com o CEP). */
const REGION_UF: Record<string, string> = {
  "Noroeste Paulista": "SP",
  "Norte Paulista": "SP",
  "Oeste Paulista": "SP",
  Paranapanema: "SP",
  "Triângulo Mineiro": "MG",
  Goiás: "GO",
  "Mato Grosso do Sul": "MS",
};

/** Fallback por UF quando a cidade não está no mapa comercial. */
const UF_DEFAULT_REGION: Record<string, string> = {
  GO: "Goiás",
  MS: "Mato Grosso do Sul",
  MG: "Triângulo Mineiro",
};

export function regionForCity(cidade?: string): string {
  if (!cidade) return "";
  return CITY_REGION[normalize(cidade)] ?? "";
}

export function regionFitsUf(regiao?: string, uf?: string): boolean {
  if (!regiao?.trim() || !uf?.trim()) return true;
  const expected = REGION_UF[regiao];
  if (!expected) return true;
  return expected === uf.trim().toUpperCase();
}

/** Cidade mapeada, senão default da UF (GO/MS/MG). SP sem cidade no mapa fica vazio. */
export function regionForLocation(cidade?: string, uf?: string): string {
  const byCity = regionForCity(cidade);
  if (byCity) return byCity;
  const u = (uf ?? "").trim().toUpperCase();
  return UF_DEFAULT_REGION[u] ?? "";
}

/**
 * Escolhe a região ao aplicar CEP/GPS:
 * 1) mapa cidade → região
 * 2) default da UF
 * 3) mantém a atual só se ainda for compatível com a UF nova
 * (evita ficar "Goiás" com CEP de São Paulo/SP)
 */
export function pickRegiaoFromLocation(cidade?: string, uf?: string, current?: string): string {
  const auto = regionForLocation(cidade, uf);
  if (auto) return auto;
  if (current && regionFitsUf(current, uf)) return current;
  return "";
}
