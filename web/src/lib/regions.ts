/** Regiões do Brasil. A região de um cliente nunca é digitada: sai da UF do endereço. */
export const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

export const UFS_POR_REGIAO: Record<string, string[]> = {
  Norte: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"],
  Nordeste: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  "Centro-Oeste": ["DF", "GO", "MS", "MT"],
  Sudeste: ["ES", "MG", "RJ", "SP"],
  Sul: ["PR", "RS", "SC"],
};

export const UFS = Object.values(UFS_POR_REGIAO).flat().sort();

const UF_REGIAO = new Map(Object.entries(UFS_POR_REGIAO).flatMap(([regiao, ufs]) => ufs.map((uf) => [uf, regiao] as const)));

export function regionForUf(uf?: string | null): string {
  return UF_REGIAO.get((uf ?? "").trim().toUpperCase()) ?? "";
}

/** Mantém a assinatura usada no cadastro (CEP/GPS): a região é sempre a da UF. */
export function pickRegiaoFromLocation(_cidade?: string, uf?: string, _atual?: string): string {
  return regionForUf(uf);
}

/** Filtro de região das telas: "" = todas, "Sudeste" = a região inteira, "uf:SP" = um estado. */
export function matchesRegionFilter(filter: string, uf?: string | null): boolean {
  if (!filter) return true;
  const state = (uf ?? "").trim().toUpperCase();
  return filter.startsWith("uf:") ? state === filter.slice(3) : regionForUf(state) === filter;
}

export function regionFilterLabel(filter: string): string {
  if (!filter) return "Todas as regiões";
  return filter.startsWith("uf:") ? filter.slice(3) : filter;
}
