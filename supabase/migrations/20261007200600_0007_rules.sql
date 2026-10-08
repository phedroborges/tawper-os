-- =============================================================================
-- Tawper OS — 0007 — Regras de integridade e visões
-- Invariantes que o banco garante sozinho, independentemente de quem chama:
--   • histórico de etapa fecha e abre junto com a mudança de etapa;
--   • etapa só avança com os critérios obrigatórios da etapa atual cumpridos;
--   • etapa terminal exige oportunidade encerrada;
--   • histórico é imutável (salvo correção administrativa marcada);
--   • espera sincroniza o status da empresa;
--   • estratégia aponta sempre para a versão mais recente;
--   • conversa mantém último horário e não lidas.
-- Os casos de uso compostos (ganhar venda → abrir recorrência → criar pós-venda)
-- pertencem à Fase 4 e serão funções de aplicação sobre estas garantias.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Critérios de saída (RN-03)
-- -----------------------------------------------------------------------------
create or replace function app.field_is_filled(p_company jsonb, p_field text)
returns boolean language sql immutable as $$
  select case
    when p_field = 'city' then coalesce(p_company ->> 'city', '') <> '' and coalesce(p_company ->> 'state', '') <> ''
    else coalesce(p_company ->> p_field, '') not in ('', '0', 'null')
  end
$$;

create or replace function app.missing_requirements(p_opportunity uuid)
returns table (requirement_id uuid, stage_id uuid, key text, label text, kind public.requirement_kind, hint text)
language sql stable as $$
  with o as (
    select op.id, op.company_id, op.stage_id, to_jsonb(c) as company
      from public.opportunities op
      join public.companies c on c.id = op.company_id
     where op.id = p_opportunity
  )
  select r.id, r.stage_id, r.key, r.label, r.kind, r.hint
    from o
    join public.stage_requirements r on r.stage_id = o.stage_id and r.is_required
   where case r.kind
           when 'field'   then not app.field_is_filled(o.company, r.field_name)
           when 'check'   then not exists (select 1 from public.opportunity_requirement_values v
                                            where v.opportunity_id = o.id and v.requirement_id = r.id and v.is_met)
           when 'contact' then not exists (select 1 from public.contacts ct
                                            where ct.company_id = o.company_id and ct.is_active)
           when 'quote'   then not exists (select 1 from public.quotes q
                                            where q.opportunity_id = o.id and q.status in ('sent', 'accepted'))
         end
   order by r.position
$$;
comment on function app.missing_requirements is 'Critérios obrigatórios ainda não cumpridos na etapa atual da oportunidade. Usado pelo servidor antes de mudar etapa e pelo trigger de proteção.';

-- -----------------------------------------------------------------------------
-- Oportunidade: regras de etapa (BEFORE)
-- -----------------------------------------------------------------------------
create or replace function app.tg_opportunity_stage_rules()
returns trigger language plpgsql as $$
declare
  v_new_pos      integer;
  v_old_pos      integer;
  v_terminal     boolean;
  v_outcome      public.opportunity_status;
  v_probability  smallint;
  v_missing      text;
  v_bypass       boolean := coalesce(current_setting('app.bypass_stage_rules', true), '') = 'on';
begin
  select position, is_terminal, terminal_outcome, probability
    into v_new_pos, v_terminal, v_outcome, v_probability
    from public.stages where id = new.stage_id;

  if v_terminal and new.status = 'open' then
    raise exception 'Etapa terminal exige oportunidade encerrada (ganha ou perdida).' using errcode = 'P0001';
  end if;
  if v_terminal and v_outcome = 'won' and new.status <> 'won' then
    raise exception 'A etapa de ganho só aceita oportunidade com status won.' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if new.probability = 0 then new.probability := v_probability; end if;
    return new;
  end if;

  if new.stage_id <> old.stage_id then
    select position into v_old_pos from public.stages where id = old.stage_id;

    if v_new_pos > v_old_pos and not v_bypass then
      select string_agg(label, ', ' order by label) into v_missing
        from app.missing_requirements(old.id)
       where stage_id = old.stage_id;
      if v_missing is not null then
        raise exception 'Critérios pendentes para sair da etapa atual: %', v_missing using errcode = 'P0001';
      end if;
    end if;

    if new.stage_entered_at is not distinct from old.stage_entered_at then
      new.stage_entered_at := now();
    end if;
    if new.probability is not distinct from old.probability then
      new.probability := v_probability;
    end if;
  end if;

  if new.status in ('won', 'lost') and old.status = 'open' and new.closed_at is null then
    new.closed_at := now();
  end if;

  return new;
