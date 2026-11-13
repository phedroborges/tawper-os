-- =============================================================================
-- Tawper OS — dados de demonstração
-- =============================================================================
-- O QUE FAZ: apaga TODAS as empresas da organização Tawper (com contatos, negócios, tarefas, orçamentos,
-- vendas e histórico) e recria uma carteira fictícia completa de 26 clientes. Equipe, logins, configurações
-- e o agente do WhatsApp NÃO são tocados (conversas e atendimentos ficam, só sem vínculo com as empresas apagadas).
--
-- O QUE FICA DEPOIS:
--   - novembro fechando bem: quase tudo concluído no prazo, 4 tarefas atrasadas espalhadas em duas pessoas
--   - dezembro organizado: todo cliente ativo com próximo passo marcado em dia útil, das 8h às 18h
--   - nenhum cliente sem contato, sem localização ou com tarefa duplicada
--   - vendas dos últimos meses (alimentam Metas, pódio e Painel), orçamentos, estratégias e 3 contas paradas
--
-- COMO RODAR: cole o arquivo inteiro no SQL Editor do Supabase do projeto da Tawper e execute.
-- É uma transação só: se qualquer linha falhar, nada muda. Todas as datas são relativas a AGORA,
-- então rode de novo na véspera da apresentação (pode rodar quantas vezes quiser).
--
-- CÓPIA DE SEGURANÇA: na primeira execução, o estado atual das tabelas é copiado para o schema
-- backup_pre_demo (fora da API). Execuções seguintes não sobrescrevem essa cópia.
-- =============================================================================

begin;

create schema if not exists backup_pre_demo;
revoke all on schema backup_pre_demo from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'company_relationships', 'contacts', 'opportunities', 'opportunity_stage_history', 'opportunity_requirement_values',
    'activities', 'interactions', 'standby_periods', 'sales', 'quotes', 'quote_items', 'strategies', 'strategy_versions', 'ai_suggestions', 'route_plans', 'route_stops',
    'conversations', 'messages', 'ai_agent_sessions', 'ai_agent_runs'
  ] loop
    execute format('create table if not exists backup_pre_demo.%I as table public.%I', t, t);
  end loop;
end $$;

-- Dia útil a partir de hoje (p_dias negativo = passado), no horário de Brasília. Sábado e domingo
-- são empurrados para o dia útil mais próximo na mesma direção.
create or replace function pg_temp.dia_util(p_dias integer, p_hora integer, p_minuto integer default 0)
returns timestamptz language plpgsql as $$
declare
  d date := (now() at time zone 'America/Sao_Paulo')::date + p_dias;
begin
  if extract(dow from d) = 6 then d := d + case when p_dias < 0 then -1 else 2 end; end if;
  if extract(dow from d) = 0 then d := d + case when p_dias < 0 then -2 else 1 end; end if;
  return (d + make_time(p_hora, p_minuto, 0)) at time zone 'America/Sao_Paulo';
end $$;

