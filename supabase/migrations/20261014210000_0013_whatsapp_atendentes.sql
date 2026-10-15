-- Um número de WhatsApp (instância Stevo), vários atendentes (ADR-003, SM-2026-10-14-001).
-- Responsável por conversa, fila sem responsável, não lidas e autor da mensagem enviada.

alter table public.whatsapp_live_messages
  add column if not exists author_id text,
  add column if not exists author_name text not null default '';

create table if not exists public.whatsapp_live_conversations (
  peer text primary key,
  owner_id text,
  owner_name text not null default '',
  assigned_at timestamptz,
  unread integer not null default 0 check (unread >= 0),
  last_message_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_live_conv_owner_idx
  on public.whatsapp_live_conversations (owner_id, last_message_at desc);

insert into public.whatsapp_live_conversations (peer, last_message_at)
select peer, max(sent_at) from public.whatsapp_live_messages group by peer
on conflict (peer) do nothing;

-- Acesso só pelo servidor (conexão direta). Sem policies: authenticated/anon não leem.
alter table public.whatsapp_live_messages enable row level security;
alter table public.whatsapp_live_conversations enable row level security;
