import { afterEach, describe, expect, it, vi } from "vitest";

const recordInbound = vi.fn(async () => ({ id: "e1", event: "message" }));
const ingest = vi.fn(async () => ({ disabled: true }));

vi.mock("@/server/integrations/stevo-proof/config", () => ({
  webhookToken: () => "token-certo",
}));
vi.mock("@/server/integrations/stevo-proof/events", () => ({ recordInbound }));
vi.mock("@/server/ai/whatsapp/ingest", () => ({ ingestWhatsAppAgentPayload: ingest }));
vi.mock("@/server/ai/whatsapp/runtime", () => ({ processWhatsAppAgentQueue: vi.fn() }));

describe("POST /api/whatsapp/webhook", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejeita token errado", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-token": "errado" },
      body: JSON.stringify({ ping: true }),
    }));
    expect(res.status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("aceita token no header", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-token": "token-certo" },
      body: JSON.stringify({ ping: true }),
    }));
    expect(res.status).toBe(200);
    expect(recordInbound).toHaveBeenCalled();
  });
});
