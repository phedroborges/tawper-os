import "server-only";

import postgres from "postgres";
import { TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { InboundMedia, MediaKind, ProofEventView } from "./events";

export type LiveConversation = {
  peer: string;
  ownerId: string | null;
  ownerName: string;
  unread: number;
  lastMessageAt: string;
};

let sql: ReturnType<typeof postgres> | null = null;
let ready: Promise<void> | null = null;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!sql) sql = postgres(url, { max: 1, ssl: "require", idle_timeout: 20, connect_timeout: 10 });
  return sql;
}

function requireDb() {
  const client = db();
  if (!client) throw new Error("DATABASE_URL ausente: o atendimento por responsável precisa do banco.");
  return client;
}

async function ensure() {
  const client = db();
  if (!client) return;
  if (!ready) {
    ready = client
      .unsafe(
        `create table if not exists public.whatsapp_live_messages (
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
        alter table public.whatsapp_live_messages
          add column if not exists author_id text,
          add column if not exists author_name text not null default '';
        alter table public.whatsapp_live_messages
          add column if not exists media_kind text,
          add column if not exists media_mime text not null default '',
          add column if not exists media_file_name text not null default '',
          add column if not exists media_payload jsonb;
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
        alter table public.whatsapp_live_messages enable row level security;
        alter table public.whatsapp_live_conversations enable row level security;`,
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  await ready;
}

async function setAuthor(id: string, item: ProofEventView) {
  if (!item.authorId) return;
  const client = requireDb();
  await client`
    update public.whatsapp_live_messages
    set author_id = ${item.authorId}, author_name = ${item.authorName ?? ""}
    where id = ${id} and author_id is null
  `;
}

async function touchConversation(item: ProofEventView) {
  const client = requireDb();
  const unread = item.direction === "in" ? 1 : 0;
  await client`
    insert into public.whatsapp_live_conversations (peer, unread, last_message_at)
    values (${item.peer!}, ${unread}, ${item.receivedAt})
    on conflict (peer) do update set
      unread = public.whatsapp_live_conversations.unread + excluded.unread,
      last_message_at = greatest(public.whatsapp_live_conversations.last_message_at, excluded.last_message_at),
      updated_at = now()
  `;
  if (item.direction === "out" && item.authorId) {
    await client`
      update public.whatsapp_live_conversations
      set owner_id = ${item.authorId}, owner_name = ${item.authorName ?? ""}, assigned_at = now(), updated_at = now()
      where peer = ${item.peer!} and owner_id is null
    `;
  }
  if (item.direction === "in") await assignFromPortfolio(item.peer!);
}

/** Telefone cadastrado como WhatsApp de contato → responsável da empresa (carteira). */
async function assignFromPortfolio(peer: string) {
  const client = requireDb();
  const open = await client`select 1 from public.whatsapp_live_conversations where peer = ${peer} and owner_id is null`;
  if (!open.length) return;
  const candidates = peer.length === 12 && peer.startsWith("55") ? [peer, `${peer.slice(0, 4)}9${peer.slice(4)}`] : [peer];
  try {
    const rows = await client<{ owner_id: string; name: string }[]>`
      select co.owner_id::text as owner_id, coalesce(p.short_name, p.full_name, '') as name
      from public.contacts ct
      join public.companies co on co.id = ct.company_id
      left join public.profiles p on p.id = co.owner_id
      where ct.organization_id = ${TAWPER_ORG_ID}
        and ct.whatsapp_e164 in ${client(candidates)}
        and co.owner_id is not null
        and co.status in ('active', 'standby')
      limit 1
    `;
    const owner = rows[0];
    if (!owner) return;
    await client`
      update public.whatsapp_live_conversations
      set owner_id = ${owner.owner_id}, owner_name = ${owner.name}, assigned_at = now(), updated_at = now()
      where peer = ${peer} and owner_id is null
    `;
  } catch {
    // Sem schema do CRM a conversa fica na fila.
  }
}

async function setMedia(id: string, media: InboundMedia | null) {
  if (!media) return;
  const client = requireDb();
  await client`
    update public.whatsapp_live_messages
    set media_kind = ${media.kind}, media_mime = ${media.mime}, media_file_name = ${media.fileName},
        media_payload = ${client.json(media.payload as Parameters<typeof client.json>[0])}
    where id = ${id} and media_kind is null
  `;
}

export async function saveLiveMessage(item: ProofEventView, externalId = "", media: InboundMedia | null = null) {
  if (item.direction !== "in" && item.direction !== "out") return;
  if (!item.peer || !item.preview) return;
  const client = requireDb();
  await ensure();
  if (externalId) {
    const found = await client<{ id: string }[]>`select id from public.whatsapp_live_messages where external_id = ${externalId} limit 1`;
    if (found.length) {
      await setAuthor(found[0].id, item);
      await setMedia(found[0].id, media);
      return;
    }
  }
  if (item.direction === "out") {
    const duplicate = await client<{ id: string }[]>`
      select id from public.whatsapp_live_messages
      where direction = 'out' and peer = ${item.peer} and body = ${item.preview}
        and sent_at > now() - interval '20 seconds'
      limit 1
    `;
    if (duplicate.length) {
      await setAuthor(duplicate[0].id, item);
      if (externalId) {
        await client`update public.whatsapp_live_messages set external_id = ${externalId} where id = ${duplicate[0].id} and external_id is null`;
      }
      return;
    }
  }
  const inserted = await client`
    insert into public.whatsapp_live_messages (id, peer, direction, body, contact_name, external_id, sent_at, author_id, author_name)
    values (
      ${item.id},
      ${item.peer},
      ${item.direction},
      ${item.preview},
      ${item.name ?? ""},
      ${externalId || null},
      ${item.receivedAt},
      ${item.authorId ?? null},
      ${item.authorName ?? ""}
    )
    on conflict do nothing
    returning id
  `;
  if (inserted.length) await setMedia(item.id, media);
  if (item.name) {
    await client`
      update public.whatsapp_live_messages
      set contact_name = ${item.name}
      where peer = ${item.peer} and contact_name = ''
    `;
  }
  if (inserted.length) await touchConversation(item);
}

/** Mídia enviada pelo Tawper: gravada antes do envio porque a Stevo busca o arquivo pela URL pública. */
export async function insertOutboundMedia(item: ProofEventView, media: InboundMedia) {
  const client = requireDb();
  await ensure();
  await client`
    insert into public.whatsapp_live_messages
      (id, peer, direction, body, contact_name, sent_at, author_id, author_name, media_kind, media_mime, media_file_name, media_payload)
    values (
      ${item.id}, ${item.peer!}, 'out', ${item.preview}, '', ${item.receivedAt},
      ${item.authorId ?? null}, ${item.authorName ?? ""},
      ${media.kind}, ${media.mime}, ${media.fileName}, ${client.json(media.payload as Parameters<typeof client.json>[0])}
    )
  `;
  await touchConversation(item);
}

export async function setLiveExternalId(id: string, externalId: string) {
  if (!externalId) return;
  const client = requireDb();
  await client`
    update public.whatsapp_live_messages set external_id = ${externalId}
    where id = ${id} and external_id is null
      and not exists (select 1 from public.whatsapp_live_messages where external_id = ${externalId})
  `;
}

export async function deleteLiveMessage(id: string) {
  const client = requireDb();
  await client`delete from public.whatsapp_live_messages where id = ${id}`;
}

export async function listLiveMessages(): Promise<ProofEventView[] | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<
    {
      id: string;
      peer: string;
      direction: "in" | "out";
      body: string;
      contact_name: string;
      sent_at: Date;
      author_id: string | null;
      author_name: string;
      media_kind: MediaKind | null;
    }[]
  >`
    select id, peer, direction, body, contact_name, sent_at, author_id, author_name, media_kind
    from public.whatsapp_live_messages
    order by sent_at desc
    limit 500
  `;
  return rows.map((row) => ({
    id: row.id,
    receivedAt: new Date(row.sent_at).toISOString(),
    event: row.direction === "out" ? "SendMessage" : "Message",
    from: row.peer,
    preview: row.body,
    accepted: true,
    direction: row.direction,
    peer: row.peer,
    name: row.contact_name,
    authorId: row.author_id ?? undefined,
    authorName: row.author_name || undefined,
    mediaKind: row.media_kind ?? undefined,
  }));
}

export async function getLiveMedia(id: string): Promise<{ kind: MediaKind; mime: string; fileName: string; payload: Record<string, unknown> } | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<{ media_kind: MediaKind | null; media_mime: string; media_file_name: string; media_payload: Record<string, unknown> | null }[]>`
    select media_kind, media_mime, media_file_name, media_payload
    from public.whatsapp_live_messages where id = ${id}
  `;
  const row = rows[0];
  if (!row?.media_kind || !row.media_payload) return null;
  return { kind: row.media_kind, mime: row.media_mime, fileName: row.media_file_name, payload: row.media_payload };
}