do $$
declare
  v_org      constant uuid := '00000000-0000-4000-8000-000000000001';
  v_admin    uuid;
  v_sellers  uuid[];
  aq         constant text[] := array['lead', 'qualificacao', 'apresentacao_empresa', 'apresentacao_tecnica', 'cadastro', 'homologacao', 'aprovado', 'orcamento', 'negociacao'];
  rc         constant text[] := array['posvenda', 'relacionamento', 'previsao', 'orcamento_r', 'negociacao_r'];
  tipos      constant public.activity_type[] := array['call', 'whatsapp', 'visit', 'meeting', 'email', 'call']::public.activity_type[];
  titulos    constant text[] := array['Ligar e alinhar o próximo passo', 'Enviar material técnico por WhatsApp', 'Visita técnica à oficina agrícola', 'Reunião com a manutenção', 'Enviar documentos por e-mail', 'Ligar para confirmar recebimento'];
  resultados constant text[] := array[
    'Falei com o responsável. Combinamos o próximo contato.', 'Material enviado e recebido. Vai repassar para a equipe.',
    'Visita feita. Levantei as medidas das mangueiras nas colhedoras.', 'Reunião realizada com manutenção e compras. Interesse confirmado.',
    'Documentos enviados. Aguardando conferência do cadastro.', 'Confirmou o recebimento e pediu retorno na próxima semana.'];
  canais     constant public.interaction_channel[] := array['phone', 'whatsapp', 'visit', 'meeting', 'email', 'phone']::public.interaction_channel[];
  decisores  constant text[] := array['Carlos Menezes', 'Roberto Almeida', 'Sérgio Nogueira', 'Marcelo Tavares', 'Antônio Furtado', 'Ricardo Pacheco', 'Fernando Lacerda', 'Eduardo Brandão'];
  tecnicos   constant text[] := array['Júlio Bastos', 'Wagner Moreira', 'Leandro Pires', 'Cristiano Rocha', 'Adriano Teles', 'Márcio Cunha', 'Rafael Dantas'];
  compras    constant text[] := array['Patrícia Lemos', 'Juliana Prado', 'Camila Rezende', 'Vanessa Couto', 'Aline Barros'];
  r          record;
  v_company  uuid;
  v_owner    uuid;
  v_opp      uuid;
  v_contact  uuid;
  v_quote    uuid;
  v_f_aq     uuid;
  v_f_rc     uuid;
  v_ddd      text;
  v_pos      integer;
  v_total    integer;
  v_t        timestamptz;
  v_last     timestamptz;
  v_alvo     timestamptz;
  v_due      timestamptz;
  v_done     timestamptz;
  v_sales    text[];
  v_days     integer;
  v_amount   numeric;
  v_cycle    integer;
  v_title    text;
  v_type     public.activity_type;
  j          integer;
  k          integer;
