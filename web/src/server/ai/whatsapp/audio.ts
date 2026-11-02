/** Marcadores do texto que entra na fila quando a mensagem original era um áudio. */
export const AUDIO_PREFIX = "[áudio] ";
export const AUDIO_FAILED = "[áudio sem transcrição]";

export type WhatsAppAgentAudio = { base64: string; mime: string };
