const DAY = 86_400_000;

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Data relativa a hoje, com hora fixa — usada pelo seed para manter a demo sempre "atual". */
export function rel(days: number, hour = 9, minute = 0, base = new Date()) {
  const x = addDays(startOfDay(base), days);
  x.setHours(hour, minute, 0, 0);
  return x.toISOString();
}

export function relMinutes(mins: number, base = new Date()) {
  return new Date(base.getTime() + mins * 60_000).toISOString();
}

export function dayDiff(a: string | Date, b: string | Date = new Date()) {
  return Math.round((startOfDay(new Date(a)).getTime() - startOfDay(new Date(b)).getTime()) / DAY);
}

export function daysSince(iso: string, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));
}

export type DueState = "atrasada" | "hoje" | "amanha" | "proxima";

export function dueState(iso: string, now = new Date()): DueState {
  const d = dayDiff(iso, now);
  if (d < 0) return "atrasada";
  if (d === 0) return "hoje";
  if (d === 1) return "amanha";
  return "proxima";
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function weekdayName(iso: string) {
  return WEEKDAYS[new Date(iso).getDay()];
}

export function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateShort(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string) {
  return `${fmtDateShort(iso)} · ${fmtTime(iso)}`;
}

/** "hoje", "amanhã", "sexta, 12/09", "há 3 dias" … */
export function fmtDue(iso: string, now = new Date()) {
  const d = dayDiff(iso, now);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  if (d < -1) return `há ${-d} dias`;
  if (d < 7) return `${WEEKDAYS_SHORT[new Date(iso).getDay()]}, ${fmtDateShort(iso)}`;
  return fmtDateShort(iso);
}

export function fmtAgo(iso: string, now = new Date()) {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24 && dayDiff(iso, now) === 0) return `há ${h} h`;
  const d = -dayDiff(iso, now);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  const m = Math.round(d / 30);
  return m === 1 ? "há 1 mês" : `há ${m} meses`;
}

export function toInputDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromInputDate(v: string, hour = 9) {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0).toISOString();
}

/** Próxima ocorrência de um dia da semana (0 = domingo) a partir de uma data. */
export function nextWeekday(from: Date, dow: number, allowSame = false) {
  const x = startOfDay(from);
  let diff = (dow - x.getDay() + 7) % 7;
  if (diff === 0 && !allowSame) diff = 7;
  return addDays(x, diff);
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function longToday(now = new Date()) {
  return now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

/** Período de filtro em datas de calendário ("AAAA-MM-DD"); vazio = sem limite daquele lado. */
export interface Period {
  from: string;
  to: string;
}

export const NO_PERIOD: Period = { from: "", to: "" };

export function inPeriod(iso: string | undefined, p: Period): boolean {
  if (!p.from && !p.to) return true;
  if (!iso) return false;
  const day = toInputDate(iso);
  return (!p.from || day >= p.from) && (!p.to || day <= p.to);
}

export type PeriodPreset = "tudo" | "mes" | "mes_passado" | "30" | "90" | "ano";

export function presetPeriod(preset: PeriodPreset, now = new Date()): Period {
  const iso = (d: Date) => toInputDate(d.toISOString());
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "mes":
      return { from: iso(new Date(y, m, 1, 12)), to: iso(new Date(y, m + 1, 0, 12)) };
    case "mes_passado":
      return { from: iso(new Date(y, m - 1, 1, 12)), to: iso(new Date(y, m, 0, 12)) };
    case "30":
      return { from: iso(addDays(now, -30)), to: iso(now) };
    case "90":
      return { from: iso(addDays(now, -90)), to: iso(now) };
    case "ano":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return NO_PERIOD;
  }
}
