import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "./types";
import { batteryBase, douglas, IDS } from "./battery/base";

const mocks = vi.hoisted(() => ({
  addActivityRecord: vi.fn(async () => "e0000000-0000-4000-8000-0000000000aa"),
  addContactRecord: vi.fn(async () => "f0000000-0000-4000-8000-0000000000aa"),
  completeActivityRecord: vi.fn(async () => "e0000000-0000-4000-8000-0000000000bb"),
  runCommand: vi.fn(async () => null),
  loadCrmSnapshot: vi.fn(),
}));
vi.mock("@/server/persist", () => ({ addActivityRecord: mocks.addActivityRecord, addContactRecord: mocks.addContactRecord, completeActivityRecord: mocks.completeActivityRecord, registerCompany: vi.fn() }));
vi.mock("@/server/commands", () => ({ runCommand: mocks.runCommand }));
vi.mock("@/server/crm", () => ({ invalidateCrmReadCache: vi.fn(), loadCrmSnapshot: mocks.loadCrmSnapshot }));
vi.mock("../action-engine", () => ({ planAssistantAction: vi.fn() }));

import { dueFrom } from "./dates";
import { agentSystemPrompt } from "./index";
import { consultarCrm } from "./tools/consultar-crm";
import { planRegistro, registrarAtividade } from "./tools/registrar-atividade";
import { planReagendar, planTarefa } from "./tools/tarefas";

const base = batteryBase();
const minhaCarteira = new Set([IDS.ativos, IDS.santaHelena]);
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const ctx = { actor: douglas(), question: "", history: [], consultar: vi.fn(), requestId: "job-1" } as unknown as AgentContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadCrmSnapshot.mockResolvedValue(batteryBase());
});

describe("datas", () => {
  it("converte data e hora de Brasília para ISO, com 09:00 quando não há hora", () => {
    expect(dueFrom("2027-01-22", undefined)).toEqual({ iso: "2027-01-22T12:00:00.000Z" });
    expect(dueFrom("2027-01-22", "14:30")).toEqual({ iso: "2027-01-22T17:30:00.000Z" });
  });
  it("recusa data que não existe ou fora do formato", () => {
    expect(dueFrom("2027-02-30", undefined)).toHaveProperty("erro");
    expect(dueFrom("22/01/2027", undefined)).toHaveProperty("erro");
    expect(dueFrom("2027-01-22", "25:00")).toHaveProperty("erro");
  });
});

