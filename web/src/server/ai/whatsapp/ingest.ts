import "server-only";

import { AUDIO_FAILED, AUDIO_PREFIX } from "./audio";
import { transcribeInboundAudio } from "./audio-transcribe";
import { findWhatsAppAgentIdentity, whatsappAgentEnabled } from "./config";
import { parseWhatsAppAgentInbound } from "./inbound";
import { enqueueWhatsAppAgentMessage } from "./store";

export type WhatsAppAgentIngestResult =
  | { disabled: true }
  | { ignored: "unsupported_event" | "unauthorized_sender" }
  | { duplicate: boolean; queued: boolean };

/**
 * Normaliza e enfileira uma mensagem do agente independentemente da URL de webhook usada.
 * A Stevo aceita um webhook por instância, então o canal de Conversas e o agente compartilham
 * a mesma entrada e decidem aqui se o remetente pertence à equipe autorizada.
 */
export async function ingestWhatsAppAgentPayload(payload: unknown): Promise<WhatsAppAgentIngestResult> {
  if (!whatsappAgentEnabled()) return { disabled: true };

  const message = parseWhatsAppAgentInbound(payload);
  if (!message) return { ignored: "unsupported_event" };

  const identity = findWhatsAppAgentIdentity(message.sender);
  if (!identity) return { ignored: "unauthorized_sender" };

  // Só transcreve depois de confirmar que o remetente é autorizado: áudio de estranho não gasta IA.
  let text = message.text;
  if (message.audio) {
    if (!message.audio.base64) console.warn("[agente] áudio chegou sem o arquivo no webhook; a Stevo precisa enviar o base64");
    const heard = await transcribeInboundAudio(message.audio).catch(() => null);
    text = heard ? `${AUDIO_PREFIX}${heard}` : AUDIO_FAILED;
  }
  const result = await enqueueWhatsAppAgentMessage({ eventId: message.eventId, sender: message.sender, displayName: identity.name, text });
  return { duplicate: result.duplicate, queued: !result.duplicate };
}
