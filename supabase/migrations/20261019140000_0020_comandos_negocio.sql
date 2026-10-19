-- =============================================================================
-- Tawper OS — 0020 — Comandos do negócio executados no banco
-- Cada operação composta (mudar etapa, ganho, perda, espera, retomada, reagendar,
-- estratégia) roda numa transação só, aplica as regras do banco e registra quem fez.
-- O servidor chama estas funções com a chave de serviço; a tela nunca decide sozinha.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Quem está agindo (a chave de serviço não tem usuário logado)
-- -----------------------------------------------------------------------------
create or replace function app.actor_uid()
returns uuid language sql stable as $$
  select coalesce(auth.uid(), app.try_uuid(nullif(current_setting('app.actor_id', true), '')))
$$;

create or replace function app.current_actor_type()
returns public.actor_type language sql stable as $$
  select coalesce(
    nullif(current_setting('app.actor_type', true), '')::public.actor_type,
    case when app.actor_uid() is null then 'system'::public.actor_type else 'user'::public.actor_type end
  )
$$;

create or replace function app.crm_begin(p_actor uuid, p_origin text default 'user')
returns void language plpgsql as $$
begin
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  perform set_config('app.actor_type', case p_origin when 'ai' then 'ai' when 'system' then 'system' else 'user' end, true);
end $$;

-- Auditoria e histórico passam a registrar o autor informado pelo servidor.
create or replace function app.tg_audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row   jsonb := coalesce(v_new, v_old);
  v_org   uuid  := (v_row ->> 'organization_id')::uuid;
  v_id    uuid  := (v_row ->> 'id')::uuid;
  v_comp  uuid  := case when tg_table_name = 'companies' then v_id else app.try_uuid(v_row ->> 'company_id') end;
  v_actor uuid  := app.actor_uid();
  v_type  public.actor_type := app.current_actor_type();
  v_req   text  := nullif(current_setting('app.request_id', true), '');
  v_skip  text[] := array['id', 'organization_id', 'created_at', 'updated_at', 'normalized_name', 'gross_total', 'discount_total', 'net_total', 'monthly_total'];
  k text;
begin
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;
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

create or replace function app.tg_opportunity_stage_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := app.actor_uid();
begin
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;
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
  values (new.organization_id, new.id, new.stage_id, new.stage_entered_at, v_actor, app.current_actor_type());
  return null;
end $$;

create or replace function app.tg_requirement_value_met()
returns trigger language plpgsql as $$
begin
  if new.is_met and (tg_op = 'INSERT' or not old.is_met) then
    new.met_at := coalesce(new.met_at, now());
    new.met_by := coalesce(new.met_by, app.actor_uid());
  elsif not new.is_met then
    new.met_at := null;
    new.met_by := null;
  end if;
  return new;
end $$;

-- Linha da linha do tempo da empresa.
create or replace function app.crm_interaction(
  p_org uuid, p_company uuid, p_opportunity uuid, p_channel text, p_kind text, p_actor uuid, p_title text, p_content text default null
) returns void language plpgsql as $$
begin
  insert into public.interactions (organization_id, company_id, opportunity_id, channel, kind, author_id, actor_type, title, content)
  values (p_org, p_company, p_opportunity, p_channel::public.interaction_channel, p_kind::public.interaction_kind,
          p_actor, app.current_actor_type(), p_title, nullif(trim(coalesce(p_content, '')), ''));
end $$;

-- Marca ou desmarca critérios (checklist) de uma oportunidade.
create or replace function app.crm_apply_checks(p_opportunity uuid, p_funnel uuid, p_org uuid, p_actor uuid, p_checks jsonb)
returns void language plpgsql as $$
declare
  rec record;
  req uuid;
begin
  for rec in select key, value from jsonb_each_text(coalesce(p_checks, '{}'::jsonb)) loop
    select r.id into req
      from public.stage_requirements r
      join public.stages s on s.id = r.stage_id
     where s.funnel_id = p_funnel and r.key = rec.key and r.kind = 'check';
    if req is null then continue; end if;
    insert into public.opportunity_requirement_values (organization_id, opportunity_id, requirement_id, is_met)
    values (p_org, p_opportunity, req, rec.value::boolean)
    on conflict (opportunity_id, requirement_id) do update set is_met = excluded.is_met;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Mudar de etapa
