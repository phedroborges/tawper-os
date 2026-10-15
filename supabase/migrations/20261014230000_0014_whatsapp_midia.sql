-- Áudio, imagem, vídeo, documento e figurinha recebidos pelo WhatsApp (ADR-003).
-- media_payload guarda o objeto da mensagem para baixar a mídia pela Stevo;
-- contém a chave de decriptação e só é lido pelo servidor.

alter table public.whatsapp_live_messages
  add column if not exists media_kind text,
  add column if not exists media_mime text not null default '',
  add column if not exists media_file_name text not null default '',
  add column if not exists media_payload jsonb;

-- Grupos não entram no atendimento: remove o que foi gravado antes do filtro.
delete from public.whatsapp_live_messages where peer like '120363%' and length(peer) >= 17;
delete from public.whatsapp_live_conversations where peer like '120363%' and length(peer) >= 17;
