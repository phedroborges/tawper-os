import "server-only";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function model() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Uma chamada ao modelo com resposta em JSON. Devolve `null` quando a chave não está configurada,
 * a OpenAI falha ou o JSON vem inválido: quem chama cai na regra local, a tela nunca trava.
 */
export async function askJSON<T>(opts: { system: string; user: string; history?: ChatTurn[]; maxTokens?: number; temperature?: number }): Promise<T | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model(),
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 1200,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: opts.system }, ...(opts.history ?? []), { role: "user", content: opts.user }],
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[ia] OpenAI respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as T;
  } catch (error) {
    console.error("[ia] falha ao chamar a OpenAI:", error instanceof Error ? error.message : error);
    return null;
  }
}
