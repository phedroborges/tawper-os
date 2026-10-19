import { canonicalWhatsApp } from "@/lib/br-ids";

export type WhatsAppAgentInbound = {
  eventId: string;
  sender: string;
  displayName: string;
  text: string;
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
  if (!sender || !text) return null;

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
  };
}
