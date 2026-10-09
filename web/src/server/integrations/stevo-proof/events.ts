import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listLiveMessages, saveLiveMessage } from "./live-store";

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

function messageText(data: Record<string, unknown> | null, depth = 0): string {
  if (!data || depth > 3) return "";
  const message = asRecord(data.Message) ?? asRecord(data.message);
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
  const wrapped = asRecord(message.ephemeralMessage) ?? asRecord(message.viewOnceMessage) ?? asRecord(message.documentWithCaptionMessage);
  const inner = asRecord(wrapped?.message);
  if (inner) return messageText({ Message: inner }, depth + 1);
  return "";
}

function externalIdOf(info: Record<string, unknown> | null, data: Record<string, unknown> | null, key: Record<string, unknown> | null) {
  const raw = info?.ID ?? info?.Id ?? key?.id ?? data?.id;
  return typeof raw === "string" ? raw : "";
}

async function keep(item: ProofEventView, externalId = "") {
  if (item.direction === "in" || item.direction === "out") {
    try {
      await saveLiveMessage(item, externalId);
      return item;
    } catch {
      remember(item);
      return item;
    }
  }
  return item;
}

export async function recordInbound(payload: unknown, accepted = true): Promise<ProofEventView> {
  const record = asRecord(payload);
  const data = asRecord(record?.data) ?? record;
  const info = asRecord(data?.Info) ?? asRecord(data?.info);
  const key = asRecord(data?.key);
  const event =
    (typeof record?.event === "string" && record.event) ||
    findString(payload, ["event", "Event", "type", "Type"]) ||
    "webhook";
  const rawFrom =
    (typeof info?.Sender === "string" && info.Sender) ||
    (typeof info?.Chat === "string" && info.Chat) ||
    (typeof key?.remoteJid === "string" && key.remoteJid) ||
    (typeof data?.jid === "string" && data.jid) ||
    findString(payload, ["from", "sender", "remoteJid", "sender_pn", "jid"]);
  const fromMe = info?.IsFromMe === true || info?.fromMe === true || key?.fromMe === true || event.toLowerCase() === "sendmessage";
  const chatJid =
    (typeof info?.Chat === "string" && info.Chat) ||
    (typeof key?.remoteJid === "string" && key.remoteJid) ||
    (typeof data?.jid === "string" && data.jid) ||
    "";
  const peer = phoneOf(chatJid) || phoneOf(rawFrom) || phoneOf(typeof info?.Sender === "string" ? info.Sender : "");
  const name =
    (!fromMe && typeof info?.PushName === "string" && info.PushName) ||
    (typeof data?.pushName === "string" ? data.pushName : "") ||
    "";
  const text = messageText(data);
  const session = /connected|disconnected|loggedout|pairsuccess|qrcode|offlinesync/i.test(event);
  const preview = text || (event === "Connected" ? "WhatsApp conectado." : event === "Disconnected" ? "WhatsApp desconectado." : "");
  const direction = !accepted || session || !text ? "note" : fromMe ? "out" : "in";
  const item: ProofEventView = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    event: accepted ? event : "recusado",
    from: peer || name,
    preview: (accepted ? preview : "A Stevo chamou, mas o token da URL não confere.").slice(0, 4000),
    accepted,
    direction,
    peer: direction === "note" ? "" : peer,
    name,
  };
  return keep(item, externalIdOf(info, data, key));
}

export async function recordSent(peer: string, text: string): Promise<ProofEventView> {
  const digits = phoneOf(peer) || peer.replace(/\D/g, "");
  return keep({
    id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    event: "SendMessage",
    from: digits,
    preview: text.slice(0, 4000),
    accepted: true,
    direction: "out",
    peer: digits,
    name: "",
  });
}

export async function listMessages(): Promise<ProofEventView[]> {
  try {
    const stored = await listLiveMessages();
    if (stored) return stored;
  } catch {
    // O arquivo local cobre a ausência momentânea do banco.
  }
  return readAll().filter((item) => item.direction === "in" || item.direction === "out");
}
