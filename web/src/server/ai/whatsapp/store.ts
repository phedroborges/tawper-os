import "server-only";

import postgres from "postgres";
import { TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { AssistantActionProposal } from "@/lib/assistant-actions";

let sql: ReturnType<typeof postgres> | null = null;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente para o agente interno do WhatsApp.");
  const local = /(?:localhost|127\.0\.0\.1):\d+/.test(url);
  if (!sql) sql = postgres(url, { max: 2, ssl: local ? false : "require", idle_timeout: 20, connect_timeout: 10 });
  return sql;
}
export type WhatsAppAgentJob = {
  id: string;
  organization_id: string;
  aggregate_id: string;
  payload: {
    session_id?: unknown;
    sender?: unknown;
    external_message_id?: unknown;
    question?: unknown;
  };
  attempts: number;
};

export async function enqueueWhatsAppAgentMessage(input: {
  eventId: string;
  sender: string;
  displayName: string;
  text: string;
}) {
  const client = db();
  const rows = await client<{
    duplicate: boolean;
    inbound_event_id: string | null;
    session_id: string | null;
    outbox_event_id: string | null;
  }[]>`
    select * from app.enqueue_whatsapp_agent_message(
      ${TAWPER_ORG_ID}::uuid,
      ${"stevo_internal_agent"},
      ${input.eventId},
      ${input.sender},
      ${input.displayName},
      ${input.text}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("A fila do agente não devolveu confirmação.");
  return {
    duplicate: row.duplicate,
    inboundEventId: row.inbound_event_id,
    sessionId: row.session_id,
    outboxEventId: row.outbox_event_id,
  };
}

export async function claimWhatsAppAgentJob(workerId: string): Promise<WhatsAppAgentJob | null> {
  const rows = await db()<WhatsAppAgentJob[]>`
    select id::text, organization_id::text, aggregate_id::text, payload, attempts
      from app.claim_whatsapp_agent_outbox(${workerId})
  `;
  return rows[0] ?? null;
}

export async function finishWhatsAppAgentJob(eventId: string, succeeded: boolean, error?: string) {
  await db()`select app.finish_ai_outbox(${eventId}::uuid, ${succeeded}, ${error?.slice(0, 1800) ?? null})`;
}

export async function loadWhatsAppAgentHistory(sessionId: string, excludeExternalMessageId?: string) {
  const rows = await db()<{
    direction: "in" | "out";
    body: string;
    external_message_id: string | null;
    created_at: Date;
  }[]>`
    select direction, body, external_message_id, created_at
      from public.ai_channel_messages
     where session_id = ${sessionId}::uuid
       and (${excludeExternalMessageId ?? null}::text is null or external_message_id is distinct from ${excludeExternalMessageId ?? null})
     order by created_at desc
     limit 12
  `;
  return rows.reverse().map((row) => ({
    role: row.direction === "in" ? ("user" as const) : ("assistant" as const),
    content: row.body,
  }));
}

export async function bindWhatsAppAgentSessionProfile(sessionId: string, profileId: string | null) {
  if (!profileId) return;
  await db()`
    update public.ai_agent_sessions
       set profile_id = ${profileId}::uuid, updated_at = now()
     where id = ${sessionId}::uuid and (profile_id is null or profile_id = ${profileId}::uuid)
  `;
}

export async function findWhatsAppAgentReply(outboxEventId: string) {
  const rows = await db()<{
    body: string;
    external_message_id: string | null;
  }[]>`
    select body, external_message_id
      from public.ai_channel_messages
     where direction = 'out' and metadata ->> 'outbox_event_id' = ${outboxEventId}
     order by created_at desc
     limit 1
  `;
  return rows[0] ?? null;
}

export async function recordWhatsAppAgentReply(input: {
  sessionId: string;
  outboxEventId: string;
  body: string;
  externalMessageId: string;
  action?: AssistantActionProposal;
}) {
  const action = input.action?.status === "awaiting_confirmation" ? JSON.stringify(input.action) : null;
  await db()`
    insert into public.ai_channel_messages (
      organization_id, session_id, channel, direction, external_message_id, body, metadata
    )
    values (
      ${TAWPER_ORG_ID}::uuid, ${input.sessionId}::uuid, 'whatsapp', 'out',
      ${input.externalMessageId || null}, ${input.body},
      jsonb_build_object('outbox_event_id', ${input.outboxEventId}::text) ||
      case when ${action}::text is null then '{}'::jsonb
           else jsonb_build_object('action', ${action}::jsonb, 'action_status', 'pending') end
    )
  `;
}

export async function claimPendingWhatsAppAction(sessionId: string) {
  const rows = await db()<{
    id: string;
    action: AssistantActionProposal;
  }[]>`
    with candidate as (
      select id
        from public.ai_channel_messages
       where session_id = ${sessionId}::uuid
         and direction = 'out'
         and metadata ->> 'action_status' = 'pending'
       order by created_at desc
       limit 1
       for update skip locked
    )
    update public.ai_channel_messages message
       set metadata = jsonb_set(message.metadata, '{action_status}', to_jsonb('executing'::text), true)
      from candidate
     where message.id = candidate.id
    returning message.id::text, message.metadata -> 'action' as action
  `;
  return rows[0] ?? null;
}

export async function finishPendingWhatsAppAction(messageId: string, status: "executed" | "failed" | "cancelled") {
  await db()`
    update public.ai_channel_messages
       set metadata = jsonb_set(metadata, '{action_status}', to_jsonb(${status}::text), true)
     where id = ${messageId}::uuid
  `;
}
