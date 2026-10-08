-- =============================================================================
-- Tawper OS — 0001 — Base
-- Extensões, schema interno `app`, tipos, identidade e organização.
--
-- Princípios aplicados (PLANO_IMPLEMENTACAO.md, seção 6):
--   • PostgreSQL é a fonte de verdade.
--   • Toda tabela de negócio possui organization_id.
--   • Datas em timestamptz (UTC); exibição em America/Sao_Paulo.
--   • Telefones em E.164; monetário em numeric + moeda explícita.
--   • IDs internos (uuid) independentes de fornecedores.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;

create schema if not exists app;
comment on schema app is 'Funções internas, triggers e helpers de autorização do Tawper OS. Nada aqui é exposto diretamente à interface.';

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
create type public.user_role           as enum ('admin', 'gestor', 'vendedor', 'representante');
create type public.company_status      as enum ('active', 'standby', 'lost', 'archived', 'merged');
create type public.press_type          as enum ('own', 'tawper_loan', 'competitor_loan', 'none');
create type public.level_3             as enum ('high', 'medium', 'low');
create type public.contact_role        as enum ('decision_maker', 'buyer', 'technical', 'mechanic', 'influencer', 'other');
create type public.contact_channel     as enum ('whatsapp', 'phone', 'email', 'in_person');
create type public.opportunity_status  as enum ('open', 'won', 'lost', 'suspended');
create type public.requirement_kind    as enum ('field', 'check', 'contact', 'quote');
create type public.strategy_origin     as enum ('manual', 'ai_approved');
create type public.activity_type       as enum ('call', 'whatsapp', 'email', 'visit', 'meeting', 'quote', 'homologation', 'registration', 'support', 'other');
create type public.activity_status     as enum ('pending', 'in_progress', 'done', 'cancelled');
create type public.record_origin       as enum ('manual', 'rule', 'ai', 'integration');
create type public.interaction_channel as enum ('whatsapp', 'phone', 'email', 'visit', 'meeting', 'note', 'system', 'ai');
create type public.interaction_kind    as enum ('create', 'stage', 'win', 'loss', 'standby', 'quote', 'task', 'note', 'ai', 'contact', 'merge', 'import', 'nudge', 'strategy', 'message');
create type public.actor_type          as enum ('user', 'ai', 'integration', 'automation', 'system');
create type public.notification_type   as enum ('nudge', 'alert', 'ai', 'system');
create type public.quote_status        as enum ('draft', 'sent', 'accepted', 'rejected', 'expired');
create type public.sale_kind           as enum ('first_sale', 'repurchase');
create type public.integration_kind    as enum ('whatsapp', 'ai', 'storage', 'notification', 'other');
create type public.connection_status   as enum ('disconnected', 'connecting', 'connected', 'error');
create type public.message_direction   as enum ('inbound', 'outbound', 'internal_note', 'system');
create type public.delivery_status     as enum ('queued', 'sent', 'delivered', 'read', 'failed');
create type public.attachment_kind     as enum ('pdf', 'image', 'audio', 'video', 'document', 'other');
create type public.processing_status   as enum ('pending', 'processing', 'processed', 'failed', 'ignored', 'dead');
create type public.ai_suggestion_type  as enum ('strategy', 'next_step', 'registration');
create type public.decision_status     as enum ('pending', 'approved', 'discarded');
create type public.import_source       as enum ('moskit', 'spreadsheet', 'other');
create type public.import_row_status   as enum ('created', 'updated', 'skipped', 'rejected');
create type public.route_status        as enum ('planned', 'confirmed', 'done', 'cancelled');
create type public.standby_outcome     as enum ('resumed', 'lost', 'archived');
create type public.relationship_kind   as enum ('depends_on', 'same_group', 'service_provider_of', 'other');

