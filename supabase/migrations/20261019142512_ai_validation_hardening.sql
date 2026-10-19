-- SM-2026-10-19-002: endurecimento encontrado durante a validação local.
-- Recupera leases abandonados, encerra eventos que esgotaram tentativas e
-- impede que qualquer consumidor conclua um evento que não esteja processando.

create index outbox_events_processing_lease_idx
  on public.outbox_events (locked_at)
  where status = 'processing';

create or replace function app.claim_ai_outbox(p_worker_id text)
returns setof public.outbox_events
language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'worker_id é obrigatório' using errcode = '22023';
  end if;

  update public.outbox_events e
     set status = 'dead',
         locked_at = null,
         locked_by = null,
         last_error = coalesce(e.last_error, 'Número máximo de tentativas atingido')
   where (e.event_type like 'ai.%' or e.event_type like 'automation.%')
     and e.status in ('pending', 'failed', 'processing')
     and e.attempts >= e.max_attempts;

  return query
  update public.outbox_events e
     set status = 'processing', locked_at = now(), locked_by = p_worker_id, attempts = attempts + 1
   where e.id = (
     select q.id from public.outbox_events q
      where (q.event_type like 'ai.%' or q.event_type like 'automation.%')
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
end $$;

revoke all on function app.claim_ai_outbox(text) from public, anon, authenticated;
grant execute on function app.claim_ai_outbox(text) to service_role;

create or replace function app.finish_ai_outbox(p_event_id uuid, p_succeeded boolean, p_error text default null)
returns public.outbox_events
language plpgsql security definer set search_path = public as $$
declare
  v_event public.outbox_events;
begin
  update public.outbox_events e
     set status = case
           when p_succeeded then 'processed'::public.processing_status
           when e.attempts >= e.max_attempts then 'dead'::public.processing_status
           else 'failed'::public.processing_status
         end,
         processed_at = case when p_succeeded then now() else null end,
         last_error = case when p_succeeded then null else left(coalesce(p_error, 'Falha sem detalhe'), 2000) end,
         next_attempt_at = case
           when p_succeeded or e.attempts >= e.max_attempts then e.next_attempt_at
           else now() + make_interval(secs => least(3600, 5 * power(2, least(e.attempts, 9))::integer))
         end,
         locked_at = null,
         locked_by = null
   where e.id = p_event_id
     and e.status = 'processing'
     and (e.event_type like 'ai.%' or e.event_type like 'automation.%')
  returning e.* into v_event;
  return v_event;
end $$;

revoke all on function app.finish_ai_outbox(uuid, boolean, text) from public, anon, authenticated;
grant execute on function app.finish_ai_outbox(uuid, boolean, text) to service_role;
