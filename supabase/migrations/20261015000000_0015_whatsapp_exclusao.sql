-- Central de Conversas: apagar para todos (revoked_at) e apagar para mim (hidden_at).
-- Mensagem revogada perde o texto e o arquivo; a oculta some da tela e perde o arquivo.
alter table public.whatsapp_live_messages
  add column if not exists revoked_at timestamptz,
  add column if not exists hidden_at timestamptz;
