import "server-only";

import type { AssistantAnswer } from "@/lib/ai";
import { ACTIVITY_TYPES } from "@/lib/constants";
import type { User } from "@/lib/types";
import type { ChatTurn } from "../openai";
import { runAgent } from "./engine";
import { acoesBasicas } from "./tools/acoes-basicas";
import { buscarCliente } from "./tools/buscar-cliente";
import { consultarCrm } from "./tools/consultar-crm";
import { criarCliente } from "./tools/criar-cliente";
import type { AgentContext, AgentResult, AgentTool } from "./types";

/** Ferramentas disponíveis. Cada nova capacidade do agente entra aqui. */
export const AGENT_TOOLS: AgentTool[] = [buscarCliente, criarCliente, consultarCrm, acoesBasicas];

export function agentToolsEnabled() {
  return process.env.TAWPER_AGENT_TOOLS_ENABLED === "true" && process.env.TAWPER_AGENT_WRITES_ENABLED === "true";
}

export function agentSystemPrompt(actor: User, now = new Date()) {
  const hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(now);
  return `Você é o agente interno da Tawper (fabricante de mangueiras hidráulicas para usinas de cana) no WhatsApp. Fala com ${actor.short} (${actor.role}). Agora: ${hoje}.

Estilo: conversa de WhatsApp, em português do Brasil. Curto e direto, sem enrolar, sem markdown. Uma pergunta por vez, só o que realmente falta.

Como agir:
- Pedido de consulta ou análise: chame consultar_crm.
- Falar de um cliente específico: chame buscar_cliente primeiro.
- Cliente novo: junte nome da empresa, cidade, nome do contato (e o WhatsApp dele) e o próximo passo. Pergunte só o que faltar, depois chame criar_cliente. Se buscar_cliente ou criar_cliente apontar um parecido, pergunte se é o mesmo antes de seguir.
- Mover etapa, criar ou concluir tarefa: chame acao_etapa_ou_tarefa.
- Tipos de atividade válidos: ${ACTIVITY_TYPES.join(", ")}.

Regra de ouro: você só pode dizer que criou, alterou ou registrou algo se a ferramenta devolveu ok=true. Se devolveu erro ou faltando, diga a verdade e peça o que falta. Se não existe ferramenta para o pedido, diga que ainda não consegue fazer isso por aqui. Nunca invente dados, nomes, números ou IDs.`;
}

export async function runToolAgent(input: {
  actor: User;
  question: string;
  history: ChatTurn[];
  consultar: AgentContext["consultar"];
}): Promise<AssistantAnswer | null> {
  const ctx: AgentContext = { actor: input.actor, question: input.question, history: input.history, consultar: input.consultar };
  const result: AgentResult | null = await runAgent({
    system: agentSystemPrompt(input.actor),
    question: input.question,
    history: input.history,
    tools: AGENT_TOOLS,
    ctx,
  });
  if (!result) return null;
  return { texto: result.texto, acao: result.acao };
}
