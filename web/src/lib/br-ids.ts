/** Máscara de exibição ≠ valor persistido. CNPJ: 14 dígitos. WhatsApp: 55 + DDD + celular. */

const DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export function onlyDigits(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeCNPJ(value?: string | null): string {
  return onlyDigits(value).slice(0, 14);
}

export function formatCNPJ(value?: string | null): string {
  const d = normalizeCNPJ(value);
  if (!d) return "";
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function cnpjDigit(base: string, weights: number[]): number {
  const sum = base.split("").reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function withValidCNPJCheckDigits(value?: string | null): string {
  const base = normalizeCNPJ(value).padEnd(12, "0").slice(0, 12);
  const d1 = cnpjDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = cnpjDigit(`${base}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}

export function isValidCNPJ(value?: string | null): boolean {
  const d = normalizeCNPJ(value);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  return d === withValidCNPJCheckDigits(d);
}

/** Valor para banco/API: 14 dígitos ou vazio. Rejeita máscara e CNPJ incompleto. */
export function storedCNPJ(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  return isValidCNPJ(value) ? normalizeCNPJ(value) : undefined;
}

function nationalPhone(value?: string | null): string {
  let d = onlyDigits(value);
  while (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d.slice(0, 11);
}

export function normalizeWhatsApp(value?: string | null): string {
  const national = nationalPhone(value);
  return national ? `55${national}` : "";
}

export function formatWhatsApp(value?: string | null): string {
  const d = nationalPhone(value);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

export function isValidWhatsApp(value?: string | null): boolean {
  const stored = normalizeWhatsApp(value);
  if (stored.length !== 13 || !stored.startsWith("55")) return false;
  const ddd = stored.slice(2, 4);
  const number = stored.slice(4);
  return DDDS.has(ddd) && number.length === 9 && number.startsWith("9");
}

/** Valor para banco/API: 55 + DDD + 9 dígitos, sem +. */
export function storedWhatsApp(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  return isValidWhatsApp(value) ? normalizeWhatsApp(value) : undefined;
}

export function digitsQueryMatch(query: string, ...values: (string | undefined | null)[]): boolean {
  const q = onlyDigits(query);
  if (q.length < 3) return false;
  return values.some((value) => onlyDigits(value).includes(q));
}
