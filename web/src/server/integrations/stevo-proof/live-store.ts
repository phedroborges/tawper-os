import "server-only";

import postgres from "postgres";
import { canonicalWhatsApp } from "@/lib/br-ids";
import { TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { decideConversationRoute } from "@/server/ai/conversation-routing";
import type { InboundMedia, MediaKind, MessageReceipt, ProofEventView } from "./events";

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
        alter table public.whatsapp_live_messages
          add column if not exists revoked_at timestamptz,
          add column if not exists hidden_at timestamptz;
        alter table public.whatsapp_live_messages
          add column if not exists receipt text not null default 'delivered';
        alter table public.whatsapp_live_messages
          add column if not exists forwarded boolean not null default false;
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
        alter table public.whatsapp_live_conversations enable row level security;
        update public.whatsapp_live_messages
          set peer = substr(peer, 1, 4) || '9' || substr(peer, 5)
          where length(peer) = 12 and peer like '55%' and substr(peer, 5, 1) between '6' and '9';
        insert into public.whatsapp_live_conversations as c (peer, owner_id, owner_name, assigned_at, unread, last_message_at)
          select substr(peer, 1, 4) || '9' || substr(peer, 5), owner_id, owner_name, assigned_at, unread, last_message_at
          from public.whatsapp_live_conversations
          where length(peer) = 12 and peer like '55%' and substr(peer, 5, 1) between '6' and '9'
          on conflict (peer) do update set
            owner_id = coalesce(c.owner_id, excluded.owner_id),
            owner_name = case when c.owner_id is null then excluded.owner_name else c.owner_name end,
            assigned_at = coalesce(c.assigned_at, excluded.assigned_at),
            unread = c.unread + excluded.unread,
            last_message_at = greatest(c.last_message_at, excluded.last_message_at),
            updated_at = now();
        delete from public.whatsapp_live_conversations
          where length(peer) = 12 and peer like '55%' and substr(peer, 5, 1) between '6' and '9';`,
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
  const candidates = peerVariants(peer);
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
    `;
    const decision = decideConversationRoute({
      portfolioCandidates: rows.map((row) => ({ ownerId: row.owner_id, ownerName: row.name })),
    });
    if (decision.destination !== "owner") return;
    await client`
      update public.whatsapp_live_conversations
      set owner_id = ${decision.ownerId}, owner_name = ${decision.ownerName}, assigned_at = now(), updated_at = now()
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

export async function saveLiveMessage(raw: ProofEventView, externalId = "", media: InboundMedia | null = null) {
  if (raw.direction !== "in" && raw.direction !== "out") return;
  if (!raw.peer || !raw.preview) return;
  const item = { ...raw, direction: raw.direction, peer: canonicalWhatsApp(raw.peer) };
  const client = requireDb();
  await ensure();
  if (externalId) {
    const found = await client<{ id: string }[]>`select id from public.whatsapp_live_messages where external_id = ${externalId} limit 1`;
    if (found.length) {
      await setAuthor(found[0].id, item);
      await setMedia(found[0].id, media);
      if (item.forwarded) await markForwarded(found[0].id);
      return;
    }
  }
  if (item.direction === "out") {
    const duplicate = await client<{ id: string }[]>`
      select id from public.whatsapp_live_messages
      where direction = 'out' and peer in ${client(peerVariants(item.peer))} and body = ${item.preview}
        and sent_at > now() - interval '20 seconds'
      limit 1
    `;
    if (duplicate.length) {
      await setAuthor(duplicate[0].id, item);
      if (item.forwarded) await markForwarded(duplicate[0].id);
      if (externalId) {
        await client`
          update public.whatsapp_live_messages set external_id = ${externalId}
          where id = ${duplicate[0].id}
            and not exists (select 1 from public.whatsapp_live_messages where external_id = ${externalId})
        `;
      }
      return;
    }
  }
  const inserted = await client`
    insert into public.whatsapp_live_messages (id, peer, direction, body, contact_name, external_id, sent_at, author_id, author_name, receipt, forwarded)
    values (
      ${item.id},
      ${item.peer},
      ${item.direction},
      ${item.preview},
      ${item.name ?? ""},
      ${externalId || null},
      ${item.receivedAt},
      ${item.authorId ?? null},
      ${item.authorName ?? ""},
      ${item.direction === "out" ? (item.receipt ?? "sent") : "sent"},
      ${Boolean(item.forwarded)}
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
export async function insertOutboundMedia(raw: ProofEventView, media: InboundMedia) {
  const item = { ...raw, peer: canonicalWhatsApp(raw.peer) };
  const client = requireDb();
  await ensure();
  await client`
    insert into public.whatsapp_live_messages
      (id, peer, direction, body, contact_name, sent_at, author_id, author_name, media_kind, media_mime, media_file_name, media_payload, receipt)
    values (
      ${item.id}, ${item.peer!}, 'out', ${item.preview}, '', ${item.receivedAt},
      ${item.authorId ?? null}, ${item.authorName ?? ""},
      ${media.kind}, ${media.mime}, ${media.fileName}, ${client.json(media.payload as Parameters<typeof client.json>[0])},
      ${item.receipt ?? "sent"}
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
  forgetMedia([id]);
}

type CachedMedia = { bytes: Buffer; mime: string; fileName: string };
const MAX_CACHED = 40;
const MAX_CACHED_BYTES = 8 * 1024 * 1024;
const holder = globalThis as typeof globalThis & { __tawperMediaCache?: Map<string, CachedMedia> };
const mediaCache = (holder.__tawperMediaCache ??= new Map());

function forgetMedia(ids: string[]) {
  for (const id of ids) mediaCache.delete(id);
}

/** Arquivo decodificado do `base64` que a Stevo entrega no webhook (ou que o Tawper gravou ao enviar). */
export async function loadLiveMediaFile(id: string): Promise<CachedMedia | null> {
  const hit = mediaCache.get(id);
  if (hit) return hit;
  const media = await getLiveMedia(id);
  const raw = typeof media?.payload.base64 === "string" ? media.payload.base64 : "";
  if (!media || !raw) return null;
  const entry = {
    bytes: Buffer.from(raw.replace(/^data:[^,]*,/, ""), "base64"),
    mime: media.mime.split(";")[0] || "application/octet-stream",
    fileName: media.fileName,
  };
  if (entry.bytes.length <= MAX_CACHED_BYTES) {
    mediaCache.set(id, entry);
    if (mediaCache.size > MAX_CACHED) mediaCache.delete(mediaCache.keys().next().value!);
  }
  return entry;
}

export function peerVariants(peer: string) {
  const digits = peer.replace(/\D/g, "");
  if (!digits.startsWith("55")) return [digits];
  if (digits.length === 12) return [digits, `${digits.slice(0, 4)}9${digits.slice(4)}`];
  if (digits.length === 13 && digits[4] === "9") return [digits, `${digits.slice(0, 4)}${digits.slice(5)}`];
  return [digits];
}

export type LiveMessageRef = { id: string; peer: string; direction: "in" | "out"; externalId: string | null; authorId: string | null; revoked: boolean };

export async function getLiveMessage(id: string): Promise<LiveMessageRef | null> {
  const client = requireDb();
  await ensure();
  const rows = await client<{ id: string; peer: string; direction: "in" | "out"; external_id: string | null; author_id: string | null; revoked_at: Date | null }[]>`
    select id, peer, direction, external_id, author_id, revoked_at
    from public.whatsapp_live_messages where id = ${id} and hidden_at is null
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, peer: row.peer, direction: row.direction, externalId: row.external_id, authorId: row.author_id, revoked: Boolean(row.revoked_at) };
}

/** Apagada para todos: o balão fica como "mensagem apagada" e o arquivo sai do banco. */
export async function markLiveRevoked(by: { id?: string; externalId?: string }) {
  const client = requireDb();
  await ensure();
  const rows = by.id
    ? await client<{ id: string }[]>`
        update public.whatsapp_live_messages set revoked_at = now(), body = '', media_payload = null
        where id = ${by.id} and revoked_at is null returning id`
    : await client<{ id: string }[]>`
        update public.whatsapp_live_messages set revoked_at = now(), body = '', media_payload = null
        where external_id = ${by.externalId ?? ""} and revoked_at is null returning id`;
  forgetMedia(rows.map((row) => row.id));
  return rows.length;
}

/** Apagada para mim: some do Tawper, que é a conta inteira do número para os atendentes. */
export async function hideLiveMessage(by: { id?: string; externalId?: string }) {
  const client = requireDb();
  await ensure();
  const rows = by.id
    ? await client<{ id: string }[]>`
        update public.whatsapp_live_messages set hidden_at = now(), media_payload = null
        where id = ${by.id} and hidden_at is null returning id`
    : await client<{ id: string }[]>`
        update public.whatsapp_live_messages set hidden_at = now(), media_payload = null
        where external_id = ${by.externalId ?? ""} and hidden_at is null returning id`;
  forgetMedia(rows.map((row) => row.id));
  return rows.length;
}

/** Apagar conversa: mensagens e responsável saem; se o cliente escrever de novo, ela volta como nova. */
export async function deleteLiveConversation(peer: string) {
  const client = requireDb();
  await ensure();
  const peers = peerVariants(peer);
  const rows = await client<{ id: string }[]>`delete from public.whatsapp_live_messages where peer in ${client(peers)} returning id`;
  await client`delete from public.whatsapp_live_conversations where peer in ${client(peers)}`;
  forgetMedia(rows.map((row) => row.id));
  return rows.length;
}

type LiveMessageRow = {
  id: string;
  peer: string;
  direction: "in" | "out";
  body: string;
  contact_name: string;
  sent_at: Date;
  author_id: string | null;
  author_name: string;
  media_kind: MediaKind | null;
  revoked_at: Date | null;
  has_external: boolean;
  receipt: string;
  forwarded: boolean;
};

async function markForwarded(id: string) {
  const client = requireDb();
  await client`update public.whatsapp_live_messages set forwarded = true where id = ${id} and forwarded = false`;
}

/** Marca encaminhada pelo id do WhatsApp ou pelo texto + horário do webhook. */
export async function markLiveForwarded(hint: { ids?: string[]; body?: string; at?: string; peer?: string }) {
  const client = db();
  if (!client) return 0;
  await ensure();
  const ids = [...new Set((hint.ids ?? []).map((id) => id.trim()).filter(Boolean))];
  if (ids.length) {
    const rows = await client<{ id: string }[]>`
      update public.whatsapp_live_messages set forwarded = true
      where forwarded = false and (external_id in ${client(ids)} or id in ${client(ids)})
      returning id
    `;
    if (rows.length) return rows.length;
  }
  const body = hint.body?.trim() ?? "";
  if (!body || !hint.at) return 0;
  const at = new Date(hint.at);
  if (Number.isNaN(at.getTime())) return 0;
  const from = new Date(at.getTime() - 20000).toISOString();
  const to = new Date(at.getTime() + 20000).toISOString();
  const peers = hint.peer ? peerVariants(hint.peer) : [];
  const rows = peers.length
    ? await client<{ id: string }[]>`
        update public.whatsapp_live_messages set forwarded = true
        where forwarded = false and body = ${body} and sent_at between ${from} and ${to}
          and peer in ${client(peers)}
        returning id
      `
    : await client<{ id: string }[]>`
        update public.whatsapp_live_messages set forwarded = true
        where forwarded = false and body = ${body} and sent_at between ${from} and ${to}
        returning id
      `;
  return rows.length;
}

function asReceipt(value: string, direction: "in" | "out"): MessageReceipt | undefined {
  if (direction !== "out") return undefined;
  if (value === "pending" || value === "sent" || value === "delivered" || value === "read") return value;
  return "sent";
}

function canUpgradeReceipt(current: string, next: Exclude<MessageReceipt, "pending">) {
  if (next === "read") return current !== "read";
  if (next === "delivered") return current === "pending" || current === "sent" || !current;
  return current === "pending" || !current;
}

export async function listLiveMessages(): Promise<ProofEventView[] | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<LiveMessageRow[]>`
    select id, peer, direction, body, contact_name, sent_at, author_id, author_name, media_kind,
      revoked_at, external_id is not null as has_external, receipt, forwarded
    from public.whatsapp_live_messages
    where hidden_at is null
    order by sent_at desc
    limit 500
  `;
  return rows.map(toEventView);
}

