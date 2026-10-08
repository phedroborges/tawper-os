-- =============================================================================
-- Tawper OS — 0010 — Índices de listagem e unicidade complementar
-- Alinha consultas de Carteira, Meu Dia, Kanban e Conversas à paginação
-- por cursor (organization_id + data + id).
-- =============================================================================

create unique index if not exists profiles_email_unique_idx
  on public.profiles (email)
  where email is not null;

create index if not exists companies_org_created_idx
  on public.companies (organization_id, created_at desc, id);

create index if not exists opportunities_org_created_idx
  on public.opportunities (organization_id, created_at desc, id);

create index if not exists activities_org_created_idx
  on public.activities (organization_id, created_at desc, id);

create index if not exists conversations_org_last_idx
  on public.conversations (organization_id, last_message_at desc nulls last, id);

create index if not exists quotes_org_created_idx
  on public.quotes (organization_id, created_at desc, id);

create index if not exists messages_org_sent_idx
  on public.messages (organization_id, sent_at desc, id);
