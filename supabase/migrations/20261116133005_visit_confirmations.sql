create table public.visit_confirmations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 activity_id uuid not null references public.activities(id), contact_id uuid not null references public.contacts(id),
 seller_id uuid not null references public.profiles(id), client_phone text not null check(client_phone ~ '^55[0-9]{10,11}$'),
 seller_phone text not null check(seller_phone ~ '^55[0-9]{10,11}$'), client_name text not null, seller_name text not null,
 company_id uuid not null references public.companies(id), purpose text not null, due_at timestamptz not null,
 status text not null default 'queued' check(status in ('queued','waiting','confirmed','declined','expired','cancelled','send_uncertain')),
 requested_at timestamptz not null default now(), sent_at timestamptz, warned_at timestamptz,
 unique(activity_id,contact_id,due_at), check(due_at > requested_at)
);
create unique index visit_confirmation_active_phone on public.visit_confirmations(client_phone) where status in ('queued','waiting','send_uncertain');
create table public.visit_communication_jobs (
 id uuid primary key default gen_random_uuid(), confirmation_id uuid not null references public.visit_confirmations(id),
 dedupe_key text not null unique, kind text not null check(kind in ('client','seller','inbound')),
 phone text not null, body text not null, created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
 claimed_at timestamptz, finished_at timestamptz, external_id text, error text
);
create index visit_jobs_pending on public.visit_communication_jobs(created_at) where status='pending';
alter table public.visit_confirmations enable row level security;
alter table public.visit_communication_jobs enable row level security;
revoke all on public.visit_confirmations,public.visit_communication_jobs from anon,authenticated;
grant all on public.visit_confirmations,public.visit_communication_jobs to service_role;
create policy visit_confirmations_read on public.visit_confirmations for select to authenticated using(app.is_manager(organization_id) or (seller_id=(select auth.uid()) and app.is_member(organization_id)));
grant select on public.visit_confirmations to authenticated;
