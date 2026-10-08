-- =============================================================================
-- Tawper OS — 0008 — RLS, grants e storage
-- Autorização no banco, não na interface (PLANO seção 6, itens 2 e 17; F3).
--   admin/gestor      → toda a organização
--   vendedor          → própria carteira (+ carteiras concedidas em wallet_grants)
--   representante     → própria carteira (+ concessões explícitas)
--   anon              → nada
--   service_role      → ignora RLS (uso exclusivo do servidor: webhooks, workers)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de autorização (security definer: leem memberships sem recursão)
-- -----------------------------------------------------------------------------
create or replace function app.member_role(p_org uuid)
returns public.user_role language sql stable security definer set search_path = public as $$
  select m.role from public.memberships m
   where m.organization_id = p_org and m.profile_id = auth.uid() and m.is_active
   limit 1
$$;

create or replace function app.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.member_role(p_org) is not null
$$;

create or replace function app.is_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.member_role(p_org) in ('admin', 'gestor')
$$;

create or replace function app.is_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.member_role(p_org) = 'admin'
$$;

create or replace function app.can_see_owner(p_org uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.is_manager(p_org)
      or (p_owner = auth.uid() and app.is_member(p_org))
      or exists (select 1 from public.wallet_grants g
                  where g.organization_id = p_org and g.grantee_profile_id = auth.uid() and g.owner_profile_id = p_owner)
$$;

create or replace function app.can_edit_owner(p_org uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.is_manager(p_org)
      or (p_owner = auth.uid() and app.is_member(p_org))
      or exists (select 1 from public.wallet_grants g
                  where g.organization_id = p_org and g.grantee_profile_id = auth.uid() and g.owner_profile_id = p_owner and g.can_edit)
$$;

create or replace function app.can_see_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app.can_see_owner(c.organization_id, c.owner_id) from public.companies c where c.id = p_company), false)
$$;

create or replace function app.can_edit_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app.can_edit_owner(c.organization_id, c.owner_id) from public.companies c where c.id = p_company), false)
$$;

create or replace function app.can_see_opportunity(p_opportunity uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app.can_see_company(o.company_id) from public.opportunities o where o.id = p_opportunity), false)
$$;

create or replace function app.can_edit_opportunity(p_opportunity uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app.can_edit_company(o.company_id) from public.opportunities o where o.id = p_opportunity), false)
$$;

create or replace function app.can_see_conversation(p_conversation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select app.can_see_owner(cv.organization_id, cv.owner_id)
        or (cv.company_id is not null and app.can_see_company(cv.company_id))
      from public.conversations cv where cv.id = p_conversation), false)
$$;

create or replace function app.can_edit_conversation(p_conversation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select app.can_edit_owner(cv.organization_id, cv.owner_id)
        or (cv.company_id is not null and app.can_edit_company(cv.company_id))
      from public.conversations cv where cv.id = p_conversation), false)
$$;

create or replace function app.can_see_quote(p_quote uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app.can_see_company(q.company_id) from public.quotes q where q.id = p_quote), false)
$$;

create or replace function app.can_edit_quote(p_quote uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app.can_edit_company(q.company_id) from public.quotes q where q.id = p_quote), false)
$$;

create or replace function app.can_see_route(p_route uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app.can_see_owner(r.organization_id, r.owner_id) from public.route_plans r where r.id = p_route), false)
$$;

-- -----------------------------------------------------------------------------
-- Geradores de políticas padrão
-- -----------------------------------------------------------------------------
-- Configuração da organização: todos leem, somente admin altera.
create or replace procedure app.policy_org_config(p_table text)
language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('create policy %I on public.%I for select to authenticated using (app.is_member(organization_id))', p_table || '_select', p_table);
  execute format('create policy %I on public.%I for insert to authenticated with check (app.is_admin(organization_id))', p_table || '_insert', p_table);
  execute format('create policy %I on public.%I for update to authenticated using (app.is_admin(organization_id)) with check (app.is_admin(organization_id))', p_table || '_update', p_table);
  execute format('create policy %I on public.%I for delete to authenticated using (app.is_admin(organization_id))', p_table || '_delete', p_table);
end $$;

-- Dado comercial ligado a uma empresa: visibilidade segue a carteira do responsável.
create or replace procedure app.policy_scoped(p_table text, p_see text, p_edit text, p_col text default 'company_id')
language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('create policy %I on public.%I for select to authenticated using (%s(%I))', p_table || '_select', p_table, p_see, p_col);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s(%I))', p_table || '_insert', p_table, p_edit, p_col);
  execute format('create policy %I on public.%I for update to authenticated using (%s(%I)) with check (%s(%I))', p_table || '_update', p_table, p_edit, p_col, p_edit, p_col);
  execute format('create policy %I on public.%I for delete to authenticated using (app.is_manager(organization_id))', p_table || '_delete', p_table);
end $$;

