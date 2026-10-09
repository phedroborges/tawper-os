-- Histórico operacional do WhatsApp conectado.
-- A tela do vendedor lê e grava aqui. Não vincula empresa, contato nem oportunidade.

create table if not exists public.whatsapp_live_messages (
  id text primary key,
  peer text not null,
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  contact_name text not null default '',
  external_id text,
  sent_at timestamptz not null default now()
);

create unique index if not exists whatsapp_live_external_idx
  on public.whatsapp_live_messages (external_id) where external_id is not null;

create index if not exists whatsapp_live_peer_idx
  on public.whatsapp_live_messages (peer, sent_at);
