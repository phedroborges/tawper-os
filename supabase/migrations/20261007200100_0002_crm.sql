-- =============================================================================
-- Tawper OS — 0002 — CRM
-- Empresa (entidade central), relacionamentos, contatos, funis, etapas,
-- critérios, oportunidades, histórico de etapa, estratégia e sugestões da IA.
-- Fonte: especificação funcional seções 5.1–5.4 e 6; PLANO F2.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Empresas
-- -----------------------------------------------------------------------------
create table public.companies (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete restrict,
  code                    text not null,
  trade_name              text not null,
  legal_name              text,
  cnpj                    text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  status                  public.company_status not null default 'active',
  owner_id                uuid not null,
  region_id               uuid,
  city                    text,
  state                   char(2) check (state is null or state ~ '^[A-Z]{2}$'),
  address                 text,
  latitude                numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude               numeric(9,6) check (longitude is null or longitude between -180 and 180),
  industry                text,
  economic_group          text,
  source                  text not null default 'manual',
  potential               public.level_3,
  monthly_potential       numeric(14,2) check (monthly_potential is null or monthly_potential >= 0),
  currency                char(3) not null default 'BRL',
  harvesters_count        integer check (harvesters_count is null or harvesters_count >= 0),
  machine_models          text,
  press_type              public.press_type,
  current_brand           text,
  competitor              text,
  urgency                 public.level_3 not null default 'medium',
  notes                   text,
  customer_since          timestamptz,
  imported_from           public.import_source,
  import_external_id      text,
  loss_reason             text,
  archived_reason         text,
  archived_at             timestamptz,
  merged_into_company_id  uuid references public.companies(id) on delete set null,
  normalized_name         text generated always as (app.normalize_text(trade_name)) stored,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code),
  foreign key (organization_id, owner_id)  references public.memberships (organization_id, profile_id) on delete restrict,
  foreign key (organization_id, region_id) references public.regions (organization_id, id) on delete set null,
  constraint companies_lost_needs_reason     check (status <> 'lost' or loss_reason is not null),
  constraint companies_archived_needs_reason check (status <> 'archived' or (archived_reason is not null and archived_at is not null)),
  constraint companies_merged_needs_target   check (status <> 'merged' or merged_into_company_id is not null),
  constraint companies_not_merged_into_self  check (merged_into_company_id is null or merged_into_company_id <> id)
);
comment on table public.companies is 'Entidade central. Contatos, oportunidades, atividades, conversas e estratégias pertencem a ela.';
comment on column public.companies.cnpj is 'Somente dígitos (14). Único por organização quando informado. Empresas sem CNPJ usam nome normalizado + telefone para duplicidade.';
comment on column public.companies.code is 'Código legível gerado pelo trigger (ex.: TW-0118). Também recebe o código do sistema anterior na importação, se desejado.';
comment on column public.companies.import_external_id is 'ID no Moskit/planilha. Mapeamento completo em external_identities.';

create unique index companies_cnpj_unique_idx on public.companies (organization_id, cnpj)
  where cnpj is not null and status <> 'merged';
create index companies_owner_status_idx   on public.companies (organization_id, owner_id, status);
create index companies_region_idx         on public.companies (organization_id, region_id);
create index companies_status_idx         on public.companies (organization_id, status);
create index companies_normalized_name_trgm_idx on public.companies using gin (normalized_name gin_trgm_ops);
create index companies_merged_into_idx    on public.companies (merged_into_company_id) where merged_into_company_id is not null;

create trigger companies_set_updated_at before update on public.companies
  for each row execute function app.set_updated_at();

-- Código sequencial por organização.
create or replace function app.tg_company_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_seq integer;
  v_prefix text;
begin
  if new.code is null or new.code = '' then
    update public.organizations
       set company_seq = company_seq + 1
     where id = new.organization_id
    returning company_seq, code_prefix into v_seq, v_prefix;
    new.code := v_prefix || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end $$;

create trigger companies_code before insert on public.companies
  for each row execute function app.tg_company_code();

