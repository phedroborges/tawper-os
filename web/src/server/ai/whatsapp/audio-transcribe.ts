import "server-only";

import { aiTranscribe } from "../actions";
import type { WhatsAppAgentAudio } from "./audio";

const MAX_BASE64_CHARS = 20_000_000;
const EXTENSIONS: Record<string, string> = { "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm" };

/** Transcreve o áudio recebido no WhatsApp. `null` quando não há arquivo, ele é grande demais ou a IA não consegue ouvir. */
export async function transcribeInboundAudio(audio: WhatsAppAgentAudio): Promise<string | null> {
  const raw = audio.base64.replace(/^data:[^,]*,/, "").trim();
  if (!raw || raw.length > MAX_BASE64_CHARS) return null;
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length) return null;
  // Recado de voz do WhatsApp é quase sempre ogg/opus; outros formatos que a IA não aceita são tratados como ogg.
  const declared = audio.mime.split(";")[0].trim().toLowerCase();
  const mime = EXTENSIONS[declared] ? declared : "audio/ogg";
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], `audio.${EXTENSIONS[mime]}`, { type: mime }));
  return aiTranscribe(form);
}
