import { describe, expect, it, vi } from "vitest";
import type { AgentContext } from "./types";

vi.mock("@/server/persist", () => ({ registerCompany: vi.fn() }));
vi.mock("@/server/crm", () => ({ invalidateCrmReadCache: vi.fn(), loadCrmSnapshot: vi.fn() }));
vi.mock("../action-engine", () => ({ planAssistantAction: vi.fn() }));

import { agentSystemPrompt, isCadastroConversation } from "./index";
import { consultarCrm } from "./tools/consultar-crm";

const user = (content: string) => ({ role: "user" as const, content });
const bot = (content: string) => ({ role: "assistant" as const, content });

describe("conversa de cadastro de cliente", () => {
  it("reconhece o pedido de cadastro, inclusive em forma de pergunta e por áudio", () => {
    expect(isCadastroConversation("Olá, eu queria criar um cliente novo. Tem como?", [])).toBe(true);
    expect(isCadastroConversation("quero cadastrar a empresa Ativos de Mineiros", [])).toBe(true);
    expect(isCadastroConversation("tenho uma usina nova pra cadastrar", [])).toBe(true);
    expect(isCadastroConversation("preciso incluir um lead novo", [])).toBe(true);
  });

  it("segue em modo cadastro enquanto o usuário só responde as perguntas", () => {
    const history = [user("[áudio] Queria criar um cliente novo"), bot("Qual o nome da empresa?"), user("Ativos de Mineiros"), bot("Qual a cidade?")];
    expect(isCadastroConversation("Mineiros, Goiás", history)).toBe(true);
  });

  it("não ativa em perguntas comuns", () => {
    expect(isCadastroConversation("Quais tarefas tenho hoje?", [])).toBe(false);
    expect(isCadastroConversation("Como está a Usina Santa Helena?", [user("e o dia de ontem?")])).toBe(false);
  });

  it("o aviso de cadastro só entra no prompt quando há cadastro em andamento", () => {
    const actor = { short: "Phedro", role: "admin" } as never;
    expect(agentSystemPrompt(actor, new Date(), false)).not.toContain("cadastro de cliente em andamento");
    expect(agentSystemPrompt(actor, new Date(), true)).toContain("cadastro de cliente em andamento");
  });

  it("durante o cadastro, a consulta devolve o resultado ao modelo em vez de encerrar a conversa", async () => {
    const consultar = vi.fn(async () => ({ texto: "Nenhum cadastro encontrado." }));
    const base = { actor: {}, question: "cadastro feito?", history: [], consultar } as unknown as AgentContext;
    expect((await consultarCrm.run({ pergunta: "cadastro feito?" }, { ...base, modoCadastro: true })).reply).toBeUndefined();
    expect((await consultarCrm.run({ pergunta: "cadastro feito?" }, { ...base, modoCadastro: false })).reply).toBe("Nenhum cadastro encontrado.");
  });
});