-- -----------------------------------------------------------------------------
-- Helpers genéricos
-- -----------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Normalização de texto para busca e duplicidade (imutável para uso em coluna gerada).
create or replace function app.normalize_text(p text)
returns text language sql immutable strict as $$
  select trim(regexp_replace(regexp_replace(lower(translate(p,
    'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^a-z0-9 ]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function app.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Quem está agindo: usuário autenticado, IA, integração, automação ou sistema.
-- A camada de aplicação define `set_config('app.actor_type', 'ai', true)` quando necessário.
create or replace function app.current_actor_type()
returns public.actor_type language sql stable as $$
  select coalesce(
    nullif(current_setting('app.actor_type', true), '')::public.actor_type,
    case when auth.uid() is null then 'system'::public.actor_type else 'user'::public.actor_type end
  )
$$;

-- -----------------------------------------------------------------------------
-- Organização (tenant)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          citext not null unique,
  code_prefix   text not null default 'TW' check (code_prefix ~ '^[A-Z]{1,5}$'),
  company_seq   integer not null default 0,
  quote_seq     integer not null default 0,
  timezone      text not null default 'America/Sao_Paulo',
  currency      char(3) not null default 'BRL',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.organizations is 'Tenant. Mesmo com uma única empresa inicialmente, o isolamento nasce aqui.';
comment on column public.organizations.company_seq is 'Contador para o código sequencial de empresas (ex.: TW-0118).';
comment on column public.organizations.quote_seq is 'Contador para o número sequencial de orçamentos (ex.: TW-2026-0179).';

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         citext,
  full_name     text not null,
  short_name    text not null,
  title         text,
  phone_e164    text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  avatar_color  text check (avatar_color is null or avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.profiles is 'Dados de exibição do usuário. Nunca decidir autorização por aqui: usar memberships.';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

-- Cria o perfil automaticamente quando o usuário é criado no Supabase Auth.
create or replace function app.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_full text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1), 'Usuário');
begin
  insert into public.profiles (id, email, full_name, short_name)
  values (
    new.id,
    new.email,
    v_full,
    coalesce(nullif(new.raw_user_meta_data ->> 'short_name', ''), split_part(v_full, ' ', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Vínculo usuário × organização × perfil de acesso
-- -----------------------------------------------------------------------------
create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  profile_id       uuid not null references public.profiles(id) on delete restrict,
  role             public.user_role not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, profile_id)
);
comment on table public.memberships is 'Perfil de acesso (admin, gestor, vendedor, representante) por organização. Base de toda a autorização.';
create index memberships_profile_idx on public.memberships (profile_id) where is_active;

create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Regiões comerciais
-- -----------------------------------------------------------------------------
create table public.regions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  name             text not null,
  states           char(2)[] not null default '{}',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);
comment on table public.regions is 'Regiões de atuação (ex.: Noroeste Paulista). Cadastro pendente de decisão na Fase 0, item 12.';

create trigger regions_set_updated_at before update on public.regions
  for each row execute function app.set_updated_at();

create table public.user_region_assignments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  profile_id       uuid not null,
  region_id        uuid not null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, profile_id) references public.memberships (organization_id, profile_id) on delete cascade,
  foreign key (organization_id, region_id)  references public.regions (organization_id, id) on delete cascade,
  unique (organization_id, profile_id, region_id)
);
create index user_region_assignments_region_idx on public.user_region_assignments (region_id);

-- -----------------------------------------------------------------------------
-- Matriz de carteira: quem enxerga (e pode editar) a carteira de quem.
-- Gestores e administradores veem tudo por padrão; esta tabela cobre exceções
-- (ex.: representante autorizado a ver outra carteira).
-- -----------------------------------------------------------------------------
create table public.wallet_grants (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  grantee_profile_id  uuid not null,
  owner_profile_id    uuid not null,
  can_edit            boolean not null default false,
  granted_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  foreign key (organization_id, grantee_profile_id) references public.memberships (organization_id, profile_id) on delete cascade,
  foreign key (organization_id, owner_profile_id)   references public.memberships (organization_id, profile_id) on delete cascade,
  check (grantee_profile_id <> owner_profile_id),
  unique (organization_id, grantee_profile_id, owner_profile_id)
);
create index wallet_grants_grantee_idx on public.wallet_grants (organization_id, grantee_profile_id);

-- -----------------------------------------------------------------------------
-- Listas de opções configuráveis pelo administrador (motivos, origens, ramos…)
-- Campos de relatório ficam estruturados sem exigir alteração de código.
-- -----------------------------------------------------------------------------
create table public.reference_options (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  list_key         text not null check (list_key ~ '^[a-z_]+$'),
  value            text not null,
  label            text not null,
  position         integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, list_key, value)
);
comment on table public.reference_options is 'Listas: loss_reason, standby_reason, lead_source, industry, brand, payment_terms, competitor.';
create index reference_options_list_idx on public.reference_options (organization_id, list_key, position) where is_active;

create trigger reference_options_set_updated_at before update on public.reference_options
  for each row execute function app.set_updated_at();
