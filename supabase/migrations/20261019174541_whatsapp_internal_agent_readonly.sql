-- Piloto de leitura do Agente Geral no WhatsApp.
-- Mantém identidade do canal separada do login e usa a outbox canônica.

alter table public.ai_agent_sessions
  add column if not exists external_channel_user_id text;

create unique index if not exists ai_agent_sessions_whatsapp_active_identity_idx
  on public.ai_agent_sessions (organization_id, channel, external_channel_user_id)
  where channel = 'whatsapp' and status = 'active' and external_channel_user_id is not null;

create table public.ai_channel_messages (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  session_id           uuid not null references public.ai_agent_sessions(id) on delete cascade,
  channel              text not null check (channel in ('web', 'whatsapp', 'job', 'api')),
  direction            text not null check (direction in ('in', 'out')),
  external_message_id  text,
  body                 text not null check (char_length(body) between 1 and 4000),
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  unique (channel, external_message_id)
);

create index ai_channel_messages_session_idx
  on public.ai_channel_messages (session_id, created_at desc);

create index ai_channel_messages_org_created_idx
  on public.ai_channel_messages (organization_id, created_at desc);

create unique index ai_channel_messages_outbox_reply_idx
  on public.ai_channel_messages ((metadata ->> 'outbox_event_id'))
  where direction = 'out' and metadata ? 'outbox_event_id';

alter table public.ai_channel_messages enable row level security;

create policy ai_channel_messages_select on public.ai_channel_messages
  for select to authenticated
  using (
    exists (
      select 1
        from public.ai_agent_sessions s
       where s.id = ai_channel_messages.session_id
         and s.organization_id = ai_channel_messages.organization_id
         and (
           app.is_manager(s.organization_id)
           or s.profile_id = (select auth.uid())
           or (s.company_id is not null and app.can_see_company(s.company_id))
         )
    )
  );

revoke insert, update, delete on public.ai_channel_messages from authenticated;
grant select, insert, update on public.ai_channel_messages to service_role;

create or replace function app.enqueue_whatsapp_agent_message(
  p_organization_id uuid,
  p_provider text,
  p_external_event_id text,
  p_sender text,
  p_display_name text,
  p_body text
)
returns table (
  duplicate boolean,
  inbound_event_id uuid,
  session_id uuid,
  outbox_event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inbound_id uuid;
  v_session_id uuid;
  v_outbox_id uuid;
begin
  if p_organization_id is null or not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Organizacao invalida' using errcode = '22023';
  end if;
  if nullif(btrim(p_provider), '') is null or nullif(btrim(p_external_event_id), '') is null then
    raise exception 'Provedor e id externo sao obrigatorios' using errcode = '22023';
  end if;
  if p_sender !~ '^[0-9]{10,15}$' then
    raise exception 'Remetente invalido' using errcode = '22023';
  end if;
  if nullif(btrim(p_body), '') is null or char_length(p_body) > 4000 then
    raise exception 'Mensagem invalida' using errcode = '22023';
  end if;

  insert into public.inbound_events (
    organization_id, provider, external_event_id, event_type, payload,
    signature_valid, status
  )
  values (
    p_organization_id, btrim(p_provider), btrim(p_external_event_id),
    'message.received',
    jsonb_build_object('sender', p_sender, 'channel', 'whatsapp_internal_agent'),
    true, 'pending'
  )
  on conflict (provider, external_event_id) do nothing
  returning id into v_inbound_id;

  if v_inbound_id is null then
    return query select true, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  insert into public.ai_agent_sessions (
    organization_id, channel, external_channel_user_id, title, status
  )
  values (
    p_organization_id, 'whatsapp', p_sender,
    nullif(left(btrim(coalesce(p_display_name, '')), 120), ''), 'active'
  )
  on conflict (organization_id, channel, external_channel_user_id)
    where channel = 'whatsapp' and status = 'active' and external_channel_user_id is not null
  do update set
    title = coalesce(excluded.title, public.ai_agent_sessions.title),
    updated_at = now()
  returning id into v_session_id;

  insert into public.ai_channel_messages (
    organization_id, session_id, channel, direction, external_message_id, body,
    metadata
  )
  values (
    p_organization_id, v_session_id, 'whatsapp', 'in',
    btrim(p_external_event_id), btrim(p_body),
    jsonb_build_object('sender', p_sender, 'display_name', coalesce(p_display_name, ''))
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, event_type, payload,
    idempotency_key, status, max_attempts
  )
  values (
    p_organization_id, 'ai_agent_session', v_session_id,
    'ai.whatsapp.respond',
    jsonb_build_object(
      'session_id', v_session_id,
      'sender', p_sender,
      'external_message_id', btrim(p_external_event_id),
      'question', btrim(p_body)
    ),
    'ai:whatsapp:respond:' || btrim(p_provider) || ':' || btrim(p_external_event_id),
    'pending', 5
  )
  returning id into v_outbox_id;

  update public.inbound_events
     set status = 'processed', processed_at = now(), attempts = 1
   where id = v_inbound_id;

  return query select false, v_inbound_id, v_session_id, v_outbox_id;
end
$$;

revoke all on function app.enqueue_whatsapp_agent_message(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function app.enqueue_whatsapp_agent_message(uuid, text, text, text, text, text)
  to service_role;

create or replace function app.claim_whatsapp_agent_outbox(p_worker_id text)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'worker_id e obrigatorio' using errcode = '22023';
  end if;

  update public.outbox_events e
     set status = 'dead', locked_at = null, locked_by = null,
         last_error = coalesce(e.last_error, 'Numero maximo de tentativas atingido')
   where e.event_type = 'ai.whatsapp.respond'
     and e.status in ('pending', 'failed', 'processing')
     and e.attempts >= e.max_attempts;

  return query
  update public.outbox_events e
     set status = 'processing', locked_at = now(), locked_by = p_worker_id,
         attempts = attempts + 1
   where e.id = (
     select q.id
       from public.outbox_events q
      where q.event_type = 'ai.whatsapp.respond'
        and q.attempts < q.max_attempts
        and (
          (q.status in ('pending', 'failed') and q.next_attempt_at <= now())
          or (q.status = 'processing' and q.locked_at < now() - interval '15 minutes')
        )
      order by q.next_attempt_at, q.created_at
      for update skip locked
      limit 1
   )
  returning e.*;
end
$$;

revoke all on function app.claim_whatsapp_agent_outbox(text)
  from public, anon, authenticated;
grant execute on function app.claim_whatsapp_agent_outbox(text) to service_role;
