import "server-only";

import { canonicalWhatsApp } from "@/lib/br-ids";
import { whatsappAgentStevoConfig } from "./config";

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function findString(value: unknown, keys: string[], depth = 0): string {
  if (depth > 5 || !value || typeof value !== "object") return "";
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (wanted.has(key.toLowerCase()) && typeof child === "string" && child) return child;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findString(child, keys, depth + 1);
    if (found) return found;
  }
  return "";
}

export async function sendWhatsAppAgentText(to: string, text: string) {
  const { baseUrl, apiKey } = whatsappAgentStevoConfig();
  if (!baseUrl || !apiKey) throw new Error("Stevo do agente interno não configurada.");
  const number = canonicalWhatsApp(to);
  if (!/^55\d{10,11}$/.test(number)) throw new Error("Número de destino inválido.");

  const response = await fetch(`${baseUrl}/send/text`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { raw: raw.slice(0, 200) };
  }
  if (!response.ok) {
    const error = recordOf(body);
    const message = typeof error?.message === "string" ? error.message : `Stevo respondeu ${response.status}`;
    throw new Error(message);
  }
  return {
    number,
    messageId: findString(body, ["messageId", "MessageID", "ID", "Id", "id"]),
  };
}
