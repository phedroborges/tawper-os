import { renderWhatsAppAnswer } from "../../whatsapp/render";
import type { AgentTool } from "../types";
import { str } from "./shared";

export const consultarCrm: AgentTool = {
  name: "consultar_crm",
  description:
    "Responde perguntas de leitura sobre o CRM: agenda e tarefas do dia, números, listas, negócios, histórico, orçamentos, conversas de WhatsApp, comparativos. Use só quando o pedido é apenas consulta ou análise, sem nada para gravar. Nunca use para achar cliente, contato ou tarefa antes de gravar algo (para isso é buscar_cliente, que acha também pelo nome do contato). A resposta já vem pronta para o usuário e encerra a conversa.",
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