-- -----------------------------------------------------------------------------
create or replace function public.crm_move_stage(
  p_opportunity uuid, p_to_stage text, p_actor uuid,
  p_checks jsonb default '{}'::jsonb, p_tasks jsonb default '[]'::jsonb, p_note text default null, p_origin text default 'user'
) returns uuid language plpgsql as $$
declare
  o       public.opportunities%rowtype;
  v_from  public.stages%rowtype;
  v_to    public.stages%rowtype;
  t       jsonb;
begin
  perform app.crm_begin(p_actor, p_origin);
  select * into o from public.opportunities where id = p_opportunity for update;
  if not found then raise exception 'Negócio não encontrado.' using errcode = 'P0001'; end if;
  if o.status <> 'open' then raise exception 'Este negócio já está encerrado.' using errcode = 'P0001'; end if;

  select * into v_from from public.stages where id = o.stage_id;
  select * into v_to from public.stages where funnel_id = o.funnel_id and key = p_to_stage and is_active;
  if not found then raise exception 'Essa etapa não existe neste funil.' using errcode = 'P0001'; end if;
  if v_to.id = v_from.id then raise exception 'O negócio já está nesta etapa.' using errcode = 'P0001'; end if;
  if v_to.is_terminal then raise exception 'Para encerrar o negócio use Registrar venda ou Perda.' using errcode = 'P0001'; end if;
  if v_to.position < v_from.position and length(trim(coalesce(p_note, ''))) < 4 then
    raise exception 'Informe o motivo para voltar o negócio de etapa.' using errcode = 'P0001';
  end if;

  perform app.crm_apply_checks(o.id, o.funnel_id, o.organization_id, p_actor, p_checks);

  update public.opportunities set stage_id = v_to.id where id = o.id;

  update public.opportunity_stage_history set note = nullif(trim(coalesce(p_note, '')), '')
   where opportunity_id = o.id and left_at is null;

  for t in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    insert into public.activities (organization_id, company_id, opportunity_id, type, title, description, owner_id, due_at, priority, origin, created_by)
    values (o.organization_id, o.company_id, o.id, (t ->> 'type')::public.activity_type, t ->> 'title', nullif(t ->> 'description', ''),
            o.owner_id, (t ->> 'dueAt')::timestamptz, coalesce(nullif(t ->> 'priority', ''), 'medium')::public.level_3, 'rule', p_actor);
  end loop;

  perform app.crm_interaction(o.organization_id, o.company_id, o.id, 'system', 'stage', p_actor,
                              'Etapa alterada: ' || v_from.name || ' → ' || v_to.name, p_note);
  return o.id;
end $$;

-- Marca critérios sem mudar de etapa.
create or replace function public.crm_set_checks(p_opportunity uuid, p_checks jsonb, p_actor uuid, p_origin text default 'user')
returns uuid language plpgsql as $$
declare o public.opportunities%rowtype;
begin
  perform app.crm_begin(p_actor, p_origin);
  select * into o from public.opportunities where id = p_opportunity for update;
  if not found then raise exception 'Negócio não encontrado.' using errcode = 'P0001'; end if;
  perform app.crm_apply_checks(o.id, o.funnel_id, o.organization_id, p_actor, p_checks);
  return o.id;
end $$;

-- -----------------------------------------------------------------------------
-- Registrar venda: encerra o negócio como ganho, registra a venda, abre a
-- recorrência e cria o pós-venda, tudo ou nada.
-- -----------------------------------------------------------------------------
create or replace function public.crm_win_deal(p_opportunity uuid, p_value numeric, p_note text, p_actor uuid)
returns jsonb language plpgsql as $$
declare
  o         public.opportunities%rowtype;
  v_from    text;
  v_term    uuid;
  v_recf    uuid;
  v_recs    uuid;
  v_first   boolean;
  v_cycle   integer;
  v_new     uuid;
  v_act     uuid;
  v_quote   uuid;