-- -----------------------------------------------------------------------------
-- Relacionamentos entre empresas (dependência comercial, grupo, prestador)
-- Especificação 7.9: cliente dependente de outra conta.
-- -----------------------------------------------------------------------------
create table public.company_relationships (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  company_id          uuid not null,
  related_company_id  uuid not null,
  kind                public.relationship_kind not null,
  condition           text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  foreign key (organization_id, company_id)         references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, related_company_id) references public.companies (organization_id, id) on delete cascade,
  check (company_id <> related_company_id),
  unique (company_id, related_company_id, kind)
);
comment on column public.company_relationships.condition is 'Para depends_on: condição de avanço (ex.: só troca de fornecedor após homologação na usina).';
create unique index company_relationships_one_dependency_idx on public.company_relationships (company_id) where kind = 'depends_on';
create index company_relationships_related_idx on public.company_relationships (related_company_id, kind);

-- -----------------------------------------------------------------------------
-- Contatos
-- -----------------------------------------------------------------------------
create table public.contacts (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete restrict,
  company_id              uuid not null,
  name                    text not null,
  job_title               text,
  department              text,
  role                    public.contact_role not null default 'other',
  influence               smallint not null default 2 check (influence between 1 and 3),
  phone_e164              text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_e164           text check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email                   citext,
  preferred_channel       public.contact_channel not null default 'whatsapp',
  contact_allowed         boolean not null default true,
  relationship_owner_id   uuid,
  is_active               boolean not null default true,
  notes                   text,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, company_id)            references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, relationship_owner_id) references public.memberships (organization_id, profile_id) on delete set null
);
create index contacts_company_idx   on public.contacts (company_id) where is_active;
create index contacts_whatsapp_idx  on public.contacts (organization_id, whatsapp_e164) where whatsapp_e164 is not null;
create index contacts_phone_idx     on public.contacts (organization_id, phone_e164) where phone_e164 is not null;
create index contacts_email_idx     on public.contacts (organization_id, email) where email is not null;

create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Funis e etapas (configuráveis pelo administrador)
-- -----------------------------------------------------------------------------
create table public.funnels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  key              text not null check (key ~ '^[a-z_]+$'),
  name             text not null,
  subtitle         text,
  position         integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, key)
);
comment on table public.funnels is 'Dois funis previstos: aquisicao (prospecção até a primeira venda) e recorrencia (pós-venda até recompra).';

create trigger funnels_set_updated_at before update on public.funnels
  for each row execute function app.set_updated_at();

create table public.stages (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete restrict,
  funnel_id         uuid not null,
  key               text not null check (key ~ '^[a-z_]+$'),
  name              text not null,
  short_name        text not null,
  objective         text,
  position          integer not null,
  sla_days          integer not null default 0 check (sla_days >= 0),
  probability       smallint not null default 0 check (probability between 0 and 100),
  is_terminal       boolean not null default false,
  terminal_outcome  public.opportunity_status check (terminal_outcome is null or terminal_outcome in ('won', 'lost')),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, id),
  unique (funnel_id, id),
  unique (funnel_id, key),
  unique (funnel_id, position) deferrable initially deferred,
  foreign key (organization_id, funnel_id) references public.funnels (organization_id, id) on delete cascade,
  constraint stages_terminal_outcome check ((is_terminal and terminal_outcome is not null) or (not is_terminal and terminal_outcome is null))
);
comment on column public.stages.sla_days is 'Limite de dias na etapa antes de ser considerada estagnada (0 = sem limite). Configurável por etapa (especificação 7.5).';
comment on column public.stages.probability is 'Probabilidade padrão atribuída à oportunidade ao entrar na etapa.';

create trigger stages_set_updated_at before update on public.stages
  for each row execute function app.set_updated_at();