end $$;

create trigger opportunities_stage_rules before insert or update on public.opportunities
  for each row execute function app.tg_opportunity_stage_rules();

-- -----------------------------------------------------------------------------
-- Oportunidade: histórico de etapa (AFTER)
-- -----------------------------------------------------------------------------
create or replace function app.tg_opportunity_stage_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.stage_id = old.stage_id then
      return null;
    end if;
    perform set_config('app.admin_correction', 'on', true);
    update public.opportunity_stage_history
       set left_at = new.stage_entered_at
     where opportunity_id = new.id and left_at is null;
    perform set_config('app.admin_correction', '', true);
  end if;

  insert into public.opportunity_stage_history (organization_id, opportunity_id, stage_id, entered_at, entered_by, actor_type)
  values (new.organization_id, new.id, new.stage_id, new.stage_entered_at, auth.uid(), app.current_actor_type());
  return null;
end $$;

create trigger opportunities_stage_history after insert or update of stage_id on public.opportunities
  for each row execute function app.tg_opportunity_stage_history();

-- Histórico imutável após fechamento, salvo correção administrativa auditada.
create or replace function app.tg_stage_history_immutable()
returns trigger language plpgsql as $$
declare
  v_correction boolean := coalesce(current_setting('app.admin_correction', true), '') = 'on';
begin
  if v_correction then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Histórico de etapa não pode ser excluído.' using errcode = '42501';
  end if;
  if old.left_at is not null then
    raise exception 'Passagem de etapa já encerrada é imutável. Use correção administrativa auditada.' using errcode = '42501';
  end if;
  if new.opportunity_id <> old.opportunity_id or new.stage_id <> old.stage_id or new.entered_at <> old.entered_at then
    raise exception 'Somente left_at e note podem ser alterados em uma passagem aberta.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger opportunity_stage_history_immutable before update or delete on public.opportunity_stage_history
  for each row execute function app.tg_stage_history_immutable();

-- Critério marcado como cumprido recebe data e autor.
create or replace function app.tg_requirement_value_met()
returns trigger language plpgsql as $$
begin
  if new.is_met and (tg_op = 'INSERT' or not old.is_met) then
    new.met_at := coalesce(new.met_at, now());
    new.met_by := coalesce(new.met_by, auth.uid());
  elsif not new.is_met then
    new.met_at := null;
    new.met_by := null;
  end if;
  return new;
end $$;

create trigger opportunity_requirement_values_met before insert or update on public.opportunity_requirement_values
  for each row execute function app.tg_requirement_value_met();

-- -----------------------------------------------------------------------------
-- Espera ↔ status da empresa
-- -----------------------------------------------------------------------------
create or replace function app.tg_standby_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.ended_at is null then
    update public.companies set status = 'standby' where id = new.company_id and status = 'active';
  elsif tg_op = 'UPDATE' and old.ended_at is null and new.ended_at is not null and new.end_outcome = 'resumed' then
    update public.companies set status = 'active' where id = new.company_id and status = 'standby';
    update public.opportunities set stage_entered_at = now()
     where company_id = new.company_id and status = 'open';
  end if;
  return null;
end $$;

create trigger standby_periods_sync after insert or update on public.standby_periods
  for each row execute function app.tg_standby_sync();

-- -----------------------------------------------------------------------------
-- Estratégia: versão atual
-- -----------------------------------------------------------------------------
create or replace function app.tg_strategy_version_current()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.strategies
     set current_version_id = new.id
   where id = new.strategy_id
     and (current_version_id is null
          or new.version > (select version from public.strategy_versions where id = current_version_id));
  return null;
end $$;

create trigger strategy_versions_current after insert on public.strategy_versions
  for each row execute function app.tg_strategy_version_current();

create or replace function app.tg_strategy_version_number()
returns trigger language plpgsql as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
      from public.strategy_versions where strategy_id = new.strategy_id;
  end if;
  return new;
end $$;

alter table public.strategy_versions alter column version drop not null;
create trigger strategy_versions_number before insert on public.strategy_versions
  for each row execute function app.tg_strategy_version_number();

-- -----------------------------------------------------------------------------
-- Conversa: último horário e não lidas
-- -----------------------------------------------------------------------------
create or replace function app.tg_message_conversation_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message_at = greatest(coalesce(last_message_at, new.sent_at), new.sent_at),
         unread_count    = unread_count + case when new.direction = 'inbound' then 1 else 0 end,
         is_archived     = false
   where id = new.conversation_id;
  return null;