-- -----------------------------------------------------------------------------
-- Identidade e organização
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
create policy organizations_select on public.organizations for select to authenticated using (app.is_member(id));
create policy organizations_update on public.organizations for update to authenticated using (app.is_admin(id)) with check (app.is_admin(id));

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (select 1 from public.memberships a
              join public.memberships b on b.organization_id = a.organization_id
             where a.profile_id = auth.uid() and a.is_active and b.profile_id = profiles.id and b.is_active)
);
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.memberships enable row level security;
create policy memberships_select on public.memberships for select to authenticated using (app.is_member(organization_id));
create policy memberships_insert on public.memberships for insert to authenticated with check (app.is_admin(organization_id));
create policy memberships_update on public.memberships for update to authenticated using (app.is_admin(organization_id)) with check (app.is_admin(organization_id));
create policy memberships_delete on public.memberships for delete to authenticated using (app.is_admin(organization_id));

call app.policy_org_config('regions');
call app.policy_org_config('user_region_assignments');
call app.policy_org_config('wallet_grants');
call app.policy_org_config('reference_options');
call app.policy_org_config('funnels');
call app.policy_org_config('stages');
call app.policy_org_config('stage_requirements');
call app.policy_org_config('stage_task_templates');
call app.policy_org_config('products');
call app.policy_org_config('integration_accounts');
call app.policy_org_config('import_batches');
call app.policy_org_config('import_rows');

-- -----------------------------------------------------------------------------
-- Empresas: a carteira define o que cada um vê.
-- O WITH CHECK na atualização impede trocar owner_id para obter acesso indevido.
-- -----------------------------------------------------------------------------
alter table public.companies enable row level security;
create policy companies_select on public.companies for select to authenticated
  using (app.can_see_owner(organization_id, owner_id));
create policy companies_insert on public.companies for insert to authenticated
  with check (app.can_edit_owner(organization_id, owner_id));
create policy companies_update on public.companies for update to authenticated
  using (app.can_edit_owner(organization_id, owner_id))
  with check (app.can_edit_owner(organization_id, owner_id));
create policy companies_delete on public.companies for delete to authenticated
  using (app.is_admin(organization_id));

call app.policy_scoped('company_relationships', 'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('contacts',              'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('opportunities',         'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('strategies',            'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('ai_suggestions',        'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('interactions',          'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('standby_periods',       'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('quotes',                'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('sales',                 'app.can_see_company', 'app.can_edit_company');
call app.policy_scoped('route_stops',           'app.can_see_company', 'app.can_edit_company');

call app.policy_scoped('opportunity_stage_history',      'app.can_see_opportunity', 'app.can_edit_opportunity', 'opportunity_id');
call app.policy_scoped('opportunity_requirement_values', 'app.can_see_opportunity', 'app.can_edit_opportunity', 'opportunity_id');
call app.policy_scoped('quote_items',                    'app.can_see_quote',       'app.can_edit_quote',       'quote_id');
call app.policy_scoped('conversation_participants',      'app.can_see_conversation', 'app.can_edit_conversation', 'conversation_id');
call app.policy_scoped('messages',                       'app.can_see_conversation', 'app.can_edit_conversation', 'conversation_id');
call app.policy_scoped('conversation_summaries',         'app.can_see_conversation', 'app.can_edit_conversation', 'conversation_id');

-- Versões de estratégia e anexos: escopo pelo pai.
alter table public.strategy_versions enable row level security;
create policy strategy_versions_select on public.strategy_versions for select to authenticated
  using (exists (select 1 from public.strategies s where s.id = strategy_id and app.can_see_company(s.company_id)));
create policy strategy_versions_insert on public.strategy_versions for insert to authenticated
  with check (exists (select 1 from public.strategies s where s.id = strategy_id and app.can_edit_company(s.company_id)));

alter table public.message_attachments enable row level security;
create policy message_attachments_select on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and app.can_see_conversation(m.conversation_id)));
create policy message_attachments_insert on public.message_attachments for insert to authenticated
  with check (exists (select 1 from public.messages m where m.id = message_id and app.can_edit_conversation(m.conversation_id)));

alter table public.activity_results enable row level security;
create policy activity_results_select on public.activity_results for select to authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id and (app.can_see_company(a.company_id) or a.owner_id = auth.uid())));
create policy activity_results_insert on public.activity_results for insert to authenticated
  with check (exists (select 1 from public.activities a where a.id = activity_id and (app.can_edit_company(a.company_id) or a.owner_id = auth.uid())));
create policy activity_results_update on public.activity_results for update to authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id and (app.can_edit_company(a.company_id) or a.owner_id = auth.uid())));

alter table public.data_consents enable row level security;
create policy data_consents_select on public.data_consents for select to authenticated
  using (exists (select 1 from public.contacts ct where ct.id = contact_id and app.can_see_company(ct.company_id)));
create policy data_consents_insert on public.data_consents for insert to authenticated
  with check (exists (select 1 from public.contacts ct where ct.id = contact_id and app.can_edit_company(ct.company_id)));
