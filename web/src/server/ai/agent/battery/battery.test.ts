/**
 * Bateria do cotidiano: falas reais de vendedor (longas, por áudio, com vai e volta) rodando no modelo de verdade,
 * com o CRM e as gravações simulados. Não roda no `npm test` (custa chamadas à OpenAI).
 *
 *   AGENT_BATTERY=1 BATTERY_ENV_DIR=../../tawper-os/web BATTERY_MODELS=gpt-4o-mini,gpt-5.4 BATTERY_REPS=3 npx vitest run src/server/ai/agent/battery
 *
 * Cada falha nova que aparecer no WhatsApp vira um caso aqui antes de ser corrigida.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import type { ChatTurn } from "../../openai";
import { batteryBase, douglas, IDS } from "./base";
import { rodada, type Call } from "./recorder";

vi.mock("@/server/crm", async () => {
  const { batteryBase: fresh } = await import("./base");
  return { invalidateCrmReadCache: () => undefined, loadCrmSnapshot: async () => fresh() };
});
vi.mock("@/server/persist", async () => {
  const { recorder } = await import("./recorder");
  return {
    addActivityRecord: recorder("addActivityRecord", () => "e0000000-0000-4000-8000-0000000000aa"),
    addContactRecord: recorder("addContactRecord", () => "f0000000-0000-4000-8000-0000000000aa"),
    completeActivityRecord: recorder("completeActivityRecord", () => "e0000000-0000-4000-8000-0000000000bb"),
    updateCompanyRecord: recorder("updateCompanyRecord", () => undefined),
    registerCompany: recorder("registerCompany", (input) => {
      const { company, contacts, firstActivity } = input as { company: { nome: string; cidade: string }; contacts: { nome: string }[]; firstActivity: { titulo: string; dueAt: string; tipo: string } };
      return {
        company: { ...company, id: "c0000000-0000-4000-8000-0000000000aa", codigo: "TW-NEW" },
        contacts,
        deal: { id: "d0000000-0000-4000-8000-0000000000aa" },
        activity: { ...firstActivity, id: "e0000000-0000-4000-8000-0000000000cc" },
      };
    }),
  };
});
vi.mock("@/server/commands", async () => {
  const { recorder } = await import("./recorder");
  return { runCommand: recorder("runCommand", () => null) };
});
vi.mock("../undo", async () => {
  const { recorder } = await import("./recorder");
  // Leituras para montar o desfazer não contam como gravação.
  return {
    companyRow: async () => ({}),
    lastInteractionId: async () => null,
    updateContactRow: recorder("updateContactRow", () => ({})),
    deleteContactRow: recorder("deleteContactRow", () => ({})),
    cancelActivityRow: recorder("cancelActivityRow", () => undefined),
  };
});
vi.mock("../../action-engine", async () => {
  const { recorder } = await import("./recorder");
  return {
    proposal: (input: object) => ({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 900_000).toISOString() }),
    planAssistantAction: recorder("planAssistantAction", () => ({ texto: "Para mover para Qualificação, confirme os requisitos. Responda CONFIRMAR." })) };
});

const ON = Boolean(process.env.AGENT_BATTERY);
if (ON) {
  // Em modo de teste o Next ignora o .env.local; a bateria precisa das chaves de verdade.
  const env = process.env as Record<string, string | undefined>;
  const mode = env.NODE_ENV;
  env.NODE_ENV = "development";
  loadEnvConfig(process.env.BATTERY_ENV_DIR || process.cwd(), true, { info: () => undefined, error: console.error }, true);
  env.NODE_ENV = mode;
  if (!process.env.OPENAI_API_KEY) throw new Error("Bateria sem OPENAI_API_KEY: aponte BATTERY_ENV_DIR para a pasta do .env.local.");
}

// ---------- datas esperadas, sempre a partir de hoje em Brasília ----------
const brDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
function nextWeekday(weekday: number) {
  const now = new Date(Date.now() - 3 * 3_600_000);
  const delta = ((weekday - now.getUTCDay() + 7) % 7) || 7;
  return new Date(now.getTime() + delta * 86_400_000).toISOString().slice(0, 10);
}
const tomorrow = () => new Date(Date.now() - 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
/** "Quinta-feira da semana que vem": a quinta da semana seguinte (semana de segunda a domingo). */
function weekdayNextWeek(weekday: number) {
  const now = new Date(Date.now() - 3 * 3_600_000);
  const isoDay = now.getUTCDay() || 7;
  const nextMonday = new Date(now.getTime() + (8 - isoDay) * 86_400_000);
  return new Date(nextMonday.getTime() + ((weekday || 7) - 1) * 86_400_000).toISOString().slice(0, 10);
}

// ---------- leitura das gravações simuladas ----------
type Rodada = { calls: Call[]; respostas: string[]; ferramentas: string[][]; marcas: string[]; acoes: { kind: string; payload?: Record<string, unknown> }[]; tokens: { entrada: number; saida: number; cache: number }; ms: number };
const named = (r: Rodada, name: string) => r.calls.filter((call) => call.name === name);
const arg = <T>(call: Call, index = 0) => call.args[index] as T;
type Act = { companyId: string; tipo: string; titulo: string; dueAt: string };
type Cmd = { command: string; companyId?: string; canal?: string; activityId?: string; dueAt?: string };

