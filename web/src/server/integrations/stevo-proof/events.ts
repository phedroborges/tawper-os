import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { clearStevoStatusCache } from "./client";
import { deleteLiveConversation, hideLiveMessage, listLiveMessages, markLiveForwarded, markLiveReceipts, markLiveRevoked, saveLiveMessage } from "./live-store";
import { webhookPublicUrl } from "./config";

export type MessageReceipt = "pending" | "sent" | "delivered" | "read";

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
  revoked?: boolean;
  revocable?: boolean;
  receipt?: MessageReceipt;
  forwarded?: boolean;
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

function flagOn(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "TRUE";
}

function scoreOn(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function contextForwarded(value: unknown, depth = 0): boolean {
  if (depth > 6 || value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => contextForwarded(item, depth + 1));
  const record = value as Record<string, unknown>;
  if (flagOn(record.IsForwarded) || flagOn(record.isForwarded) || flagOn(record.forwarded) || flagOn(record.is_forwarded)) return true;
  if (scoreOn(record.ForwardingScore ?? record.forwardingScore)) return true;
  const ctx = asRecord(record.contextInfo) ?? asRecord(record.ContextInfo);
  if (ctx && contextForwarded(ctx, depth + 1)) return true;
  for (const [key, child] of Object.entries(record)) {
    if (/base64|thumbnail|mediakey|filesha|fileenc|jpeg/i.test(key)) continue;
    if (child && typeof child === "object" && contextForwarded(child, depth + 1)) return true;
  }
  return false;
}

function forwardedOf(data: Record<string, unknown> | null, info: Record<string, unknown> | null) {
  if (flagOn(info?.IsForwarded) || flagOn(info?.isForwarded) || flagOn(info?.forwarded)) return true;
  if (scoreOn(info?.ForwardingScore ?? info?.forwardingScore)) return true;
  return contextForwarded(data);
}

/** Grupos, canais e status não entram no atendimento. */
function outsideService(jid: string) {
  return /@(g\.us|newsletter|broadcast)$/i.test(jid);
}

function externalIdOf(info: Record<string, unknown> | null, data: Record<string, unknown> | null, key: Record<string, unknown> | null) {
  const raw = info?.ID ?? info?.Id ?? key?.id ?? data?.id;
  return typeof raw === "string" ? raw : "";
}

function expandMessageId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const last = trimmed.split("_").at(-1) ?? trimmed;
  return last !== trimmed && last.length >= 8 ? [trimmed, last] : [trimmed];
}

function takeIds(value: unknown, into: Set<string>, depth = 0) {
  if (depth > 4 || value == null) return;
  if (typeof value === "string") {
    for (const id of expandMessageId(value)) into.add(id);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) takeIds(item, into, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, found] of Object.entries(record)) {
    if (/^(id|ids|messageid|messageids|_id)$/i.test(key)) takeIds(found, into, depth + 1);
  }
}

function receiptIdsOf(data: Record<string, unknown> | null, info: Record<string, unknown> | null, key: Record<string, unknown> | null) {
  const ids = new Set<string>();
  takeIds(data?.MessageIDs ?? data?.messageIDs ?? data?.IDs ?? data?.ids, ids);
  takeIds(info?.MessageIDs ?? info?.messageIDs, ids);
  takeIds(data?.MessageID ?? data?.messageId, ids);
  const message = asRecord(data?.message) ?? asRecord(data?.Message);
  takeIds(message?._id ?? message?.id, ids);
  if (!ids.size) takeIds(key?.id, ids);
  return [...ids];
}

function isReceiptEvent(event: string) {
  const compact = event.toLowerCase().replace(/[.\s_-]/g, "");
  return /^(receipt|ack|readreceipt|messageack)$/.test(compact) || /receipt|messageack/.test(compact);
}

/** Confirmação WhatsApp: 1 visto = enviada, 2 cinza = recebida, 2 azul = lida. */
function receiptOf(
  event: string,
  data: Record<string, unknown> | null,
  info: Record<string, unknown> | null,
  key: Record<string, unknown> | null,
): { ids: string[]; status: Exclude<MessageReceipt, "pending"> } | null {
  if (!isReceiptEvent(event)) return null;
  const typeRaw = info?.Type ?? info?.type ?? data?.Type ?? data?.type ?? data?.ReceiptType ?? data?.ack ?? data?.Ack ?? "";
  const type = String(typeRaw).toLowerCase();
  const n = Number(typeRaw);
  let status: Exclude<MessageReceipt, "pending"> = "delivered";
  if (/read-?self|read|played|lida/.test(`${event} ${type}`) || n === 3 || n === 4 || n === 5) status = "read";
  else if (n === 1 || type === "sender" || type === "server") status = "sent";
  else if (n === 2 || type === "delivered" || type === "0" || type === "") status = "delivered";
  return { ids: receiptIdsOf(data, info, key), status };
}

type Deletion = { kind: "revoke" | "hide"; externalId: string } | { kind: "chat"; peer: string };

function idOf(record: Record<string, unknown> | null) {
  const raw = record?.ID ?? record?.Id ?? record?.id;
  return typeof raw === "string" ? raw : "";
}

/**
 * Apagar para todos chega como `protocolMessage` REVOKE (tipo 0) apontando para a mensagem original.
 * Apagar para mim e apagar conversa são eventos de sincronização (`DeleteForMe`, `DeleteChat`, `ClearChat`),
 * aplicados se a Stevo os repassar.
 */