create policy data_consents_update on public.data_consents for update to authenticated
  using (exists (select 1 from public.contacts ct where ct.id = contact_id and app.can_edit_company(ct.company_id)));

-- Atividades: quem vê a empresa ou é o responsável pela tarefa.
alter table public.activities enable row level security;
create policy activities_select on public.activities for select to authenticated
  using (app.can_see_company(company_id) or owner_id = auth.uid());
create policy activities_insert on public.activities for insert to authenticated
  with check (app.can_edit_company(company_id) or (owner_id = auth.uid() and app.can_see_company(company_id)));
create policy activities_update on public.activities for update to authenticated
  using (app.can_edit_company(company_id) or owner_id = auth.uid())
  with check (app.can_edit_company(company_id) or owner_id = auth.uid());
create policy activities_delete on public.activities for delete to authenticated
  using (app.is_manager(organization_id));

-- Conversas: carteira do responsável pelo número/conversa ou da empresa vinculada.
alter table public.conversations enable row level security;
create policy conversations_select on public.conversations for select to authenticated
  using (app.can_see_owner(organization_id, owner_id) or (company_id is not null and app.can_see_company(company_id)));
create policy conversations_insert on public.conversations for insert to authenticated
  with check (app.can_edit_owner(organization_id, owner_id));
create policy conversations_update on public.conversations for update to authenticated
  using (app.can_edit_owner(organization_id, owner_id) or (company_id is not null and app.can_edit_company(company_id)))
  with check (app.can_edit_owner(organization_id, owner_id) or (company_id is not null and app.can_edit_company(company_id)));

-- Rotas: responsável ou gestão.
alter table public.route_plans enable row level security;
create policy route_plans_select on public.route_plans for select to authenticated using (app.can_see_owner(organization_id, owner_id));
create policy route_plans_insert on public.route_plans for insert to authenticated with check (app.can_edit_owner(organization_id, owner_id));
create policy route_plans_update on public.route_plans for update to authenticated using (app.can_edit_owner(organization_id, owner_id)) with check (app.can_edit_owner(organization_id, owner_id));
create policy route_plans_delete on public.route_plans for delete to authenticated using (app.is_manager(organization_id));

-- Notificações: só o destinatário lê e marca como lida; qualquer membro pode gerar (cobrança interna).
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated with check (app.is_member(organization_id));
create policy notifications_update on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (recipient_id = auth.uid());

-- Auditoria: leitura por quem vê a empresa (ou gestão para eventos sem empresa). Sem UPDATE/DELETE para ninguém.
alter table public.audit_events enable row level security;
create policy audit_events_select on public.audit_events for select to authenticated
  using (app.is_manager(organization_id) or (company_id is not null and app.can_see_company(company_id)));
create policy audit_events_insert on public.audit_events for insert to authenticated
  with check (app.is_member(organization_id) and actor_id = auth.uid());

-- Integração técnica: somente servidor (service_role). Administradores leem para o painel de saúde.
alter table public.external_identities enable row level security;
create policy external_identities_select on public.external_identities for select to authenticated using (app.is_member(organization_id));
create policy external_identities_write on public.external_identities for all to authenticated using (app.is_admin(organization_id)) with check (app.is_admin(organization_id));

alter table public.inbound_events enable row level security;
create policy inbound_events_select on public.inbound_events for select to authenticated using (organization_id is not null and app.is_admin(organization_id));

alter table public.outbox_events enable row level security;
create policy outbox_events_select on public.outbox_events for select to authenticated using (app.is_admin(organization_id));

alter table public.job_attempts enable row level security;
create policy job_attempts_select on public.job_attempts for select to authenticated using (
  exists (select 1 from public.outbox_events e where e.id = outbox_event_id and app.is_admin(e.organization_id))
  or exists (select 1 from public.inbound_events e where e.id = inbound_event_id and e.organization_id is not null and app.is_admin(e.organization_id))
);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Append-only e tabelas técnicas: o usuário autenticado só lê.
revoke update, delete on public.audit_events from authenticated;
revoke insert, update, delete on public.inbound_events from authenticated;
revoke insert, update, delete on public.outbox_events from authenticated;
revoke insert, update, delete on public.job_attempts from authenticated;
revoke insert, update, delete on public.opportunity_stage_history from authenticated;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema app grant execute on functions to authenticated;

-- -----------------------------------------------------------------------------
-- Storage privado para anexos e PDFs: caminho começa com {organization_id}/
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)
on conflict (id) do nothing;

create policy attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and app.is_member(app.try_uuid((storage.foldername(name))[1])));
create policy attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and app.is_member(app.try_uuid((storage.foldername(name))[1])));
create policy attachments_update on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and app.is_manager(app.try_uuid((storage.foldername(name))[1])));
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and app.is_manager(app.try_uuid((storage.foldername(name))[1])));
