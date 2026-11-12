import { describe, expect, it } from "vitest";
import { confirmationDue, isBusinessDay, scheduleRoute, toBusinessDay, WORK_END, WORK_START } from "./route-schedule";

const legs = (n: number, drive = 60) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, driveMinutes: i === 0 ? 0 : drive }));
const hm = (d: Date) => d.getHours() * 60 + d.getMinutes();

describe("agenda da rota", () => {
  it("nada começa antes das 8h nem termina depois das 18h, e nada cai em fim de semana", () => {
    const plan = scheduleRoute(new Date(2026, 10, 16), legs(9, 75)); // segunda
    for (const s of plan.stops) {
      expect(hm(s.arrive)).toBeGreaterThanOrEqual(WORK_START * 60);
      expect(hm(s.leave)).toBeLessThanOrEqual(WORK_END * 60);
      expect(isBusinessDay(s.arrive)).toBe(true);
    }
  });

  it("seis paradas com 1h30 de estrada não cabem num dia", () => {
    const plan = scheduleRoute(new Date(2026, 10, 16), legs(6, 90));
    expect(plan.days).toBeGreaterThan(1);
    expect(plan.stops[0].day).toBe(1);
    expect(plan.stops[plan.stops.length - 1].day).toBe(plan.days);
  });

  it("visita não atravessa o almoço", () => {
    const plan = scheduleRoute(new Date(2026, 10, 16), legs(4, 45));
    for (const s of plan.stops) {
      const cruza = hm(s.arrive) < 13 * 60 && hm(s.leave) > 12 * 60;
      expect(cruza).toBe(false);
    }
  });

  it("sábado vira segunda; o que sobra de sexta vai para segunda", () => {
    expect(toBusinessDay(new Date(2026, 10, 14)).getDay()).toBe(1);
    const plan = scheduleRoute(new Date(2026, 10, 13), legs(7, 90)); // sexta
    const segundoDia = plan.stops.find((s) => s.day === 2)!;
    expect(segundoDia.arrive.getDay()).toBe(1);
  });

  it("feriado nacional não é dia útil", () => {
    expect(isBusinessDay(new Date(2026, 11, 25))).toBe(false);
    expect(isBusinessDay(new Date(2026, 10, 20))).toBe(false);
  });

  it("confirmação é às 9h do dia útil anterior, nunca no passado", () => {
    const due = confirmationDue(new Date(2026, 10, 16, 8), new Date(2026, 10, 10, 10)); // visita na segunda
    expect(due.getDay()).toBe(5);
    expect(due.getHours()).toBe(9);
    const agora = new Date(2026, 10, 16, 7);
    expect(confirmationDue(new Date(2026, 10, 16, 8), agora)).toEqual(agora);
  });
});
