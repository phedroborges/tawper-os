export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

let counter = 0;
export function uid(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const num = new Intl.NumberFormat("pt-BR");

export function money(v?: number, cents = false) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return cents ? brlCents.format(v) : brl.format(v);
}

export function moneyShort(v?: number) {
  if (v === undefined || v === null) return "—";
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl.format(v);
}

export function fmtNum(v?: number) {
  return v === undefined ? "—" : num.format(v);
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "usina", "grupo", "agro", "agricola", "agropecuaria", "agroindustrial", "bioenergia", "acucar", "etanol",
  "alcool", "ltda", "sa", "s", "a", "e", "de", "do", "da", "dos", "das", "ctt", "cia", "fazenda", "destilaria",
]);

export function nameTokens(s: string) {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Similaridade simples entre nomes de empresas (0..1), ignorando termos genéricos do setor. */
export function nameSimilarity(a: string, b: string) {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  return inter / Math.min(ta.size, tb.size);
}

export function quoteTotals(itens: { qtd: number; preco: number }[], descontoPct: number) {
  const bruto = itens.reduce((acc, i) => acc + i.qtd * i.preco, 0);
  const desconto = Math.round(bruto * (descontoPct / 100) * 100) / 100;
  return { bruto, desconto, total: Math.round((bruto - desconto) * 100) / 100 };
}

export function digits(s?: string) {
  return (s ?? "").replace(/\D/g, "");
}

export function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : p[0]?.[1] ?? "")).toUpperCase();
}
