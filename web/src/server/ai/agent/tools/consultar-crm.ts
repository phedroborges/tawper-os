import { renderWhatsAppAnswer } from "../../whatsapp/render";
import type { AgentTool } from "../types";
import { str } from "./shared";

export const consultarCrm: AgentTool = {
  name: "consultar_crm",
  description:
    "Responde perguntas de leitura sobre o CRM: números do dia, listas, tarefas, negócios, histórico, orçamentos, conversas de WhatsApp, comparativos. Use para qualquer pedido que seja só consulta ou análise. A resposta já vem pronta para o usuário e encerra a conversa.",
  writes: false,
  parameters: {
    type: "object",
    properties: { pergunta: { type: "string", description: "A pergunta do usuário, completa e com o contexto necessário." } },
    required: ["pergunta"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const answer = await ctx.consultar(str(args.pergunta, 2000) || ctx.question);
    const text = renderWhatsAppAnswer(answer);
    return { data: { ok: true, resposta: text }, reply: text };
  },
};
