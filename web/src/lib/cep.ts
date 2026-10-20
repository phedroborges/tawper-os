/** CEP brasileiro: máscara, ViaCEP e montagem de endereço. */

import { onlyDigits } from "./br-ids";

export type CepAddress = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  endereco: string;
};

export function normalizeCEP(value?: string | null): string {
  return onlyDigits(value).slice(0, 8);
}

export function formatCEP(value?: string | null): string {
  const d = normalizeCEP(value);
  if (!d) return "";
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function isValidCEP(value?: string | null): boolean {
  return normalizeCEP(value).length === 8;
}

export function buildEndereco(parts: { logradouro?: string; bairro?: string; cidade?: string; uf?: string; cep?: string }) {
  const line = [parts.logradouro, parts.bairro].filter(Boolean).join(" — ");
  const city = [parts.cidade, parts.uf].filter(Boolean).join("/");
  const cep = parts.cep ? `CEP ${formatCEP(parts.cep)}` : "";
  return [line, city, cep].filter(Boolean).join(", ");
}

/** Consulta ViaCEP. Retorna null se CEP inválido ou não encontrado. */
export async function lookupViaCep(cep: string): Promise<CepAddress | null> {
  const digits = normalizeCEP(cep);
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    erro?: boolean;
    cep?: string;
    logradouro?: string;
    complemento?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  if (data.erro || !data.localidade || !data.uf) return null;
  const endereco = buildEndereco({
    logradouro: data.logradouro,
    bairro: data.bairro,
    cidade: data.localidade,
    uf: data.uf,
    cep: digits,
  });
  return {
    cep: digits,
    logradouro: data.logradouro ?? "",
    complemento: data.complemento ?? "",
    bairro: data.bairro ?? "",
    cidade: data.localidade,
    uf: data.uf,
    endereco,
  };
}
