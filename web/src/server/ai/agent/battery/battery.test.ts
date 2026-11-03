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
  return { planAssistantAction: recorder("planAssistantAction", () => ({ texto: "Para mover para Qualificação, confirme os requisitos. Responda CONFIRMAR." })) };
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

// ---------- leitura das gravações simuladas ----------
type Rodada = { calls: Call[]; respostas: string[]; ferramentas: string[][]; marcas: string[] };
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
  {
    nome: "Avançar etapa",
    turnos: ["A Ativos já pode ir pra qualificação, o Marcelo confirmou que eles têm 12 colhedoras e prensa própria"],
    checar: (r) => [!named(r, "planAssistantAction").length && "não chamou mover_etapa"],
  },
];

async function rodar(caso: Caso): Promise<Rodada> {
  const { runToolAgent } = await import("../index");
  const calls: Call[] = [];
  const respostas: string[] = [];
  const ferramentas: string[][] = [];
  const marcas: string[] = [];
  const history: ChatTurn[] = [];
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
      history.push({ role: "user", content: turno }, { role: "assistant", content: result?.contexto.length ? `${texto}\n[interno: ${result.contexto.join(" | ")}]` : texto });
    }
  });
  return { calls, respostas, ferramentas, marcas };
}

describe.skipIf(!ON)("bateria do cotidiano (modelo real)", () => {
  it("roda os casos e mostra o placar", { timeout: 60 * 60_000 }, async () => {
    const models = (process.env.BATTERY_MODELS || process.env.OPENAI_MODEL || "gpt-4o-mini").split(",").map((item) => item.trim()).filter(Boolean);
    const reps = Math.max(1, Number(process.env.BATTERY_REPS || 3));
    const only = process.env.BATTERY_ONLY?.toLowerCase();
    const casos = only ? CASOS.filter((caso) => caso.nome.toLowerCase().includes(only)) : CASOS;
    process.env.AI_GATEWAY_API_KEY = "";
    const report: { modelo: string; caso: string; ok: boolean; falhas: string[]; respostas: string[]; ferramentas: string[][]; gravacoes: string[] }[] = [];
    for (const modelo of models) {
      process.env.OPENAI_MODEL = modelo;
      const jobs = casos.flatMap((caso) => Array.from({ length: reps }, () => caso));
      // Poucas rodadas ao mesmo tempo, para não estourar o limite da OpenAI.
      for (let index = 0; index < jobs.length; index += 6) {
        const batch = jobs.slice(index, index + 6);
        const results = await Promise.all(batch.map(async (caso) => ({ caso, r: await rodar(caso) })));
        for (const { caso, r } of results) {
          const falhas = [...caso.checar(r), ...geral(r)].filter((item): item is string => typeof item === "string");
          report.push({ modelo, caso: caso.nome, ok: !falhas.length, falhas, respostas: r.respostas, ferramentas: r.ferramentas, gravacoes: r.calls.map((call) => `${call.name} ${JSON.stringify(call.args).slice(0, 300)}`) });
        }
      }
    }
    const lines: string[] = [];
    for (const modelo of models) {
      const rows = report.filter((item) => item.modelo === modelo);
      lines.push(`\n=== ${modelo}: ${rows.filter((item) => item.ok).length}/${rows.length}`);
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
