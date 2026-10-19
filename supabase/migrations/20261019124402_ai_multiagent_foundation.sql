-- Tawper OS — fundação multiagente (SM-2026-10-19-001 / ADR-004)
-- Estruturas aditivas. A ativação produtiva permanece condicionada aos gates.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.ai_model_policies (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  agent_key           text not null check (agent_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  task_key            text not null check (task_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  primary_model       text not null,
  fallback_models     text[] not null default '{}',
  max_steps           smallint not null default 4 check (max_steps between 1 and 12),
  max_input_tokens    integer not null default 40000 check (max_input_tokens between 1000 and 1000000),
  max_output_tokens   integer not null default 1800 check (max_output_tokens between 100 and 100000),
  daily_budget_usd    numeric(12,4) check (daily_budget_usd is null or daily_budget_usd >= 0),
  prompt_version      text not null default 'v1',
  enabled             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, agent_key, task_key)
);
create trigger ai_model_policies_set_updated_at before update on public.ai_model_policies
  for each row execute function app.set_updated_at();

create table public.ai_agent_sessions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  profile_id          uuid references public.profiles(id) on delete set null,
  company_id          uuid,
  channel             text not null default 'web' check (channel in ('web', 'whatsapp', 'job', 'api')),
  title               text,
  status              text not null default 'active' check (status in ('active', 'closed', 'expired')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (organization_id, company_id) references public.companies (organization_id, id) on delete cascade
);
create index ai_agent_sessions_profile_idx on public.ai_agent_sessions (organization_id, profile_id, updated_at desc);
create index ai_agent_sessions_company_idx on public.ai_agent_sessions (company_id, updated_at desc) where company_id is not null;
create trigger ai_agent_sessions_set_updated_at before update on public.ai_agent_sessions
  for each row execute function app.set_updated_at();

create table public.ai_agent_runs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  session_id          uuid references public.ai_agent_sessions(id) on delete set null,
  actor_profile_id    uuid references public.profiles(id) on delete set null,
  company_id          uuid,
  agent_key           text not null,
  task_key            text not null,
  status              text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  provider            text,
  model               text,
  prompt_version      text not null,
  correlation_id      text not null,
  input_summary       jsonb not null default '{}'::jsonb,
  output_summary      jsonb,
  input_tokens        integer check (input_tokens is null or input_tokens >= 0),
  output_tokens       integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd  numeric(12,6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  latency_ms          integer check (latency_ms is null or latency_ms >= 0),
  error_code          text,
  error_message       text,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now(),
  foreign key (organization_id, company_id) references public.companies (organization_id, id) on delete set null,
  check (finished_at is null or started_at is null or finished_at >= started_at)
);
create unique index ai_agent_runs_correlation_idx on public.ai_agent_runs (organization_id, correlation_id);
create index ai_agent_runs_recent_idx on public.ai_agent_runs (organization_id, created_at desc);
create index ai_agent_runs_cost_idx on public.ai_agent_runs (organization_id, created_at, estimated_cost_usd) where estimated_cost_usd is not null;
create index ai_agent_runs_session_idx on public.ai_agent_runs (session_id) where session_id is not null;
create index ai_agent_runs_actor_idx on public.ai_agent_runs (actor_profile_id, created_at desc) where actor_profile_id is not null;
create index ai_agent_runs_company_idx on public.ai_agent_runs (company_id, created_at desc) where company_id is not null;

create table public.ai_agent_steps (
  id                 uuid primary key default gen_random_uuid(),
  run_id              uuid not null references public.ai_agent_runs(id) on delete cascade,
  step_number         smallint not null check (step_number between 1 and 50),
  kind                text not null check (kind in ('plan', 'model', 'retrieval', 'tool', 'approval', 'final')),
  tool_name           text,
  status              text not null check (status in ('started', 'completed', 'failed', 'skipped')),
  request_summary     jsonb not null default '{}'::jsonb,
  response_summary    jsonb,
  duration_ms         integer check (duration_ms is null or duration_ms >= 0),
  error_message       text,
  created_at          timestamptz not null default now(),
  unique (run_id, step_number)
);
create index ai_agent_steps_run_idx on public.ai_agent_steps (run_id, step_number);

create table public.ai_memories (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  profile_id          uuid references public.profiles(id) on delete cascade,
  company_id          uuid,
  session_id          uuid references public.ai_agent_sessions(id) on delete cascade,
  scope               text not null check (scope in ('session', 'user', 'company', 'organization')),
  kind                text not null check (kind in ('fact', 'preference', 'summary', 'decision', 'procedure')),
  content             text not null check (char_length(content) between 1 and 12000),
  source_type         text not null,
  source_id           text,
  confidence          numeric(4,3) not null default 1 check (confidence between 0 and 1),
  embedding_model     text,
  embedding           extensions.vector(1536),
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (organization_id, company_id) references public.companies (organization_id, id) on delete cascade,
  check ((scope <> 'user') or profile_id is not null),
  check ((scope <> 'company') or company_id is not null),
  check ((scope <> 'session') or session_id is not null)
);
create index ai_memories_scope_idx on public.ai_memories (organization_id, scope, company_id, profile_id, updated_at desc);
create index ai_memories_session_idx on public.ai_memories (session_id, updated_at desc) where session_id is not null;
create index ai_memories_embedding_hnsw on public.ai_memories using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;
create trigger ai_memories_set_updated_at before update on public.ai_memories
  for each row execute function app.set_updated_at();

create table public.ai_knowledge_documents (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  company_id          uuid,
  source_type         text not null,
  source_id           text not null,
  title               text not null,
  source_updated_at   timestamptz,
  metadata             jsonb not null default '{}'::jsonb,
  content_hash        text not null,
  status              text not null default 'pending' check (status in ('pending', 'indexed', 'failed', 'deleted')),
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (organization_id, company_id) references public.companies (organization_id, id) on delete cascade,
  unique (organization_id, source_type, source_id)
);
create index ai_knowledge_documents_company_idx on public.ai_knowledge_documents (company_id, updated_at desc) where company_id is not null;
create trigger ai_knowledge_documents_set_updated_at before update on public.ai_knowledge_documents
  for each row execute function app.set_updated_at();

create table public.ai_knowledge_chunks (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  document_id         uuid not null references public.ai_knowledge_documents(id) on delete cascade,
  company_id          uuid,
  chunk_index         integer not null check (chunk_index >= 0),
  content             text not null check (char_length(content) between 1 and 20000),
  metadata             jsonb not null default '{}'::jsonb,
  embedding_model     text not null,
  embedding           extensions.vector(1536),
  search_vector       tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at          timestamptz not null default now(),
  foreign key (organization_id, company_id) references public.companies (organization_id, id) on delete cascade,
  unique (document_id, chunk_index)
);
create index ai_knowledge_chunks_document_idx on public.ai_knowledge_chunks (document_id, chunk_index);
create index ai_knowledge_chunks_company_idx on public.ai_knowledge_chunks (organization_id, company_id);
create index ai_knowledge_chunks_fts_idx on public.ai_knowledge_chunks using gin (search_vector);
create index ai_knowledge_chunks_embedding_hnsw on public.ai_knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;

create table public.ai_evaluation_cases (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  agent_key           text not null,
  name                text not null,
  input               jsonb not null,
  expected             jsonb not null,
  tags                 text[] not null default '{}',
  is_active           boolean not null default true,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index ai_evaluation_cases_agent_idx on public.ai_evaluation_cases (organization_id, agent_key) where is_active;
create trigger ai_evaluation_cases_set_updated_at before update on public.ai_evaluation_cases
  for each row execute function app.set_updated_at();

-- RLS: leitura no mesmo escopo comercial; configuração e datasets só por admin.
alter table public.ai_model_policies enable row level security;
alter table public.ai_agent_sessions enable row level security;
alter table public.ai_agent_runs enable row level security;
alter table public.ai_agent_steps enable row level security;
alter table public.ai_memories enable row level security;
alter table public.ai_knowledge_documents enable row level security;
alter table public.ai_knowledge_chunks enable row level security;
alter table public.ai_evaluation_cases enable row level security;

create policy ai_model_policies_select on public.ai_model_policies for select to authenticated using (app.is_member(organization_id));
create policy ai_model_policies_admin on public.ai_model_policies for all to authenticated using (app.is_admin(organization_id)) with check (app.is_admin(organization_id));
create policy ai_agent_sessions_select on public.ai_agent_sessions for select to authenticated using (app.is_manager(organization_id) or profile_id = auth.uid() or (company_id is not null and app.can_see_company(company_id)));
create policy ai_agent_runs_select on public.ai_agent_runs for select to authenticated using (app.is_manager(organization_id) or actor_profile_id = auth.uid() or (company_id is not null and app.can_see_company(company_id)));
create policy ai_agent_steps_select on public.ai_agent_steps for select to authenticated using (exists (select 1 from public.ai_agent_runs r where r.id = run_id and (app.is_manager(r.organization_id) or r.actor_profile_id = auth.uid() or (r.company_id is not null and app.can_see_company(r.company_id)))));
create policy ai_memories_select on public.ai_memories for select to authenticated using (app.is_manager(organization_id) or profile_id = auth.uid() or (company_id is not null and app.can_see_company(company_id)) or (scope = 'organization' and app.is_member(organization_id)));
create policy ai_knowledge_documents_select on public.ai_knowledge_documents for select to authenticated using ((company_id is null and app.is_member(organization_id)) or (company_id is not null and app.can_see_company(company_id)));
create policy ai_knowledge_chunks_select on public.ai_knowledge_chunks for select to authenticated using ((company_id is null and app.is_member(organization_id)) or (company_id is not null and app.can_see_company(company_id)));
create policy ai_evaluation_cases_select on public.ai_evaluation_cases for select to authenticated using (app.is_member(organization_id));
create policy ai_evaluation_cases_admin on public.ai_evaluation_cases for all to authenticated using (app.is_admin(organization_id)) with check (app.is_admin(organization_id));

revoke insert, update, delete on public.ai_agent_sessions, public.ai_agent_runs, public.ai_agent_steps, public.ai_memories, public.ai_knowledge_documents, public.ai_knowledge_chunks from authenticated;

-- Busca híbrida: combina ranking lexical e semântico por reciprocal rank fusion.
create or replace function public.search_ai_knowledge(
  p_organization_id uuid,
  p_query text,
  p_embedding extensions.vector(1536),
  p_company_id uuid default null,
  p_limit integer default 8
)
returns table (chunk_id uuid, document_id uuid, content text, metadata jsonb, score double precision)
language sql stable security invoker set search_path = public, extensions as $$
  with lexical as (
    select c.id, row_number() over (order by ts_rank_cd(c.search_vector, websearch_to_tsquery('portuguese', p_query)) desc) as rank
      from public.ai_knowledge_chunks c
     where c.organization_id = p_organization_id
       and (p_company_id is null or c.company_id = p_company_id)
       and c.search_vector @@ websearch_to_tsquery('portuguese', p_query)
     order by ts_rank_cd(c.search_vector, websearch_to_tsquery('portuguese', p_query)) desc
     limit least(greatest(p_limit * 4, 8), 100)
  ), semantic as (
    select c.id, row_number() over (order by c.embedding <=> p_embedding) as rank
      from public.ai_knowledge_chunks c
     where c.organization_id = p_organization_id
       and (p_company_id is null or c.company_id = p_company_id)
       and c.embedding is not null
     order by c.embedding <=> p_embedding
     limit least(greatest(p_limit * 4, 8), 100)
  ), fused as (
    select coalesce(l.id, s.id) as id,
           coalesce(1.0 / (60 + l.rank), 0) + coalesce(1.0 / (60 + s.rank), 0) as score
      from lexical l full outer join semantic s on s.id = l.id
  )
  select c.id, c.document_id, c.content, c.metadata, f.score
    from fused f join public.ai_knowledge_chunks c on c.id = f.id
   order by f.score desc
   limit least(greatest(p_limit, 1), 30)
$$;

revoke all on function public.search_ai_knowledge(uuid, text, extensions.vector, uuid, integer) from public, anon;
grant execute on function public.search_ai_knowledge(uuid, text, extensions.vector, uuid, integer) to authenticated, service_role;

-- Claim atômico da fila canônica para eventos de IA/automação.
create or replace function app.claim_ai_outbox(p_worker_id text)
returns setof public.outbox_events
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.outbox_events e
     set status = 'processing', locked_at = now(), locked_by = p_worker_id, attempts = attempts + 1
   where e.id = (
     select q.id from public.outbox_events q
      where q.status in ('pending', 'failed')
        and q.next_attempt_at <= now()
        and (q.event_type like 'ai.%' or q.event_type like 'automation.%')
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
     and (e.event_type like 'ai.%' or e.event_type like 'automation.%')
  returning e.* into v_event;
  return v_event;
end $$;

revoke all on function app.finish_ai_outbox(uuid, boolean, text) from public, anon, authenticated;
grant execute on function app.finish_ai_outbox(uuid, boolean, text) to service_role;

insert into public.ai_model_policies (organization_id, agent_key, task_key, primary_model, fallback_models, max_steps, max_output_tokens, prompt_version, enabled)
select id, 'orchestrator', 'route', 'openai/gpt-5.6-luna', array['google/gemini-3.5-flash-lite'], 2, 500, 'route-v1', false from public.organizations
on conflict do nothing;

insert into public.ai_model_policies (organization_id, agent_key, task_key, primary_model, fallback_models, max_steps, max_output_tokens, prompt_version, enabled)
select id, 'assistant_analytic', 'answer', 'openai/gpt-5.6-luna', array['google/gemini-3.8-flash'], 4, 1800, 'assistant-v2', false from public.organizations
on conflict do nothing;

insert into public.ai_model_policies (organization_id, agent_key, task_key, primary_model, fallback_models, max_steps, max_output_tokens, prompt_version, enabled)
select id, 'strategic_copilot', 'strategy', 'openai/gpt-5.6-sol', array['anthropic/claude-sonnet-4.6'], 5, 1800, 'copilot-v2', false from public.organizations
on conflict do nothing;