begin
  perform app.crm_begin(p_actor, 'user');
  perform set_config('app.bypass_stage_rules', 'on', true);
  select * into o from public.opportunities where id = p_opportunity for update;
  if not found then raise exception 'Negócio não encontrado.' using errcode = 'P0001'; end if;
  if o.status <> 'open' then raise exception 'Este negócio já está encerrado.' using errcode = 'P0001'; end if;
  if p_value is null or p_value <= 0 then raise exception 'Informe o valor da venda.' using errcode = 'P0001'; end if;

  select s.name into v_from from public.stages s where s.id = o.stage_id;
  select (f.key = 'aquisicao') into v_first from public.funnels f where f.id = o.funnel_id;
  select s.id into v_term from public.stages s where s.funnel_id = o.funnel_id and s.is_terminal and s.terminal_outcome = 'won';
  v_cycle := case when v_first then 1 else o.cycle + 1 end;

  select q.id into v_quote from public.quotes q
   where q.opportunity_id = o.id and q.status in ('sent', 'accepted')
   order by q.sent_at desc nulls last limit 1;

  update public.opportunities
     set stage_id = v_term, status = 'won', realized_value = p_value,
         estimated_value = coalesce(estimated_value, p_value), probability = 100
   where id = o.id;

  insert into public.sales (organization_id, company_id, opportunity_id, quote_id, kind, cycle, amount, registered_by, notes)
  values (o.organization_id, o.company_id, o.id, v_quote, case when v_first then 'first_sale' else 'repurchase' end::public.sale_kind,
          o.cycle, p_value, p_actor, nullif(trim(coalesce(p_note, '')), ''));

  update public.quotes set status = 'accepted', decided_at = now() where opportunity_id = o.id and status = 'sent';
  update public.activities set status = 'cancelled', outcome = 'Encerrada: venda ganha'
   where opportunity_id = o.id and status in ('pending', 'in_progress');
  update public.companies set status = 'active', customer_since = coalesce(customer_since, now()) where id = o.company_id;

  select f.id into v_recf from public.funnels f where f.organization_id = o.organization_id and f.key = 'recorrencia';
  select s.id into v_recs from public.stages s where s.funnel_id = v_recf and s.key = 'posvenda';

  insert into public.opportunities (organization_id, company_id, owner_id, funnel_id, stage_id, title, status, cycle, currency, created_by)
  values (o.organization_id, o.company_id, o.owner_id, v_recf, v_recs, 'Recorrência — ciclo ' || v_cycle, 'open', v_cycle, o.currency, p_actor)
  returning id into v_new;

  insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, origin, created_by)
  values (o.organization_id, o.company_id, v_new, 'call', 'Pós-venda: confirmar entrega e aplicação', o.owner_id,
          ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '5 days 10 hours') at time zone 'America/Sao_Paulo'),
          'high', 'rule', p_actor)
  returning id into v_act;

  perform app.crm_interaction(o.organization_id, o.company_id, o.id, 'system', 'win', p_actor,
    case when v_first then 'Primeira venda registrada' else 'Recompra registrada (ciclo ' || o.cycle || ')' end
      || ' — R$ ' || replace(to_char(p_value, 'FM999999990.00'), '.', ','), p_note);
  perform app.crm_interaction(o.organization_id, o.company_id, v_new, 'system', 'stage', p_actor,
    'Conta movida para Recorrência · ciclo ' || v_cycle, 'Pós-venda criado automaticamente. Etapa anterior: ' || v_from || '.');

  return jsonb_build_object('recurrence_id', v_new, 'activity_id', v_act);
end $$;