/** Histórico completo dos números de uma empresa (sem o corte de 500 da central). */
export async function listLiveMessagesFor(peers: string[]): Promise<ProofEventView[] | null> {
  const client = db();
  if (!client) return null;
  if (!peers.length) return [];
  await ensure();
  const rows = await client<LiveMessageRow[]>`
    select id, peer, direction, body, contact_name, sent_at, author_id, author_name, media_kind,
      revoked_at, external_id is not null as has_external, receipt, forwarded
    from public.whatsapp_live_messages
    where hidden_at is null and peer in ${client(peers)}
    order by sent_at desc
    limit 2000
  `;
  return rows.map(toEventView);
}

export async function listLiveConversationsFor(peers: string[]): Promise<LiveConversation[] | null> {
  const client = db();
  if (!client) return null;
  if (!peers.length) return [];
  await ensure();
  const rows = await client<ConversationRow[]>`
    select peer, owner_id, owner_name, unread, last_message_at
    from public.whatsapp_live_conversations
    where peer in ${client(peers)}
  `;
  return mergeConversations(rows);
}

type ConversationRow = { peer: string; owner_id: string | null; owner_name: string; unread: number; last_message_at: Date };

/**
 * Uma instância com código antigo ainda pode gravar o número sem o 9º dígito;
 * na leitura as duas linhas viram uma conversa só (dono preferido: o da forma canônica).
 */