describe("registrar atividade", () => {
  it("ligação com alguém que não é contato: cadastra o contato e marca a visita como próximo passo", () => {
    const plan = planRegistro(
      { empresa_id: IDS.ativos, tipo: "Ligação", resumo: "Pedro liberou a visita.", contato_nome: "Pedro", proximo_passo: { tipo: "Visita", titulo: "Visitar o Pedro", data: "2027-01-22" } },
      base,
      minhaCarteira,
    );
    expect(plan).toMatchObject({ ok: true, canal: "Ligação", contato: { novo: { nome: "Pedro", companyId: IDS.ativos } }, next: { tipo: "Visita", dueAt: "2027-01-22T12:00:00.000Z" } });
    if (plan.ok) expect(plan.tarefa).toBeUndefined();
  });

  it("reconhece contato que já existe pelo primeiro nome", () => {
    const plan = planRegistro({ empresa_id: IDS.santaHelena, tipo: "Ligação", resumo: "Falou com a Joana.", contato_nome: "Joana" }, base, minhaCarteira);
    expect(plan).toMatchObject({ ok: true, contato: { existente: { nome: "Joana Ribeiro" } } });
  });

  it("só conclui a tarefa indicada, e só se for da empresa", () => {
    const ok = planRegistro({ empresa_id: IDS.santaHelena, tipo: "Ligação", resumo: "Joana recebeu.", concluir_tarefa_id: IDS.tarefaJoana }, base, minhaCarteira);
    expect(ok).toMatchObject({ ok: true, tarefa: { id: IDS.tarefaJoana } });
    expect(planRegistro({ empresa_id: IDS.ativos, tipo: "Ligação", resumo: "x", concluir_tarefa_id: IDS.tarefaJoana }, base, minhaCarteira)).toMatchObject({ ok: false });
  });

  it("não deixa a empresa sem próximo passo: pede um antes de gravar", () => {
    const plan = planRegistro({ empresa_id: IDS.ativos, tipo: "Ligação", resumo: "Marcelo atendeu.", concluir_tarefa_id: IDS.tarefaMarcelo }, base, minhaCarteira);
    expect(plan).toMatchObject({ ok: false, faltando: ["proximo_passo"] });
  });

  it("vendedor não registra em cliente de outra carteira", () => {
    expect(planRegistro({ empresa_id: IDS.colorado, tipo: "Visita", resumo: "x" }, base, minhaCarteira)).toMatchObject({ ok: false, erro: expect.stringContaining("carteira") });
  });

  it("recusa próximo passo com data passada", () => {
    const plan = planRegistro({ empresa_id: IDS.ativos, tipo: "Ligação", resumo: "x", proximo_passo: { tipo: "Visita", titulo: "Visita", data: "2020-01-01" } }, base, minhaCarteira);
    expect(plan).toMatchObject({ ok: false, erro: expect.stringContaining("já passou") });
  });

  it("sem concluir tarefa: grava a interação, o contato novo e o próximo passo, e o comprovante sai do que foi gravado", async () => {
    const output = await registrarAtividade.run(
      { empresa_id: IDS.ativos, tipo: "Ligação", resultado: "Pedro liberou visita", resumo: "Pedro liberou a visita.", contato_nome: "Pedro", proximo_passo: { tipo: "Visita", titulo: "Visitar o Pedro", data: future(30) } },
      ctx,
    );
    expect(mocks.addContactRecord).toHaveBeenCalledWith(expect.objectContaining({ nome: "Pedro", companyId: IDS.ativos }), IDS.douglas);
    expect(mocks.runCommand).toHaveBeenCalledWith(expect.objectContaining({ command: "addInteraction", companyId: IDS.ativos, canal: "Ligação", titulo: "Pedro liberou visita" }));
    expect(mocks.addActivityRecord).toHaveBeenCalledWith(expect.objectContaining({ tipo: "Visita", companyId: IDS.ativos, dealId: IDS.dealAtivos }), expect.objectContaining({ actorType: "ai" }));
    expect(mocks.completeActivityRecord).not.toHaveBeenCalled();
    expect(output.wrote).toBe(true);
    expect(output.recibo).toContain("Ativos de Mineiros");
    expect(output.recibo).toContain("Visitar o Pedro");
    expect(output.memo).toContain(IDS.ativos);
  });

  it("concluindo tarefa: fecha a tarefa com o resultado e cria o próximo passo na mesma chamada", async () => {
    await registrarAtividade.run(
      { empresa_id: IDS.santaHelena, tipo: "Ligação", resumo: "Joana recebeu o orçamento.", concluir_tarefa_id: IDS.tarefaJoana, proximo_passo: { tipo: "Cotação", titulo: "Mandar cotação revisada", data: future(7) } },
      ctx,
    );
    expect(mocks.completeActivityRecord).toHaveBeenCalledWith(IDS.tarefaJoana, expect.stringContaining("Joana recebeu"), expect.objectContaining({ tipo: "Cotação" }), expect.objectContaining({ actorType: "ai", requestId: `job-1:concluir:${IDS.tarefaJoana}` }));
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });

  it("quando falta algo, não grava nada", async () => {
    const output = await registrarAtividade.run({ empresa_id: IDS.ativos, tipo: "Ligação", resumo: "x", concluir_tarefa_id: IDS.tarefaMarcelo }, ctx);
    expect(output.wrote).toBeUndefined();
    expect(mocks.runCommand).not.toHaveBeenCalled();
    expect(mocks.completeActivityRecord).not.toHaveBeenCalled();
  });
});

describe("tarefas", () => {
  it("agenda com tipo, título e data; sem tipo conhecido vira ligação", () => {
    expect(planTarefa({ empresa_id: IDS.santaHelena, tipo: "Ligação", titulo: "Ligar pro João", data: future(1), hora: "10:00" }, base, minhaCarteira)).toMatchObject({ ok: true, tipo: "Ligação" });
    expect(planTarefa({ empresa_id: IDS.santaHelena, tipo: "qualquer", titulo: "x", data: future(1) }, base, minhaCarteira)).toMatchObject({ ok: true, tipo: "Ligação" });
    expect(planTarefa({ empresa_id: IDS.santaHelena, tipo: "Ligação", titulo: "", data: future(1) }, base, minhaCarteira)).toMatchObject({ ok: false, faltando: ["titulo"] });
  });

  it("reagenda só tarefa pendente da própria carteira", () => {
    expect(planReagendar({ tarefa_id: IDS.visitaSantaHelena, data: future(9) }, base, minhaCarteira)).toMatchObject({ ok: true, task: { id: IDS.visitaSantaHelena } });
    expect(planReagendar({ tarefa_id: IDS.tarefaColorado, data: future(9) }, base, minhaCarteira)).toMatchObject({ ok: false });
    expect(planReagendar({ tarefa_id: "Visita técnica", data: future(9) }, base, minhaCarteira)).toMatchObject({ ok: false });
  });
});

describe("prompt e consulta", () => {
  it("o prompt é o mesmo para qualquer pedido: sem modo especial de cadastro", () => {
    const prompt = agentSystemPrompt(douglas());
    expect(prompt).toContain("Douglas");
    expect(prompt).not.toContain("cadastro de cliente em andamento");
  });

  it("a consulta responde direto ao usuário", async () => {
    const consultar = vi.fn(async () => ({ texto: "Hoje você tem 2 tarefas." }));
    expect((await consultarCrm.run({ pergunta: "o que tenho hoje?" }, { ...ctx, consultar })).reply).toBe("Hoje você tem 2 tarefas.");
  });
});