-- -----------------------------------------------------------------------------
-- Registrar perda
-- -----------------------------------------------------------------------------
create or replace function public.crm_lose_deal(p_opportunity uuid, p_reason text, p_note text, p_actor uuid)
returns jsonb language plpgsql as $$
declare
  o       public.opportunities%rowtype;
  v_from  text;
  v_first boolean;
  v_recf  uuid;
  v_recs  uuid;
  v_new   uuid;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  perform app.crm_begin(p_actor, 'user');
  perform set_config('app.bypass_stage_rules', 'on', true);
  select * into o from public.opportunities where id = p_opportunity for update;
  if not found then raise exception 'Negócio não encontrado.' using errcode = 'P0001'; end if;
  if o.status <> 'open' then raise exception 'Este negócio já está encerrado.' using errcode = 'P0001'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo da perda.' using errcode = 'P0001'; end if;

  select s.name into v_from from public.stages s where s.id = o.stage_id;
  select (f.key = 'aquisicao') into v_first from public.funnels f where f.id = o.funnel_id;

  update public.opportunities set status = 'lost', close_reason = v_reason, objection = nullif(trim(coalesce(p_note, '')), '') where id = o.id;
  update public.quotes set status = 'rejected', decided_at = now() where opportunity_id = o.id and status = 'sent';
  update public.activities set status = 'cancelled', outcome = 'Encerrada: oportunidade perdida'
   where opportunity_id = o.id and status in ('pending', 'in_progress');

  if v_first then
    update public.companies set status = 'lost', loss_reason = v_reason where id = o.company_id;
  else
    select f.id into v_recf from public.funnels f where f.id = o.funnel_id;
    select s.id into v_recs from public.stages s where s.funnel_id = v_recf and s.key = 'relacionamento';
    insert into public.opportunities (organization_id, company_id, owner_id, funnel_id, stage_id, title, status, cycle, currency, created_by)
    values (o.organization_id, o.company_id, o.owner_id, v_recf, v_recs, 'Recuperação — ciclo ' || o.cycle, 'open', o.cycle, o.currency, p_actor)
    returning id into v_new;
    insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, origin, created_by)
    values (o.organization_id, o.company_id, v_new, 'meeting', 'Plano de recuperação — motivo: ' || v_reason, o.owner_id,
            ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '7 days 10 hours') at time zone 'America/Sao_Paulo'),
            'high', 'rule', p_actor);
  end if;

  perform app.crm_interaction(o.organization_id, o.company_id, o.id, 'system', 'loss', p_actor,
    'Oportunidade perdida em ' || v_from, 'Motivo: ' || v_reason || case when nullif(trim(coalesce(p_note, '')), '') is not null then ' — ' || trim(p_note) else '' end);

  return jsonb_build_object('recovery_id', v_new);
end $$;

-- -----------------------------------------------------------------------------
-- Espera e retomada
-- -----------------------------------------------------------------------------
create or replace function public.crm_set_standby(
  p_company uuid, p_reason text, p_condition text, p_responsible uuid, p_review_at timestamptz, p_actor uuid
) returns uuid language plpgsql as $$
declare
  c       public.companies%rowtype;
  v_opp   uuid;
  v_act   uuid;
  v_id    uuid;
