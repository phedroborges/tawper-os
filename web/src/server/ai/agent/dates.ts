/** Datas que o modelo manda (AAAA-MM-DD e HH:MM, horário de Brasília) viram ISO; o Brasil não tem horário de verão desde 2019. */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function dueFrom(data: unknown, hora: unknown): { iso: string } | { erro: string } {
  const day = typeof data === "string" ? DAY.exec(data.trim()) : null;
  if (!day) return { erro: "Data inválida: mande no formato AAAA-MM-DD, já convertida a partir de hoje." };
  const time = typeof hora === "string" && hora.trim() ? TIME.exec(hora.trim()) : null;
  if (typeof hora === "string" && hora.trim() && !time) return { erro: "Hora inválida: mande no formato HH:MM." };
  const [, y, m, d] = day;
  const check = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (check.getUTCMonth() !== Number(m) - 1 || check.getUTCDate() !== Number(d)) return { erro: "Essa data não existe no calendário." };
  const hh = (time?.[1] ?? "9").padStart(2, "0");
  const mm = time?.[2] ?? "00";
  return { iso: new Date(`${y}-${m}-${d}T${hh}:${mm}:00-03:00`).toISOString() };
}

/** Hoje em Brasília, AAAA-MM-DD. */
export function todayBR(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function isPastDay(iso: string, now = new Date()) {
  return todayBR(new Date(iso)) < todayBR(now);
}

/** Data passada: quase sempre o ano ficou de fora ("dia 22 de janeiro"). A mensagem já sugere a próxima vez que esse dia acontece. */
export function pastDayError(iso: string, now = new Date()) {
  const day = todayBR(new Date(iso));
  let year = Number(todayBR(now).slice(0, 4));
  if (`${year}${day.slice(4)}` < todayBR(now)) year += 1;
  return `A data ${day} já passou. Se o usuário não disse o ano, use ${year}${day.slice(4)}; se disse, confirme a data com ele.`;
}

/** "qui, 22/01/2027 às 09:00" */
export function fmtWhen(iso: string) {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(at);
  return `${day.replace(".", "")} às ${time}`;
}
