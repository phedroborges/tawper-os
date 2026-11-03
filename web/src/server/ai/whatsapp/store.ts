import "server-only";

import postgres from "postgres";
import { TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { AssistantActionProposal } from "@/lib/assistant-actions";
import type { AgentStep } from "../agent/types";

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

/** Histórico da conversa. `contexto` é a anotação interna da resposta (ids do que foi lido ou gravado). */
export async function loadWhatsAppAgentHistory(sessionId: string, excludeExternalMessageId?: string) {
  const rows = await db()<{
    direction: "in" | "out";
    body: string;
    contexto: string | null;
    external_message_id: string | null;
    created_at: Date;
  }[]>`
    select direction, body, metadata ->> 'contexto' as contexto, external_message_id, created_at
      from public.ai_channel_messages
     where session_id = ${sessionId}::uuid
       and (${excludeExternalMessageId ?? null}::text is null or external_message_id is distinct from ${excludeExternalMessageId ?? null})
     order by created_at desc
     limit 24
  `;
  return rows.reverse().map((row) => ({
    role: row.direction === "in" ? ("user" as const) : ("assistant" as const),
    content: row.body,
    contexto: row.contexto ?? undefined,
  }));
}

export type AgentRunRecord = {
  sessionId: string;
  correlationId: string;
  profileId: string | null;
  companyId?: string;
  question: string;
  audio: boolean;
  caminho: "ferramentas" | "fluxo_antigo";
  versao: string;
  modelo?: string;
  resposta: string;
  gravou: string[];
  marcas: string[];
  passos: AgentStep[];
  tokens?: { entrada: number; saida: number };
  inicio: Date;
  fim: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guarda o atendimento inteiro (pergunta, cada chamada do modelo e de ferramenta, resposta) em ai_agent_runs/ai_agent_steps,
 * para a revisão semanal. Nunca derruba a resposta: se falhar, só registra no log.
 */
export async function recordWhatsAppAgentRun(run: AgentRunRecord) {
  try {
    await db().begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into public.ai_agent_runs (
          organization_id, session_id, actor_profile_id, company_id, agent_key, task_key, status, provider, model, prompt_version,
          correlation_id, input_summary, output_summary, input_tokens, output_tokens, latency_ms, started_at, finished_at
        ) values (
          ${TAWPER_ORG_ID}::uuid, ${run.sessionId}::uuid, ${run.profileId && UUID.test(run.profileId) ? run.profileId : null}::uuid,
          ${run.companyId && UUID.test(run.companyId) ? run.companyId : null}::uuid, 'whatsapp_agent', 'conversa', 'completed',
          ${run.modelo ? "openai" : null}, ${run.modelo ?? null}, ${run.versao}, ${run.correlationId},
          ${tx.json({ pergunta: run.question, audio: run.audio, caminho: run.caminho })},
          ${tx.json({ resposta: run.resposta, gravou: run.gravou, marcas: run.marcas })},
          ${run.tokens?.entrada ?? null}, ${run.tokens?.saida ?? null}, ${run.fim.getTime() - run.inicio.getTime()},
          ${run.inicio}, ${run.fim}
        )
        on conflict (organization_id, correlation_id) do update set
          model = excluded.model, prompt_version = excluded.prompt_version, company_id = excluded.company_id,
          input_summary = excluded.input_summary, output_summary = excluded.output_summary,
          input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, latency_ms = excluded.latency_ms,
          started_at = excluded.started_at, finished_at = excluded.finished_at
        returning id::text
      `;
      const runId = rows[0]?.id;
      if (!runId) return;
      await tx`delete from public.ai_agent_steps where run_id = ${runId}::uuid`;
      for (const [index, step] of run.passos.slice(0, 50).entries()) {
        await tx`
          insert into public.ai_agent_steps (run_id, step_number, kind, tool_name, status, request_summary, response_summary, duration_ms)
          values (
            ${runId}::uuid, ${index + 1}, ${step.kind}, ${step.tool ?? null}, ${step.ok ? "completed" : "failed"},
            ${tx.json((step.request ?? {}) as Parameters<typeof tx.json>[0])}, ${tx.json((step.response ?? null) as Parameters<typeof tx.json>[0])}, ${step.ms}
          )
        `;
      }
    });
  } catch (error) {
    console.warn("[agente] não gravou o registro do atendimento", error instanceof Error ? error.message : error);
  }
}

/** O usuário respondeu "errou": marca o último atendimento da conversa para a revisão. */
export async function flagLastWhatsAppAgentRun(sessionId: string, marca: string) {
  const rows = await db()<{ id: string }[]>`
    update public.ai_agent_runs
       set output_summary = jsonb_set(
             coalesce(output_summary, '{}'::jsonb), '{marcas}',
             coalesce(output_summary -> 'marcas', '[]'::jsonb) || to_jsonb(${marca}::text), true)
     where id = (
       select id from public.ai_agent_runs
        where session_id = ${sessionId}::uuid and agent_key = 'whatsapp_agent'
        order by created_at desc limit 1
     )
    returning id::text
  `;
  return Boolean(rows[0]);
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
  /** Anotação interna (ids do que foi lido ou gravado) que volta ao modelo nas próximas mensagens. */
  contexto?: string;
}) {
  const action = input.action?.status === "awaiting_confirmation" ? JSON.stringify(input.action) : null;
  const contexto = input.contexto?.slice(0, 1500) || null;
  await db()`
    insert into public.ai_channel_messages (
      organization_id, session_id, channel, direction, external_message_id, body, metadata
    )
    values (
      ${TAWPER_ORG_ID}::uuid, ${input.sessionId}::uuid, 'whatsapp', 'out',
      ${input.externalMessageId || null}, ${input.body},
      jsonb_build_object('outbox_event_id', ${input.outboxEventId}::text) ||
      case when ${action}::text is null then '{}'::jsonb
           else jsonb_build_object('action', ${action}::jsonb, 'action_status', 'pending') end ||
      case when ${contexto}::text is null then '{}'::jsonb
           else jsonb_build_object('contexto', ${contexto}::text) end
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
         and created_at > now() - interval '15 minutes'
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
