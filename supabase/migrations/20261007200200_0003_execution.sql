-- =============================================================================
-- Tawper OS — 0003 — Execução
-- Atividades (próximo passo), resultados, interações (linha do tempo),
-- estado de espera, notificações e rotas de visita.
-- Fonte: especificação 5.5–5.7, 6.3, 7.2–7.8.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Atividades / próximo passo
-- -----------------------------------------------------------------------------
create table public.activities (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  company_id         uuid not null,
  opportunity_id     uuid,
  type               public.activity_type not null,
  title              text not null,
  description        text,
  owner_id           uuid not null,
  due_at             timestamptz not null,
  priority           public.level_3 not null default 'medium',
  status             public.activity_status not null default 'pending',
  origin             public.record_origin not null default 'manual',
  completed_at       timestamptz,
  outcome            text,
  next_activity_id   uuid references public.activities(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, company_id)     references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete set null,
  foreign key (organization_id, owner_id)       references public.memberships (organization_id, profile_id) on delete restrict,
  constraint activities_done_has_result    check (status <> 'done' or (completed_at is not null and outcome is not null)),
  constraint activities_open_not_completed check (status in ('done', 'cancelled') or completed_at is null),
  constraint activities_not_self_next      check (next_activity_id is null or next_activity_id <> id)
);
comment on table public.activities is 'Próximo passo. Atividade concluída exige resultado e deve gerar ou exigir a próxima (next_activity_id).';
comment on column public.activities.origin is 'manual, rule (regra de etapa/automação), ai (sugestão aprovada) ou integration.';

create index activities_owner_due_idx     on public.activities (organization_id, owner_id, due_at) where status in ('pending', 'in_progress');
create index activities_company_open_idx  on public.activities (company_id, due_at) where status in ('pending', 'in_progress');
create index activities_opportunity_idx   on public.activities (opportunity_id) where opportunity_id is not null;
create index activities_completed_idx     on public.activities (organization_id, owner_id, completed_at) where status = 'done';
create index activities_due_idx           on public.activities (organization_id, due_at) where status in ('pending', 'in_progress');

create trigger activities_set_updated_at before update on public.activities
  for each row execute function app.set_updated_at();

create or replace function app.tg_activity_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.status in ('pending', 'in_progress') then
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger activities_completion before insert or update on public.activities
  for each row execute function app.tg_activity_completion();

-- Resultado estruturado (registro simplificado / leitura da IA) — especificação 7.3.
create table public.activity_results (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  activity_id      uuid not null,
  raw_text         text,
  summary          text not null,
  client_pending   text,
  evidence_path    text,
  suggested_stage_id uuid,
  structured       jsonb,
  recorded_by      uuid references public.profiles(id) on delete set null,
  recorded_at      timestamptz not null default now(),
  foreign key (organization_id, activity_id)        references public.activities (organization_id, id) on delete cascade,
  foreign key (organization_id, suggested_stage_id) references public.stages (organization_id, id) on delete set null,
  unique (activity_id)
);
comment on column public.activity_results.structured is 'Saída estruturada da IA (resultado, pendência, próximo passo, data). Campos filtráveis ficam em colunas próprias.';

