-- =============================================================================
-- Tawper OS — 0005 — Comunicação e integrações
-- Modelo canônico de conversa/mensagem independente do provedor (PLANO 14.1),
-- dados específicos do provedor isolados (PLANO 14.2), idempotência de
-- webhooks e outbox para efeitos externos (PLANO seção 6, itens 6–9).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Contas de integração (um número de WhatsApp, um provedor de IA…)
-- Credenciais NUNCA ficam aqui: apenas a referência ao cofre de segredos.
-- -----------------------------------------------------------------------------
create table public.integration_accounts (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  kind                  public.integration_kind not null,
  provider              text not null,
  label                 text not null,
  phone_e164            text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  owner_id              uuid,
  external_instance_id  text,
  status                public.connection_status not null default 'disconnected',
  capabilities          jsonb not null default '{}'::jsonb,
  config                jsonb not null default '{}'::jsonb,
  credentials_ref       text,
  is_enabled            boolean not null default false,
  last_health_at        timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, owner_id) references public.memberships (organization_id, profile_id) on delete set null
);
comment on table public.integration_accounts is 'Conta conectada em um provedor (ex.: whatsapp_unofficial, whatsapp_cloud, openai). is_enabled é a feature flag por número.';
comment on column public.integration_accounts.config is 'Configuração NÃO sensível. Segredos ficam no cofre, referenciados por credentials_ref.';
create unique index integration_accounts_instance_idx on public.integration_accounts (organization_id, provider, external_instance_id) where external_instance_id is not null;
create unique index integration_accounts_phone_idx    on public.integration_accounts (organization_id, kind, phone_e164) where phone_e164 is not null;

create trigger integration_accounts_set_updated_at before update on public.integration_accounts
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Conversas (canônicas)
-- -----------------------------------------------------------------------------
create table public.conversations (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete restrict,
  integration_account_id    uuid not null,
  company_id                uuid,
  contact_id                uuid,
  counterpart_phone_e164    text not null check (counterpart_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  counterpart_name          text,
  owner_id                  uuid not null,
  is_archived               boolean not null default false,
  unread_count              integer not null default 0 check (unread_count >= 0),
  last_message_at           timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, integration_account_id) references public.integration_accounts (organization_id, id) on delete restrict,
  foreign key (organization_id, company_id)             references public.companies (organization_id, id) on delete set null,
  foreign key (organization_id, contact_id)             references public.contacts (organization_id, id) on delete set null,
  foreign key (organization_id, owner_id)               references public.memberships (organization_id, profile_id) on delete restrict,
  unique (integration_account_id, counterpart_phone_e164)
);
comment on table public.conversations is 'Conversa por número conectado × telefone do interlocutor. Vínculo com empresa/contato pode ser nulo até ser assistido pelo usuário.';
create index conversations_owner_idx    on public.conversations (organization_id, owner_id, last_message_at desc);
create index conversations_company_idx  on public.conversations (company_id) where company_id is not null;
create index conversations_unlinked_idx on public.conversations (organization_id, last_message_at desc) where company_id is null and not is_archived;

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function app.set_updated_at();

create table public.conversation_participants (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  conversation_id  uuid not null,
  profile_id       uuid,
  contact_id       uuid,
  role             text not null check (role in ('agent', 'customer', 'observer')),
  joined_at        timestamptz not null default now(),
  left_at          timestamptz,
  foreign key (organization_id, conversation_id) references public.conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, profile_id)      references public.memberships (organization_id, profile_id) on delete cascade,
  foreign key (organization_id, contact_id)      references public.contacts (organization_id, id) on delete cascade,
  check ((profile_id is not null) <> (contact_id is not null)),
  check (left_at is null or left_at >= joined_at)
);
create index conversation_participants_conv_idx on public.conversation_participants (conversation_id);

-- -----------------------------------------------------------------------------
-- Mensagens
-- -----------------------------------------------------------------------------
create table public.messages (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  conversation_id       uuid not null,
  direction             public.message_direction not null,
  body                  text,
  author_id             uuid references public.profiles(id) on delete set null,
  contact_id            uuid,
  sent_at               timestamptz not null default now(),
  delivery_status       public.delivery_status,
  delivered_at          timestamptz,
  read_at               timestamptz,
  failed_at             timestamptz,
  error_detail          text,
  external_message_id   text,
  idempotency_key       text,
  reply_to_message_id   uuid references public.messages(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, conversation_id) references public.conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id)      references public.contacts (organization_id, id) on delete set null,
  constraint messages_outbound_status check (direction <> 'outbound' or delivery_status is not null),
  constraint messages_note_has_author check (direction <> 'internal_note' or author_id is not null)
);
comment on column public.messages.external_message_id is 'ID da mensagem no provedor. Único por conversa quando presente.';
comment on column public.messages.idempotency_key is 'Chave do comando de envio: repetir o mesmo envio não duplica a mensagem.';
create unique index messages_external_idx    on public.messages (conversation_id, external_message_id) where external_message_id is not null;
create unique index messages_idempotency_idx on public.messages (organization_id, idempotency_key) where idempotency_key is not null;
create index messages_conversation_time_idx  on public.messages (conversation_id, sent_at);
create index messages_pending_idx            on public.messages (organization_id, sent_at) where direction = 'outbound' and delivery_status in ('queued', 'failed');

