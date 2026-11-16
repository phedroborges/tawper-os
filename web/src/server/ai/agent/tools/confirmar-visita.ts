import type { AgentTool } from "../types";
import { requestVisitConfirmation } from "@/server/visit-confirmations";
export const confirmarVisita: AgentTool = {
  name: "confirmar_visita_cliente",
  writes: true,
  description:
    "A pedido explícito do vendedor, envia confirmação de uma visita existente ao contato e acompanha resposta. Primeiro busque cliente, selecione contato e tarefa. Data, hora e objetivo obrigatórios. Nunca invente horário; se houver dúvida, confirme com vendedor. Não é apenas criar tarefa.",
  parameters: {
    type: "object",
    properties: {
      data: {
        type: "string",
        description: "AAAA-MM-DD confirmado para a visita",
      },
      hora: { type: "string", description: "HH:MM confirmado pelo vendedor" },
      tarefa_id: { type: "string" },
      contato_id: { type: "string" },
      objetivo: { type: "string" },
      horario_confirmado: {
        type: "boolean",
        description:
          "true somente se data e hora vieram do pedido ou foram confirmadas com vendedor; nunca assumir horário padrão.",
      },
    },
    required: [
      "data",
      "hora",
      "tarefa_id",
      "contato_id",
      "objetivo",
      "horario_confirmado",
    ],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const data = await requestVisitConfirmation(args, ctx);
    return {
      data,
      wrote: data.ok,
      recibo: data.ok && "aviso" in data ? `📨 ${data.aviso}` : undefined,
    };
  },
};
