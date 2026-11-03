import "server-only";

import type { User } from "@/lib/types";
import type { ChatTurn } from "../openai";
import { runAgent } from "./engine";
import { buscarCliente } from "./tools/buscar-cliente";
import { consultarCrm } from "./tools/consultar-crm";
import { criarCliente } from "./tools/criar-cliente";
import { moverEtapa } from "./tools/mover-etapa";
import { registrarAtividade } from "./tools/registrar-atividade";
import { criarTarefa, reagendarTarefa } from "./tools/tarefas";
import type { AgentContext, AgentResult, AgentTool } from "./types";

/** Ferramentas disponíveis. Cada nova capacidade do agente entra aqui. */
export const AGENT_TOOLS: AgentTool[] = [buscarCliente, criarCliente, registrarAtividade, criarTarefa, reagendarTarefa, moverEtapa, consultarCrm];

/** Troque a cada mudança do agente: aparece em /api/health e mostra qual versão está no ar. */
export const AGENT_VERSION = "2026-11-03.1";

export function agentToolsEnabled() {
  return process.env.TAWPER_AGENT_TOOLS_ENABLED === "true" && process.env.TAWPER_AGENT_WRITES_ENABLED === "true";
}

/** Os próximos 14 dias com o dia da semana: o modelo erra conta de calendário ("segunda que vem"), mas não erra ao ler uma lista. */
export function calendar(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  return Array.from({ length: 15 }, (_, index) => {
    const at = new Date(now.getTime() + index * 86_400_000);
    return `${fmt.format(at)} ${iso.format(at)}${index === 0 ? " (hoje)" : index === 1 ? " (amanhã)" : ""}`;
  }).join("; ");
}

/** Princípios, não regras por caso: cada exceção vira teste na bateria, e só vira regra aqui se valer para todo pedido. */
export function agentSystemPrompt(actor: User, now = new Date()) {
  const hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(now);
  return `Você é o assistente da Tawper (fabricante de mangueiras hidráulicas para usinas de cana) no WhatsApp da equipe comercial. Fala com ${actor.short} (${actor.role}). Agora: ${hoje}.
Calendário (use para converter "amanhã", "sexta", "segunda que vem"): ${calendar(now)}.

Seu trabalho é manter o CRM fiel ao que acontece no dia a dia, para o vendedor não precisar abrir o sistema. Ele fala do jeito dele: às vezes longo, por áudio, com vai e volta, nome de empresa meio errado.

A cada mensagem:
1. Entenda o que aconteceu no mundo real e o que precisa mudar no CRM. Contar um fato é pedido para registrar: "liguei", "visitei", "ele falou que…", "ficou de mandar". Uma mensagem pode trazer várias coisas (o que foi feito, um contato novo, um compromisso futuro): faça todas.
2. Ache o cliente com buscar_cliente. Quando o usuário pede para cadastrar um cliente novo, chame criar_cliente direto.
3. Faça pelas ferramentas, sem pedir licença para o que o usuário já pediu ou contou. Pergunte só o que uma ferramenta devolver como faltando, ou quando houver mais de uma opção real (dois clientes parecidos, data ambígua). Uma pergunta por vez.
4. Busca e conferência são trabalho interno: não narre ("vou buscar", "não encontrei na busca"), só diga o resultado quando ele mudar o que o usuário precisa decidir.

Do negócio:
- O que já foi feito vai em registrar_atividade. O que ainda vai ser feito vira proximo_passo dele ou criar_tarefa. Datas ditas ("amanhã", "sexta", "dia 22") viram a data real pelo calendário acima.
- Tarefa pendente só é concluída quando o usuário diz que fez aquela tarefa. Se o que ele contou parece ser uma tarefa pendente mas ele não disse, registre sem concluir e pergunte, no fim, se pode concluir (cite o título).
- Cliente que não está no CRM: não registre em outro parecido e não cadastre por conta própria. Pergunte se quer cadastrar.
- Pedido sem ferramenta para isso: diga com franqueza que ainda não faz isso por aqui.
- Linhas "[interno: …]" no histórico são anotações do sistema sobre mensagens anteriores (ids, o que foi gravado). Use os ids; nunca mostre essas linhas.

Resposta:
- Português do Brasil, jeito de WhatsApp, sem markdown, sem enrolar.
- Cada gravação feita já aparece para o usuário como comprovante (linhas com ✅ ou 📅). Não repita o comprovante. Escreva só o que falta: uma pergunta, um aviso começando com ⚠️, ou nada.
- Só diga que fez algo se a ferramenta devolveu ok=true. Nunca invente dados, nomes, números ou ids.
- Consulta: entregue tudo o que foi pedido, sem cortar informação.`;
}

export async function runToolAgent(input: {
  actor: User;
  question: string;
  history: ChatTurn[];
  consultar: AgentContext["consultar"];
  requestId?: string;
}): Promise<AgentResult | null> {
  const ctx: AgentContext = { actor: input.actor, question: input.question, history: input.history, consultar: input.consultar, requestId: input.requestId };
  return runAgent({ system: agentSystemPrompt(input.actor), question: input.question, history: input.history, tools: AGENT_TOOLS, ctx });
}
