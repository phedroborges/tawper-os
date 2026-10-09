import "server-only";

import postgres from "postgres";
import type { ProofEventView } from "./events";

let sql: ReturnType<typeof postgres> | null = null;
let ready: Promise<void> | null = null;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!sql) sql = postgres(url, { max: 1, ssl: "require", idle_timeout: 20 });
  return sql;
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
          on public.whatsapp_live_messages (peer, sent_at);`,
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  await ready;
}

export async function saveLiveMessage(item: ProofEventView, externalId = "") {
  if (item.direction !== "in" && item.direction !== "out") return;
  if (!item.peer || !item.preview) return;
  const client = db();
  if (!client) throw new Error("DATABASE_URL ausente.");
  await ensure();
  if (externalId) {
    const found = await client`select id from public.whatsapp_live_messages where external_id = ${externalId} limit 1`;
    if (found.length) return;
  }
  if (item.direction === "out") {
    const duplicate = await client`
      select id from public.whatsapp_live_messages
      where direction = 'out' and peer = ${item.peer} and body = ${item.preview}
        and sent_at > now() - interval '20 seconds'
      limit 1
    `;
    if (duplicate.length) return;
  }
  await client`
    insert into public.whatsapp_live_messages (id, peer, direction, body, contact_name, external_id, sent_at)
    values (
      ${item.id},
      ${item.peer},
      ${item.direction},
      ${item.preview},
      ${item.name ?? ""},
      ${externalId || null},
      ${item.receivedAt}
    )
    on conflict (id) do nothing
  `;
  if (item.name) {
    await client`
      update public.whatsapp_live_messages
      set contact_name = ${item.name}
      where peer = ${item.peer} and contact_name = ''
    `;
  }
}

export async function listLiveMessages(): Promise<ProofEventView[] | null> {
  const client = db();
  if (!client) return null;
  await ensure();
  const rows = await client<
    { id: string; peer: string; direction: "in" | "out"; body: string; contact_name: string; sent_at: Date }[]
  >`
    select id, peer, direction, body, contact_name, sent_at
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
  }));
}