begin
  perform app.crm_begin(p_actor, 'user');
  select * into c from public.companies where id = p_company for update;
  if not found then raise exception 'Empresa não encontrada.' using errcode = 'P0001'; end if;
  if c.status <> 'active' then raise exception 'Só uma conta ativa pode ser colocada em espera.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo da espera.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_condition, ''))) < 3 then raise exception 'Informe a condição de retomada.' using errcode = 'P0001'; end if;
  if p_review_at is null or p_review_at <= now() then raise exception 'A data de reavaliação precisa ser futura.' using errcode = 'P0001'; end if;

  select id into v_opp from public.opportunities where company_id = c.id and status = 'open' order by created_at desc limit 1;

  update public.activities set status = 'cancelled', outcome = 'Encerrada: conta em espera'
   where company_id = c.id and status in ('pending', 'in_progress');

  insert into public.activities (organization_id, company_id, opportunity_id, type, title, description, owner_id, due_at, priority, origin, created_by)
  values (c.organization_id, c.id, v_opp, 'call', 'Reavaliar conta em espera — ' || lower(trim(p_reason)),
          'Condição de retomada: ' || trim(p_condition), p_responsible, p_review_at, 'medium', 'rule', p_actor)
  returning id into v_act;

  insert into public.standby_periods (organization_id, company_id, opportunity_id, reason, resume_condition, responsible_id, review_at, review_activity_id, created_by)
  values (c.organization_id, c.id, v_opp, trim(p_reason), trim(p_condition), p_responsible, p_review_at, v_act, p_actor)
  returning id into v_id;

  perform app.crm_interaction(c.organization_id, c.id, v_opp, 'system', 'standby', p_actor, 'Conta colocada em espera',
    'Motivo: ' || trim(p_reason) || '. Retomada: ' || trim(p_condition) || '. Reavaliação em ' || to_char(p_review_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.');
  return v_id;
end $$;

create or replace function public.crm_resume_standby(p_company uuid, p_actor uuid)
returns uuid language plpgsql as $$
declare
  sb public.standby_periods%rowtype;
begin
  perform app.crm_begin(p_actor, 'user');
  select * into sb from public.standby_periods where company_id = p_company and ended_at is null for update;
  if not found then raise exception 'Esta conta não está em espera.' using errcode = 'P0001'; end if;

  update public.standby_periods set ended_at = now(), end_outcome = 'resumed' where id = sb.id;
  update public.activities set status = 'done', outcome = 'Conta retomada', completed_at = now()
   where id = sb.review_activity_id and status in ('pending', 'in_progress');

  perform app.crm_interaction(sb.organization_id, sb.company_id, sb.opportunity_id, 'system', 'standby', p_actor, 'Conta retomada — saiu da espera');
  return sb.id;
end $$;

-- -----------------------------------------------------------------------------
-- Reagendar atividade
-- -----------------------------------------------------------------------------
create or replace function public.crm_reschedule_activity(p_activity uuid, p_due timestamptz, p_actor uuid)
returns uuid language plpgsql as $$
declare a public.activities%rowtype;
begin
  perform app.crm_begin(p_actor, 'user');
  select * into a from public.activities where id = p_activity for update;
  if not found then raise exception 'Atividade não encontrada.' using errcode = 'P0001'; end if;
  if a.status not in ('pending', 'in_progress') then raise exception 'Só uma atividade em aberto pode ser reagendada.' using errcode = 'P0001'; end if;
  if p_due is null then raise exception 'Informe a nova data.' using errcode = 'P0001'; end if;
  update public.activities set due_at = p_due where id = a.id;
  return a.id;
end $$;

-- -----------------------------------------------------------------------------
-- Estratégia da conta (cada salvamento é uma nova versão)
-- -----------------------------------------------------------------------------
create or replace function public.crm_save_strategy(
  p_company uuid, p_objective text, p_diagnosis text, p_barrier text, p_strategy text, p_expected text,
  p_origin text, p_next_review timestamptz, p_actor uuid
) returns integer language plpgsql as $$
declare
  c       public.companies%rowtype;
  v_sid   uuid;
  v_ver   integer;
begin
  perform app.crm_begin(p_actor, case when p_origin = 'ai_approved' then 'user' else 'user' end);
  select * into c from public.companies where id = p_company;
  if not found then raise exception 'Empresa não encontrada.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_objective, ''))) < 3 or length(trim(coalesce(p_strategy, ''))) < 3 then
    raise exception 'Informe o objetivo e a estratégia.' using errcode = 'P0001';
  end if;
  if p_next_review is not null and p_next_review <= now() then
    raise exception 'A próxima revisão precisa ser uma data futura.' using errcode = 'P0001';
  end if;

  insert into public.strategies (organization_id, company_id) values (c.organization_id, c.id)
  on conflict (company_id) do nothing;
  select id into v_sid from public.strategies where company_id = c.id;

  insert into public.strategy_versions (organization_id, strategy_id, objective, diagnosis, barrier, strategy, expected_result, origin, defined_by, next_review_at)
  values (c.organization_id, v_sid, trim(p_objective), nullif(trim(coalesce(p_diagnosis, '')), ''), nullif(trim(coalesce(p_barrier, '')), ''),
          trim(p_strategy), nullif(trim(coalesce(p_expected, '')), ''),
          case when p_origin = 'ai_approved' then 'ai_approved' else 'manual' end::public.strategy_origin, p_actor, p_next_review)
  returning version into v_ver;

  perform app.crm_interaction(c.organization_id, c.id, null, 'note', 'strategy', p_actor,
    'Estratégia ' || case when v_ver = 1 then 'definida' else 'revisada' end || ' (v' || v_ver || ')', p_strategy);
  return v_ver;
end $$;

-- -----------------------------------------------------------------------------
-- Registro na linha do tempo
-- -----------------------------------------------------------------------------
create or replace function public.crm_add_interaction(
  p_company uuid, p_opportunity uuid, p_channel text, p_kind text, p_title text, p_content text, p_actor uuid, p_origin text default 'user'
) returns void language plpgsql as $$
declare c public.companies%rowtype;
begin
  perform app.crm_begin(p_actor, p_origin);
  select * into c from public.companies where id = p_company;
  if not found then raise exception 'Empresa não encontrada.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o texto do registro.' using errcode = 'P0001'; end if;
  perform app.crm_interaction(c.organization_id, c.id, p_opportunity, p_channel, p_kind, p_actor, trim(p_title), p_content);
end $$;

-- Só o servidor (service_role) executa os comandos.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'crm\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
