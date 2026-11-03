import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "./types";
import { batteryBase, douglas, IDS } from "./battery/base";

const mocks = vi.hoisted(() => ({
  addActivityRecord: vi.fn(async () => "e0000000-0000-4000-8000-0000000000aa"),
  addContactRecord: vi.fn(async () => "f0000000-0000-4000-8000-0000000000aa"),
  completeActivityRecord: vi.fn(async () => "e0000000-0000-4000-8000-0000000000bb"),
  runCommand: vi.fn(async () => null),
  loadCrmSnapshot: vi.fn(),
  updateCompanyRecord: vi.fn(async () => undefined),
  companyRow: vi.fn(async () => ({ city: "Mineiros", cnpj: null })),
  lastInteractionId: vi.fn(async () => "b0000000-0000-4000-8000-0000000000aa"),
  updateContactRow: vi.fn(async () => ({ whatsapp_e164: "5564999990000", job_title: "Comprador" })),
  deleteContactRow: vi.fn(async () => ({ id: "f0000000-0000-4000-8000-000000000001", name: "Marcelo Souza" })),
  cancelActivityRow: vi.fn(async () => undefined),
}));
vi.mock("@/server/persist", () => ({
  addActivityRecord: mocks.addActivityRecord,
  addContactRecord: mocks.addContactRecord,
  completeActivityRecord: mocks.completeActivityRecord,
  updateCompanyRecord: mocks.updateCompanyRecord,
  registerCompany: vi.fn(),
}));
vi.mock("./undo", () => ({
  companyRow: mocks.companyRow,
  lastInteractionId: mocks.lastInteractionId,
  updateContactRow: mocks.updateContactRow,
  deleteContactRow: mocks.deleteContactRow,
  cancelActivityRow: mocks.cancelActivityRow,
}));
vi.mock("@/server/commands", () => ({ runCommand: mocks.runCommand }));
vi.mock("@/server/crm", () => ({ invalidateCrmReadCache: vi.fn(), loadCrmSnapshot: mocks.loadCrmSnapshot }));
vi.mock("../action-engine", () => ({
  planAssistantAction: vi.fn(),
  proposal: (input: object) => ({ ...input, id: "00000000-0000-4000-8000-0000000000ff", createdAt: "", expiresAt: "" }),
}));

import { dueFrom } from "./dates";
import { agentSystemPrompt } from "./index";
import { consultarCrm } from "./tools/consultar-crm";
import { planRegistro, registrarAtividade } from "./tools/registrar-atividade";
import { planReagendar, planTarefa, planFechar, concluirTarefa, cancelarTarefa, reagendarTarefa } from "./tools/tarefas";
import { adicionarContato, atualizarCliente, atualizarContato, excluirContato, planAdicionarContato, planAtualizarCliente } from "./tools/cliente";

import { PEDIU_CADASTRO } from "./tools/criar-cliente";
import { userAsked } from "./tools/shared";
import { colocarEmEspera, ganharNegocio, planNegocio } from "./tools/negocio";