/** Atividades futuras criadas: as soltas e as que vieram junto da conclusão de uma tarefa. */
function futuras(r: Rodada): Act[] {
  return [...named(r, "addActivityRecord").map((call) => arg<Act>(call)), ...named(r, "completeActivityRecord").map((call) => arg<Act>(call, 2)).filter(Boolean)];
}
/** Registros do que foi feito: interação nova ou tarefa concluída. */
function registros(r: Rodada, companyId: string) {
  const interacoes = named(r, "runCommand").map((call) => arg<Cmd>(call)).filter((cmd) => cmd.command === "addInteraction" && cmd.companyId === companyId);
  const base = batteryBase();
  const concluidas = named(r, "completeActivityRecord").filter((call) => base.activities.find((task) => task.id === arg<string>(call))?.companyId === companyId);
  return interacoes.length + concluidas.length;
}
const escritas = (r: Rodada) => r.calls.filter((call) => call.name !== "planAssistantAction").length;
const ultima = (r: Rodada) => r.respostas.at(-1) ?? "";

type Caso = { nome: string; turnos: string[]; checar: (r: Rodada) => unknown[] };

/** Vale para todo caso: o texto do modelo não repete o comprovante, não vaza anotação interna, não narra a busca. */
function geral(r: Rodada): unknown[] {
  const comRecibo = r.respostas.filter((texto) => /^(✅|📅|✏️|🗑️)/u.test(texto));
  const extras = comRecibo.map((texto) => texto.split("\n\n").slice(1).join("\n\n"));
  const repete = /[✅📅]|\b(registrei|agendei|cadastrei|criei|reagendei|anotei)\b|\b(registrad|agendad|cadastrad|reagendad|criad)[oa]s?\b/i;
  return [
    extras.some((texto) => repete.test(texto)) && "repetiu o comprovante",
    r.respostas.some((texto) => /\[interno/i.test(texto)) && "mostrou anotação interna",
    r.respostas.some((texto) => /vou (buscar|procurar|verificar)/i.test(texto)) && "narrou a busca",
    r.marcas.includes("limite_passos") && "estourou o limite de passos",
  ];
}

const CASOS: Caso[] = [
  {
    nome: "Pedro da Ativos, áudio do jeito que o Phedro falou",
    turnos: ["Acabei de fazer uma ligação para o Pedro lá da Ativos Mineiros e o Pedro me falou que a gente pode visitar ele no dia 22 de janeiro de 2027."],
    checar: (r) => [
      registros(r, IDS.ativos) !== 1 && `ligação registrada ${registros(r, IDS.ativos)} vez(es) na Ativos`,
      !named(r, "addContactRecord").some((call) => /pedro/i.test(arg<{ nome: string }>(call).nome)) && "não cadastrou o Pedro como contato",
      !futuras(r).some((act) => act.companyId === IDS.ativos && act.tipo === "Visita" && brDay(act.dueAt) === "2027-01-22") && "não marcou a visita de 22/01/2027",
      named(r, "completeActivityRecord").some((call) => arg(call) === IDS.tarefaMarcelo) && "concluiu a tarefa do Marcelo sem ele pedir",
    ],
  },
  {
    nome: "Pedro da Ativos, versão prolixa",
    turnos: [
      "Ô, bom dia. Então, ontem no finalzinho da tarde eu consegui falar com o pessoal lá da Ativos, aquela de Mineiros, sabe? Quem me atendeu foi o Pedro, ele é o gerente de manutenção lá, gente boa demais. Ele disse que tão com problema de mangueira estourando na colhedora, umas três por semana, e que querem conhecer a gente. Aí ele falou pra gente ir lá visitar dia 22 de janeiro, que antes disso eles tão parados na entressafra. Anota aí pra mim.",
    ],
    checar: (r) => [
      registros(r, IDS.ativos) !== 1 && `ligação registrada ${registros(r, IDS.ativos)} vez(es) na Ativos`,
      !named(r, "addContactRecord").some((call) => /pedro/i.test(arg<{ nome: string }>(call).nome)) && "não cadastrou o Pedro como contato",
      !futuras(r).some((act) => act.companyId === IDS.ativos && act.tipo === "Visita" && brDay(act.dueAt).endsWith("-01-22")) && "não marcou a visita de 22/01",
      named(r, "completeActivityRecord").some((call) => arg(call) === IDS.tarefaMarcelo) && "concluiu a tarefa do Marcelo sem ele pedir",
    ],
  },
  {
    nome: "Lead novo com tudo na mesma mensagem",
    turnos: ["Fala! Peguei um lead novo hoje lá na Fenasucro. É a Usina Boa Vista, fica em Quirinópolis, Goiás. O cara que eu conversei é o Marcos, ele é o comprador, o zap dele é 64 99876-5432. Cadastra ela pra mim."],
    checar: (r) => {
      const cad = named(r, "registerCompany");
      const input = cad[0] ? arg<{ company: { nome: string; cidade: string }; contacts: { nome: string; whatsapp?: string }[] }>(cad[0]) : null;
      return [
        cad.length !== 1 && `cadastrou ${cad.length} vez(es)`,
        input && !/boa vista/i.test(input.company.nome) && `nome errado: ${input.company.nome}`,
        input && !/quirin/i.test(input.company.cidade) && `cidade errada: ${input.company.cidade}`,
        input && !input.contacts.some((contact) => /marcos/i.test(contact.nome) && contact.whatsapp) && "sem o Marcos com WhatsApp",
      ];
    },
  },
  {
    nome: "Lead novo aos poucos, em três mensagens",
    turnos: ["Quero cadastrar um cliente novo", "É a Usina Cocal, lá de Paraguaçu Paulista", "Contato eu ainda não tenho não"],
    checar: (r) => {
      const cad = named(r, "registerCompany");
      return [
        cad.length !== 1 && `cadastrou ${cad.length} vez(es)`,
        cad[0] && !/cocal/i.test(arg<{ company: { nome: string } }>(cad[0]).company.nome) && "nome errado",
        /\[interno/i.test(r.respostas.join(" ")) && "mostrou anotação interna",
      ];
    },
  },
  {
    nome: "Tarefa feita, dita com todas as letras",
    turnos: [
      "Aquela ligação que eu tinha pra fazer pra Joana da Santa Helena eu já fiz, viu. Ela confirmou que recebeu o orçamento, mas falou que o preço tá um pouco acima e pediu pra gente rever o frete. Fiquei de mandar a revisão até sexta.",
    ],
    checar: (r) => {
      const sexta = nextWeekday(5);
      return [
        !named(r, "completeActivityRecord").some((call) => arg(call) === IDS.tarefaJoana) && "não concluiu a tarefa da Joana",
        !futuras(r).some((act) => act.companyId === IDS.santaHelena && brDay(act.dueAt) <= sexta && act.dueAt > new Date().toISOString().slice(0, 10)) && `sem próximo passo até sexta (${sexta})`,
        registros(r, IDS.santaHelena) > 1 && "registrou duas vezes",
      ];
    },
  },
  {
    nome: "Lembrete para amanhã",
    turnos: ["Me lembra amanhã às dez da manhã de ligar pro João lá da Santa Helena pra saber se a prensa chegou"],
    checar: (r) => {
      const act = named(r, "addActivityRecord").map((call) => arg<Act>(call));
      return [
        act.length !== 1 && `criou ${act.length} tarefa(s)`,
        act[0] && act[0].companyId !== IDS.santaHelena && "tarefa no cliente errado",
        act[0] && act[0].dueAt !== new Date(`${tomorrow()}T10:00:00-03:00`).toISOString() && `data/hora errada: ${act[0].dueAt}`,
        registros(r, IDS.santaHelena) > 0 && "registrou como se já tivesse feito",
      ];
    },
  },
  {
    nome: "Reagendar visita",
    turnos: ["A visita técnica da Santa Helena não vai rolar não, o João vai tá de folga. Passa ela pra segunda que vem, mesmo horário."],
    checar: (r) => {
      const cmd = named(r, "runCommand").map((call) => arg<Cmd>(call)).filter((item) => item.command === "reschedule");
      return [
        cmd.length !== 1 && `reagendou ${cmd.length} vez(es)`,
        cmd[0] && cmd[0].activityId !== IDS.visitaSantaHelena && "reagendou a tarefa errada",
        cmd[0] && brDay(cmd[0].dueAt!) !== nextWeekday(1) && `data errada: ${cmd[0].dueAt} (esperado ${nextWeekday(1)})`,
        cmd[0] && new Date(cmd[0].dueAt!).getUTCHours() !== 11 && "não manteve o horário (08:00)",
      ];
    },
  },
  {
    nome: "Consulta do dia",
    turnos: ["O que que eu tenho pra hoje?"],
    checar: (r) => [!named(r, "consultar").length && "não consultou", escritas(r) - named(r, "consultar").length > 0 && "gravou algo numa consulta"],
  },
  {
    nome: "Cliente que não existe no CRM",
    turnos: ["Passei hoje na Usina Pitangueiras, conversei com o encarregado da oficina, eles usam mangueira da concorrência mas tão insatisfeitos com o prazo de entrega."],
    checar: (r) => [
      (named(r, "runCommand").length || named(r, "addActivityRecord").length || named(r, "completeActivityRecord").length) && "registrou em outro cliente",
      named(r, "registerCompany").length && "cadastrou sem o usuário pedir",
      !/cadastr/i.test(ultima(r)) && "não ofereceu cadastrar",
    ],
  },
  {
    nome: "Duas coisas na mesma mensagem",
    turnos: ["Liguei agora pro Marcelo da Ativos, ele pediu orçamento de 40 mangueiras de meia polegada, vou mandar até quinta. E aproveita, me lembra de visitar a Santa Helena na segunda que vem."],
    checar: (r) => [
      registros(r, IDS.ativos) !== 1 && `ligação registrada ${registros(r, IDS.ativos)} vez(es) na Ativos`,
      !futuras(r).some((act) => act.companyId === IDS.ativos && brDay(act.dueAt) <= nextWeekday(4)) && "sem o orçamento até quinta na Ativos",
      !futuras(r).some((act) => act.companyId === IDS.santaHelena && act.tipo === "Visita" && brDay(act.dueAt) === nextWeekday(1)) && "sem a visita de segunda na Santa Helena",
    ],
  },
  {
    nome: "Cliente de outra carteira",
    turnos: ["Liguei pro comprador da Usina Colorado, ele pediu uma visita semana que vem"],
    checar: (r) => [escritas(r) > 0 && "gravou na carteira de outro vendedor", !/paulo|carteira|acesso/i.test(ultima(r)) && "não explicou que é de outra carteira"],
  },
  {
    nome: "Corrigir cadastro e acrescentar contato",
    turnos: ["Na Ativos, corrige aí: eles ficam em Jataí, não em Mineiros. E tem 12 colhedoras. Ah, e o mecânico de lá é o Tiago, o zap dele é 64 98111-2233."],
    checar: (r) => {
      const upd = named(r, "updateCompanyRecord").map((call) => ({ id: arg<string>(call), patch: arg<{ cidade?: string; colhedoras?: number }>(call, 1) }));
      const patch = Object.assign({}, ...upd.filter((item) => item.id === IDS.ativos).map((item) => item.patch)) as { cidade?: string; colhedoras?: number };
      const tiago = named(r, "addContactRecord").map((call) => arg<{ nome: string; whatsapp?: string; papel: string; companyId: string }>(call)).find((c) => /tiago/i.test(c.nome));
      return [
        !/jata/i.test(patch.cidade ?? "") && "não corrigiu a cidade",
        patch.colhedoras !== 12 && "não gravou as 12 colhedoras",
        !tiago && "não cadastrou o Tiago",
        tiago && tiago.companyId !== IDS.ativos && "Tiago no cliente errado",
        tiago && !tiago.whatsapp && "Tiago sem WhatsApp",
        registros(r, IDS.ativos) > 0 && "registrou atividade sem ninguém ter feito nada",
      ];
    },
  },
  {
    nome: "Contato saiu da empresa",
    turnos: ["O João da Santa Helena saiu da usina, pode tirar ele dos contatos."],
    checar: (r) => {
      const del = named(r, "deleteContactRow").map((call) => arg<string>(call, 1));
      return [
        del.length !== 1 && `excluiu ${del.length} contato(s)`,
        del[0] && del[0] !== "f0000000-0000-4000-8000-000000000003" && "excluiu o contato errado",
      ];
    },
  },
  {
    nome: "Tirar tarefa da agenda",
    turnos: ["Cancela aquela visita técnica da Santa Helena, o cliente desmarcou e não vai ter mais."],
    checar: (r) => {
      const cancel = named(r, "cancelActivityRow").map((call) => arg<string>(call, 1));
      return [
        cancel.length !== 1 && `cancelou ${cancel.length} tarefa(s)`,
        cancel[0] && cancel[0] !== IDS.visitaSantaHelena && "cancelou a tarefa errada",
        named(r, "completeActivityRecord").length > 0 && "concluiu em vez de cancelar",
      ];
    },
  },
  {
    nome: "Concluir tarefa direto",
    turnos: ["Pode dar baixa na ligação da Joana de hoje, já falei com ela, tá tudo certo."],
    checar: (r) => [
      !named(r, "completeActivityRecord").some((call) => arg(call) === IDS.tarefaJoana) && "não concluiu a tarefa da Joana",
      named(r, "cancelActivityRow").length > 0 && "cancelou em vez de concluir",
    ],
  },
  // ---------- da conversa real no WhatsApp, 03/11/2026 (gpt-4o-mini, versão 2026-11-03.1); dados pessoais trocados ----------
  {
    nome: "Real: apagar dois contatos errados, um de cada vez",
    turnos: ["Pode apagar o contato Phedro da Ativos de Mineiros, foi cadastrado errado.", "Faltou você apagar o outro contato \"Contato Certo\" que está no sistema"],
    checar: (r) => {
      const del = named(r, "deleteContactRow").map((call) => arg<string>(call, 1));
      return [
        !del.includes(IDS.contatoPhedro) && "não excluiu o Phedro",
        !del.includes(IDS.contatoCerto) && "não excluiu o Contato Certo",
        del.length > 2 && `excluiu ${del.length} contatos`,
        (named(r, "runCommand").length || named(r, "addContactRecord").length || named(r, "addActivityRecord").length) && "registrou ou criou algo em vez de só excluir",
      ];
    },
  },
  {
    nome: "Real: \"essa tarefa eu já fiz\" logo depois da lista",
    turnos: ["Quais tarefas eu tenho na Ativos?", "Essa do Marcelo eu já fiz"],
    checar: (r) => [
      named(r, "addContactRecord").length && "inventou um contato",
      !named(r, "completeActivityRecord").some((call) => arg(call) === IDS.tarefaMarcelo) && !/\?/.test(ultima(r)) && "nem concluiu nem perguntou o próximo passo",
    ],
  },
  {
    nome: "Real: contato novo em lista, depois de o agente pedir os dados",
    turnos: [
      "Quero cadastrar um contato na Ativos de Mineiros",
      "1. Nome do contato: Tereza Lima\n2. Cargo do contato: Supervisor\n3. Número de WhatsApp (com DDD): 64998760000\n4. E-mail (opcional): tereza@exemplo.com.br",
    ],
    checar: (r) => {
      const tereza = named(r, "addContactRecord").map((call) => arg<{ nome: string; whatsapp?: string; companyId: string }>(call)).filter((c) => /tereza/i.test(c.nome));
      return [
        tereza.length !== 1 && `cadastrou a Tereza ${tereza.length} vez(es)`,
        tereza[0] && tereza[0].companyId !== IDS.ativos && "Tereza no cliente errado",
        tereza[0] && !tereza[0].whatsapp && "Tereza sem WhatsApp",
        named(r, "registerCompany").length && "cadastrou empresa",
        r.ferramentas.flat().some((name) => name.startsWith("criar_cliente")) && "chamou criar_cliente",
      ];
    },
  },
  {
    nome: "Real: falou com a contato e marcou visita pra quinta da semana que vem",
    turnos: ["Eu queria documentar que eu falei com a Joana lá da Santa Helena e eu conversei com ela e consegui marcar a visita pra quinta-feira da semana que vem."],
    checar: (r) => {
      const quinta = weekdayNextWeek(4);
      const cmd = named(r, "runCommand").map((call) => arg<Cmd>(call)).filter((item) => item.command === "addInteraction" && item.companyId === IDS.santaHelena);
      return [
        registros(r, IDS.santaHelena) !== 1 && `registrou ${registros(r, IDS.santaHelena)} vez(es)`,
        cmd.some((item) => item.canal === "Visita") && "registrou como visita feita (foi só a conversa)",
        !futuras(r).some((act) => act.companyId === IDS.santaHelena && act.tipo === "Visita" && brDay(act.dueAt) === quinta) && `não marcou a visita na quinta ${quinta}`,
      ];
    },
  },
  {
    nome: "Real: pedido de estratégia não vira tarefa",
    turnos: ["Você pode me dar uma estratégia de como eu posso entrar em contato com a Joana da Santa Helena?"],
    checar: (r) => [escritas(r) - named(r, "consultar").length > 0 && "gravou algo num pedido de estratégia"],
  },
  {
    nome: "Venda fechada",
    turnos: ["Fechei com a Ativos! Mandaram o pedido de 48 mil e quinhentos reais, primeira compra deles."],
    checar: (r) => {
      const win = r.acoes.find((acao) => acao.kind === "win_deal");
      return [!win && "não propôs a venda", win && win.payload?.valor !== 48500 && `valor errado: ${win.payload?.valor}`, escritas(r) > 0 && "gravou sem esperar o CONFIRMAR"];
    },
  },
  {
    nome: "Venda sem valor",
    turnos: ["A Santa Helena fechou com a gente!"],
    checar: (r) => [r.acoes.some((acao) => acao.kind === "win_deal") && "propôs venda sem valor", !/valor|quanto/i.test(ultima(r)) && "não perguntou o valor"],
  },
  {
    nome: "Perdeu para o concorrente",
    turnos: ["Perdi a Santa Helena, fecharam com a concorrência por causa de preço."],
    checar: (r) => {
      const lose = r.acoes.find((acao) => acao.kind === "lose_deal");
      return [!lose && "não propôs a perda", lose && lose.payload?.companyId !== IDS.santaHelena && "perda no cliente errado", escritas(r) > 0 && "gravou sem esperar o CONFIRMAR"];
    },
  },
  {
    nome: "Cliente pediu para voltar na próxima safra",
    turnos: ["A Ativos pediu pra gente voltar a conversar só depois da entressafra, lá pra março. Coloca ela em espera."],
    checar: (r) => {
      const sb = r.acoes.find((acao) => acao.kind === "set_standby");
      const quando = String(sb?.payload?.reavaliacao ?? "");
      return [!sb && !/\?/.test(ultima(r)) && "nem propôs a espera nem perguntou o que falta", sb && !/-03-/.test(quando) && `reavaliação fora de março: ${quando}`, escritas(r) > 0 && "gravou sem esperar o CONFIRMAR"];
    },
  },
  {
    nome: "Avançar etapa",
    turnos: ["A Ativos já pode ir pra qualificação, o Marcelo confirmou que eles têm 12 colhedoras e prensa própria"],
    checar: (r) => [!named(r, "planAssistantAction").length && "não chamou mover_etapa"],
  },
  // ---------- casos vindos das conversas reais de teste (Phedro 03/11, Douglas 05/11, Murilo 07/11) ----------
  {
    nome: "Real: vários clientes na mesma mensagem (registrar os dois)",
    turnos: ["Hoje de manhã liguei pro Marcelo da Ativos e ele confirmou que a frota tem 12 colhedoras. À tarde falei com a Joana da Santa Helena, ela pediu orçamento de 20 mangueiras e vou mandar até sexta."],
    checar: (r) => [
      registros(r, IDS.ativos) < 1 && !/próximo passo|proximo passo|quando|qual.*passo|ligar|visita/i.test(ultima(r)) && "não registrou a Ativos nem perguntou o que falta",
      registros(r, IDS.santaHelena) < 1 && "não registrou a conversa da Santa Helena",
      !futuras(r).some((act) => act.companyId === IDS.santaHelena) && "sem o próximo passo do orçamento da Santa Helena",
      registros(r, IDS.ativos) > 1 && "registrou a Ativos mais de uma vez",
    ],
  },
  {
    nome: "Real: dois clientes mudam de situação na mesma mensagem (venda e perda)",
    turnos: ["Fechei a Ativos, pedido de 30 mil. E a Santa Helena eu perdi, foram pro concorrente por causa de prazo."],
    checar: (r) => {
      const propostas = r.ferramentas.flat().filter((nome) => /^(ganhar_negocio|perder_negocio|mover_etapa|colocar_em_espera)/.test(nome)).length;
      return [
        propostas < 2 && `só chamou ${propostas} ferramenta(s) de situação para dois clientes`,
        // Hoje só uma proposta fica pendente por conversa: o resultado mostra se o CONFIRMAR cobre as duas.
        propostas >= 2 && r.acoes.length < 2 && "propôs duas mudanças mas só uma fica para o CONFIRMAR",
        escritas(r) > 0 && "gravou sem esperar o CONFIRMAR",
      ];
    },
  },
  {
    nome: "Real: três clientes, um de outra carteira",
    turnos: ["Falei hoje com o Marcelo da Ativos (12 colhedoras), com a Joana da Santa Helena (pediu desconto) e com o comprador da Colorado (quer visita na semana que vem)."],
    checar: (r) => [
      registros(r, IDS.ativos) < 1 && !/próximo passo|proximo passo|quando|qual.*passo|ligar|visita/i.test(ultima(r)) && "não registrou a Ativos nem perguntou o que falta",
      registros(r, IDS.santaHelena) < 1 && "não registrou a Santa Helena",
      registros(r, IDS.colorado) > 0 && "gravou na Colorado, que é de outra carteira",
      !/colorado/i.test(ultima(r)) && "não avisou sobre a Colorado",
    ],
  },
  {
    nome: "Real: telefone ditado sem o 9",
    turnos: ["Adiciona o contato Marco Beto na Ativos de Mineiros, supervisor geral, WhatsApp 82 9111-2222"],
    checar: (r) => {
      const c = named(r, "addContactRecord").map((call) => arg<{ nome: string; whatsapp?: string }>(call)).find((item) => /marco/i.test(item.nome));
      return [!c && "não cadastrou o Marco Beto", c && c.whatsapp !== "5582991112222" && `WhatsApp errado: ${c.whatsapp}`, /formato|reenvi|manda.*novamente/i.test(ultima(r)) && "pediu para reformatar o número"];
    },
  },
  {
    nome: "Real: apagar contato não vira cadastro nem tarefa",
    turnos: ["Exclui o contato Contato Certo e também o Phedro da Ativos de Mineiros. Estão errados."],
    checar: (r) => [
      !named(r, "deleteContactRow").some((call) => call.args.includes(IDS.contatoCerto)) && "não excluiu o Contato Certo",
      !named(r, "deleteContactRow").some((call) => call.args.includes(IDS.contatoPhedro)) && "não excluiu o Phedro",
      named(r, "addContactRecord").length > 0 && "cadastrou contato em vez de excluir",
      named(r, "addActivityRecord").length > 0 && "criou tarefa em vez de excluir",
      registros(r, IDS.ativos) > 0 && "registrou interação em vez de excluir",
    ],
  },
  {
    nome: "Real: confirmação curta depois do cadastro não vira pergunta repetida",
    turnos: ["Quero adicionar a Tereza Cristina como contato na Ativos de Mineiros, supervisora, WhatsApp 65 99888-7777", "Sim"],
    checar: (r) => [
      named(r, "addContactRecord").filter((call) => /tereza/i.test(arg<{ nome: string }>(call).nome)).length !== 1 && "não cadastrou a Tereza exatamente uma vez",
      /deseja|quer.*adicionar|confirma/i.test(ultima(r)) && !named(r, "addContactRecord").length && "repetiu a pergunta depois do Sim",
    ],
  },
  {
    nome: "Real: agradecimento e aceno não geram resposta de ajuda nem gravação",
    turnos: ["Liguei pra Joana da Santa Helena, ela quer o orçamento até sexta.", "Perfeito, obrigado"],
    checar: (r) => [/não entendi|posso responder com base|experimente perguntar/i.test(ultima(r)) && "respondeu 'não entendi' ou texto de ajuda a um aceno", escritas(r) > 2 && "gravou de novo no aceno"],
  },
  {
    nome: "Real: pergunta de acompanhamento usa a consulta",
    turnos: ["Quais são minhas tarefas hoje?", "E em que etapa a Santa Helena está?"],
    checar: (r) => [!r.ferramentas.flat().includes("consultar_crm") && "não consultou o CRM", /não entendi|posso responder com base/i.test(ultima(r)) && "devolveu texto de ajuda"],
  },
  // ---------- achados do teste real no WhatsApp, 11/11 (versão .3) ----------
  {
    nome: "Real: dados de um contato vêm da busca, não de uma consulta genérica",
    turnos: ["Me passa o cargo e o whatsapp da Joana da Santa Helena"],
    checar: (r) => [
      named(r, "consultar").length > 0 && "mandou para a consulta genérica em vez de responder pela busca",
      !/compras/i.test(ultima(r)) && "não disse o cargo (Compras)",
      !/99999[- ]?0000/.test(ultima(r)) && "não disse o WhatsApp",
    ],
  },
  {
    nome: "Real: espera com só o mês não pergunta o dia",
    turnos: ["A Ativos pediu pra voltar a conversar só em março, quando fecharem o orçamento deles. Coloca em espera."],
    checar: (r) => {
      const sb = r.acoes.find((acao) => acao.kind === "set_standby");
      return [!sb && "não propôs a espera", sb && !/-03-/.test(String(sb.payload?.reavaliacao ?? "")) && `reavaliação fora de março: ${sb.payload?.reavaliacao}`, /qual dia|que dia/i.test(ultima(r)) && "perguntou o dia do mês"];
    },
  },
  {
    nome: "Real: pergunta sem cliente não diz que vai ligar",
    turnos: ["liga pra ele amanhã"],
    checar: (r) => [escritas(r) > 0 && "gravou sem saber quem é", /que eu ligue|eu ligo|eu vou ligar/i.test(ultima(r)) && "falou como se ele mesmo fosse ligar"],
  },
  {
    nome: "Real: contato por outro canal não conclui a tarefa pendente",
    turnos: ["Mandei WhatsApp pra Joana da Santa Helena falando do orçamento, ela visualizou mas não respondeu."],
    checar: (r) => [
      named(r, "completeActivityRecord").some((call) => arg(call) === IDS.tarefaJoana) && "concluiu a ligação da Joana sem o usuário dizer que ligou",
      registros(r, IDS.santaHelena) < 1 && "não registrou o WhatsApp",
    ],
  },
  {
    nome: "Real: visita à pessoa não conclui a ligação pendente dela",
    turnos: ["Visitei a Ativos de Mineiros hoje, conversei com o Marcelo e mostrei o catálogo, ele gostou. Volto a falar com ele na segunda."],
    checar: (r) => [
      named(r, "completeActivityRecord").some((call) => arg(call) === IDS.tarefaMarcelo) && "concluiu a ligação do Marcelo sem o usuário dizer que ligou",
      registros(r, IDS.ativos) < 1 && "não registrou a visita",
    ],
  },
  {
    nome: "Real: adiar não pode ir para antes da data atual",
    turnos: ["Adia a visita técnica da Santa Helena pra amanhã"],
    checar: (r) => [named(r, "runCommand").some((call) => arg<Cmd>(call).command === "reschedule") && "adiou para uma data anterior à atual", !/\?/.test(ultima(r)) && "não perguntou para qual dia"],
  },
  {
    nome: "Real: tarefa que não existe não vira outra parecida",
    turnos: ["Reagenda a reunião de diretoria da Santa Helena pra sexta"],
    checar: (r) => [named(r, "runCommand").some((call) => arg<Cmd>(call).command === "reschedule") && "reagendou uma tarefa que o usuário não descreveu", !/\?|não (achei|encontrei|tem|há)/i.test(ultima(r)) && "não avisou que não achou"],
  },
  {
    nome: "Real: canal não dito não vira ligação nem e-mail",
    turnos: ["Já mandei a proposta pra Santa Helena, a Joana recebeu e vai analisar. Retorno com ela dia 20."],
    checar: (r) => {
      const cmd = named(r, "runCommand").map((call) => arg<Cmd>(call)).filter((item) => item.command === "addInteraction" && item.companyId === IDS.santaHelena);
      return [!cmd.length && "não registrou", named(r, "completeActivityRecord").some((call) => arg(call) === IDS.tarefaJoana) && "concluiu a ligação da Joana sem ela ter sido feita", cmd.some((item) => /liga|e-?mail|whatsapp|visita|reuni/i.test(String(item.canal))) && `inventou o canal: ${cmd.map((item) => item.canal).join(", ")}`];
    },
  },
  {
    nome: "Real: resposta a pergunta de requisito da etapa é gravada antes de tentar de novo",
    turnos: ["A Ativos já pode ir pra qualificação, eles têm 12 colhedoras.", "A região comercial deles é Norte Paulista"],
    checar: (r) => [
      !named(r, "updateCompanyRecord").some((call) => /norte paulista/i.test(JSON.stringify(arg(call, 1)))) && "não gravou a região antes de conferir a etapa",
    ],
  },
  {
    nome: "Real: cadastro com dia e hora do primeiro passo usa a hora dita",
    turnos: ["Cadastra a Usina Palmeiras, de Ribeirão Preto. Contato Lia, compradora, zap 16 99888-7766. Primeiro passo: visita técnica dia 18 às 8h30."],
    checar: (r) => {
      const cad = named(r, "registerCompany");
      const passo = cad[0] ? arg<{ firstActivity: { dueAt: string } }>(cad[0]).firstActivity.dueAt : "";
      const hora = passo ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(passo)) : "";
      return [cad.length !== 1 && `cadastrou ${cad.length} vez(es)`, passo && hora !== "08:30" && `hora do primeiro passo: ${hora}`];
    },
  },
  {
    nome: "Real: valor fora da lista de opções não é escolhido por palpite",
    turnos: ["A Ativos de Mineiros tem prensa mecânica"],
    checar: (r) => [named(r, "updateCompanyRecord").some((call) => /prensa/i.test(JSON.stringify(arg(call, 1))) && /Própria/.test(JSON.stringify(arg(call, 1)))) && "escolheu 'Própria' por palpite para prensa mecânica"],
  },
  {
    nome: "Real: mandar o catálogo sem canal não vira tarefa de e-mail",
    turnos: ["Cria uma tarefa pra mandar o catálogo pra Joana da Santa Helena amanhã às 10h"],
    checar: (r) => {
      const tarefas = named(r, "addActivityRecord").map((call) => arg<{ tipo: string }>(call));
      return [!tarefas.length && "não criou a tarefa", tarefas.some((t) => /e-?mail|whats|lig|visit/i.test(t.tipo)) && `inventou o canal: ${tarefas.map((t) => t.tipo).join(", ")}`];
    },
  },
  {
    nome: "Real: pergunta encadeada sobre o contato responde com o dado gravado",
    turnos: ["Qual o zap da Joana da Santa Helena?", "e o cargo dela?"],
    checar: (r) => [!/compras/i.test(ultima(r)) && `não disse o cargo gravado (Compras): "${ultima(r).slice(0, 80)}"`, named(r, "consultar").length > 0 && "mandou a consulta genérica"],
  },
  {
    nome: "Real: pergunta do cargo com dois contatos na empresa",
    turnos: ["Qual o cargo do João Batista da Santa Helena?"],
    checar: (r) => [!/supervisor de manuten/i.test(ultima(r)) && `não disse o cargo gravado (Supervisor de manutenção): "${ultima(r).slice(0, 80)}"`],
  },
  {
    nome: "Real: conta perdida ainda recebe o registro da visita",
    turnos: ["Fiz uma visita na Usina Vale do Rio hoje de manhã, falei com a Helena. Volto lá semana que vem."],
    checar: (r) => [registros(r, IDS.perdida) < 1 && "não registrou a visita na conta perdida", /retomar|reabrir/i.test(ultima(r)) && "ofereceu retomar/reabrir"],
  },
  {
    nome: "Real: confirmar 'é outra empresa' cadastra de verdade, sem comprovante inventado",
    turnos: ["Cadastra a Usina Palmeiras, de Rio Verde, Goiás. Contato Lia, compradora, zap 64 99888-7766.", "Sim, é outra empresa"],
    checar: (r) => [
      r.respostas.some((texto) => /^(✅|📅)/mu.test(texto)) && named(r, "registerCompany").length === 0 && "disse que cadastrou sem gravar nada",
      r.marcas.includes("comprovante_inventado") && !named(r, "registerCompany").length && "inventou comprovante e não gravou",
    ],
  },
  // ---------- regras do prompt 2026-11-11.2 ----------
  {
    nome: "Pessoa nova com nome parecido de contato existente (João Pedro × João Batista)",
    turnos: ["Liguei pro João Pedro da Santa Helena, ele é o novo gerente agrícola e pediu catálogo das mangueiras."],
    checar: (r) => {
      const novo = named(r, "addContactRecord").some((call) => /jo[aã]o pedro/i.test(arg<{ nome: string }>(call).nome));
      return [registros(r, IDS.santaHelena) > 0 && !novo && "registrou a ligação sem cadastrar o João Pedro (usou outro contato?)", !registros(r, IDS.santaHelena) && !/\?/.test(ultima(r)) && "nem registrou nem perguntou"];
    },
  },
  {
    nome: "Espera sem data: pergunta antes de gravar",
    turnos: ["A Ativos pediu pra voltar a falar só na próxima safra."],
    checar: (r) => {
      const sb = r.acoes.find((acao) => acao.kind === "set_standby");
      return [escritas(r) > 0 && "gravou algo antes de fechar a espera", !sb && !/\?/.test(ultima(r)) && "nem propôs a espera nem perguntou o que falta"];
    },
  },
  {
    nome: "Estado deduzido pela cidade (não pergunta a UF)",
    turnos: ["Cadastra pra mim a Usina São Francisco, de Sertãozinho. Contato ainda não tenho."],
    checar: (r) => {
      const cad = named(r, "registerCompany");
      const uf = cad[0] ? arg<{ company: { uf?: string } }>(cad[0]).company.uf : undefined;
      return [/\bestado\b|\bUF\b/i.test(r.respostas.join(" ")) && "perguntou o estado", cad.length !== 1 && `cadastrou ${cad.length} vez(es)`, cad[0] && uf !== "SP" && `UF errada: ${uf}`];
    },
  },
];

async function rodar(caso: Caso): Promise<Rodada> {
  const { runToolAgent } = await import("../index");
  const calls: Call[] = [];
  const respostas: string[] = [];
  const ferramentas: string[][] = [];
  const marcas: string[] = [];
  const acoes: Rodada["acoes"] = [];
  const history: ChatTurn[] = [];
  const tokens = { entrada: 0, saida: 0, cache: 0 };
  const inicio = Date.now();
  await rodada.run(calls, async () => {
    for (const turno of caso.turnos) {
      const result = await runToolAgent({
        actor: douglas(),
        question: turno,
        history,
        consultar: async (pergunta) => {
          calls.push({ name: "consultar", args: [pergunta] });
          return { texto: "Hoje: 14:00 ligar para a Joana (Santa Helena). Atrasada: ligar para o Marcelo (Ativos)." };
        },
      });
      const texto = result?.texto ?? "(sem resposta: caiu no fluxo antigo)";
      respostas.push(texto);
      ferramentas.push(result?.passos.filter((step) => step.kind === "tool").map((step) => `${step.tool}${step.ok ? "" : "✗"}`) ?? []);
      marcas.push(...(result?.marcas ?? []));
      tokens.entrada += result?.tokens.entrada ?? 0;
      tokens.saida += result?.tokens.saida ?? 0;
      tokens.cache += result?.tokens.cache ?? 0;
      for (const item of result?.acoes?.length ? result.acoes : result?.acao ? [result.acao] : []) acoes.push({ kind: item.kind, payload: item.payload as Record<string, unknown> | undefined });
      history.push({ role: "user", content: turno }, { role: "assistant", content: result?.contexto.length ? `${texto}\n[interno: ${result.contexto.join(" | ")}]` : texto });
    }
  });
  return { calls, respostas, ferramentas, marcas, acoes, tokens, ms: Date.now() - inicio };
}

describe.skipIf(!ON)("bateria do cotidiano (modelo real)", () => {
  it("roda os casos e mostra o placar", { timeout: 60 * 60_000 }, async () => {
    const models = (process.env.BATTERY_MODELS || process.env.OPENAI_MODEL || "gpt-4o-mini").split(",").map((item) => item.trim()).filter(Boolean);
    const reps = Math.max(1, Number(process.env.BATTERY_REPS || 3));
    const only = process.env.BATTERY_ONLY?.toLowerCase();
    const casos = only ? CASOS.filter((caso) => caso.nome.toLowerCase().includes(only)) : CASOS;
    process.env.AI_GATEWAY_API_KEY = "";
    const report: { modelo: string; caso: string; ok: boolean; falhas: string[]; respostas: string[]; ferramentas: string[][]; gravacoes: string[] }[] = [];
    const extra: Record<string, { entrada: number; saida: number; cache: number; ms: number; runs: number }> = {};
    for (const alvo of models) {
      // "gpt-5.4@low" = modelo gpt-5.4 com esforço de raciocínio low.
      const [modelo, esforco] = alvo.split("@");
      process.env.OPENAI_MODEL = modelo;
      if (esforco) process.env.AGENT_REASONING_EFFORT = esforco;
      else delete process.env.AGENT_REASONING_EFFORT;
      const jobs = casos.flatMap((caso) => Array.from({ length: reps }, () => caso));
      // Poucas rodadas ao mesmo tempo, para não estourar o limite da OpenAI.
      const par = Math.max(1, Number(process.env.BATTERY_PARALLEL || 6));
      for (let index = 0; index < jobs.length; index += par) {
        const batch = jobs.slice(index, index + par);
        const results = await Promise.all(batch.map(async (caso) => ({ caso, r: await rodar(caso) })));
        for (const { caso, r } of results) {
          const falhas = [...caso.checar(r), ...geral(r)].filter((item): item is string => typeof item === "string");
          (extra[alvo] ??= { entrada: 0, saida: 0, cache: 0, ms: 0, runs: 0 }, extra[alvo].entrada += r.tokens.entrada, extra[alvo].saida += r.tokens.saida, extra[alvo].cache += r.tokens.cache, extra[alvo].ms += r.ms, extra[alvo].runs += 1);
          report.push({ modelo: alvo, caso: caso.nome, ok: !falhas.length, falhas, respostas: r.respostas, ferramentas: r.ferramentas, gravacoes: r.calls.map((call) => `${call.name} ${JSON.stringify(call.args).slice(0, 300)}`) });
        }
      }
    }
    const lines: string[] = [];
    for (const modelo of models) {
      const rows = report.filter((item) => item.modelo === modelo);
      const e = extra[modelo];
      const custo = e ? `  | por conversa: ${Math.round(e.entrada / e.runs)} tokens de entrada (${Math.round((100 * e.cache) / Math.max(1, e.entrada))}% do cache), ${Math.round(e.saida / e.runs)} de saída, ${(e.ms / e.runs / 1000).toFixed(1)} s` : "";
      lines.push(`
=== ${modelo}: ${rows.filter((item) => item.ok).length}/${rows.length}${custo}`);
      for (const caso of casos) {
        const mine = rows.filter((item) => item.caso === caso.nome);
        const falhas = [...new Set(mine.flatMap((item) => item.falhas))];
        lines.push(`${mine.filter((item) => item.ok).length}/${mine.length}  ${caso.nome}${falhas.length ? `  ← ${falhas.join("; ")}` : ""}`);
      }
    }
    console.log(lines.join("\n"));
    if (process.env.BATTERY_OUT) writeFileSync(process.env.BATTERY_OUT, JSON.stringify(report, null, 2));
    expect(report.length).toBeGreaterThan(0);
  });
});
