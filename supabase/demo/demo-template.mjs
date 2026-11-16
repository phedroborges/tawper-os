// Corpo do SQL da demonstração. Os clientes e contatos vêm do gerar-demo.mjs.
export default ({ clientes, contatos, resumo }) => `-- =============================================================================
-- Tawper OS — dados de demonstração (gerado por supabase/demo/gerar-demo.mjs; não edite à mão)
-- =============================================================================
-- O QUE FAZ: acrescenta uma carteira fictícia de ${resumo.n} clientes, com atividades,
-- vendas e histórico. Empresas já existentes (mesmo CNPJ ou nome) são preservadas.
-- Não apaga dados, não altera logins, metas, políticas RLS ou gatilhos de auditoria.
-- COMO RODAR: execute o arquivo INTEIRO no SQL Editor, como postgres.
-- Uma transação: qualquer erro desfaz a carga. Repetir não duplica os clientes.
-- demo_clientes não é uma tabela: os clientes abaixo são valores usados na carga.
-- =============================================================================

begin;
select pg_advisory_xact_lock(hashtext('tawper-demo-2026'));

-- Dia útil a partir de hoje (negativo = passado), no horário de Brasília; fim de semana vai para o dia útil mais próximo.
create or replace function pg_temp.dia_util(p_dias integer, p_hora integer, p_minuto integer default 0)
returns timestamptz language plpgsql as $f$
declare d date := (now() at time zone 'America/Sao_Paulo')::date + p_dias;
begin
  if extract(isodow from d) = 6 then d := d + case when p_dias < 0 then -1 else 2 end; end if;
  if extract(isodow from d) = 7 then d := d + case when p_dias < 0 then -2 else 1 end; end if;
  return (d + make_time(p_hora, p_minuto, 0)) at time zone 'America/Sao_Paulo';
end $f$;

-- "AAAA-MM-DD:valor" de uma venda → data e hora da venda (horário comercial de Brasília).
create or replace function pg_temp.venda_ts(p text) returns timestamptz language sql immutable as $f$
  select (split_part(p, ':', 1)::date + make_time(9 + extract(doy from split_part(p, ':', 1)::date)::int % 8, 0, 0)) at time zone 'America/Sao_Paulo'
$f$;

-- Ritmo diário de cada dono (0 = diretor): ligações, WhatsApps, e-mails e cotações por dia útil; reuniões e visitas por mês;
-- registros pelo agente do WhatsApp por dia.
create temp table pg_temp.demo_ritmo (dono int, ligacoes int, whatsapps int, emails int, cotacoes int, reunioes_mes int, visitas_mes int, agente_dia int) on commit drop;
insert into pg_temp.demo_ritmo values (0, 4, 3, 2, 1, 14, 3, 1), (1, 15, 8, 2, 1, 11, 4, 4), (2, 14, 7, 2, 1, 10, 5, 3), (3, 11, 6, 1, 1, 8, 3, 2), (4, 13, 7, 2, 1, 10, 4, 3);

create temp table pg_temp.demo_donos (dono int, owner_id uuid) on commit drop;
create temp table pg_temp.demo_mapa (idx int, dono int, funil text, nome text, uf text, company_id uuid, opp_id uuid, owner_id uuid, contato_id uuid) on commit drop;

do $$
declare
  v_org      constant uuid := '00000000-0000-4000-8000-000000000001';
  v_admin    uuid;
  v_murilo   uuid;
  v_others   uuid[];
  aq         constant text[] := array['lead', 'qualificacao', 'apresentacao_empresa', 'apresentacao_tecnica', 'cadastro', 'homologacao', 'aprovado', 'orcamento', 'negociacao'];
  rc         constant text[] := array['posvenda', 'relacionamento', 'previsao', 'orcamento_r', 'negociacao_r'];
  r          record;
  v_company  uuid;
  v_owner    uuid;
  v_opp      uuid;
  v_contact  uuid;
  v_quote    uuid;
  v_sid      uuid;
  v_f_aq     uuid;
  v_f_rc     uuid;
  v_pos      integer;
  v_t        timestamptz;
  v_last     timestamptz;
  v_alvo     timestamptz;
  v_sales    text[];
  v_amount   numeric;
  v_title    text;
  v_type     public.activity_type;
  j          integer;
  k          integer;
begin
  -- Pessoas: quem age na carga (um administrador), o diretor que também vende e os vendedores, cada um no seu território.
  select m.profile_id into v_admin from public.memberships m join public.profiles p on p.id = m.profile_id
   where m.organization_id = v_org and m.is_active and p.is_active and m.role = 'admin' order by p.full_name limit 1;
  if v_admin is null then raise exception 'Não achei administrador ativo na organização Tawper.'; end if;
  select m.profile_id into v_murilo from public.memberships m join public.profiles p on p.id = m.profile_id
   where m.organization_id = v_org and m.is_active and p.is_active and p.full_name ilike 'murilo%' order by (m.role = 'admin') desc limit 1;
  v_murilo := coalesce(v_murilo, v_admin);
  select array_agg(s.profile_id order by s.full_name) into v_others from (
    select m.profile_id, p.full_name from public.memberships m join public.profiles p on p.id = m.profile_id
     where m.organization_id = v_org and m.is_active and p.is_active and m.role in ('vendedor', 'representante') and m.profile_id <> v_murilo) s;
  if v_others is null then v_others := array[v_murilo]; end if;
  insert into pg_temp.demo_donos values (0, v_murilo);
  -- Território pelo primeiro nome (Douglas: Noroeste Paulista; Fernando: Triângulo; Nilton: MS e GO; Paulo: Oeste Paulista e PR).
  insert into pg_temp.demo_donos
  select s.slot, coalesce(
           (select m.profile_id from public.memberships m join public.profiles p on p.id = m.profile_id
             where m.organization_id = v_org and m.is_active and p.is_active and m.profile_id = any(v_others) and p.full_name ilike s.prefixo || '%' limit 1),
           v_others[1 + (s.slot - 1) % array_length(v_others, 1)])
    from (values (1, 'douglas'), (2, 'fernando'), (3, 'nilton'), (4, 'paulo')) s(slot, prefixo);

  perform app.crm_begin(v_admin, 'user');
  perform set_config('app.bypass_stage_rules', 'on', true);

  -- 2. Regiões do Brasil (a região do cliente sai da UF).
  insert into public.regions (organization_id, name, states) values
    (v_org, 'Norte', '{AC,AM,AP,PA,RO,RR,TO}'), (v_org, 'Nordeste', '{AL,BA,CE,MA,PB,PE,PI,RN,SE}'),
    (v_org, 'Centro-Oeste', '{DF,GO,MS,MT}'), (v_org, 'Sudeste', '{ES,MG,RJ,SP}'), (v_org, 'Sul', '{PR,RS,SC}')
  on conflict (organization_id, name) do nothing;

  select id into v_f_aq from public.funnels where organization_id = v_org and key = 'aquisicao';
  select id into v_f_rc from public.funnels where organization_id = v_org and key = 'recorrencia';

  -- 3. Carteira: empresa, contatos, estratégia e a história de cada negócio até a etapa atual.
  for r in select * from (values
${clientes}
  ) as carga(idx, nome, cidade, uf, cep, lat, lng, ddd, ramo, colhedoras, modelos,
    prensa, marca, concorrente, potencial, mensal, urgencia, funil, etapa, dias, valor,
    vendas, cnpj, dono, hoje, atraso, fechado, motivo) order by idx loop
    if exists (select 1 from public.companies c where c.organization_id = v_org
               and (c.cnpj = r.cnpj or lower(c.trade_name) = lower(r.nome))) then
      continue;
    end if;
    select owner_id into v_owner from pg_temp.demo_donos where dono = r.dono;
    v_sales := case when r.vendas = '' then '{}'::text[] else string_to_array(r.vendas, ',') end;

    insert into public.companies (
      organization_id, trade_name, legal_name, cnpj, status, owner_id, region_id, city, state, postal_code, address, latitude, longitude,
      industry, economic_group, source, potential, monthly_potential, harvesters_count, machine_models, press_type, current_brand, competitor, urgency, notes, created_by, created_at
    ) values (
      v_org, r.nome, r.nome || ' S.A.', r.cnpj, 'active', v_owner,
      (select id from public.regions where organization_id = v_org and r.uf = any(states) and is_active limit 1),
      r.cidade, r.uf, r.cep, 'Rodovia de acesso à unidade, km ' || (3 + r.idx % 40) || ' — Zona Rural', r.lat, r.lng,
      r.ramo, case when r.ramo = 'Grupo sucroenergético' then r.nome end,
      (array['Visita de prospecção', 'Indicação de cliente', 'Feira / evento', 'WhatsApp', 'Site tawper.com.br'])[1 + r.idx % 5],
      r.potencial::public.level_3, r.mensal, r.colhedoras, r.modelos, r.prensa::public.press_type, r.marca, r.concorrente, r.urgencia::public.level_3,
      'Safra de abril a novembro. ' || r.colhedoras || ' colhedoras (' || r.modelos || '). Reposição concentrada na entressafra; oficina própria na unidade.',
      v_admin,
      case when r.funil = 'rc' then pg_temp.venda_ts(v_sales[1]) - interval '120 days' else now() - make_interval(days => r.dias + 90) end
    ) returning id into v_company;

    insert into public.contacts (organization_id, company_id, name, job_title, role, influence, whatsapp_e164, email, preferred_channel, contact_allowed, relationship_owner_id, is_active, created_by)
    select v_org, v_company, k.nome, k.cargo, k.papel::public.contact_role, k.influencia,
           '55' || r.ddd || '9' || lpad((r.idx * 10 + k.ordem)::text, 8, '0'),
           case when k.papel in ('decision_maker', 'buyer', 'financial') then lower(split_part(k.nome, ' ', 1)) || '.' || r.idx || '@cliente-demo.example' end,
           k.canal::public.contact_channel, true, v_owner, true, v_admin
      from (values
${contatos}
      ) as k(cliente, ordem, nome, cargo, papel, influencia, canal)
     where k.cliente = r.idx order by k.ordem;
    select id into v_contact from public.contacts where company_id = v_company order by influence desc, created_at limit 1;

    -- Negócio de aquisição: percorre as etapas no passado (histórico e tempo médio por etapa fazem sentido).
    v_pos := case when r.funil = 'rc' then 9 else array_position(aq, r.etapa) end;
    v_t := case when r.funil = 'rc' then pg_temp.venda_ts(v_sales[1]) - interval '12 days' else now() - make_interval(days => r.dias) end;
    for j in 1 .. v_pos - 1 loop v_t := v_t - make_interval(days => 6 + (r.idx + j * 3) % 8); end loop;
    insert into public.opportunities (organization_id, company_id, owner_id, funnel_id, stage_id, title, status, estimated_value, cycle, funnel_entered_at, stage_entered_at, created_by, created_at)
    values (v_org, v_company, v_owner, v_f_aq, (select id from public.stages where funnel_id = v_f_aq and key = 'lead'),
            'Prospecção — ' || r.nome, 'open', nullif(r.valor, 0), 1, v_t, v_t, v_owner, v_t)
    returning id into v_opp;
    for j in 2 .. v_pos loop
      v_t := v_t + make_interval(days => 6 + (r.idx + (j - 1) * 3) % 8);
      update public.opportunities set stage_id = (select id from public.stages where funnel_id = v_f_aq and key = aq[j]), stage_entered_at = v_t where id = v_opp;
    end loop;

    if r.funil = 'perdida' then
      v_t := now() - make_interval(days => r.fechado);
      update public.opportunities set status = 'lost', close_reason = r.motivo, closed_at = v_t where id = v_opp;
      update public.companies set status = 'lost', loss_reason = r.motivo where id = v_company;
      insert into public.interactions (organization_id, company_id, opportunity_id, channel, kind, occurred_at, author_id, actor_type, title, content)
      values (v_org, v_company, v_opp, 'system', 'loss', v_t, v_owner, 'user', 'Oportunidade perdida', 'Motivo: ' || r.motivo);
    end if;

    -- Cliente: primeira venda, recompras e o negócio aberto de recorrência, um ciclo depois do outro.
    if r.funil = 'rc' then
      for k in 1 .. array_length(v_sales, 1) loop
        v_last := pg_temp.venda_ts(v_sales[k]);
        v_amount := split_part(v_sales[k], ':', 2)::numeric;
        if k > 1 then
          update public.opportunities set stage_id = (select id from public.stages where funnel_id = v_f_rc and key = 'negociacao_r'), stage_entered_at = v_last - interval '8 days' where id = v_opp;
        end if;
        update public.opportunities
           set stage_id = (select id from public.stages where funnel_id = case when k = 1 then v_f_aq else v_f_rc end and is_terminal and terminal_outcome = 'won'),
               status = 'won', realized_value = v_amount, estimated_value = v_amount, probability = 100, closed_at = v_last, stage_entered_at = v_last
         where id = v_opp;
        insert into public.sales (organization_id, company_id, opportunity_id, kind, cycle, amount, sold_at, registered_by)
        values (v_org, v_company, v_opp, case when k = 1 then 'first_sale' else 'repurchase' end::public.sale_kind, greatest(k - 1, 1), v_amount, v_last, v_owner);
        insert into public.interactions (organization_id, company_id, opportunity_id, channel, kind, occurred_at, author_id, actor_type, title, content)
        values (v_org, v_company, v_opp, 'system', 'win', v_last, v_owner, 'user',
                case when k = 1 then 'Primeira venda registrada' else k || 'ª venda registrada' end || ' — R$ ' || to_char(v_amount, 'FM999G999G990D00'),
                'Pedido confirmado pelo cliente. Orçamento emitido no ERP e anexado ao negócio.');
        if k = 1 then update public.companies set customer_since = v_last where id = v_company; end if;
        insert into public.opportunities (organization_id, company_id, owner_id, funnel_id, stage_id, title, status, cycle, funnel_entered_at, stage_entered_at, created_by, created_at)
        values (v_org, v_company, v_owner, v_f_rc, (select id from public.stages where funnel_id = v_f_rc and key = 'posvenda'), 'Recorrência — ciclo ' || k, 'open', k, v_last, v_last, v_owner, v_last)
        returning id into v_opp;
      end loop;
      v_pos := array_position(rc, r.etapa);
      v_alvo := now() - make_interval(days => r.dias);
      for j in 2 .. v_pos loop
        update public.opportunities
           set stage_id = (select id from public.stages where funnel_id = v_f_rc and key = rc[j]),
               stage_entered_at = v_last + (v_alvo - v_last) * (j - 1) / (v_pos - 1)
         where id = v_opp;
      end loop;
      update public.opportunities
         set estimated_value = nullif(r.valor, 0), expected_close_date = case when r.etapa in ('previsao', 'orcamento_r', 'negociacao_r') then (now() + make_interval(days => 12 + r.idx % 30))::date end
       where id = v_opp;
    end if;

    insert into pg_temp.demo_mapa values (r.idx, r.dono, r.funil, r.nome, r.uf, v_company, v_opp, v_owner, v_contact);
    continue when r.funil = 'perdida';

    -- Estratégia de toda conta ativa, revisada nas últimas semanas.
    insert into public.strategies (organization_id, company_id) values (v_org, v_company) returning id into v_sid;
    insert into public.strategy_versions (organization_id, strategy_id, objective, diagnosis, barrier, strategy, expected_result, origin, defined_by, reviewed_at, next_review_at)
    values (v_org, v_sid,
      case when r.funil = 'rc' then 'Ampliar a participação da Tawper na reposição da entressafra' else 'Fechar a primeira venda até o início da próxima safra' end,
      r.colhedoras || ' colhedoras (' || r.modelos || '). Fornecedor atual: ' || r.marca || '. A manutenção reclama de prazo de entrega na safra.',
      case when r.funil = 'rc' then 'Parte da compra ainda vai para ' || r.concorrente else 'Relacionamento antigo com ' || r.concorrente end,
      case when r.funil = 'rc' then 'Levantar a demanda completa das colhedoras e propor contrato de fornecimento programado para a entressafra.'
           else 'Homologar um kit de teste e entrar pela manutenção, com prensa em comodato como diferencial.' end,
      'Pedido de R$ ' || to_char(greatest(r.valor, r.mensal * 1.5), 'FM999G999G990') || ' na próxima janela de compra',
      'manual', v_owner, now() - make_interval(days => 12 + r.idx % 35), now() + make_interval(days => 7 + r.idx % 30));

    -- Próximo passo da conta, em dia útil e horário comercial.
    select case r.etapa
             when 'lead' then 'Identificar o responsável pela manutenção agrícola' when 'qualificacao' then 'Mapear frota, prensa e fornecedor atual'
             when 'apresentacao_empresa' then 'Apresentar a Tawper para a manutenção' when 'apresentacao_tecnica' then 'Apresentação técnica na oficina'
             when 'cadastro' then 'Enviar ficha cadastral e documentos' when 'homologacao' then 'Acompanhar o kit de teste na colhedora'
             when 'aprovado' then 'Confirmar janela de compra e estoque' when 'orcamento' then 'Follow-up do orçamento enviado'
             when 'negociacao' then 'Tratar objeções e buscar a decisão' when 'posvenda' then 'Pós-venda: confirmar entrega e aplicação'
             when 'relacionamento' then 'Mapear estoque e demanda da entressafra' when 'previsao' then 'Revisar a demanda na janela prevista'
             when 'orcamento_r' then 'Follow-up do orçamento de reposição' else 'Acompanhar a decisão de recompra' end,
           case when r.etapa in ('negociacao', 'negociacao_r') then 'meeting' when r.etapa in ('qualificacao', 'orcamento', 'orcamento_r', 'relacionamento') then 'whatsapp'
                when r.etapa = 'cadastro' then 'email' else 'call' end::public.activity_type
      into v_title, v_type;
    insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by, created_at)
    values (v_org, v_company, v_opp, v_type, v_title, v_owner, pg_temp.dia_util(1 + (r.idx * 3) % 12, 9 + r.idx % 8),
            case when r.urgencia = 'high' then 'high' else 'medium' end::public.level_3, 'pending', 'rule', v_owner, now() - interval '3 days');
    if r.hoje then
      insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by, created_at)
      values (v_org, v_company, v_opp, 'call', 'Ligar e confirmar a agenda da semana', v_owner, pg_temp.dia_util(0, 14 + r.idx % 3), 'medium', 'pending', 'manual', v_owner, now() - interval '2 days');
    end if;
    if r.atraso > 0 then
      insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by, created_at)
      values (v_org, v_company, v_opp, 'whatsapp', 'Retornar o contato pedido pelo cliente', v_owner, pg_temp.dia_util(-r.atraso, 10), 'medium', 'pending', 'manual', v_owner, now() - make_interval(days => r.atraso + 4));
    end if;

    -- Orçamento feito no ERP e anexado, já enviado, para quem está em orçamento ou negociação.
    if r.etapa in ('orcamento', 'negociacao', 'orcamento_r', 'negociacao_r') then
      insert into public.quotes (organization_id, company_id, opportunity_id, number, status, payment_terms, validity_days, sent_at, expected_decision_at, author_id, sent_to_contact_id, sent_via, sent_by, notes)
      values (v_org, v_company, v_opp, '', 'sent', (array['28/56 dias', '30/60/90 dias', '28 dias'])[1 + r.idx % 3], 30,
              now() - make_interval(days => least(r.dias, 18)), now() - make_interval(days => least(r.dias, 18)) + interval '5 days', v_owner, v_contact, 'manual', v_owner,
              'Kit de mangueiras e terminais para a entressafra, conforme levantamento da frota.')
      returning id into v_quote;
      insert into public.quote_items (organization_id, quote_id, sku, description, unit, quantity, unit_price, position, mode)
      values (v_org, v_quote, lpad((4500 + r.idx * 7)::text, 6, '0'), 'Orçamento nº ' || lpad((4500 + r.idx * 7)::text, 6, '0') || ' (ERP da Tawper)', 'un', 1, r.valor, 0, 'sale');
    end if;
  end loop;

  -- Uma conta em espera, com motivo, condição e data de reavaliação (não é etapa de funil).
  if exists (select 1 from pg_temp.demo_mapa where funil = 'aq') then
  perform public.crm_set_standby(
    (select company_id from pg_temp.demo_mapa where funil = 'aq' order by dono desc, idx limit 1),
    'Orçamento anual ainda não liberado', 'Liberação do orçamento de manutenção de 2027',
    (select owner_id from pg_temp.demo_mapa where funil = 'aq' order by dono desc, idx limit 1),
    pg_temp.dia_util(18, 10), v_admin);
  end if;
  perform app.crm_begin(v_admin, 'user');
end $$;

-- 4. Trabalho das últimas 5 semanas: ligações, WhatsApps, e-mails e cotações concluídos, no ritmo de cada pessoa.
create temp table pg_temp.demo_cart on commit drop as
select m.*, row_number() over (partition by m.owner_id order by m.idx) as rn, count(*) over (partition by m.owner_id) as cnt
  from pg_temp.demo_mapa m where m.funil <> 'perdida';
create temp table pg_temp.demo_dias on commit drop as
select d::date as dia from generate_series((now() at time zone 'America/Sao_Paulo')::date - 35, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
 where extract(isodow from d) < 6 and to_char(d, 'MM-DD') not in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25');

insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, completed_at, outcome, created_by, created_at)
select '00000000-0000-4000-8000-000000000001', c.company_id, c.opp_id, b.tipo,
       (case b.tipo
          when 'call' then array['Ligar para alinhar o próximo passo', 'Ligar para confirmar estoque de mangueiras', 'Ligar para a manutenção sobre a colhedora parada', 'Ligar para confirmar o recebimento', 'Ligar para o comprador sobre a programação']
          when 'whatsapp' then array['Enviar material técnico pelo WhatsApp', 'Mandar fotos dos terminais pedidos', 'Confirmar a medida das mangueiras', 'Responder dúvida sobre prazo de entrega']
          when 'email' then array['Enviar ficha técnica por e-mail', 'Enviar condições comerciais por e-mail', 'Enviar documentos de cadastro']
          else array['Montar cotação no ERP e anexar', 'Revisar cotação de reposição'] end)[1 + (b.h / 7) % (case b.tipo when 'call' then 5 when 'whatsapp' then 4 when 'email' then 3 else 2 end)],
       c.owner_id, b.due, 'medium', 'done', 'manual',
       least(now() - make_interval(mins => 3 + b.n), case when b.h % 100 < 8 and b.dia < (now() at time zone 'America/Sao_Paulo')::date - 3 then b.due + interval '1 day 3 hours' else b.due + make_interval(mins => 15 + b.h % 80) end),
       (array['Falei com o responsável; combinamos o próximo contato.', 'Material recebido; vai repassar para a manutenção.', 'Confirmou a demanda e pediu retorno na próxima semana.',
              'Sem resposta na primeira tentativa; retornou à tarde.', 'Passou as medidas das colhedoras.', 'Pediu para incluir capas protetoras no próximo pedido.'])[1 + b.h % 6],
       c.owner_id, b.due - interval '2 days'
  from (
    select rt.dono, d.dia, k.tipo, g.n, abs(hashtext(rt.dono || '|' || d.dia || '|' || k.tipo::text || '|' || g.n)) as h,
           least(now() - make_interval(mins => 30 + g.n * 9),
                 (d.dia + make_time(8 + abs(hashtext(rt.dono || '|' || d.dia || '|' || k.tipo::text || '|' || g.n)) % 9, (g.n % 4) * 15, 0)) at time zone 'America/Sao_Paulo') as due
      from pg_temp.demo_ritmo rt
      cross join pg_temp.demo_dias d
      cross join lateral (values ('call'::public.activity_type, rt.ligacoes), ('whatsapp'::public.activity_type, rt.whatsapps), ('email'::public.activity_type, rt.emails), ('quote'::public.activity_type, rt.cotacoes)) k(tipo, qtd)
      cross join lateral generate_series(1, round(k.qtd * (0.8 + (abs(hashtext(rt.dono || '|' || d.dia || '|' || k.tipo::text)) % 40) / 100.0)
                                         * case when d.dia = (now() at time zone 'America/Sao_Paulo')::date
                                                then least(1, greatest(0, (extract(hour from now() at time zone 'America/Sao_Paulo') - 8) / 10.0)) else 1 end)::int) g(n)
  ) b
  join pg_temp.demo_donos dn on dn.dono = b.dono
  join pg_temp.demo_cart c on c.owner_id = dn.owner_id and c.rn = 1 + b.h % c.cnt;

-- Reuniões e visitas feitas nas últimas 5 semanas.
insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, completed_at, outcome, created_by, created_at)
select '00000000-0000-4000-8000-000000000001', c.company_id, c.opp_id, x.tipo,
       case x.tipo when 'visit' then 'Visita técnica na oficina' else (array['Reunião com manutenção e compras', 'Reunião de planejamento da entressafra', 'Reunião com o gerente industrial'])[1 + x.h % 3] end,
       c.owner_id, x.due, 'medium', 'done', 'manual', least(now() - interval '20 minutes', x.due + interval '1 hour 30 minutes'),
       case x.tipo when 'visit' then 'Visita feita: levantamos as medidas e a oficina aprovou a padronização por cores.' else 'Reunião realizada; demanda da entressafra mapeada e próximos passos definidos.' end,
       c.owner_id, x.due - interval '5 days'
  from (
    select rt.dono, t.tipo, g.n, abs(hashtext(rt.dono || t.tipo::text || g.n)) as h,
           (select (d.dia + make_time(case t.tipo when 'visit' then 9 else 10 end + (g.n % 3) * 2, 0, 0)) at time zone 'America/Sao_Paulo'
              from pg_temp.demo_dias d where d.dia < (now() at time zone 'America/Sao_Paulo')::date
              -- metade cai no mês corrente: a tela de Metas mostra o andamento do mês
              order by (g.n % 2 = 1 and d.dia >= date_trunc('month', now() at time zone 'America/Sao_Paulo')::date) desc, abs(hashtext(rt.dono || t.tipo::text || g.n || d.dia)) limit 1) as due
      from pg_temp.demo_ritmo rt
      cross join lateral (values ('meeting'::public.activity_type, rt.reunioes_mes), ('visit'::public.activity_type, rt.visitas_mes)) t(tipo, qtd)
      cross join lateral generate_series(1, round(t.qtd * 1.15)::int) g(n)
  ) x
  join pg_temp.demo_donos dn on dn.dono = x.dono
  join pg_temp.demo_cart c on c.owner_id = dn.owner_id and c.rn = 1 + x.h % c.cnt;

-- Um registro na linha do tempo do cliente para cada três atividades concluídas.
insert into public.interactions (organization_id, company_id, opportunity_id, contact_id, channel, kind, occurred_at, author_id, actor_type, title, content)
select a.organization_id, a.company_id, a.opportunity_id, c.contato_id,
       (case a.type when 'call' then 'phone' when 'whatsapp' then 'whatsapp' when 'visit' then 'visit' when 'meeting' then 'meeting' else 'email' end)::public.interaction_channel,
       'note', a.completed_at, a.owner_id, 'user', a.title, a.outcome
  from public.activities a join pg_temp.demo_cart c on c.company_id = a.company_id
 where a.organization_id = '00000000-0000-4000-8000-000000000001' and a.status = 'done' and abs(hashtext(a.id::text)) % 3 = 0;

-- 5. Agenda: reuniões das próximas três semanas e visitas com rota, confirmação e tarefa no dia útil anterior.
insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by, created_at)
select '00000000-0000-4000-8000-000000000001', c.company_id, c.opp_id, 'meeting',
       (array['Reunião de planejamento da entressafra', 'Reunião com manutenção e compras', 'Apresentar proposta de fornecimento programado'])[1 + g.n % 3],
       c.owner_id, pg_temp.dia_util(g.n * 2 + rt.dono % 2, 9 + (g.n * 3 + rt.dono) % 7), 'medium', 'pending', 'manual', c.owner_id, now() - interval '4 days'
  from pg_temp.demo_ritmo rt
  join pg_temp.demo_donos dn on dn.dono = rt.dono
  cross join lateral generate_series(1, case when rt.dono = 0 then 6 else 5 end) g(n)
  join pg_temp.demo_cart c on c.owner_id = dn.owner_id and c.rn = 1 + abs(hashtext('reuniao' || rt.dono || g.n)) % c.cnt;

do $$
declare
  v_org constant uuid := '00000000-0000-4000-8000-000000000001';
  v_rotas boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'route_stops' and column_name = 'scheduled_at');
  d record;
  s record;
  v_plan uuid;
  v_visit uuid;
  v_when timestamptz;
  v_rota integer;
  v_n integer;
begin
  for d in select distinct dn.dono, dn.owner_id from pg_temp.demo_donos dn loop
    -- Duas rotas por pessoa: a primeira daqui a 3 dias úteis, a segunda na semana seguinte, cada uma num estado.
    v_rota := 0;
    -- Cinco clientes, começando pelo estado com mais clientes: 3 na primeira rota e 2 na segunda.
    for s in
      select x.*, case when x.pos <= 3 then 1 else 2 end as grupo, case when x.pos <= 3 then x.pos else x.pos - 3 end as ordem
        from (select c.*, row_number() over (order by c.cnt_uf desc, c.uf, c.idx) as pos
                from (select c.*, count(*) over (partition by c.uf) as cnt_uf from pg_temp.demo_cart c where c.owner_id = d.owner_id) c) x
       where x.pos <= 5
       order by x.pos
    loop
      if s.ordem = 1 then
        v_rota := v_rota + 1;
        v_plan := null;
        if v_rotas then
          execute 'insert into public.route_plans (organization_id, owner_id, planned_date, status, estimated_km, notes, region_label, created_by)
                   values ($1, $2, ($3 at time zone ''America/Sao_Paulo'')::date, ''confirmed'', $4, $5, $6, $2) returning id'
             into v_plan using v_org, d.owner_id, pg_temp.dia_util(case v_rota when 1 then 3 else 9 end, 8), 140 + (abs(hashtext(s.uf || d.dono)) % 260),
                  'Rota de visitas em ' || s.uf || ': levantamento de frota e apresentação da padronização por cores.', s.uf;
        end if;
      end if;
      v_when := pg_temp.dia_util(case v_rota when 1 then 3 else 9 end, (array[8, 11, 14])[s.ordem], (array[30, 15, 30])[s.ordem]);
      insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by, created_at)
      values (v_org, s.company_id, s.opp_id, 'visit', 'Visita: ' || s.nome, d.owner_id, v_when, 'high', 'pending', 'rule', d.owner_id, now() - interval '2 days')
      returning id into v_visit;
      if v_when - interval '1 day' > now() then
        insert into public.activities (organization_id, company_id, opportunity_id, type, title, description, owner_id, due_at, priority, status, origin, created_by, created_at)
        values (v_org, s.company_id, s.opp_id, 'whatsapp', 'Confirmar visita: ' || s.nome,
                'Mensagem pronta: Olá! Confirmando nossa visita ' || to_char(v_when at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '. Esse horário continua bom para você?',
                d.owner_id, greatest(now() + interval '1 hour', v_when - interval '1 day' - make_interval(hours => extract(hour from v_when at time zone 'America/Sao_Paulo')::int - 9)),
                'high', 'pending', 'rule', d.owner_id, now() - interval '2 days');
      end if;
      if v_plan is not null then
        execute 'insert into public.route_stops (organization_id, route_plan_id, company_id, position, objective, reason, activity_id, scheduled_at)
                 values ($1, $2, $3, $4, $5, $6, $7, $8)'
          using v_org, v_plan, s.company_id, s.ordem, 'Visita: levantamento de frota', 'Conta da região com demanda para a entressafra', v_visit, v_when;
      end if;
    end loop;
  end loop;
end $$;

-- 6. Registros pelo WhatsApp (tela Registros): o que cada pessoa informou ao agente e o que o sistema gravou.
insert into public.ai_agent_runs (organization_id, actor_profile_id, company_id, agent_key, task_key, status, provider, model, prompt_version, correlation_id,
                                  input_summary, output_summary, latency_ms, started_at, finished_at, created_at)
select '00000000-0000-4000-8000-000000000001', c.owner_id, case when x.t < 6 then c.company_id end, 'whatsapp_agent', 'conversa', 'completed', 'openai', 'gpt-5.4', 'demo',
       'demo-' || md5(x.dono || '|' || x.dia || '|' || x.n),
       jsonb_build_object('pergunta', replace(replace(
           (array['Liguei pro {c} da {e}, ele pediu retorno semana que vem', 'Visitei a {e} hoje, levantei as medidas das colhedoras',
                  'O {c} da {e} pediu orçamento de reposição pra entressafra', 'Me lembra de ligar pra {e} na quinta às 10h',
                  'Mandei o material técnico pro {c} da {e} pelo whats', 'Fechou o pedido da {e}? qual o valor?',
                  'Quais tarefas eu tenho amanhã?', 'Como está o funil da minha carteira?'])[1 + x.t], '{c}', split_part(k.name, ' ', 1)), '{e}', c.nome),
         'audio', x.h % 4 = 0, 'caminho', 'ferramentas'),
       jsonb_build_object(
         'resposta', (array['✅ Registrado na ' || c.nome || ': ligação feita, retorno agendado para a próxima semana.',
                            '✅ Visita registrada na ' || c.nome || ' com o levantamento das medidas.',
                            '✅ Registrado o pedido de orçamento da ' || c.nome || ' e criada a tarefa de enviar a cotação.',
                            '📅 Tarefa criada: ligar para ' || c.nome || ' na quinta às 10h.',
                            '✅ Envio de material registrado na ' || c.nome || '.',
                            'A ' || c.nome || ' está em negociação; a última venda está no histórico do cliente.',
                            'Amanhã você tem 4 tarefas: 2 ligações, 1 reunião e 1 visita.',
                            'Sua carteira tem negócios em todas as etapas; os maiores estão em orçamento e negociação.'])[1 + x.t],
         'gravou', (array['["registrar_atividade"]', '["registrar_atividade"]', '["registrar_atividade","criar_tarefa"]', '["criar_tarefa"]',
                          '["registrar_atividade"]', '[]', '[]', '[]'])[1 + x.t]::jsonb,
         'marcas', case when x.h % 40 = 0 then '["errou"]'::jsonb else '[]'::jsonb end),
       2500 + x.h % 9000, x.quando, x.quando + interval '8 seconds', x.quando + interval '8 seconds'
  from (
    select rt.dono, d.dia, g.n, abs(hashtext('agente' || rt.dono || d.dia || g.n)) as h,
           abs(hashtext('agente' || rt.dono || d.dia || g.n)) % 8 as t,
           least(now() - make_interval(mins => 5 + g.n * 3), (d.dia + make_time(8 + abs(hashtext('h' || rt.dono || d.dia || g.n)) % 10, (g.n * 13) % 60, 0)) at time zone 'America/Sao_Paulo') as quando
      from pg_temp.demo_ritmo rt cross join pg_temp.demo_dias d cross join lateral generate_series(1, rt.agente_dia) g(n)
  ) x
  join pg_temp.demo_donos dn on dn.dono = x.dono
  join pg_temp.demo_cart c on c.owner_id = dn.owner_id and c.rn = 1 + x.h % c.cnt
  join public.contacts k on k.id = c.contato_id;

-- 8. Histórico de alterações (Auditoria) coerente com a carga: etapas, vendas, orçamentos e tarefas concluídas dos últimos 30 dias.
insert into public.audit_events (organization_id, occurred_at, actor_id, actor_type, entity_type, entity_id, company_id, field, old_value, new_value)
select h.organization_id, h.entered_at, o.owner_id, 'user'::public.actor_type, 'opportunities', h.opportunity_id, o.company_id, 'stage_id', h.anterior::text, h.stage_id::text
  from (select h.*, lag(h.stage_id) over (partition by h.opportunity_id order by h.entered_at) as anterior from public.opportunity_stage_history h
         where h.organization_id = '00000000-0000-4000-8000-000000000001') h
  join public.opportunities o on o.id = h.opportunity_id join pg_temp.demo_mapa m on m.company_id = o.company_id
 where h.anterior is not null and h.entered_at > now() - interval '30 days' and h.entered_at <= now()
union all
select o.organization_id, o.closed_at, o.owner_id, 'user'::public.actor_type, 'opportunities', o.id, o.company_id, 'status', 'open', o.status::text
  from public.opportunities o join pg_temp.demo_mapa m on m.company_id = o.company_id where o.organization_id = '00000000-0000-4000-8000-000000000001' and o.status in ('won', 'lost') and o.closed_at > now() - interval '30 days'
union all
select q.organization_id, q.sent_at, q.author_id, 'user'::public.actor_type, 'quotes', q.id, q.company_id, 'status', 'draft', 'sent'
  from public.quotes q join pg_temp.demo_mapa m on m.company_id = q.company_id where q.organization_id = '00000000-0000-4000-8000-000000000001' and q.sent_at > now() - interval '30 days'
union all
select a.organization_id, a.completed_at, a.owner_id, 'user'::public.actor_type, 'activities', a.id, a.company_id, 'status', 'pending', 'done'
  from public.activities a join pg_temp.demo_mapa m on m.company_id = a.company_id where a.organization_id = '00000000-0000-4000-8000-000000000001' and a.status = 'done' and a.completed_at > now() - interval '30 days' and abs(hashtext(a.id::text)) % 4 = 0;


-- Conferência: o que ficou no banco.
with org as (select '00000000-0000-4000-8000-000000000001'::uuid as id),
pessoas as (select dn.dono, p.short_name from pg_temp.demo_donos dn join public.profiles p on p.id = dn.owner_id)
select 'clientes (ativos / perdidos)' as item, (select count(*) filter (where status <> 'lost') || ' / ' || count(*) filter (where status = 'lost') from public.companies, org where organization_id = org.id) as valor
union all select 'vendido em 2026', (select 'R$ ' || to_char(sum(amount), 'FM999G999G990') || ' em ' || count(*) || ' vendas' from public.sales, org where organization_id = org.id and sold_at >= '2026-01-01')
union all select 'negócios abertos (valor)', (select count(*) || ' / R$ ' || to_char(coalesce(sum(estimated_value), 0), 'FM999G999G990') from public.opportunities, org where organization_id = org.id and status = 'open')
union all select 'vendido em 2026 — ' || p.short_name, (select 'R$ ' || to_char(coalesce(sum(s.amount), 0), 'FM999G999G990') from public.sales s join pg_temp.demo_mapa m on m.company_id = s.company_id where m.dono = p.dono and s.sold_at >= '2026-01-01') from pessoas p
union all select 'agenda de ' || p.short_name || ' (visitas / reuniões / outras pendentes)',
  (select count(*) filter (where a.type = 'visit') || ' / ' || count(*) filter (where a.type = 'meeting') || ' / ' || count(*) filter (where a.type not in ('visit', 'meeting'))
     from public.activities a join pg_temp.demo_donos dn on dn.owner_id = a.owner_id where dn.dono = p.dono and a.status = 'pending') from pessoas p
union all select 'clientes sem contato', (select count(*)::text from public.companies c, org where c.organization_id = org.id and not exists (select 1 from public.contacts k where k.company_id = c.id))
union all select 'clientes sem cidade, UF ou coordenada', (select count(*)::text from public.companies, org where organization_id = org.id and (city is null or state is null or latitude is null or longitude is null))
union all select 'tarefas pendentes duplicadas', (select count(*)::text from (select 1 from public.activities, org where organization_id = org.id and status = 'pending' group by company_id, title, (due_at at time zone 'America/Sao_Paulo')::date having count(*) > 1) d)
union all select 'tarefas atrasadas', (select count(*)::text from public.activities, org where organization_id = org.id and status = 'pending' and due_at < date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
union all select 'pendentes fora do horário (8h-18h) ou no fim de semana', (select count(*)::text from public.activities, org where organization_id = org.id and status = 'pending' and (extract(isodow from due_at at time zone 'America/Sao_Paulo') > 5 or extract(hour from due_at at time zone 'America/Sao_Paulo') not between 8 and 17))
union all select 'contas ativas sem próximo passo', (select count(*)::text from public.companies c, org where c.organization_id = org.id and c.status = 'active' and not exists (select 1 from public.activities a where a.company_id = c.id and a.status = 'pending'))
union all select 'atividades concluídas nos últimos 30 dias (no prazo / total)', (select count(*) filter (where completed_at::date <= due_at::date) || ' / ' || count(*) from public.activities, org where organization_id = org.id and status = 'done' and completed_at > now() - interval '30 days')
union all select 'concluídas no futuro (deve ser 0)', (select count(*)::text from public.activities, org where organization_id = org.id and completed_at > now())
union all select 'registros pelo WhatsApp (últimos 30 dias)', (select count(*)::text from public.ai_agent_runs, org where organization_id = org.id and correlation_id like 'demo-%');

commit;
`;