-- -----------------------------------------------------------------------------
-- Interações (linha do tempo da empresa) — especificação 5.6
-- -----------------------------------------------------------------------------
create table public.interactions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  company_id       uuid not null,
  opportunity_id   uuid,
  contact_id       uuid,
  channel          public.interaction_channel not null,
  kind             public.interaction_kind not null,
  occurred_at      timestamptz not null default now(),
  author_id        uuid references public.profiles(id) on delete set null,
  actor_type       public.actor_type not null default 'user',
  title            text not null,
  content          text,
  risk_flag        boolean not null default false,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, company_id)     references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete set null,
  foreign key (organization_id, contact_id)     references public.contacts (organization_id, id) on delete set null
);
create index interactions_company_time_idx on public.interactions (company_id, occurred_at desc);
create index interactions_org_time_idx     on public.interactions (organization_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Estado de espera (stand by controlado) — especificação 6.3
-- -----------------------------------------------------------------------------
create table public.standby_periods (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  company_id       uuid not null,
  opportunity_id   uuid,
  reason           text not null,
  resume_condition text not null,
  responsible_id   uuid not null,
  started_at       timestamptz not null default now(),
  review_at        timestamptz not null,
  ended_at         timestamptz,
  end_outcome      public.standby_outcome,
  review_activity_id uuid,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, company_id)        references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id)    references public.opportunities (organization_id, id) on delete set null,
  foreign key (organization_id, responsible_id)    references public.memberships (organization_id, profile_id) on delete restrict,
  foreign key (organization_id, review_activity_id) references public.activities (organization_id, id) on delete set null,
  constraint standby_review_in_future check (review_at > started_at),
  constraint standby_end_consistency  check ((ended_at is null) = (end_outcome is null)),
  constraint standby_end_after_start  check (ended_at is null or ended_at >= started_at),
  exclude using gist (company_id with =, tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz), '[)') with &&)
);
comment on table public.standby_periods is 'Espera com motivo, condição de retomada, responsável e reavaliação obrigatória no futuro. Uma ativa por empresa.';
create unique index standby_periods_active_idx on public.standby_periods (company_id) where ended_at is null;
create index standby_periods_review_idx on public.standby_periods (organization_id, review_at) where ended_at is null;

-- -----------------------------------------------------------------------------
-- Notificações internas
-- -----------------------------------------------------------------------------
create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  recipient_id     uuid not null,
  type             public.notification_type not null,
  title            text not null,
  body             text,
  link             text,
  company_id       uuid,
  from_profile_id  uuid references public.profiles(id) on delete set null,
  source_kind      text,
  source_id        uuid,
  dedupe_key       text,
  is_read          boolean not null default false,
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, recipient_id) references public.memberships (organization_id, profile_id) on delete cascade,
  foreign key (organization_id, company_id)   references public.companies (organization_id, id) on delete cascade,
  check (not is_read or read_at is not null)
);
comment on column public.notifications.dedupe_key is 'Chave idempotente para automações: reexecutar uma janela não duplica alertas.';
create unique index notifications_dedupe_idx on public.notifications (organization_id, dedupe_key) where dedupe_key is not null;
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications (recipient_id) where not is_read;

-- -----------------------------------------------------------------------------
-- Rotas de visita — especificação 5.7 e 7.8
-- -----------------------------------------------------------------------------
create table public.route_plans (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  owner_id         uuid not null,
  region_id        uuid,
  planned_date     date not null,
  status           public.route_status not null default 'planned',
  estimated_km     numeric(10,1) check (estimated_km is null or estimated_km >= 0),
  estimated_cost   numeric(14,2) check (estimated_cost is null or estimated_cost >= 0),
  actual_km        numeric(10,1) check (actual_km is null or actual_km >= 0),
  actual_cost      numeric(14,2) check (actual_cost is null or actual_cost >= 0),
  currency         char(3) not null default 'BRL',
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, owner_id)  references public.memberships (organization_id, profile_id) on delete restrict,
  foreign key (organization_id, region_id) references public.regions (organization_id, id) on delete set null
);
create index route_plans_owner_date_idx on public.route_plans (organization_id, owner_id, planned_date);

create trigger route_plans_set_updated_at before update on public.route_plans
  for each row execute function app.set_updated_at();

create table public.route_stops (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  route_plan_id    uuid not null,
  company_id       uuid not null,
  position         integer not null check (position >= 1),
  objective        text not null,
  reason           text,
  activity_id      uuid,
  result           text,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, route_plan_id) references public.route_plans (organization_id, id) on delete cascade,
  foreign key (organization_id, company_id)    references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, activity_id)   references public.activities (organization_id, id) on delete set null,
  unique (route_plan_id, position) deferrable initially deferred,
  unique (route_plan_id, company_id)
);
create index route_stops_company_idx on public.route_stops (company_id);
