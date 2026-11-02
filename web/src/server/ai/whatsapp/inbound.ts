import { canonicalWhatsApp } from "@/lib/br-ids";
import type { WhatsAppAgentAudio } from "./audio";

export type WhatsAppAgentInbound = {
  eventId: string;
  sender: string;
  displayName: string;
  text: string;
  /** Recado de voz: o texto vem vazio e o áudio é transcrito antes de entrar na fila. */
  audio?: WhatsAppAgentAudio;
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function stringOf(record: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function phoneOf(value: string) {
  const digits = (value.split("@")[0] ?? "").split(":")[0]?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 ? canonicalWhatsApp(digits) : "";
}

function unwrapMessage(message: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 3) return message;
  const wrapper =
    recordOf(message.ephemeralMessage) ??
    recordOf(message.viewOnceMessage) ??
    recordOf(message.viewOnceMessageV2) ??
    recordOf(message.documentWithCaptionMessage);
  const inner = recordOf(wrapper?.message);
  return inner ? unwrapMessage(inner, depth + 1) : message;
}

function textOf(data: Record<string, unknown>) {
  const outer = recordOf(data.Message) ?? recordOf(data.message) ?? data;
  const message = unwrapMessage(outer);
  const direct = stringOf(message, "conversation", "text", "body");
  if (direct) return direct;
  const extended = recordOf(message.extendedTextMessage);
  if (typeof extended?.text === "string") return extended.text.trim();
  for (const key of ["imageMessage", "videoMessage", "documentMessage"]) {
    const media = recordOf(message[key]);
    if (typeof media?.caption === "string" && media.caption.trim()) return media.caption.trim();
  }
  return "";
}

/** Procura o arquivo em base64 que a Stevo entrega junto da mensagem. */
function findBase64(value: unknown, depth = 0): string {
  if (depth > 5 || !value || typeof value !== "object") return "";
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === "base64" && typeof child === "string" && child.length > 100) return child;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findBase64(child, depth + 1);
    if (found) return found;
  }
  return "";
}

function audioOf(data: Record<string, unknown>): WhatsAppAgentAudio | null {
  const outer = recordOf(data.Message) ?? recordOf(data.message) ?? data;
  const node = recordOf(unwrapMessage(outer).audioMessage);
  if (!node) return null;
  return { base64: findBase64(data), mime: stringOf(node, "mimetype", "mimeType") || "audio/ogg" };
}

function ignoredJid(value: string) {
  return /@(g\.us|newsletter|broadcast)$/i.test(value);
}

/** Normaliza tanto o payload SM v2 usado hoje quanto o envelope de webhook de conta. */
export function parseWhatsAppAgentInbound(payload: unknown): WhatsAppAgentInbound | null {
  const root = recordOf(payload);
  if (!root) return null;
  const envelopeData = recordOf(root.data) ?? recordOf(root.Data) ?? root;
  const nestedPayload = recordOf(envelopeData.payload);
  const data = nestedPayload ?? envelopeData;
  const info = recordOf(data.Info) ?? recordOf(data.info);
  const key = recordOf(data.key) ?? recordOf(recordOf(data.message)?.key);

  const fromMe = info?.IsFromMe === true || info?.fromMe === true || key?.fromMe === true;
  if (fromMe) return null;

  const chat = stringOf(info, "Chat", "chat") || stringOf(key, "remoteJid") || stringOf(data, "jid", "chat");
  const rawSender = stringOf(info, "Sender", "sender") || stringOf(data, "from", "sender", "sender_pn") || chat;
  if (ignoredJid(chat) || ignoredJid(rawSender)) return null;

  const sender = phoneOf(rawSender) || phoneOf(chat);
  const text = textOf(data).replace(/\u0000/g, "").trim().slice(0, 4000);
  const audio = text ? null : audioOf(data);
  if (!sender || (!text && !audio)) return null;

  const eventId =
    stringOf(root, "event_id", "eventId") ||
    stringOf(info, "ID", "Id", "id") ||
    stringOf(key, "id", "ID") ||
    stringOf(data, "messageId", "MessageID", "id");
  if (!eventId) return null;

  return {
    eventId: eventId.slice(0, 300),
    sender,
    displayName: (stringOf(info, "PushName", "pushName") || stringOf(data, "pushName", "name")).slice(0, 120),
    text,
    ...(audio ? { audio } : {}),
  };
}
