import { describe, expect, it } from "vitest";
import { readCrmBootstrap } from "./crm";
import { alertsOf, computeMetrics, sellerStats, timelineOf } from "@/lib/selectors";

describe.skipIf(!process.env.TAWPER_TEST_LIVE_READS)("CRM: leitura do banco sem alterações", () => {
  it("carrega os dados e calcula as telas sem erro", async () => {
    const start = performance.now();
    const body = await readCrmBootstrap();
    console.info(`Bootstrap: ${Math.round(performance.now() - start)} ms`);
    expect(body.health).toMatchObject({ ok: true });
    expect(body.snapshot).not.toBeNull();
    const data = { ...body.snapshot!, suggestions: [], conversations: [] };
    expect(() => alertsOf(data)).not.toThrow();
    expect(() => computeMetrics(data)).not.toThrow();
    expect(() => sellerStats(data)).not.toThrow();
    for (const company of data.companies) {
      expect(() => timelineOf(data, company.id)).not.toThrow();
    }
  });
});
