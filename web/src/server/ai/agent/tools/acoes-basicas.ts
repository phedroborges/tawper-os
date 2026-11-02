import { planAssistantAction } from "../../action-engine";
import type { AgentTool } from "../types";

/**
 * Ponte para as três ações que já existiam (mover etapa, criar tarefa, concluir tarefa).
 * Elas propõem e esperam o "confirmar" do WhatsApp; serão trocadas por ferramentas próprias, uma a uma.
 */
export const acoesBasicas: AgentTool = {
  name: "acao_etapa_ou_tarefa",
  description:
    "Mover um negócio de etapa, criar uma tarefa ou concluir uma tarefa. Gera uma proposta que o usuário confirma respondendo CONFIRMAR (ou pergunta o que falta). A resposta já vem pronta para o usuário e encerra a conversa.",
  writes: false,
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async run(_args, ctx) {
    const answer = await planAssistantAction({ question: ctx.question, history: ctx.history, actorId: ctx.actor.id });
    if (!answer) return { data: { ok: false, erro: "Não consegui interpretar como mover etapa ou tarefa. Peça mais detalhes ao usuário." } };
    if (answer.acao?.status === "awaiting_confirmation") ctx.acao = answer.acao;
    return { data: { ok: true, resposta: answer.texto }, reply: answer.texto };
  },
};