function findRecord(value: unknown, key: string, depth = 0): Record<string, unknown> | null {
  if (depth > 6) return null;
  const record = asRecord(value);
  if (!record) return null;
  const direct = asRecord(record[key]);
  if (direct) return direct;
  for (const child of Object.values(record)) {
    const found = findRecord(child, key, depth + 1);
    if (found) return found;
  }
  return null;
}

function isRevokeType(type: unknown, protocol: Record<string, unknown>) {
  if (type === 0 || type === "0" || (typeof type === "string" && /^revoke$/i.test(type))) return true;
  return type === undefined && !protocol.editedMessage;
}

function deletionOf(event: string, data: Record<string, unknown> | null): Deletion | null {
  const protocol = findRecord(data, "protocolMessage") ?? findRecord(data, "ProtocolMessage");
  if (protocol) {
    const type = protocol.type ?? protocol.Type;
    const target = idOf(asRecord(protocol.key) ?? asRecord(protocol.Key));
    if (isRevokeType(type, protocol) && target) return { kind: "revoke", externalId: target };
    return null;
  }
  if (/revoke|delete(d)?(for)?everyone|messages?\.delete/i.test(event) && !/deleteforme|deletechat|clearchat/i.test(event)) {
    const target = findString(data, ["revokedMessageId", "RevokedMessageID", "MessageID", "messageId"]) || idOf(asRecord(data?.key));
    if (target) return { kind: "revoke", externalId: target };
  }
  if (/deleteforme/i.test(event) && typeof data?.MessageID === "string" && data.MessageID) {
    return { kind: "hide", externalId: data.MessageID };
  }
  if (/deletechat|clearchat/i.test(event)) {
    const jid = typeof data?.JID === "string" ? data.JID : typeof data?.jid === "string" ? data.jid : "";
    const peer = outsideService(jid) ? "" : phoneOf(jid);
    if (peer) return { kind: "chat", peer };
  }
  return null;
}

async function applyDeletion(deletion: Deletion) {
  if (deletion.kind === "chat") await deleteLiveConversation(deletion.peer);
  else if (deletion.kind === "revoke") await markLiveRevoked({ externalId: deletion.externalId });
  else await hideLiveMessage({ externalId: deletion.externalId });
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
  const data = asRecord(record?.data) ?? asRecord(record?.Data) ?? record;
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
  const deletion = accepted ? deletionOf(event, data) : null;
  if (deletion && !outsideService(chatJid)) await applyDeletion(deletion).catch(() => undefined);
  const receipt = accepted ? receiptOf(event, data, info, key) : null;
  const inboundReceipt = receipt && !(fromMe && receipt.status !== "sent");
  if (inboundReceipt && !outsideService(chatJid)) {
    await markLiveReceipts(receipt.ids, receipt.status, peer).catch(() => undefined);
  }
  const { text, media } = messageContent(data);
  const session = /connected|disconnected|loggedout|pairsuccess|qrcode|offlinesync/i.test(event);
  if (session) clearStevoStatusCache();
  const preview = text || (event === "Connected" ? "WhatsApp conectado." : event === "Disconnected" ? "WhatsApp desconectado." : "");
  const ignored = outsideService(chatJid) || outsideService(rawFrom);
  const direction = !accepted || session || Boolean(receipt) || !text || ignored ? "note" : fromMe ? "out" : "in";
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
    forwarded: direction === "note" ? undefined : forwardedOf(data, info) || undefined,
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
      receipt: "sent",
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

function forwardHintOf(payload: unknown, receivedAt?: string) {
  const record = asRecord(payload);
  const data = asRecord(record?.data) ?? asRecord(record?.Data) ?? record;
  const info = asRecord(data?.Info) ?? asRecord(data?.info);
  const key = asRecord(data?.key);
  if (!forwardedOf(data, info)) return null;
  const { text } = messageContent(data);
  if (!text) return null;
  const chatJid =
    (typeof info?.Chat === "string" && info.Chat) ||
    (typeof key?.remoteJid === "string" && key.remoteJid) ||
    (typeof data?.jid === "string" && data.jid) ||
    "";
  const rawFrom =
    (typeof info?.Sender === "string" && info.Sender) ||
    (typeof info?.Chat === "string" && info.Chat) ||
    "";
  return {
    body: text.slice(0, 4000),
    at: receivedAt || new Date().toISOString(),
    ids: [externalIdOf(info, data, key)].filter(Boolean),
    peer: phoneOf(chatJid) || phoneOf(rawFrom),
  };
}

let lastForwardSync = 0;
let forwardSyncInflight: Promise<void> | null = null;

/** O webhook público (EasyPanel) guarda o isForwarded; o localhost lê e marca as bolhas. */
export async function syncForwardedFlagsFromDebug() {
  if (forwardSyncInflight) return forwardSyncInflight;
  if (Date.now() - lastForwardSync < 1500) return;
  lastForwardSync = Date.now();
  forwardSyncInflight = (async () => {
    const url = webhookPublicUrl();
    if (!url) return;
    const debugUrl = url.includes("?") ? `${url}&debug=1` : `${url}?debug=1`;
    const res = await fetch(debugUrl, { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { recent?: { at?: string; payload?: unknown }[] };
    for (const item of json.recent ?? []) {
      const hint = forwardHintOf(item.payload, item.at);
      if (hint) await markLiveForwarded(hint).catch(() => undefined);
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      forwardSyncInflight = null;
    });
  return forwardSyncInflight;
}
