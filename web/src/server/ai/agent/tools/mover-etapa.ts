import { planAssistantAction } from "../../action-engine";
import type { AgentTool } from "../types";
import { str } from "./shared";

/**
 * Ponte para a mudança de etapa que já existia: confere os requisitos da etapa, pergunta o que falta
 * e propõe a mudança, que o usuário confirma respondendo CONFIRMAR. Será trocada por uma ferramenta própria.
 */
export const moverEtapa: AgentTool = {
  name: "mover_etapa",
  description:
    "Avança o negócio de um cliente para outra etapa do funil. Confere os requisitos da etapa e pergunta o que falta; quando está tudo certo, pede ao usuário que responda CONFIRMAR. A resposta já vem pronta para o usuário.",
  writes: false,
  parameters: {
    type: "object",
    properties: {
      pedido: { type: "string", description: "Frase completa: \"Mover a <empresa> para a etapa <etapa>\", mais o que o usuário já contou sobre os requisitos." },
    },
    required: ["pedido"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const pedido = str(args.pedido, 1500) || ctx.question;
    const answer = await planAssistantAction({ question: pedido, history: ctx.history, actorId: ctx.actor.id });
    if (!answer) return { data: { ok: false, erro: "Não entendi qual cliente e qual etapa. Pergunte ao usuário." } };
    if (answer.acao?.status === "awaiting_confirmation") ctx.acao = answer.acao;
    return { data: { ok: true, resposta: answer.texto }, reply: answer.texto };
  },
};
