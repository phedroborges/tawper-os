-- =============================================================================
-- Tawper OS — 0006 — Governança
-- Auditoria append-only gerada pelo banco, importação com relatório por linha
-- e consentimentos (LGPD).
-- Fonte: especificação 5.8, 12 e 14; PLANO seção 6 (item 4) e 15.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auditoria (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_events (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  occurred_at      timestamptz not null default now(),
  actor_id         uuid references public.profiles(id) on delete set null,
  actor_type       public.actor_type not null,
  entity_type      text not null,
  entity_id        uuid not null,
  company_id       uuid,
  field            text not null,
  old_value        text,
  new_value        text,
  request_id       text,
  metadata         jsonb
);
comment on table public.audit_events is 'Quem, o quê, antes/depois, quando e por qual origem (usuário, IA, integração, automação). Sem UPDATE/DELETE.';
create index audit_events_company_idx on public.audit_events (company_id, occurred_at desc) where company_id is not null;
create index audit_events_entity_idx  on public.audit_events (entity_type, entity_id, occurred_at desc);
create index audit_events_org_time_idx on public.audit_events (organization_id, occurred_at desc);
create index audit_events_actor_idx   on public.audit_events (actor_id, occurred_at desc) where actor_id is not null;

create or replace function app.tg_audit_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_events é append-only: % não permitido', tg_op using errcode = '42501';
end $$;

create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function app.tg_audit_append_only();

-- Trigger genérico: registra criação, exclusão e cada coluna alterada.
create or replace function app.tg_audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row   jsonb := coalesce(v_new, v_old);
  v_org   uuid  := (v_row ->> 'organization_id')::uuid;
  v_id    uuid  := (v_row ->> 'id')::uuid;
  v_comp  uuid  := case when tg_table_name = 'companies' then v_id else app.try_uuid(v_row ->> 'company_id') end;
  v_actor uuid  := auth.uid();
  v_type  public.actor_type := app.current_actor_type();
  v_req   text  := nullif(current_setting('app.request_id', true), '');
  v_skip  text[] := array['id', 'organization_id', 'created_at', 'updated_at', 'normalized_name', 'gross_total', 'discount_total', 'net_total'];
  k text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (organization_id, actor_id, actor_type, entity_type, entity_id, company_id, field, new_value, request_id)
    values (v_org, v_actor, v_type, tg_table_name, v_id, v_comp, 'created', coalesce(v_new ->> 'trade_name', v_new ->> 'title', v_new ->> 'name', v_new ->> 'number', v_id::text), v_req);
  elsif tg_op = 'DELETE' then
    insert into public.audit_events (organization_id, actor_id, actor_type, entity_type, entity_id, company_id, field, old_value, request_id)
    values (v_org, v_actor, v_type, tg_table_name, v_id, v_comp, 'deleted', coalesce(v_old ->> 'trade_name', v_old ->> 'title', v_old ->> 'name', v_old ->> 'number', v_id::text), v_req);
  else
    for k in select jsonb_object_keys(v_new) loop
      if k = any (v_skip) then continue; end if;
      if v_new -> k is distinct from v_old -> k then
        insert into public.audit_events (organization_id, actor_id, actor_type, entity_type, entity_id, company_id, field, old_value, new_value, request_id)
        values (v_org, v_actor, v_type, tg_table_name, v_id, v_comp, k, v_old ->> k, v_new ->> k, v_req);
      end if;
    end loop;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'company_relationships', 'contacts', 'opportunities', 'opportunity_requirement_values',
    'strategy_versions', 'ai_suggestions', 'activities', 'standby_periods', 'quotes', 'sales',
    'memberships', 'wallet_grants', 'route_plans', 'integration_accounts', 'funnels', 'stages', 'stage_requirements'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.tg_audit_row()', t || '_audit', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Importação (Moskit / planilha) — especificação 12; PLANO F6
-- -----------------------------------------------------------------------------
create table public.import_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  source           public.import_source not null,
  file_name        text,
  checksum         text,
  storage_path     text,
  status           public.processing_status not null default 'pending',
  started_by       uuid references public.profiles(id) on delete set null,
  started_at       timestamptz,
  finished_at      timestamptz,
  total_rows       integer not null default 0,
  created_count    integer not null default 0,
  updated_count    integer not null default 0,
  skipped_count    integer not null default 0,
  rejected_count   integer not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, checksum)
);
comment on column public.import_batches.checksum is 'Hash do arquivo: reprocessar o mesmo lote não duplica registros.';

create table public.import_rows (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  batch_id            uuid not null,
  row_number          integer not null check (row_number >= 1),
  external_id         text,
  raw                 jsonb not null,
  status              public.import_row_status,
  target_entity_type  text,
  target_entity_id    uuid,
  duplicate_score     numeric(4,3) check (duplicate_score is null or duplicate_score between 0 and 1),
  reason              text,
  processed_at        timestamptz,
  foreign key (organization_id, batch_id) references public.import_batches (organization_id, id) on delete cascade,
  unique (batch_id, row_number),
  constraint import_rows_rejected_has_reason check (status <> 'rejected' or reason is not null)
);
comment on column public.import_rows.reason is 'Toda rejeição precisa de motivo legível (Gate G6).';
create index import_rows_batch_status_idx on public.import_rows (batch_id, status);

-- -----------------------------------------------------------------------------
-- Consentimentos de contato (LGPD)
-- -----------------------------------------------------------------------------
create table public.data_consents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  contact_id       uuid not null,
  channel          public.contact_channel not null,
  purpose          text not null,
  legal_basis      text not null,
  granted          boolean not null,
  granted_at       timestamptz,
  revoked_at       timestamptz,
  source           text,
  evidence         text,
  recorded_by      uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  check (not granted or granted_at is not null),
  check (revoked_at is null or granted_at is null or revoked_at >= granted_at)
);
create index data_consents_contact_idx on public.data_consents (contact_id, channel);
