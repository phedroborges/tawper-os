export type ProofEvent = {
  id: string;
  receivedAt: string;
  event: string;
  from: string;
  preview: string;
  payload: unknown;
};

const MAX = 40;
const buffer: ProofEvent[] = [];

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

export function recordInbound(payload: unknown): ProofEvent {
  const record = asRecord(payload);
  const event =
    findString(payload, ["event", "Event", "type", "Type"]) ||
    (typeof record?.event === "string" ? record.event : "webhook");
  const from = findString(payload, ["from", "From", "sender", "number", "Number", "phone", "Phone", "remoteJid", "RemoteJid"]);
  const preview =
    findString(payload, ["text", "Text", "body", "Body", "conversation", "caption", "Caption"]) ||
    JSON.stringify(payload).slice(0, 180);
  const item: ProofEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    event,
    from,
    preview: preview.slice(0, 240),
    payload,
  };
  buffer.unshift(item);
  if (buffer.length > MAX) buffer.splice(MAX);
  return item;
}

export function listInbound(): ProofEvent[] {
  return buffer.map(({ payload: _payload, ...rest }) => rest);
}

export function inboundCount() {
  return buffer.length;
}