-- Critérios de saída da etapa (campos obrigatórios, checagens, contato, orçamento).
create table public.stage_requirements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  stage_id         uuid not null,
  key              text not null check (key ~ '^[a-z_]+$'),
  label            text not null,
  kind             public.requirement_kind not null,
  field_name       text,
  hint             text,
  is_required      boolean not null default true,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, stage_id) references public.stages (organization_id, id) on delete cascade,
  unique (stage_id, key),
  constraint stage_requirements_field_name check (kind <> 'field' or field_name is not null)
);
comment on column public.stage_requirements.field_name is 'Para kind = field: coluna de companies que precisa estar preenchida (city exige city + state).';
create index stage_requirements_stage_idx on public.stage_requirements (stage_id, position);

-- Tarefas sugeridas/obrigatórias criadas ao entrar na etapa (especificação 7.4, passo 6).
create table public.stage_task_templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  stage_id         uuid not null,
  title            text not null,
  activity_type    public.activity_type not null,
  due_days         integer not null default 3 check (due_days >= 0),
  priority         public.level_3 not null default 'medium',
  is_mandatory     boolean not null default false,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, stage_id) references public.stages (organization_id, id) on delete cascade
);
create index stage_task_templates_stage_idx on public.stage_task_templates (stage_id, position);

-- -----------------------------------------------------------------------------
-- Oportunidades
-- -----------------------------------------------------------------------------
create table public.opportunities (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  company_id            uuid not null,
  owner_id              uuid not null,
  funnel_id             uuid not null,
  stage_id              uuid not null,
  title                 text not null,
  status                public.opportunity_status not null default 'open',
  estimated_value       numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  realized_value        numeric(14,2) check (realized_value is null or realized_value >= 0),
  currency              char(3) not null default 'BRL',
  probability           smallint not null default 0 check (probability between 0 and 100),
  product_line          text,
  source                text,
  expected_close_date   date,
  cycle                 integer not null default 1 check (cycle >= 1),
  close_reason          text,
  objection             text,
  funnel_entered_at     timestamptz not null default now(),
  stage_entered_at      timestamptz not null default now(),
  closed_at             timestamptz,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, company_id) references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, owner_id)   references public.memberships (organization_id, profile_id) on delete restrict,
  foreign key (organization_id, funnel_id)  references public.funnels (organization_id, id) on delete restrict,
  foreign key (funnel_id, stage_id)         references public.stages (funnel_id, id) on delete restrict,
  constraint opportunities_open_not_closed  check (status <> 'open' or closed_at is null),
  constraint opportunities_closed_has_date  check (status not in ('won', 'lost') or closed_at is not null),
  constraint opportunities_won_has_value    check (status <> 'won' or realized_value is not null),
  constraint opportunities_lost_has_reason  check (status <> 'lost' or close_reason is not null),
  constraint opportunities_stage_after_funnel check (stage_entered_at >= funnel_entered_at)
);
comment on table public.opportunities is 'Negócio dentro de um funil. A etapa precisa pertencer ao funil (FK composta).';
comment on column public.opportunities.cycle is 'Ciclo de recorrência (1 = primeira venda; 2+ = recompras).';

-- Decisão provisória (Fase 0, item 9 pendente): no máximo uma oportunidade aberta por empresa e funil.
create unique index opportunities_one_open_per_funnel_idx on public.opportunities (company_id, funnel_id) where status = 'open';
create index opportunities_company_idx        on public.opportunities (company_id, status);
create index opportunities_owner_status_idx   on public.opportunities (organization_id, owner_id, status);
create index opportunities_stage_idx          on public.opportunities (stage_id) where status = 'open';
create index opportunities_closed_at_idx      on public.opportunities (organization_id, closed_at) where closed_at is not null;
create index opportunities_expected_close_idx on public.opportunities (organization_id, expected_close_date) where status = 'open';

create trigger opportunities_set_updated_at before update on public.opportunities
  for each row execute function app.set_updated_at();