const MARCELO = "f0000000-0000-4000-8000-000000000001";

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
    // Desfazer apaga o contato, o registro e o próximo passo que esta chamada criou.
    expect(output.desfazer?.ops).toEqual([
      { op: "apagar_contato", id: "f0000000-0000-4000-8000-0000000000aa" },
      { op: "apagar_registro", id: "b0000000-0000-4000-8000-0000000000aa" },
      { op: "cancelar_tarefa", id: "e0000000-0000-4000-8000-0000000000aa" },
    ]);
  });

  it("concluindo tarefa: fecha a tarefa com o resultado e cria o próximo passo na mesma chamada", async () => {
    await registrarAtividade.run(
      { empresa_id: IDS.santaHelena, tipo: "Ligação", resumo: "Joana recebeu o orçamento.", concluir_tarefa_id: IDS.tarefaJoana, proximo_passo: { tipo: "Cotação", titulo: "Mandar cotação revisada", data: future(7) } },
      { ...ctx, question: "liguei pra Joana, ela recebeu o orçamento" },
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

  it("desfazer do reagendamento volta a data anterior", async () => {
    const output = await reagendarTarefa.run({ tarefa_id: IDS.visitaSantaHelena, data: future(9) }, ctx);
    const original = base.activities.find((task) => task.id === IDS.visitaSantaHelena)!.dueAt;
    expect(output.desfazer?.ops).toEqual([{ op: "prazo_tarefa", id: IDS.visitaSantaHelena, dueAt: original }]);
  });

  it("concluir ou tirar a última tarefa pendente pede o próximo passo antes de gravar", () => {
    expect(planFechar({ tarefa_id: IDS.tarefaMarcelo }, base, minhaCarteira)).toMatchObject({ ok: false, faltando: ["proximo_passo"] });
    // A Santa Helena tem outras pendentes: pode fechar uma sem pedir.
    expect(planFechar({ tarefa_id: IDS.tarefaJoana }, base, minhaCarteira)).toMatchObject({ ok: true });
    expect(planFechar({ tarefa_id: IDS.tarefaColorado }, base, minhaCarteira)).toMatchObject({ ok: false, erro: expect.stringContaining("carteira") });
  });

  it("não conclui tarefa de um contato que o usuário nem citou", () => {
    expect(planFechar({ tarefa_id: IDS.tarefaJoana }, base, minhaCarteira, { question: "falei com o Pedro", history: [] })).toMatchObject({ ok: false, erro: expect.stringContaining("Joana") });
    expect(planRegistro({ empresa_id: IDS.ativos, tipo: "Ligação", resumo: "x", concluir_tarefa_id: IDS.tarefaMarcelo }, base, minhaCarteira, new Date(), { question: "liguei pro Pedro da Ativos", history: [] })).toMatchObject({ ok: false, erro: expect.stringContaining("Marcelo") });
  });

  it("concluir tarefa grava o resultado e o desfazer reabre", async () => {
    const output = await concluirTarefa.run({ tarefa_id: IDS.tarefaJoana, resultado: "Joana confirmou" }, { ...ctx, question: "dá baixa na ligação da Joana" });
    expect(mocks.completeActivityRecord).toHaveBeenCalledWith(IDS.tarefaJoana, "Joana confirmou", undefined, expect.objectContaining({ actorType: "ai" }));
    expect(output.recibo).toContain("Tarefa concluída");
    expect(output.desfazer?.ops).toEqual([{ op: "reabrir_tarefa", id: IDS.tarefaJoana }]);
  });

  it("tirar tarefa cancela com o motivo e cria o substituto quando era a última", async () => {
    const output = await cancelarTarefa.run({ tarefa_id: IDS.tarefaMarcelo, motivo: "Marcelo saiu da empresa", proximo_passo: { tipo: "Ligação", titulo: "Achar o novo comprador", data: future(2) } }, { ...ctx, question: "tira a ligação do Marcelo" });
    expect(mocks.cancelActivityRow).toHaveBeenCalledWith(IDS.douglas, IDS.tarefaMarcelo, "Removida: Marcelo saiu da empresa");
    expect(mocks.addActivityRecord).toHaveBeenCalledWith(expect.objectContaining({ titulo: "Achar o novo comprador", companyId: IDS.ativos }), expect.objectContaining({ actorType: "ai" }));
    expect(output.desfazer?.ops).toEqual([{ op: "reabrir_tarefa", id: IDS.tarefaMarcelo }, { op: "cancelar_tarefa", id: "e0000000-0000-4000-8000-0000000000aa" }]);
  });
});

describe("cadastro do cliente e contatos", () => {
  it("atualiza só o que foi dito, valida CNPJ e acrescenta observação sem apagar a anterior", () => {
    expect(planAtualizarCliente({ empresa_id: IDS.ativos, cidade: "Jataí", colhedoras: 12 }, base, minhaCarteira)).toMatchObject({ ok: true, patch: { cidade: "Jataí", colhedoras: 12 } });
    expect(planAtualizarCliente({ empresa_id: IDS.ativos, cnpj: "11.111.111/1111-11" }, base, minhaCarteira)).toMatchObject({ ok: false, erro: expect.stringContaining("CNPJ") });
    expect(planAtualizarCliente({ empresa_id: IDS.ativos }, base, minhaCarteira)).toMatchObject({ ok: false, faltando: expect.any(Array) });
    expect(planAtualizarCliente({ empresa_id: IDS.colorado, cidade: "x" }, base, minhaCarteira)).toMatchObject({ ok: false });
    const nota = planAtualizarCliente({ empresa_id: IDS.ativos, observacao: "Troca a cada 3 dias" }, { ...base, companies: base.companies.map((c) => (c.id === IDS.ativos ? { ...c, observacoes: "Antiga" } : c)) }, minhaCarteira);
    expect(nota.ok && nota.patch.observacoes).toMatch(/^Antiga\n.*Troca a cada 3 dias$/);
  });

  it("atualizar cliente guarda os valores antigos para o desfazer", async () => {
    const output = await atualizarCliente.run({ empresa_id: IDS.ativos, cidade: "Jataí" }, ctx);
    expect(mocks.updateCompanyRecord).toHaveBeenCalledWith(IDS.ativos, { cidade: "Jataí" }, IDS.douglas);
    expect(output.recibo).toContain("cidade: Jataí");
    expect(output.desfazer?.ops).toEqual([{ op: "restaurar_empresa", id: IDS.ativos, row: { city: "Mineiros", cnpj: null } }]);
  });

  it("não duplica contato que já existe", () => {
    expect(planAdicionarContato({ empresa_id: IDS.ativos, nome: "Marcelo" }, base, minhaCarteira)).toMatchObject({ ok: false, erro: expect.stringContaining("atualizar_contato") });
    expect(planAdicionarContato({ empresa_id: IDS.ativos, nome: "Pedro", whatsapp: "123" }, base, minhaCarteira)).toMatchObject({ ok: false, erro: expect.stringContaining("WhatsApp") });
    expect(planAdicionarContato({ empresa_id: IDS.ativos, nome: "Pedro", papel: "Mecânico" }, base, minhaCarteira)).toMatchObject({ ok: true, contato: { nome: "Pedro", papel: "Mecânico" } });
  });

  it("adicionar, atualizar e excluir contato saem com o desfazer certo", async () => {
    const add = await adicionarContato.run({ empresa_id: IDS.ativos, nome: "Pedro" }, ctx);
    expect(add.desfazer?.ops).toEqual([{ op: "apagar_contato", id: "f0000000-0000-4000-8000-0000000000aa" }]);
    const upd = await atualizarContato.run({ contato_id: MARCELO, whatsapp: "64 99876-5432" }, ctx);
    expect(mocks.updateContactRow).toHaveBeenCalledWith(IDS.douglas, MARCELO, { whatsapp_e164: "5564998765432" });
    expect(upd.desfazer?.ops).toEqual([{ op: "restaurar_contato", id: MARCELO, row: { whatsapp_e164: "5564999990000" } }]);
    const del = await excluirContato.run({ contato_id: MARCELO }, { ...ctx, question: "exclui o Marcelo, ele saiu" });
    expect(del.recibo).toContain("Marcelo Souza");
    expect(del.desfazer?.ops).toEqual([{ op: "recriar_contato", row: { id: MARCELO, name: "Marcelo Souza" } }]);
  });

  it("contato de outra carteira não se mexe", async () => {
    const output = await excluirContato.run({ contato_id: "f0000000-0000-4000-8000-000000000099" }, { ...ctx, question: "exclui esse contato" });
    expect(output.wrote).toBeUndefined();
    expect(mocks.deleteContactRow).not.toHaveBeenCalled();
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

describe("travas: cadastrar, tirar da agenda e excluir só a pedido", () => {
  const turn = (role: "user" | "assistant", content: string) => ({ role, content });
  it("vale o pedido agora, nas últimas mensagens, ou o sim a uma pergunta sobre isso", () => {
    expect(userAsked({ question: "Cadastra ela pra mim", history: [] }, PEDIU_CADASTRO)).toBe(true);
    expect(userAsked({ question: "Contato eu não tenho", history: [turn("user", "Quero cadastrar um cliente novo")] }, PEDIU_CADASTRO)).toBe(true);
    expect(userAsked({ question: "Pode sim", history: [turn("assistant", "A Pitangueiras não está no CRM. Quer que eu cadastre?")] }, PEDIU_CADASTRO)).toBe(true);
    expect(userAsked({ question: "Passei hoje na Usina Pitangueiras, conversei com o encarregado", history: [] }, PEDIU_CADASTRO)).toBe(false);
  });

  it("recusa cancelar tarefa e excluir contato quando o usuário só contou um fato", async () => {
    const fato = { ...ctx, question: "Falei com o Pedro, ele liberou a visita" };
    expect((await cancelarTarefa.run({ tarefa_id: IDS.tarefaMarcelo, motivo: "x" }, fato)).wrote).toBeUndefined();
    expect((await excluirContato.run({ contato_id: MARCELO }, fato)).wrote).toBeUndefined();
    expect(mocks.cancelActivityRow).not.toHaveBeenCalled();
    expect(mocks.deleteContactRow).not.toHaveBeenCalled();
  });
});

describe("ganhar, perder, espera: só propõem, gravam no CONFIRMAR", () => {
  const douglasUser = douglas();
  it("venda pede o valor e usa o negócio aberto", () => {
    expect(planNegocio("win_deal", { empresa_id: IDS.ativos }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: false, faltando: ["valor da venda"] });
    expect(planNegocio("win_deal", { empresa_id: IDS.ativos, valor: 48500 }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: true, payload: { kind: "win_deal", dealId: IDS.dealAtivos, valor: 48500 } });
    expect(planNegocio("win_deal", { empresa_id: IDS.colorado, valor: 10 }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: false, erro: expect.stringContaining("carteira") });
  });

  it("perda usa o motivo da lista quando bate", () => {
    expect(planNegocio("lose_deal", { empresa_id: IDS.ativos, motivo: "preço" }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: true, payload: { motivo: "Preço" } });
    expect(planNegocio("lose_deal", { empresa_id: IDS.ativos, motivo: "" }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: false, faltando: ["motivo da perda"] });
  });

  it("espera exige motivo, condição e data futura", () => {
    expect(planNegocio("set_standby", { empresa_id: IDS.ativos, motivo: "Entressafra", condicao_retomada: "", data_reavaliacao: future(30) }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: false, faltando: ["o que precisa acontecer para retomar"] });
    expect(planNegocio("set_standby", { empresa_id: IDS.ativos, motivo: "Entressafra", condicao_retomada: "Voltar a moer", data_reavaliacao: "2020-01-01" }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: false });
    expect(planNegocio("set_standby", { empresa_id: IDS.ativos, motivo: "entressafra / operação parada", condicao_retomada: "Voltar a moer", data_reavaliacao: future(30) }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: true, payload: { motivo: "Entressafra / operação parada", responsavelId: IDS.douglas } });
    expect(planNegocio("resume_standby", { empresa_id: IDS.ativos }, base, minhaCarteira, douglasUser)).toMatchObject({ ok: false, erro: expect.stringContaining("não está em espera") });
  });

  it("a ferramenta não grava: deixa a proposta para o CONFIRMAR e responde com o resumo", async () => {
    const local = { ...ctx } as AgentContext;
    const output = await ganharNegocio.run({ empresa_id: IDS.ativos, valor: 48500 }, local);
    expect(output.wrote).toBeUndefined();
    expect(output.reply).toContain("R$");
    expect(local.acao).toMatchObject({ kind: "win_deal", status: "awaiting_confirmation", payload: { valor: 48500 } });
    expect(mocks.runCommand).not.toHaveBeenCalled();
    const espera = await colocarEmEspera.run({ empresa_id: IDS.ativos, motivo: "x" }, { ...ctx } as AgentContext);
    expect(espera.data).toMatchObject({ ok: false });
  });
});
