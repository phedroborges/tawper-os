// Texto do lembrete diário que cada pessoa recebe no próprio WhatsApp. Função pura: o envio fica em server/reminders.ts.

import { isBusinessDay } from "./route-schedule";
import type { Activity } from "./types";

const TZ = "America/Sao_Paulo";
const MAX_ITEMS = 8;

/** Dia do calendário em Brasília ("AAAA-MM-DD"), seja qual for o fuso do servidor. */
export const dayKey = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
const hour = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fromKey = (key: string) => new Date(`${key}T12:00:00-03:00`);
const dayLabel = (key: string) => fromKey(key).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" });

/** Dois dias úteis à frente: quem recebe na quinta já enxerga a segunda. */
export function twoBusinessDaysAhead(todayKey: string): string {
  const d = fromKey(todayKey);
  for (let left = 2; left > 0; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(fromLocal(d))) left -= 1;
  }
  return dayKey(d);
}

/** isBusinessDay lê dia/mês locais; aqui a data já está no meio do dia de Brasília. */
function fromLocal(d: Date) {
  const [y, m, day] = dayKey(d).split("-").map(Number);
  return new Date(y, m - 1, day, 12);
}

function lines(items: Activity[], companyName: (id: string) => string, withHour: boolean) {
  const shown = items.slice(0, MAX_ITEMS).map((a) => `• ${withHour ? `${hour(a.dueAt)} ` : ""}${a.tipo} — ${companyName(a.companyId)}: ${a.titulo}`);
  if (items.length > MAX_ITEMS) shown.push(`…e mais ${items.length - MAX_ITEMS}.`);
  return shown.join("\n");
}

/**
 * Monta a mensagem de uma pessoa: o que vence hoje, o que está atrasado e o que vem em 2 dias úteis.
 * Devolve null quando não há nada a lembrar (ninguém recebe mensagem vazia).
 */
export function buildReminder(input: { nome: string; ownerId: string; activities: Activity[]; companyName: (id: string) => string; now: Date }): string | null {
  const today = dayKey(input.now);
  const ahead = twoBusinessDaysAhead(today);
  const mine = input.activities.filter((a) => a.ownerId === input.ownerId && a.status === "pendente").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const hoje = mine.filter((a) => dayKey(a.dueAt) === today);
  const atrasadas = mine.filter((a) => dayKey(a.dueAt) < today);
  const depois = mine.filter((a) => dayKey(a.dueAt) === ahead);
  if (!hoje.length && !atrasadas.length && !depois.length) return null;

  const parts = [`Bom dia, ${input.nome}! Seu dia no Tawper OS (${dayLabel(today)}):`];
  parts.push(hoje.length ? `*Hoje (${hoje.length})*\n${lines(hoje, input.companyName, true)}` : "*Hoje*\nNada marcado para hoje.");
  if (atrasadas.length) parts.push(`*Atrasadas (${atrasadas.length})*\n${lines(atrasadas, input.companyName, false)}`);
  if (depois.length) parts.push(`*Para ${dayLabel(ahead)} (${depois.length})*\n${lines(depois, input.companyName, true)}`);
  parts.push("Responda aqui para registrar o que fez.");
  return parts.join("\n\n");
}