begin
  select m.profile_id into v_admin
    from public.memberships m join public.profiles p on p.id = m.profile_id
   where m.organization_id = v_org and m.is_active and p.is_active and m.role = 'admin'
   order by p.full_name limit 1;
  if v_admin is null then raise exception 'Não achei administrador ativo na organização Tawper.'; end if;

  select array_agg(s.profile_id order by s.full_name) into v_sellers
    from (select m.profile_id, p.full_name from public.memberships m join public.profiles p on p.id = m.profile_id
           where m.organization_id = v_org and m.is_active and p.is_active and m.role in ('vendedor', 'representante')) s;
  if coalesce(array_length(v_sellers, 1), 0) < 2 then
    -- Equipe ainda sem vendedores cadastrados: distribui a carteira entre todos os ativos.
    select array_agg(s.profile_id order by s.full_name) into v_sellers
      from (select m.profile_id, p.full_name from public.memberships m join public.profiles p on p.id = m.profile_id
             where m.organization_id = v_org and m.is_active and p.is_active) s;
  end if;

  perform app.crm_begin(v_admin, 'user');
  perform set_config('app.bypass_stage_rules', 'on', true);

  -- 1. Limpa a carteira atual (a cópia de segurança já foi feita acima).
  -- Conversas e atendimentos do agente NÃO são apagados: só deixam de apontar para empresa e contato que vão sumir.
  -- (Sem isto o banco recusa a exclusão: o vínculo "ao apagar, zerar" tenta zerar também o organization_id.)
  update public.ai_agent_runs set company_id = null where organization_id = v_org and company_id is not null;
  update public.ai_agent_sessions set company_id = null where organization_id = v_org and company_id is not null;
  update public.messages set contact_id = null where organization_id = v_org and contact_id is not null;
  update public.conversations set company_id = null, contact_id = null where organization_id = v_org and (company_id is not null or contact_id is not null);
  perform set_config('app.admin_correction', 'on', true);
  delete from public.route_plans where organization_id = v_org;
  delete from public.companies where organization_id = v_org;
  perform set_config('app.admin_correction', '', true);
  update public.organizations set company_seq = 0 where id = v_org;

  -- 2. Regiões do Brasil (a região do cliente sai da UF).
  insert into public.regions (organization_id, name, states) values
    (v_org, 'Norte', '{AC,AM,AP,PA,RO,RR,TO}'), (v_org, 'Nordeste', '{AL,BA,CE,MA,PB,PE,PI,RN,SE}'),
    (v_org, 'Centro-Oeste', '{DF,GO,MS,MT}'), (v_org, 'Sudeste', '{ES,MG,RJ,SP}'), (v_org, 'Sul', '{PR,RS,SC}')
  on conflict (organization_id, name) do update set states = excluded.states, is_active = true;
  update public.regions set is_active = false where organization_id = v_org and name not in ('Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul');

  select id into v_f_aq from public.funnels where organization_id = v_org and key = 'aquisicao';
  select id into v_f_rc from public.funnels where organization_id = v_org and key = 'recorrencia';

  -- 3. Carteira. funil: aq = aquisição aberta, rc = cliente na recorrência, perdida = negócio perdido.
  --    dias = há quantos dias está na etapa atual. vendas = "dias atrás:valor" de cada venda, da mais antiga à mais nova.
  for r in
    select * from (values
      ( 1, 'Usina Serra Dourada Bioenergia',        'Quirinópolis',         'GO', '75860000', -18.448, -50.452, 'Usina sucroenergética',      18, 'John Deere CH570',             'own',             'Gates',     'Hidráulica Goiás',     'high',   42000, 'medium', 'aq',      'lead',                  4,      0, '',                         '41370913000187'),
      ( 2, 'Agroindustrial Rio das Pedras',         'Ituiutaba',            'MG', '38300000', -18.969, -49.465, 'Grupo sucroenergético',      24, 'Case A8800 e A9000',           'competitor_loan', 'Parker',    'Mangueiras Triângulo', 'high',   55000, 'medium', 'aq',      'lead',                  9,      0, '',                         '41741826000199'),
      ( 3, 'Usina Vale do Araguaia',                'Jataí',                'GO', '75800000', -17.881, -51.714, 'Usina sucroenergética',      15, 'John Deere CH570 e CH950',     'own',             'Manuli',    'Hidráulica Goiás',     'medium', 30000, 'medium', 'aq',      'qualificacao',          6,      0, '',                         '42112739000135'),
      ( 4, 'Destilaria Campo Belo',                 'Frutal',               'MG', '38200000', -20.025, -48.940, 'Destilaria',                  8, 'Case A8800',                   'none',            'Diversas / sem padrão', 'Revenda local', 'medium', 16000, 'low', 'aq',  'qualificacao',         12,      0, '',                         '42483652000174'),
      ( 5, 'CTT Irmãos Carvalho',                   'Olímpia',              'SP', '15400000', -20.737, -48.915, 'Prestador de serviço (CTT)',  9, 'John Deere CH570',             'own',             'Gates',     'Hidráulica Paulista',  'medium', 18000, 'high',   'aq',      'qualificacao',         25,      0, '',                         '42854565000186'),
      ( 6, 'Usina Santa Helena do Cerrado',         'Rio Verde',            'GO', '75900000', -17.798, -50.928, 'Usina sucroenergética',      22, 'Case A9000',                   'competitor_loan', 'Parker',    'Hidráulica Goiás',     'high',   50000, 'high',   'aq',      'apresentacao_empresa',  8,      0, '',                         '43225478000122'),
      ( 7, 'Grupo Agro São Miguel',                 'Catanduva',            'SP', '15800000', -21.138, -48.973, 'Grupo sucroenergético',      31, 'John Deere CH570 e CH950',     'own',             'Continental', 'Hidráulica Paulista', 'high',  70000, 'medium', 'aq',      'apresentacao_empresa', 15,      0, '',                         '43596391000161'),
      ( 8, 'Usina Nova Fronteira',                  'Naviraí',              'MS', '79950000', -23.065, -54.191, 'Usina sucroenergética',      16, 'Case A8800',                   'own',             'Eaton',     'Sul Hidráulica',       'medium', 34000, 'medium', 'aq',      'apresentacao_tecnica',  5,      0, '',                         '43967304000135'),
      ( 9, 'Usina Boa Esperança do Sul',            'Rio Brilhante',        'MS', '79130000', -21.802, -54.546, 'Usina sucroenergética',      20, 'John Deere CH570',             'competitor_loan', 'Gates',     'Sul Hidráulica',       'high',   46000, 'medium', 'aq',      'cadastro',              7,      0, '',                         '44338217000181'),
      (10, 'Fornecedora de Cana Três Barras',       'Bebedouro',            'SP', '14700000', -20.949, -48.479, 'Fornecedor de cana',          6, 'Case A8800',                   'none',            'Copecar',   'Revenda local',        'low',    11000, 'low',    'aq',      'cadastro',             14,      0, '',                         '44709130000173'),
      (11, 'Usina Planalto Verde',                  'Mineiros',             'GO', '75830000', -17.569, -52.551, 'Usina sucroenergética',      19, 'John Deere CH950',             'own',             'Manuli',    'Hidráulica Goiás',     'high',   44000, 'high',   'aq',      'homologacao',          20,  52000, '',                         '45080043000162'),
      (12, 'Usina Alto Paraná Açúcar e Etanol',     'Nova Andradina',       'MS', '79750000', -22.233, -53.343, 'Usina sucroenergética',      27, 'Case A9000',                   'competitor_loan', 'Parker',    'Sul Hidráulica',       'high',   62000, 'high',   'aq',      'homologacao',          52,  74000, '',                         '45450956000123'),
      (13, 'Bioenergia Triângulo',                  'Uberaba',              'MG', '38000000', -19.748, -47.932, 'Usina sucroenergética',      14, 'John Deere CH570',             'own',             'Gates',     'Mangueiras Triângulo', 'medium', 29000, 'medium', 'aq',      'aprovado',             10,  38000, '',                         '45821869000135'),
      (14, 'Usina São Bento do Oeste',              'Presidente Venceslau', 'SP', '19400000', -21.876, -51.844, 'Usina sucroenergética',      21, 'Case A8800 e A9000',           'own',             'Continental', 'Hidráulica Paulista', 'high',  48000, 'high',   'aq',      'orcamento',             4,  68500, '',                         '46192782000109'),
      (15, 'Usina Canaã Paulista',                  'Votuporanga',          'SP', '15500000', -20.423, -49.973, 'Usina sucroenergética',      13, 'John Deere CH570',             'tawper_loan',     'Gates',     'Hidráulica Paulista',  'medium', 27000, 'medium', 'aq',      'orcamento',             8,  41200, '',                         '46563695000110'),
      (16, 'Usina Monte Alegre de Goiás',           'Goiatuba',             'GO', '75600000', -18.012, -49.357, 'Usina sucroenergética',      29, 'John Deere CH950',             'own',             'Parker',    'Hidráulica Goiás',     'high',   66000, 'high',   'aq',      'negociacao',            6,  96000, '',                         '46934608000194'),
      (17, 'Agropecuária Santa Rita',               'Assis',                'SP', '19800000', -22.661, -50.412, 'Fornecedor de cana',         10, 'Case A8800',                   'own',             'Eaton',     'Revenda local',        'medium', 21000, 'medium', 'aq',      'negociacao',           19,  37800, '',                         '47305521000110'),
      (18, 'Usina Cristal do Vale',                 'Novo Horizonte',       'SP', '14960000', -21.468, -49.221, 'Usina sucroenergética',      23, 'John Deere CH570 e CH950',     'tawper_loan',     'Tawper',    'Gates',                'high',   52000, 'medium', 'rc',      'posvenda',              3,      0, '3:46800',                  '47676434000170'),
      (19, 'Usina Rio Claro Energia',               'Iturama',              'MG', '38280000', -19.728, -50.196, 'Usina sucroenergética',      17, 'Case A9000',                   'tawper_loan',     'Tawper',    'Parker',               'medium', 36000, 'medium', 'rc',      'posvenda',              6,      0, '6:31500',                  '48047347000116'),
      (20, 'Grupo Sucroenergético Paranaíba',       'Paranaíba',            'MS', '79500000', -19.677, -51.191, 'Grupo sucroenergético',      34, 'John Deere CH950',             'tawper_loan',     'Tawper',    'Parker',               'high',   78000, 'medium', 'rc',      'relacionamento',        4,      0, '120:58000,11:27400',       '48418260000108'),
      (21, 'Usina Pedra Branca',                    'Ourinhos',             'SP', '19900000', -22.979, -49.871, 'Usina sucroenergética',      18, 'Case A8800',                   'own',             'Tawper',    'Gates',                'medium', 40000, 'low',    'rc',      'relacionamento',       20,      0, '150:39900,30:44600',       '48789173000167'),
      (22, 'Usina Jequitibá',                       'Monte Aprazível',      'SP', '15150000', -20.772, -49.714, 'Usina sucroenergética',      25, 'John Deere CH570',             'tawper_loan',     'Tawper',    'Continental',          'high',   57000, 'medium', 'rc',      'previsao',             22,  45000, '200:72000,95:35000',       '49160086000109'),
      (23, 'Usina Horizonte Verde',                 'Paraguaçu Paulista',   'SP', '19700000', -22.413, -50.576, 'Usina sucroenergética',      20, 'Case A9000',                   'own',             'Tawper',    'Manuli',               'medium', 43000, 'high',   'rc',      'orcamento_r',           5,  52300, '170:49500,60:22800',       '49530999000170'),
      (24, 'Usina Lagoa Dourada',                   'Pereira Barreto',      'SP', '15370000', -20.638, -51.109, 'Usina sucroenergética',      30, 'John Deere CH570 e CH950',     'tawper_loan',     'Tawper',    'Parker',               'high',   69000, 'high',   'rc',      'negociacao_r',          7,  88900, '220:81000,110:54000,40:63200', '49901912000123'),
      (25, 'Usina Ribeirão Fundo',                  'Martinópolis',         'SP', '19500000', -22.146, -51.171, 'Usina sucroenergética',      16, 'Case A8800',                   'competitor_loan', 'Parker',    'Hidráulica Paulista',  'medium', 33000, 'low',    'perdida', 'negociacao',           24,  41000, 'Perdeu para concorrente',  '50272825000133'),
      (26, 'Agrícola Campo Largo',                  'Cândido Mota',         'SP', '19880000', -22.746, -50.387, 'Fornecedor de cana',          7, 'John Deere CH570',             'none',            'Copecar',   'Revenda local',        'low',    12000, 'low',    'perdida', 'orcamento',            38,  19500, 'Preço',                    '50643738000145')
    ) as t(idx, nome, cidade, uf, cep, lat, lng, ramo, colhedoras, modelos, prensa, marca, concorrente, potencial, mensal, urgencia, funil, etapa, dias, valor, extra, cnpj)
    order by idx
  loop
    v_owner := v_sellers[1 + (r.idx - 1) % array_length(v_sellers, 1)];
    v_ddd := case r.uf when 'GO' then '64' when 'MG' then '34' when 'MS' then '67' else '17' end;
    v_sales := case when r.funil = 'rc' then string_to_array(r.extra, ',') else '{}'::text[] end;

    insert into public.companies (
      organization_id, trade_name, legal_name, cnpj, status, owner_id, region_id, city, state, postal_code, address, latitude, longitude,
      industry, source, potential, monthly_potential, harvesters_count, machine_models, press_type, current_brand, competitor, urgency, notes, created_by, created_at
    ) values (
      v_org, r.nome, r.nome || ' S.A.', r.cnpj, 'active', v_owner,
      (select id from public.regions where organization_id = v_org and r.uf = any(states) and is_active limit 1),
      r.cidade, r.uf, r.cep, 'Rodovia de acesso à usina, km ' || (4 + r.idx) || ' — Zona Rural', r.lat, r.lng,
      r.ramo, (array['Visita de prospecção', 'Indicação de cliente', 'Feira / evento', 'WhatsApp'])[1 + r.idx % 4],
      r.potencial::public.level_3, r.mensal, r.colhedoras, r.modelos, r.prensa::public.press_type, r.marca, r.concorrente, r.urgencia::public.level_3,
      'Safra de abril a novembro. Compra de reposição concentrada na entressafra.', v_admin, now() - make_interval(days => 230)
    ) returning id into v_company;

    -- Contatos: quem decide, quem avalia e, em metade das contas, quem compra. Telefones fictícios (9 0000-xxxx).
    insert into public.contacts (organization_id, company_id, name, job_title, role, influence, whatsapp_e164, email, preferred_channel, contact_allowed, relationship_owner_id, is_active, created_by)
    values (v_org, v_company, decisores[1 + r.idx % 8], 'Gerente industrial', 'decision_maker', 3, '55' || v_ddd || '9' || lpad((r.idx * 100 + 1)::text, 8, '0'),
            'gerencia' || r.idx || '@cliente-demo.example', 'whatsapp', true, v_owner, true, v_admin)
    returning id into v_contact;
    insert into public.contacts (organization_id, company_id, name, job_title, role, influence, whatsapp_e164, preferred_channel, contact_allowed, relationship_owner_id, is_active, created_by)
    values (v_org, v_company, tecnicos[1 + r.idx % 7], 'Supervisor de manutenção', 'technical', 2, '55' || v_ddd || '9' || lpad((r.idx * 100 + 2)::text, 8, '0'), 'whatsapp', true, v_owner, true, v_admin);
    if r.idx % 2 = 0 then
      insert into public.contacts (organization_id, company_id, name, job_title, role, influence, whatsapp_e164, email, preferred_channel, contact_allowed, relationship_owner_id, is_active, created_by)
      values (v_org, v_company, compras[1 + r.idx % 5], 'Analista de compras', 'buyer', 2, '55' || v_ddd || '9' || lpad((r.idx * 100 + 3)::text, 8, '0'),
              'compras' || r.idx || '@cliente-demo.example', 'email', true, v_owner, true, v_admin);
    end if;

    -- Negócio de aquisição: percorre as etapas no passado, para o histórico e o tempo médio por etapa fazerem sentido.
    v_pos := case when r.funil = 'rc' then 9 else array_position(aq, r.etapa) end;
    v_days := case when r.funil = 'rc' then split_part(v_sales[1], ':', 1)::integer + 12 else r.dias end;
    v_total := v_days;
    for j in 1 .. v_pos - 1 loop v_total := v_total + 6 + (r.idx + j * 3) % 8; end loop;
    v_t := now() - make_interval(days => v_total);
    insert into public.opportunities (organization_id, company_id, owner_id, funnel_id, stage_id, title, status, estimated_value, cycle, funnel_entered_at, stage_entered_at, created_by, created_at)
    values (v_org, v_company, v_owner, v_f_aq, (select id from public.stages where funnel_id = v_f_aq and key = 'lead'),
            'Prospecção — ' || r.nome, 'open', nullif(r.valor, 0), 1, v_t, v_t, v_owner, v_t)
    returning id into v_opp;
    for j in 2 .. v_pos loop
      v_t := v_t + make_interval(days => 6 + (r.idx + (j - 1) * 3) % 8);
      update public.opportunities set stage_id = (select id from public.stages where funnel_id = v_f_aq and key = aq[j]), stage_entered_at = v_t where id = v_opp;
    end loop;

    if r.funil = 'perdida' then
      v_t := now() - make_interval(days => 9 + r.idx % 5);
      update public.opportunities set status = 'lost', close_reason = r.extra, closed_at = v_t where id = v_opp;
      update public.companies set status = 'lost', loss_reason = r.extra where id = v_company;
      insert into public.interactions (organization_id, company_id, opportunity_id, channel, kind, occurred_at, author_id, actor_type, title, content)
      values (v_org, v_company, v_opp, 'system', 'loss', v_t, v_owner, 'user', 'Oportunidade perdida', 'Motivo: ' || r.extra);
    end if;

    -- Cliente: primeira venda, recompras e o negócio aberto de recorrência, um ciclo depois do outro.
    if r.funil = 'rc' then
      for k in 1 .. array_length(v_sales, 1) loop
        v_last := now() - make_interval(days => split_part(v_sales[k], ':', 1)::integer);
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
                case when k = 1 then 'Primeira venda registrada' else 'Recompra registrada' end || ' — R$ ' || to_char(v_amount, 'FM999G999G990D00'), 'Pedido confirmado pelo cliente.');
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
         set estimated_value = nullif(r.valor, 0), expected_close_date = case when r.etapa = 'previsao' then (now() + interval '24 days')::date end
       where id = v_opp;
    end if;

    -- Histórico de execução: seis atividades concluídas nas últimas semanas, quase todas no prazo, cada uma com seu registro.
    for k in 1 .. 6 loop
      v_due := pg_temp.dia_util(-(k * 6 + r.idx % 5), 9 + (r.idx + k) % 8);
      v_done := case when (r.idx * 7 + k) % 10 = 0 then v_due + interval '2 days 3 hours' else v_due + make_interval(hours => 1 + (r.idx + k) % 4) end;
      continue when v_done >= now() or (r.funil = 'perdida' and k < 3);
      insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, completed_at, outcome, created_by, created_at)
      values (v_org, v_company, v_opp, tipos[1 + (r.idx + k) % 6], titulos[1 + (r.idx + k) % 6], v_owner, v_due, 'medium', 'done', 'manual', v_done, resultados[1 + (r.idx + k) % 6], v_owner, v_due - interval '4 days');
      insert into public.interactions (organization_id, company_id, opportunity_id, contact_id, channel, kind, occurred_at, author_id, actor_type, title, content)
      values (v_org, v_company, v_opp, v_contact, canais[1 + (r.idx + k) % 6], 'note', v_done, v_owner, 'user', titulos[1 + (r.idx + k) % 6], resultados[1 + (r.idx + k) % 6]);
    end loop;

    continue when r.funil = 'perdida';

    -- Próximo passo de toda conta ativa, em dia útil e horário comercial (novembro e dezembro organizados).
    select case r.etapa
             when 'lead' then 'Identificar o responsável pela manutenção agrícola' when 'qualificacao' then 'Mapear frota, prensa e fornecedor atual'
             when 'apresentacao_empresa' then 'Apresentar a Tawper para a manutenção' when 'apresentacao_tecnica' then 'Apresentação técnica na oficina'
             when 'cadastro' then 'Enviar ficha cadastral e documentos' when 'homologacao' then 'Acompanhar o kit de teste na colhedora'
             when 'aprovado' then 'Confirmar janela de compra e estoque' when 'orcamento' then 'Follow-up do orçamento enviado'
             when 'negociacao' then 'Tratar objeções e buscar a decisão' when 'posvenda' then 'Pós-venda: confirmar entrega e aplicação'
             when 'relacionamento' then 'Visita de relacionamento: mapear demanda' when 'previsao' then 'Revisar a demanda na janela prevista'
             when 'orcamento_r' then 'Follow-up do orçamento de reposição' else 'Acompanhar a decisão de recompra' end,
           case when r.etapa in ('apresentacao_empresa', 'apresentacao_tecnica', 'homologacao', 'relacionamento') then 'visit'
                when r.etapa in ('negociacao', 'negociacao_r') then 'meeting' when r.etapa in ('qualificacao', 'orcamento', 'orcamento_r') then 'whatsapp'
                when r.etapa = 'cadastro' then 'email' else 'call' end::public.activity_type
      into v_title, v_type;
    insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by)
    values (v_org, v_company, v_opp, v_type, v_title, v_owner, pg_temp.dia_util(1 + (r.idx * 3) % 13, 9 + r.idx % 8), case when r.urgencia = 'high' then 'high' else 'medium' end::public.level_3, 'pending', 'rule', v_owner);
    -- Dezembro: metade das contas já tem a visita ou reunião seguinte marcada.
    if r.idx % 2 = 0 then
      insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by)
      values (v_org, v_company, v_opp, case when r.idx % 4 = 0 then 'visit' else 'meeting' end::public.activity_type,
              case when r.idx % 4 = 0 then 'Visita de acompanhamento na entressafra' else 'Reunião de planejamento da entressafra' end,
              v_owner, pg_temp.dia_util(20 + r.idx % 12, 10 + r.idx % 6), 'medium', 'pending', 'manual', v_owner);
    end if;
    -- Hoje: algumas tarefas para o dia e uma já concluída, para o Meu dia ter movimento.
    if r.idx % 6 = 0 then
      insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by)
      values (v_org, v_company, v_opp, 'call', 'Ligar para ' || decisores[1 + r.idx % 8] || ' e confirmar a agenda', v_owner, pg_temp.dia_util(0, 14 + r.idx % 3), 'medium', 'pending', 'manual', v_owner);
    end if;
    -- Poucos atrasos, de propósito, espalhados entre pessoas diferentes: a Gestão precisa ter o que mostrar.
    if r.idx in (5, 12, 17, 21) then
      insert into public.activities (organization_id, company_id, opportunity_id, type, title, owner_id, due_at, priority, status, origin, created_by)
      values (v_org, v_company, v_opp, 'whatsapp', 'Retornar o contato pedido pelo cliente', v_owner, pg_temp.dia_util(-(1 + r.idx % 4), 10), 'medium', 'pending', 'manual', v_owner);
    end if;

    -- Orçamento feito no sistema da empresa, já enviado, para quem está em orçamento ou negociação.
    if r.etapa in ('orcamento', 'negociacao', 'orcamento_r', 'negociacao_r') then
      insert into public.quotes (organization_id, company_id, opportunity_id, number, status, payment_terms, validity_days, sent_at, expected_decision_at, author_id, sent_to_contact_id, sent_via, sent_by)
      values (v_org, v_company, v_opp, '', 'sent', '28/56 dias', case when r.idx = 17 then 21 else 30 end,
              now() - make_interval(days => least(r.dias, 18)), now() - make_interval(days => least(r.dias, 18)) + interval '5 days', v_owner, v_contact, 'manual', v_owner)
      returning id into v_quote;
      insert into public.quote_items (organization_id, quote_id, sku, description, unit, quantity, unit_price, position, mode)
      values (v_org, v_quote, lpad((4500 + r.idx * 7)::text, 6, '0'), 'Orçamento nº ' || lpad((4500 + r.idx * 7)::text, 6, '0') || ' (sistema da empresa)', 'un', 1, r.valor, 0, 'sale');
    end if;

    -- Estratégia registrada nas contas de maior potencial.
    if r.potencial = 'high' then
      perform public.crm_save_strategy(
        v_company,
        case when r.funil = 'rc' then 'Aumentar a participação da Tawper na reposição da entressafra' else 'Fechar a primeira venda de mangueiras até o início da safra' end,
        r.colhedoras || ' colhedoras (' || r.modelos || '). Fornecedor atual: ' || r.marca || '. A manutenção reclama de prazo de entrega na safra.',
        case when r.funil = 'rc' then 'Compra dividida com ' || r.concorrente else 'Relacionamento antigo com ' || r.concorrente end,
        case when r.funil = 'rc' then 'Levantar a demanda completa das colhedoras e propor contrato de fornecimento para a entressafra.' else 'Homologar um kit de teste e entrar pela manutenção, com prensa em comodato como diferencial.' end,
        'Pedido de R$ ' || to_char(r.mensal * 1.5, 'FM999G999G990') || ' na próxima janela de compra',
        'manual', now() + make_interval(days => 14 + r.idx), v_owner);
      perform app.crm_begin(v_admin, 'user');
    end if;
  end loop;

  -- Uma conta em espera, com motivo, condição e data de reavaliação (não é etapa de funil).
  perform public.crm_set_standby(
    (select id from public.companies where organization_id = v_org and trade_name = 'Grupo Agro São Miguel'),
    'Orçamento anual ainda não liberado', 'Liberação do orçamento de manutenção de 2027',
    (select owner_id from public.companies where organization_id = v_org and trade_name = 'Grupo Agro São Miguel'),
    pg_temp.dia_util(18, 10), v_admin);
