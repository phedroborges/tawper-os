import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ProofEventView = {
  id: string;
  receivedAt: string;
  event: string;
  from: string;
  preview: string;
  accepted: boolean;
  direction?: "in" | "out" | "note";
  peer?: string;
  name?: string;
};

const MAX = 200;
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

function remember(item: ProofEventView): ProofEventView {
  const existing = readAll();
  if (item.direction === "out" && item.peer && item.preview) {
    const duplicate = existing.some(
      (old) =>
        old.direction === "out" &&
        old.peer === item.peer &&
        old.preview === item.preview &&
        Date.now() - new Date(old.receivedAt).getTime() < 20000,
    );
    if (duplicate) return item;
  }
  writeAll([item, ...existing]);
  return item;
}

function phoneOf(value: string) {
  const head = value.split("@")[0] ?? "";
  const digits = head.split(":")[0]?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 ? digits : "";
}

function messageText(data: Record<string, unknown> | null) {
  const message = asRecord(data?.Message) ?? asRecord(data?.message);
  if (!message) return "";
  if (typeof message.conversation === "string") return message.conversation;
  const extended = asRecord(message.extendedTextMessage);
  if (typeof extended?.text === "string") return extended.text;
  for (const key of ["imageMessage", "videoMessage", "documentMessage"]) {
    const media = asRecord(message[key]);
    if (typeof media?.caption === "string" && media.caption) return media.caption;
  }
  if (message.audioMessage) return "[áudio]";
  if (message.imageMessage) return "[imagem]";
  if (message.videoMessage) return "[vídeo]";
  if (message.documentMessage) return "[documento]";
  return "";
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => (/token|apikey|secret|authorization/i.test(key) ? [key, "[oculto]"] : [key, redact(child)])),
  );
}

export function recordInbound(payload: unknown, accepted = true): ProofEventView {
  const record = asRecord(payload);
  const data = asRecord(record?.data) ?? record;
  const info = asRecord(data?.Info) ?? asRecord(data?.info);
  const event =
    (typeof record?.event === "string" && record.event) ||
    findString(payload, ["event", "Event", "type", "Type"]) ||
    "webhook";
  const rawFrom =
    (typeof info?.Sender === "string" && info.Sender) ||
    (typeof info?.Chat === "string" && info.Chat) ||
    (typeof data?.jid === "string" && data.jid) ||
    findString(payload, ["from", "sender", "remoteJid", "sender_pn", "jid"]);
  const fromMe = info?.IsFromMe === true || info?.fromMe === true || event.toLowerCase() === "sendmessage";
  const chatJid = (typeof info?.Chat === "string" && info.Chat) || (typeof data?.jid === "string" && data.jid) || "";
  const peer = phoneOf(chatJid) || phoneOf(rawFrom) || phoneOf(typeof info?.Sender === "string" ? info.Sender : "");
  const name =
    (!fromMe && typeof info?.PushName === "string" && info.PushName) ||
    (typeof data?.pushName === "string" ? data.pushName : "") ||
    "";
  const from = peer || name;
  const text = messageText(data);
  const session = /connected|disconnected|loggedout|pairsuccess|qrcode|offlinesync/i.test(event);
  const preview = text || (event === "Connected" ? "WhatsApp conectado." : event === "Disconnected" ? "WhatsApp desconectado." : JSON.stringify(redact(payload)).slice(0, 180));
  const direction = !accepted || session || !text ? "note" : fromMe ? "out" : "in";
  const item: ProofEventView = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    event: accepted ? event : "recusado",
    from,
    preview: (accepted ? preview : "A Stevo chamou, mas o token da URL não confere.").slice(0, 240),
    accepted,
    direction,
    peer: direction === "note" ? "" : peer,
    name,
  };
  return remember(item);
}

export function recordSent(peer: string, text: string): ProofEventView {
  const digits = phoneOf(peer) || peer.replace(/\D/g, "");
  return remember({
    id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    event: "SendMessage",
    from: digits,
    preview: text.slice(0, 240),
    accepted: true,
    direction: "out",
    peer: digits,
    name: "",
  });
}

export function listInbound(): ProofEventView[] {
  return readAll();
}
