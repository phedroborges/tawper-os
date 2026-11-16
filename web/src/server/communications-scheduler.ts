import "server-only";
import { processVisitCommunications } from "./visit-confirmations";
import { sendDailyReminders } from "./reminders";
import { isBusinessDay } from "@/lib/route-schedule";
const holder = globalThis as typeof globalThis & {
  __tawperCommunications?: {
    running: boolean;
    lastTick: string | null;
    ok: boolean;
  };
};
export const communicationStatus = () =>
  holder.__tawperCommunications ?? {
    running: false,
    lastTick: null,
    ok: false,
  };
export function startCommunicationsScheduler() {
  if (holder.__tawperCommunications?.running) return;
  const state: { running: boolean; lastTick: string | null; ok: boolean } =
    (holder.__tawperCommunications = {
      running: true,
      lastTick: null as string | null,
      ok: false,
    });
  let busy = false;
  let reminderSlot = "";
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      state.lastTick = new Date().toISOString();
      await processVisitCommunications();
      state.ok = true;
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date());
      const part = (key: string) =>
        parts.find((p) => p.type === key)?.value ?? "0";
      const hour = Number(part("hour")),
        minute = Number(part("minute"));
      const day = new Date(
        Number(part("year")),
        Number(part("month")) - 1,
        Number(part("day")),
        12,
      );
      const slot = `${day.toDateString()}:${hour}:${Math.floor(minute / 5)}`;
      if (
        slot !== reminderSlot &&
        isBusinessDay(day) &&
        ((hour === 7 && minute >= 30) || (hour >= 8 && hour < 10))
      ) {
        reminderSlot = slot;
        const result = await sendDailyReminders();
        if (result.failed.length)
          console.error("[lembretes] falhas", result.failed);
      }
    } catch (e) {
      state.ok = false;
      console.error(
        "[comunicacoes] execução falhou",
        e instanceof Error ? e.message : "erro",
      );
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), 30_000).unref();
  void tick();
}
