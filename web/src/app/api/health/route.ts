import { NextResponse } from "next/server";
import { AGENT_VERSION, agentToolsEnabled } from "@/server/ai/agent";
import { aiConfigured } from "@/server/ai/openai";
import { getDbHealth } from "@/server/crm";
import { proofEnabled, stevoConfigured } from "@/server/integrations/stevo-proof/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getDbHealth();
  return NextResponse.json(
    {
      ...health,
      whatsappProof: {
        enabled: proofEnabled(),
        configured: stevoConfigured(),
      },
      // Só verdadeiro ou falso: mostra se o agente com ferramentas está valendo neste deploy, sem expor nenhum segredo.
      agente: {
        versao: AGENT_VERSION,
        ferramentasLigadas: agentToolsEnabled(),
        flagFerramentas: process.env.TAWPER_AGENT_TOOLS_ENABLED === "true",
        escritaLiberada: process.env.TAWPER_AGENT_WRITES_ENABLED === "true",
        iaConfigurada: aiConfigured(),
        // Nome do modelo não é segredo, e a bateria de testes precisa saber qual roda em produção.
        modelo: process.env.AI_GATEWAY_API_KEY ? "gateway" : process.env.AGENT_MODEL?.trim() || process.env.OPENAI_MODEL || "gpt-4o-mini",
        gateway: Boolean(process.env.AI_GATEWAY_API_KEY),
      },
    },
    { status: health.ok ? 200 : 503 },
  );
}
