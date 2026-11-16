import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), quotes: vi.fn(), routes: vi.fn(), operators: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: mocks.from }), TAWPER_ORG_ID: "org" }));
vi.mock("@/server/quotes", () => ({ listQuotes: mocks.quotes }));
vi.mock("@/server/routes", () => ({ loadRoutes: mocks.routes }));
vi.mock("@/server/persist", () => ({ ensureOperators: mocks.operators }));
vi.mock("@/server/config", () => ({ loadConfigSafe: mocks.config }));

import { EMPTY_CONFIG } from "@/lib/config";
import { invalidateCrmReadCache, loadCrmSnapshot, readCrmBootstrap } from "./crm";

beforeEach(() => {
  vi.resetAllMocks();
  invalidateCrmReadCache();
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === "organizations" ? { name: "Tawper" } : [], count: 0, error: null };
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "order", "range", "limit", "is", "maybeSingle"]) query[method] = () => query;
    query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  });
  mocks.quotes.mockResolvedValue([]);
  mocks.routes.mockResolvedValue([]);
  mocks.operators.mockResolvedValue({});
  mocks.config.mockResolvedValue(EMPTY_CONFIG);
});

it("inicia orçamentos, rotas e histórico antes de terminar as consultas principais", async () => {
  const pending = loadCrmSnapshot();
  expect(mocks.quotes).toHaveBeenCalledOnce();
  expect(mocks.routes).toHaveBeenCalledOnce();
  expect(mocks.from).toHaveBeenCalledWith("interactions");
  expect(mocks.from).toHaveBeenCalledWith("audit_events");
  expect(await pending).toMatchObject({ companies: [], deals: [], audit: [] });
});

it("retorna uma falha controlada quando consultas paralelas falham", async () => {
  mocks.quotes.mockRejectedValue(new Error("consulta recusada"));
  mocks.operators.mockRejectedValue(new Error("permissão recusada"));
  const pending = readCrmBootstrap();
  expect(mocks.config).toHaveBeenCalledOnce();
  expect(await pending).toMatchObject({ health: { ok: false, reason: "error" }, snapshot: null });
});
