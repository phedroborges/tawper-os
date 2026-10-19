import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { aiConfigured } from "./openai";

const GATEWAY_EMBEDDINGS = "https://ai-gateway.vercel.sh/v1/embeddings";
const OPENAI_EMBEDDINGS = "https://api.openai.com/v1/embeddings";

async function embedQuery(input: string) {
  if (!aiConfigured()) return null;
  const gateway = Boolean(process.env.AI_GATEWAY_API_KEY);
  const key = gateway ? process.env.AI_GATEWAY_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = gateway ? process.env.AI_EMBEDDING_MODEL || "openai/text-embedding-3-small" : process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const response = await fetch(gateway ? GATEWAY_EMBEDDINGS : OPENAI_EMBEDDINGS, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: input.slice(0, 8000), dimensions: 1536 }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: { embedding?: number[] }[] };
  const embedding = body.data?.[0]?.embedding;
  return embedding?.length === 1536 ? embedding : null;
}

/** Busca híbrida; só deve ser chamada depois que a organização vier da sessão autenticada do servidor. */
export async function searchKnowledge(input: { organizationId: string; query: string; companyId?: string; limit?: number }) {
  const embedding = await embedQuery(input.query);
  if (!embedding) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("search_ai_knowledge", {
    p_organization_id: input.organizationId,
    p_query: input.query.slice(0, 1000),
    p_embedding: embedding,
    p_company_id: input.companyId ?? null,
    p_limit: Math.min(Math.max(input.limit ?? 8, 1), 20),
  });
  if (error) throw new Error(`Busca de conhecimento falhou: ${error.message}`);
  return data ?? [];
}
