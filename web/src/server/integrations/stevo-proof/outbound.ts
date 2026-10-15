import "server-only";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { sendStevoMedia, toStevoNumber, type StevoMediaType } from "./client";
import { appPublicUrl, assertProofEnabled, signMessages } from "./config";
import type { MediaKind, ProofEventView } from "./events";
import { deleteLiveMessage, getLiveConversation, insertOutboundMedia, setLiveExternalId } from "./live-store";

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export type MediaAgent = { id: string; name: string; role: string };

const PLACEHOLDER: Record<MediaKind, string> = {
  image: "[imagem]",
  audio: "[áudio]",
  video: "[vídeo]",
  document: "[documento]",
  sticker: "[figurinha]",
};

/** O WhatsApp só exibe como foto/vídeo/áudio alguns formatos; o resto vai como documento. */
function typeOf(mime: string): StevoMediaType {
  if (/^image\/(jpeg|png|webp)$/.test(mime)) return "image";
  if (mime === "video/mp4" || mime === "video/3gpp") return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/** Mensagem de voz do WhatsApp é OGG/Opus; o navegador grava WebM. Sem ffmpeg, envia como veio. */
function toOggOpus(input: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"]);
    } catch {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => proc.kill("SIGKILL"), 30_000);
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null);
    });
    proc.stdin.on("error", () => undefined);
    proc.stdin.end(input);
  });
}

export async function sendProofMedia(input: {
  to: string;
  agent: MediaAgent;
  caption: string;
  file: { bytes: Buffer; mime: string; name: string };
}) {
  assertProofEnabled();
  const { agent } = input;
  if (!agent.id || !agent.name) throw new Error("Escolha seu perfil de atendente no topo da tela.");
  const peer = toStevoNumber(input.to);
  if (!peer) throw new Error("Informe um celular brasileiro com DDD.");
  if (!input.file.bytes.length) throw new Error("Arquivo vazio.");
  if (input.file.bytes.length > MAX_MEDIA_BYTES) throw new Error("Arquivo maior que 16 MB.");
  const base = appPublicUrl();
  if (!/^https?:\/\//.test(base)) throw new Error("Defina APP_PUBLIC_URL: a Stevo busca o arquivo por ela.");

  const conversation = await getLiveConversation(peer).catch(() => null);
  if (conversation?.ownerId && conversation.ownerId !== agent.id) {
    throw new Error(`Esta conversa está com ${conversation.ownerName || "outro atendente"}. Assuma ou peça a transferência para responder.`);
  }

  let { bytes, mime } = input.file;
  let name = input.file.name || "arquivo";
  mime = (mime || "application/octet-stream").split(";")[0].toLowerCase();
  const type = typeOf(mime);
  if (type === "audio" && mime !== "audio/ogg") {
    const converted = await toOggOpus(bytes);
    if (converted) {
      bytes = converted;
      mime = "audio/ogg";
      name = name.replace(/\.[^.]+$/, "") + ".ogg";
    }
  }

  const kind: MediaKind = type;
  const signature = signMessages() ? `*${agent.name}:*` : "";
  const text = input.caption.trim();
  const caption = type === "audio" ? "" : [signature, text].filter(Boolean).join("\n");
  const body = caption || (type === "document" ? `[documento] ${name}` : PLACEHOLDER[kind]);
  const id = `out-${randomUUID()}`;
  const item: ProofEventView = {
    id,
    receivedAt: new Date().toISOString(),
    event: "SendMessage",
    from: peer,
    preview: body.slice(0, 4000),
    accepted: true,
    direction: "out",
    peer,
    name: "",
    authorId: agent.id,
    authorName: agent.name,
    mediaKind: kind,
  };
  await insertOutboundMedia(item, { kind, mime, fileName: name, payload: { base64: bytes.toString("base64") } });
  try {
    const sent = await sendStevoMedia(peer, {
      type,
      url: `${base}/api/whatsapp/media/${encodeURIComponent(id)}`,
      caption: caption || undefined,
      filename: type === "document" ? name : undefined,
    });
    await setLiveExternalId(id, sent.messageId).catch(() => undefined);
    return { number: sent.number, id };
  } catch (error) {
    await deleteLiveMessage(id).catch(() => undefined);
    throw error;
  }
}