function mergeConversations(rows: ConversationRow[]): LiveConversation[] {
  const merged = new Map<string, LiveConversation>();
  for (const row of rows) {
    const peer = canonicalWhatsApp(row.peer);
    const at = new Date(row.last_message_at).toISOString();
    const current = merged.get(peer);
    if (!current) {
      merged.set(peer, { peer, ownerId: row.owner_id, ownerName: row.owner_name, unread: row.unread, lastMessageAt: at });
      continue;
    }
    const takeOwner = row.owner_id && (!current.ownerId || row.peer === peer);
    merged.set(peer, {
      peer,
      ownerId: takeOwner ? row.owner_id : current.ownerId,
      ownerName: takeOwner ? row.owner_name : current.ownerName,
      unread: current.unread + row.unread,
      lastMessageAt: at > current.lastMessageAt ? at : current.lastMessageAt,
    });
  }
  return [...merged.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

function toEventView(row: LiveMessageRow): ProofEventView {
  const peer = canonicalWhatsApp(row.peer);
  return {
    id: row.id,
    receivedAt: new Date(row.sent_at).toISOString(),
    event: row.direction === "out" ? "SendMessage" : "Message",
    from: peer,
    preview: row.body,
    accepted: true,
    direction: row.direction,
    peer,
    name: row.contact_name,
    authorId: row.author_id ?? undefined,
    authorName: row.author_name || undefined,
    mediaKind: row.revoked_at ? undefined : (row.media_kind ?? undefined),
    revoked: row.revoked_at ? true : undefined,
    revocable: row.direction === "out" && row.has_external && !row.revoked_at ? true : undefined,
    receipt: asReceipt(row.receipt, row.direction),
    forwarded: row.forwarded || undefined,
  };
}

/** Sobe o visto da mensagem (enviada → recebida → lida) e nunca volta. Sem IDs, aplica ao chat. */
export async function markLiveReceipts(ids: string[], status: Exclude<MessageReceipt, "pending">, peer = "") {
  const client = db();
  if (!client) return 0;
  await ensure();
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length) {
    const rows = await client<{ id: string; receipt: string }[]>`
      select id, receipt from public.whatsapp_live_messages
      where direction = 'out' and hidden_at is null
        and (external_id in ${client(unique)} or id in ${client(unique)})
    `;
    const targets = rows.filter((row) => canUpgradeReceipt(row.receipt, status)).map((row) => row.id);
    if (targets.length) {
      await client`
        update public.whatsapp_live_messages set receipt = ${status}
        where id in ${client(targets)}
      `;
    }
    return targets.length;
  }
  if (!peer) return 0;
  const rows = await client<{ id: string; receipt: string }[]>`
    select id, receipt from public.whatsapp_live_messages
    where direction = 'out' and hidden_at is null and peer in ${client(peerVariants(peer))}
  `;
  const targets = rows.filter((row) => canUpgradeReceipt(row.receipt, status)).map((row) => row.id);
  if (!targets.length) return 0;
  await client`
    update public.whatsapp_live_messages set receipt = ${status}
    where id in ${client(targets)}
  `;
  return targets.length;
}

export async function getLiveMedia(id: string): Promise<{ kind: MediaKind; mime: string; fileName: string; payload: Record<string, unknown> } | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<{ media_kind: MediaKind | null; media_mime: string; media_file_name: string; media_payload: Record<string, unknown> | null }[]>`
    select media_kind, media_mime, media_file_name, media_payload
    from public.whatsapp_live_messages where id = ${id} and revoked_at is null and hidden_at is null
  `;
  const row = rows[0];
  if (!row?.media_kind || !row.media_payload) return null;
  return { kind: row.media_kind, mime: row.media_mime, fileName: row.media_file_name, payload: row.media_payload };
}

