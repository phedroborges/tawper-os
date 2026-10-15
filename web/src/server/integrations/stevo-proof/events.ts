import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { clearStevoStatusCache } from "./client";
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
  authorId?: string;
  authorName?: string;
  mediaKind?: MediaKind;
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

export type MediaKind = "image" | "audio" | "video" | "document" | "sticker";

/** Objeto da mensagem como a Stevo entrega, com o arquivo em `base64`. Fica só no servidor. */
export type InboundMedia = { kind: MediaKind; mime: string; fileName: string; payload: Record<string, unknown> };

const MEDIA_KEYS: [string, MediaKind, string][] = [
  ["imageMessage", "image", "[imagem]"],
  ["audioMessage", "audio", "[áudio]"],
  ["videoMessage", "video", "[vídeo]"],
  ["documentMessage", "document", "[documento]"],
  ["stickerMessage", "sticker", "[figurinha]"],
];

function unwrap(message: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 3) return message;
  const wrapped =
    asRecord(message.ephemeralMessage) ??
    asRecord(message.viewOnceMessage) ??
    asRecord(message.viewOnceMessageV2) ??
    asRecord(message.documentWithCaptionMessage);
  const inner = asRecord(wrapped?.message);
  return inner ? unwrap(inner, depth + 1) : message;
}

function messageContent(data: Record<string, unknown> | null): { text: string; media: InboundMedia | null } {
  const outer = asRecord(data?.Message) ?? asRecord(data?.message);
  if (!outer) return { text: "", media: null };
  const message = unwrap(outer);
  if (typeof message.conversation === "string") return { text: message.conversation, media: null };
  const extended = asRecord(message.extendedTextMessage);
  if (typeof extended?.text === "string") return { text: extended.text, media: null };
  for (const [key, kind, placeholder] of MEDIA_KEYS) {
    const node = asRecord(message[key]);
    if (!node) continue;
    const caption = typeof node.caption === "string" ? node.caption : "";
    const mime = typeof node.mimetype === "string" ? node.mimetype : "";
    const fileName = typeof node.fileName === "string" ? node.fileName : typeof node.title === "string" ? node.title : "";
    const text = caption || (kind === "document" && fileName ? `[documento] ${fileName}` : placeholder);
    return { text, media: { kind, mime, fileName, payload: message } };
  }
  return { text: "", media: null };
}

/** Grupos, canais e status não entram no atendimento. */
function outsideService(jid: string) {
  return /@(g\.us|newsletter|broadcast)$/i.test(jid);
}

function externalIdOf(info: Record<string, unknown> | null, data: Record<string, unknown> | null, key: Record<string, unknown> | null) {
  const raw = info?.ID ?? info?.Id ?? key?.id ?? data?.id;
  return typeof raw === "string" ? raw : "";
}

async function keep(item: ProofEventView, externalId = "", media: InboundMedia | null = null) {
  if (item.direction === "in" || item.direction === "out") {
    try {
      await saveLiveMessage(item, externalId, media);
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
  const { text, media } = messageContent(data);
  const session = /connected|disconnected|loggedout|pairsuccess|qrcode|offlinesync/i.test(event);
  if (session) clearStevoStatusCache();
  const preview = text || (event === "Connected" ? "WhatsApp conectado." : event === "Disconnected" ? "WhatsApp desconectado." : "");
  const ignored = outsideService(chatJid) || outsideService(rawFrom);
  const direction = !accepted || session || !text || ignored ? "note" : fromMe ? "out" : "in";
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
    mediaKind: media?.kind,
  };
  return keep(item, externalIdOf(info, data, key), media);
}

export async function recordSent(
  peer: string,
  text: string,
  author?: { id: string; name: string },
  externalId = "",
): Promise<ProofEventView> {
  const digits = phoneOf(peer) || peer.replace(/\D/g, "");
  return keep(
    {
      id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toISOString(),
      event: "SendMessage",
      from: digits,
      preview: text.slice(0, 4000),
      accepted: true,
      direction: "out",
      peer: digits,
      name: "",
      authorId: author?.id,
      authorName: author?.name,
    },
    externalId,
  );
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