-- Histórico de passagem por etapa (imutável; regras no 0007).
create table public.opportunity_stage_history (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  opportunity_id   uuid not null,
  stage_id         uuid not null,
  entered_at       timestamptz not null default now(),
  left_at          timestamptz,
  entered_by       uuid references public.profiles(id) on delete set null,
  actor_type       public.actor_type not null default 'user',
  note             text,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade,
  foreign key (organization_id, stage_id)       references public.stages (organization_id, id) on delete restrict,
  check (left_at is null or left_at >= entered_at),
  exclude using gist (opportunity_id with =, tstzrange(entered_at, coalesce(left_at, 'infinity'::timestamptz), '[)') with &&)
);
comment on table public.opportunity_stage_history is 'Uma linha por permanência em etapa. Sem sobreposição (constraint de exclusão). No máximo uma linha aberta por oportunidade.';
create unique index opportunity_stage_history_open_idx on public.opportunity_stage_history (opportunity_id) where left_at is null;
create index opportunity_stage_history_stage_idx on public.opportunity_stage_history (stage_id, entered_at);

-- Valor de cada critério por oportunidade (checklist com evidência).
create table public.opportunity_requirement_values (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  opportunity_id   uuid not null,
  requirement_id   uuid not null references public.stage_requirements(id) on delete cascade,
  is_met           boolean not null default false,
  met_at           timestamptz,
  met_by           uuid references public.profiles(id) on delete set null,
  evidence_path    text,
  note             text,
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade,
  unique (opportunity_id, requirement_id),
  check (not is_met or met_at is not null)
);
comment on column public.opportunity_requirement_values.evidence_path is 'Caminho no Storage privado (ex.: aprovação técnica assinada).';

create trigger opportunity_requirement_values_set_updated_at before update on public.opportunity_requirement_values
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Estratégia da conta (versionada) — especificação 5.4
-- -----------------------------------------------------------------------------
create table public.strategies (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  company_id          uuid not null,
  current_version_id  uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, id),
  unique (company_id),
  foreign key (organization_id, company_id) references public.companies (organization_id, id) on delete cascade
);

create trigger strategies_set_updated_at before update on public.strategies
  for each row execute function app.set_updated_at();

create table public.strategy_versions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  strategy_id        uuid not null,
  version            integer not null check (version >= 1),
  objective          text not null,
  diagnosis          text,
  barrier            text,
  strategy           text not null,
  expected_result    text,
  origin             public.strategy_origin not null default 'manual',
  ai_suggestion_id   uuid,
  defined_by         uuid references public.profiles(id) on delete set null,
  reviewed_at        timestamptz not null default now(),
  next_review_at     timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (organization_id, strategy_id) references public.strategies (organization_id, id) on delete cascade,
  unique (strategy_id, version),
  check (next_review_at is null or next_review_at > reviewed_at)
);
comment on table public.strategy_versions is 'Cada revisão gera uma nova versão. A estratégia atual aponta para a última em strategies.current_version_id.';

alter table public.strategies
  add constraint strategies_current_version_fk
  foreign key (current_version_id) references public.strategy_versions(id) on delete set null
  deferrable initially deferred;

-- -----------------------------------------------------------------------------
-- Sugestões da IA (sempre com decisão humana) — especificação 4.5 e 9
-- -----------------------------------------------------------------------------
create table public.ai_suggestions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  company_id       uuid not null,
  opportunity_id   uuid,
  type             public.ai_suggestion_type not null,
  title            text not null,
  body             text not null,
  details          jsonb,
  evidence         text[] not null default '{}',
  missing_data     text[] not null default '{}',
  status           public.decision_status not null default 'pending',
  model            text,
  prompt_version   text,
  decided_by       uuid references public.profiles(id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, company_id)     references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete set null,
  check ((status = 'pending') = (decided_at is null))
);
comment on column public.ai_suggestions.evidence is 'Dados em que a sugestão se baseou (a recomendação deve indicar suas fontes).';
comment on column public.ai_suggestions.missing_data is 'Dados que faltaram; a IA solicita em vez de inventar.';
create index ai_suggestions_company_pending_idx on public.ai_suggestions (company_id) where status = 'pending';

alter table public.strategy_versions
  add constraint strategy_versions_ai_suggestion_fk
  foreign key (ai_suggestion_id) references public.ai_suggestions(id) on delete set null;