create table public.message_attachments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  message_id         uuid not null,
  kind               public.attachment_kind not null,
  file_name          text not null,
  mime_type          text,
  size_bytes         bigint check (size_bytes is null or size_bytes >= 0),
  storage_path       text,
  external_media_id  text,
  detail             text,
  created_at         timestamptz not null default now(),
  foreign key (organization_id, message_id) references public.messages (organization_id, id) on delete cascade
);
comment on column public.message_attachments.storage_path is 'Caminho no bucket privado `attachments` ({organization_id}/...). Nulo enquanto a mídia não foi baixada.';
create index message_attachments_message_idx on public.message_attachments (message_id);

-- Resumo de conversa gerado pela IA (especificação 9.3) — sempre com confirmação humana para gravar no CRM.
create table public.conversation_summaries (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  conversation_id       uuid not null,
  subject               text,
  need                  text,
  objections            text[] not null default '{}',
  tawper_commitments    text[] not null default '{}',
  client_commitments    text[] not null default '{}',
  mentioned_dates       text[] not null default '{}',
  next_step             text,
  next_step_type        public.activity_type,
  next_step_days        integer check (next_step_days is null or next_step_days >= 0),
  suggested_stage_id    uuid,
  extracted_data        jsonb,
  confidence            numeric(4,3) check (confidence is null or confidence between 0 and 1),
  model                 text,
  prompt_version        text,
  generated_at          timestamptz not null default now(),
  approved_by           uuid references public.profiles(id) on delete set null,
  approved_at           timestamptz,
  foreign key (organization_id, conversation_id)    references public.conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, suggested_stage_id) references public.stages (organization_id, id) on delete set null
);
create index conversation_summaries_conv_idx on public.conversation_summaries (conversation_id, generated_at desc);

-- -----------------------------------------------------------------------------
-- Identidades externas: mapeamento ID externo → ID interno (Moskit, WhatsApp…)
-- -----------------------------------------------------------------------------
create table public.external_identities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  provider         text not null,
  entity_type      text not null check (entity_type in ('company', 'contact', 'profile', 'conversation', 'opportunity', 'message', 'activity')),
  entity_id        uuid not null,
  external_id      text not null,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (organization_id, provider, entity_type, external_id),
  unique (organization_id, provider, entity_type, entity_id)
);
comment on table public.external_identities is 'IDs externos nunca são chave primária interna. Cada provedor tem seu próprio mapeamento.';
create index external_identities_entity_idx on public.external_identities (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Eventos recebidos (webhooks) — payload bruto antes de qualquer processamento
-- -----------------------------------------------------------------------------
create table public.inbound_events (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid references public.organizations(id) on delete restrict,
  integration_account_id  uuid references public.integration_accounts(id) on delete set null,
  provider                text not null,
  external_event_id       text not null,
  event_type              text,
  received_at             timestamptz not null default now(),
  payload                 jsonb not null,
  signature_valid         boolean,
  status                  public.processing_status not null default 'pending',
  processed_at            timestamptz,
  attempts                integer not null default 0 check (attempts >= 0),
  last_error              text,
  unique (provider, external_event_id)
);
comment on table public.inbound_events is 'Chave única (provider, external_event_id) garante idempotência: repetir o webhook não repete efeitos.';
create index inbound_events_pending_idx on public.inbound_events (received_at) where status in ('pending', 'failed');
create index inbound_events_account_idx on public.inbound_events (integration_account_id, received_at desc);

-- -----------------------------------------------------------------------------
-- Outbox: efeitos externos gravados na mesma transação do negócio
-- -----------------------------------------------------------------------------
create table public.outbox_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  aggregate_type   text not null,
  aggregate_id     uuid not null,
  event_type       text not null,
  payload          jsonb not null default '{}'::jsonb,
  idempotency_key  text not null,
  status           public.processing_status not null default 'pending',
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 8 check (max_attempts >= 1),
  next_attempt_at  timestamptz not null default now(),
  locked_at        timestamptz,
  locked_by        text,
  last_error       text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  unique (idempotency_key)
);
comment on table public.outbox_events is 'Envio de WhatsApp, IA ou HTTP nunca ocorre dentro da transação: o worker consome a outbox com tentativas, backoff e dead-letter (status = dead).';
create index outbox_events_due_idx on public.outbox_events (next_attempt_at) where status in ('pending', 'failed');
create index outbox_events_aggregate_idx on public.outbox_events (aggregate_type, aggregate_id);

create table public.job_attempts (
  id                uuid primary key default gen_random_uuid(),
  outbox_event_id   uuid references public.outbox_events(id) on delete cascade,
  inbound_event_id  uuid references public.inbound_events(id) on delete cascade,
  job_name          text not null,
  worker_id         text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  succeeded         boolean,
  error             text,
  check (finished_at is null or finished_at >= started_at)
);
create index job_attempts_outbox_idx  on public.job_attempts (outbox_event_id, started_at desc);
create index job_attempts_inbound_idx on public.job_attempts (inbound_event_id, started_at desc);