end $$;

-- Conferência: o que ficou no banco.
select 'clientes' as item, count(*)::text as valor from public.companies where organization_id = '00000000-0000-4000-8000-000000000001'
union all select 'clientes sem contato', count(*)::text from public.companies c where c.organization_id = '00000000-0000-4000-8000-000000000001' and not exists (select 1 from public.contacts k where k.company_id = c.id)
union all select 'clientes sem cidade, UF ou coordenada', count(*)::text from public.companies where organization_id = '00000000-0000-4000-8000-000000000001' and (city is null or state is null or latitude is null or longitude is null)
union all select 'tarefas pendentes duplicadas', count(*)::text from (select 1 from public.activities where organization_id = '00000000-0000-4000-8000-000000000001' and status = 'pending' group by company_id, title, (due_at at time zone 'America/Sao_Paulo')::date having count(*) > 1) d
union all select 'tarefas atrasadas', count(*)::text from public.activities where organization_id = '00000000-0000-4000-8000-000000000001' and status = 'pending' and due_at < date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
union all select 'tarefas pendentes fora do horário (8h-18h) ou em fim de semana', count(*)::text from public.activities where organization_id = '00000000-0000-4000-8000-000000000001' and status = 'pending' and (extract(dow from due_at at time zone 'America/Sao_Paulo') in (0, 6) or extract(hour from due_at at time zone 'America/Sao_Paulo') not between 8 and 17)
union all select 'contas ativas sem próximo passo', count(*)::text from public.companies c where c.organization_id = '00000000-0000-4000-8000-000000000001' and c.status = 'active' and not exists (select 1 from public.activities a where a.company_id = c.id and a.status = 'pending')
union all select 'atividades concluídas (no prazo / total)', count(*) filter (where completed_at::date <= due_at::date)::text || ' / ' || count(*)::text from public.activities where organization_id = '00000000-0000-4000-8000-000000000001' and status = 'done'
union all select 'vendas (quantidade / valor)', count(*)::text || ' / R$ ' || to_char(coalesce(sum(amount), 0), 'FM999G999G990') from public.sales where organization_id = '00000000-0000-4000-8000-000000000001'
union all select 'negócios abertos', count(*)::text from public.opportunities where organization_id = '00000000-0000-4000-8000-000000000001' and status = 'open';

commit;