/** Mensagens reais do WhatsApp, da mais nova para a mais antiga, para a leitura da IA. */
export async function listLiveCorpus(limit = 4000): Promise<{ peer: string; direction: "in" | "out"; body: string; name: string; at: string; author: string }[] | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<{ peer: string; direction: "in" | "out"; body: string; contact_name: string; sent_at: Date; author_name: string }[]>`
    select peer, direction, body, contact_name, sent_at, author_name
    from public.whatsapp_live_messages
    where hidden_at is null and revoked_at is null
    order by sent_at desc
    limit ${limit}
  `;
  return rows.map((row) => ({
    peer: canonicalWhatsApp(row.peer),
    direction: row.direction,
    body: row.body,
    name: row.contact_name,
    at: new Date(row.sent_at).toISOString(),
    author: row.author_name,
  }));
}

export async function listLiveConversations(): Promise<LiveConversation[] | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<ConversationRow[]>`
    select peer, owner_id, owner_name, unread, last_message_at
    from public.whatsapp_live_conversations
    order by last_message_at desc
    limit 500
  `;
  return mergeConversations(rows);
}

export async function getLiveConversation(raw: string): Promise<LiveConversation | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<ConversationRow[]>`
    select peer, owner_id, owner_name, unread, last_message_at
    from public.whatsapp_live_conversations where peer in ${client(peerVariants(raw))}
  `;
  return mergeConversations(rows)[0] ?? null;
}

export async function setLiveOwner(raw: string, owner: { id: string; name: string } | null) {
  const peer = canonicalWhatsApp(raw);
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
  await client`
    update public.whatsapp_live_conversations
    set owner_id = ${owner?.id ?? null}, owner_name = ${owner?.name ?? ""}, assigned_at = ${owner ? new Date().toISOString() : null}, updated_at = now()
    where peer in ${client(peerVariants(peer))} and peer <> ${peer}
  `;
}

export async function markLiveRead(raw: string) {
  const client = db();
  if (!client) return;
  await ensure();
  await client`update public.whatsapp_live_conversations set unread = 0, updated_at = now() where peer in ${client(peerVariants(raw))} and unread > 0`;
}
