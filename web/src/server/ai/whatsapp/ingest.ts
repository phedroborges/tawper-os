import "server-only";

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

  const result = await enqueueWhatsAppAgentMessage({ ...message, displayName: identity.name });
  return { duplicate: result.duplicate, queued: !result.duplicate };
}
