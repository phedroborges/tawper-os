import { afterEach, describe, expect, it, vi } from "vitest";

const runCommand = vi.fn();
const invalidate = vi.fn();

vi.mock("@/server/commands", () => ({ runCommand }));
vi.mock("@/server/crm", () => ({ invalidateCrmReadCache: invalidate }));

describe("POST /api/crm/command", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.TAWPER_APP_PASSWORD;
    delete process.env.TAWPER_APP_SECRET;
    delete process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE;
  });

  it("recusa sem sessão quando a auth está ligada", async () => {
    process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE = "true";
    process.env.TAWPER_APP_PASSWORD = "segredo";
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/crm/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "winDeal", dealId: "00000000-0000-4000-8000-000000000001", valor: 10, actorId: "u-murilo" }),
    }));
    expect(res.status).toBe(401);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("usa o actorId da sessão, não o do body", async () => {
    process.env.TAWPER_APP_PASSWORD = "segredo";
    process.env.TAWPER_APP_SECRET = "segredo";
    const { encodeSession, createSessionForUser, sessionCookie } = await import("@/server/auth/session");
    const cookie = sessionCookie(encodeSession(createSessionForUser("u-douglas")));
    runCommand.mockResolvedValue({ ok: true });
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/crm/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${cookie.name}=${cookie.value}`,
      },
      body: JSON.stringify({ command: "winDeal", dealId: "00000000-0000-4000-8000-000000000001", valor: 10, actorId: "u-murilo" }),
    }));
    expect(res.status).toBe(200);
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ actorId: "u-douglas" }));
  });
});
