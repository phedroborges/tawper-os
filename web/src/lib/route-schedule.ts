// Agenda de uma rota de visitas que cabe na jornada: 8h às 18h, almoço, dia útil e folgas de estrada.

export const WORK_START = 8;
export const WORK_END = 18;
const LUNCH_START = 12;
const LUNCH_END = 13;

/** Folgas somadas ao tempo do Google: quem vai de usina em usina não anda no tempo do mapa. */
export const ROAD_MARGIN = 0.2; // trânsito, estrada de terra, chuva, caminhão de cana
export const GATE_MINUTES = 20; // portaria e integração de segurança
export const WAIT_MINUTES = 10; // espera pelo contato
export const VISIT_MINUTES = 60;
/** Sem tempo do Google: velocidade média em estrada de interior. */
export const FALLBACK_KMH = 60;

// shortcut: só feriados nacionais de data fixa; Carnaval, Sexta-feira Santa, Corpus Christi e feriados locais ficam de fora. Trocar por tabela quando a rota cair num deles.
const FERIADOS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]);

const pad = (n: number) => String(n).padStart(2, "0");

export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6 && !FERIADOS.has(`${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

function shiftDay(d: Date, step: 1 | -1): Date {
  const x = new Date(d);
  do x.setDate(x.getDate() + step);
  while (!isBusinessDay(x));
  return x;
}

export const nextBusinessDay = (d: Date) => shiftDay(d, 1);
export const prevBusinessDay = (d: Date) => shiftDay(d, -1);

/** O próprio dia, se for útil; senão o próximo dia útil. */
export function toBusinessDay(d: Date): Date {
  return isBusinessDay(d) ? new Date(d) : nextBusinessDay(d);
}

function at(day: Date, hour: number, minute = 0) {
  const x = new Date(day);
  x.setHours(hour, minute, 0, 0);
  return x;
}

const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/** Empurra o horário para fora do almoço; se a visita atravessar o almoço, começa às 13h. */
function afterLunch(start: Date, minutes: number): Date {
  const lunchStart = at(start, LUNCH_START);
  const lunchEnd = at(start, LUNCH_END);
  const end = addMinutes(start, minutes);
  return start < lunchEnd && end > lunchStart ? lunchEnd : start;
}

export interface RouteLeg {
  id: string;
  /** Minutos de estrada desde a parada anterior (0 na primeira). Já sem folga: a folga é somada aqui. */
  driveMinutes: number;
  visitMinutes?: number;
}

export interface ScheduledStop {
  id: string;
  arrive: Date;
  leave: Date;
  /** 1 = primeiro dia da viagem. */
  day: number;
}

export interface RouteSchedule {
  stops: ScheduledStop[];
  days: number;
  /** Fim do último atendimento. */
  end: Date | null;
}

/** Anda `minutes` de estrada só dentro da jornada: o que não cabe até as 18h continua às 8h do próximo dia útil. */
function drive(from: Date, minutes: number): Date {
  let cursor = from;
  let left = minutes;
  for (;;) {
    const room = (at(cursor, WORK_END).getTime() - cursor.getTime()) / 60_000;
    if (left <= room) return addMinutes(cursor, left);
    left -= Math.max(0, room);
    cursor = at(nextBusinessDay(cursor), WORK_START);
  }
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * Distribui as visitas a partir das 8h do primeiro dia útil. Estrada e visita só acontecem na jornada:
 * trecho longo atravessa a noite (pernoite) e visita que não termina até as 18h vai para as 8h do dia útil seguinte.
 */
export function scheduleRoute(startDay: Date, legs: RouteLeg[]): RouteSchedule {
  let cursor = at(toBusinessDay(startDay), WORK_START);
  let dayNumber = 1;
  let lastDay = cursor;
  const stops: ScheduledStop[] = [];
  for (const leg of legs) {
    const visit = leg.visitMinutes ?? VISIT_MINUTES;
    const arrive = drive(cursor, Math.round(leg.driveMinutes * (1 + ROAD_MARGIN)));
    let start = afterLunch(addMinutes(arrive, GATE_MINUTES + WAIT_MINUTES), visit);
    if (addMinutes(start, visit) > at(start, WORK_END)) {
      // Chegou tarde demais para atender hoje: dorme perto e entra na primeira hora.
      start = addMinutes(at(nextBusinessDay(start), WORK_START), GATE_MINUTES + WAIT_MINUTES);
    }
    const leave = addMinutes(start, visit);
    for (let d = lastDay; !sameDay(d, start); d = nextBusinessDay(d)) dayNumber += 1;
    lastDay = start;
    stops.push({ id: leg.id, arrive: start, leave, day: dayNumber });
    cursor = leave;
  }
  return { stops, days: dayNumber, end: stops.length ? stops[stops.length - 1].leave : null };
}

/** Minutos de estrada para uma distância em km, quando o Google não respondeu. */
export function fallbackDriveMinutes(km: number) {
  return Math.round((km / FALLBACK_KMH) * 60);
}

/** Tarefa de confirmação: 9h do dia útil anterior à visita, nunca antes de agora. */
export function confirmationDue(visitAt: Date, now = new Date()): Date {
  const due = at(prevBusinessDay(visitAt), 9);
  return due > now ? due : now;
}