end $$;

create trigger messages_conversation_sync after insert on public.messages
  for each row execute function app.tg_message_conversation_sync();

-- -----------------------------------------------------------------------------
-- Visões de leitura (security_invoker: respeitam o RLS de quem consulta)
-- -----------------------------------------------------------------------------

-- Quadro da oportunidade: etapa, dias na etapa, nível de estagnação, próximo passo.
create or replace view public.v_opportunity_board
with (security_invoker = true) as
select
  o.id                         as opportunity_id,
  o.organization_id,
  o.company_id,
  c.code                       as company_code,
  c.trade_name,
  c.status                     as company_status,
  c.urgency,
  o.owner_id,
  o.funnel_id,
  f.key                        as funnel_key,
  o.stage_id,
  s.key                        as stage_key,
  s.name                       as stage_name,
  s.position                   as stage_position,
  s.sla_days,
  o.status,
  o.estimated_value,
  o.currency,
  o.probability,
  o.cycle,
  o.stage_entered_at,
  greatest(0, floor(extract(epoch from (now() - o.stage_entered_at)) / 86400))::integer as days_in_stage,
  case
    when s.is_terminal or s.sla_days = 0 then 'ok'
    when extract(epoch from (now() - o.stage_entered_at)) / 86400 > s.sla_days then 'stagnant'
    when extract(epoch from (now() - o.stage_entered_at)) / 86400 >= s.sla_days * 0.75 then 'attention'
    else 'ok'
  end                          as stagnation_level,
  na.id                        as next_activity_id,
  na.title                     as next_activity_title,
  na.due_at                    as next_activity_due_at,
  na.owner_id                  as next_activity_owner_id
from public.opportunities o
join public.companies c on c.id = o.company_id
join public.funnels f on f.id = o.funnel_id
join public.stages s on s.id = o.stage_id
left join lateral (
  select a.id, a.title, a.due_at, a.owner_id
    from public.activities a
   where a.company_id = o.company_id and a.status in ('pending', 'in_progress')
   order by a.due_at
   limit 1
) na on true;

-- Empresa 360° resumida: oportunidade aberta, próximo passo, última interação e espera ativa.
create or replace view public.v_company_overview
with (security_invoker = true) as
select
  c.id                          as company_id,
  c.organization_id,
  c.code,
  c.trade_name,
  c.legal_name,
  c.cnpj,
  c.status,
  c.owner_id,
  c.region_id,
  r.name                        as region_name,
  c.city,
  c.state,
  c.industry,
  c.urgency,
  c.potential,
  c.monthly_potential,
  c.harvesters_count,
  c.press_type,
  c.current_brand,
  c.customer_since,
  oo.id                         as open_opportunity_id,
  oo.funnel_id                  as open_funnel_id,
  oo.stage_id                   as open_stage_id,
  oo.stage_entered_at           as open_stage_entered_at,
  na.id                         as next_activity_id,
  na.title                      as next_activity_title,
  na.due_at                     as next_activity_due_at,
  li.occurred_at                as last_interaction_at,
  sb.id                         as active_standby_id,
  sb.review_at                  as standby_review_at,
  (select count(*) from public.contacts ct where ct.company_id = c.id and ct.is_active)::integer as active_contacts,
  c.created_at,
  c.updated_at
from public.companies c
left join public.regions r on r.id = c.region_id
left join lateral (
  select o.* from public.opportunities o
   where o.company_id = c.id and o.status = 'open'
   order by o.created_at desc limit 1
) oo on true
left join lateral (
  select a.id, a.title, a.due_at from public.activities a
   where a.company_id = c.id and a.status in ('pending', 'in_progress')
   order by a.due_at limit 1
) na on true
left join lateral (
  select i.occurred_at from public.interactions i
   where i.company_id = c.id and i.kind <> 'ai'
   order by i.occurred_at desc limit 1
) li on true
left join lateral (
  select s.id, s.review_at from public.standby_periods s
   where s.company_id = c.id and s.ended_at is null limit 1
) sb on true;

-- Exceções para gestão: conta ativa com oportunidade aberta e sem próximo passo.
create or replace view public.v_companies_without_next_step
with (security_invoker = true) as
select v.*
  from public.v_company_overview v
 where v.status = 'active'
   and v.open_opportunity_id is not null
   and v.next_activity_id is null;
