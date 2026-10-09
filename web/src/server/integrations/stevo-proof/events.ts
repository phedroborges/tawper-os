import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ProofEventView = {
  id: string;
  receivedAt: string;
  event: string;
  from: string;
  preview: string;
  accepted: boolean;
};

const MAX = 40;
const file = path.join("/tmp", "tawper-stevo-proof.json");

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function findString(value: unknown, keys: string[], depth = 0): string {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return "";
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const record = asRecord(value);
  if (!record) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = findString(item, keys, depth + 1);
        if (nested) return nested;
      }
    }
    return "";
  }
  for (const [key, found] of Object.entries(record)) {
    if (wanted.has(key.toLowerCase()) && typeof found === "string" && found.trim()) return found.trim();
  }
  for (const child of Object.values(record)) {
    if (typeof child === "object") {
      const nested = findString(child, keys, depth + 1);
      if (nested) return nested;
    }
  }
  return "";
}

function readAll(): ProofEventView[] {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as ProofEventView[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: ProofEventView[]) {
  writeFileSync(file, JSON.stringify(items.slice(0, MAX)));
}

export function recordInbound(payload: unknown, accepted = true): ProofEventView {
  const record = asRecord(payload);
  const event =
    findString(payload, ["event", "Event", "type", "Type"]) ||
    (typeof record?.event === "string" ? record.event : "webhook");
  const from = findString(payload, ["from", "From", "sender", "number", "Number", "phone", "Phone", "remoteJid", "RemoteJid", "sender_pn"]);
  const preview =
    findString(payload, ["text", "Text", "body", "Body", "conversation", "caption", "Caption", "message"]) ||
    JSON.stringify(payload).slice(0, 180);
  const item: ProofEventView = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    event: accepted ? event : "recusado",
    from,
    preview: (accepted ? preview : "A Stevo chamou, mas o token da URL não confere.").slice(0, 240),
    accepted,
  };
  const next = [item, ...readAll()].slice(0, MAX);
  writeAll(next);
  return item;
}

export function listInbound(): ProofEventView[] {
  return readAll();
}
