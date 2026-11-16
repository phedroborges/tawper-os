import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ scope: vi.fn() }));
vi.mock("./ai/agent/tools/shared", () => ({ loadScope: mocks.scope }));
import {
  requestVisitConfirmation,
  validateVisitReply,
  visitClock,
} from "./visit-confirmations";
import type { AgentContext } from "./ai/agent/types";
const ctx = {
  actor: { id: "seller", role: "vendedor" },
  question: "Envie a confirmação",
  history: [],
} as unknown as AgentContext;
beforeEach(() => {
  vi.stubEnv("TAWPER_COMMUNICATIONS_ENABLED", "true");
  mocks.scope.mockResolvedValue({
    visible: new Set(["company"]),
    snapshot: {
      activities: [
        {
          id: "visit",
          companyId: "company",
          ownerId: "seller",
          tipo: "Visita",
          status: "pendente",
          dueAt: "2030-01-01T18:00:00Z",
        },
      ],
      contacts: [],
      users: [],
    },
  });
});
it("não envia sem confirmação do horário pelo vendedor", async () => {
  expect(
    await requestVisitConfirmation({ tarefa_id: "visit" }, ctx),
  ).toMatchObject({ ok: false, erro: expect.stringContaining("Confirme") });
});
it("recusa tarefa fora da carteira", async () => {
  expect(
    await requestVisitConfirmation(
      { tarefa_id: "other", horario_confirmado: true },
      ctx,
    ),
  ).toMatchObject({ ok: false });
});
it("recusa envio sem contato autorizado", async () => {
  expect(
    await requestVisitConfirmation(
      {
        tarefa_id: "visit",
        horario_confirmado: true,
        data: "2030-01-01",
        hora: "15:00",
      },
      ctx,
    ),
  ).toMatchObject({ ok: false, erro: expect.stringContaining("autorizar") });
});
it("não confirma mudança de horário ou resposta incerta", () => {
  expect(
    validateVisitReply({ result: "confirmed", same_schedule: false }),
  ).toBe("change");
  expect(validateVisitReply(null)).toBe("unknown");
  expect(validateVisitReply({ result: "confirmed", same_schedule: true })).toBe(
    "confirmed",
  );
  expect(
    validateVisitReply({ result: "confirmed", same_schedule: "true" }),
  ).toBe("change");
});

it("avisa após duas horas e continua escutando até o prazo, sem cancelar a visita", () => {
  const sent = "2030-01-01T10:00:00Z",
    due = "2030-01-02T18:00:00Z";
  expect(
    visitClock(due, sent, undefined, Date.parse("2030-01-01T11:59:59Z")),
  ).toBe("listen");
  expect(
    visitClock(due, sent, undefined, Date.parse("2030-01-01T12:00:00Z")),
  ).toBe("warn");
  expect(
    visitClock(
      due,
      sent,
      "2030-01-01T12:00:00Z",
      Date.parse("2030-01-02T17:59:59Z"),
    ),
  ).toBe("listen");
  expect(visitClock(due, sent, undefined, Date.parse(due))).toBe("expired");
});

it("recusa horário divergente e hora ausente mesmo com booleano confirmado", async () => {
  expect(
    await requestVisitConfirmation(
      {
        tarefa_id: "visit",
        horario_confirmado: true,
        data: "2030-01-01",
        hora: "14:00",
      },
      ctx,
    ),
  ).toMatchObject({
    ok: false,
    erro: expect.stringContaining("não correspondem"),
  });
  expect(
    await requestVisitConfirmation(
      { tarefa_id: "visit", horario_confirmado: true, data: "2030-01-01" },
      ctx,
    ),
  ).toMatchObject({ ok: false, erro: expect.stringContaining("horário") });
});