export async function listLiveConversations(): Promise<LiveConversation[] | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<{ peer: string; owner_id: string | null; owner_name: string; unread: number; last_message_at: Date }[]>`
    select peer, owner_id, owner_name, unread, last_message_at
    from public.whatsapp_live_conversations
    order by last_message_at desc
    limit 500
  `;
  return rows.map((row) => ({
    peer: row.peer,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    unread: row.unread,
    lastMessageAt: new Date(row.last_message_at).toISOString(),
  }));
}

export async function getLiveConversation(peer: string): Promise<LiveConversation | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<{ peer: string; owner_id: string | null; owner_name: string; unread: number; last_message_at: Date }[]>`
    select peer, owner_id, owner_name, unread, last_message_at
    from public.whatsapp_live_conversations where peer = ${peer}
  `;
  const row = rows[0];
  if (!row) return null;
  return { peer: row.peer, ownerId: row.owner_id, ownerName: row.owner_name, unread: row.unread, lastMessageAt: new Date(row.last_message_at).toISOString() };
}

export async function setLiveOwner(peer: string, owner: { id: string; name: string } | null) {
  const client = requireDb();
  await ensure();
  await client`
    insert into public.whatsapp_live_conversations (peer, owner_id, owner_name, assigned_at)
    values (${peer}, ${owner?.id ?? null}, ${owner?.name ?? ""}, ${owner ? new Date().toISOString() : null})
    on conflict (peer) do update set
      owner_id = excluded.owner_id,
      owner_name = excluded.owner_name,
      assigned_at = excluded.assigned_at,
      updated_at = now()
  `;
}

export async function markLiveRead(peer: string) {
  const client = db();
  if (!client) return;
  await ensure();
  await client`update public.whatsapp_live_conversations set unread = 0, updated_at = now() where peer = ${peer} and unread > 0`;
}
