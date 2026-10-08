-- =============================================================================
-- Tawper OS — 0009 — Configuração inicial (sem dados fictícios)
-- Cria somente a organização e a configuração de produto definida na
-- especificação funcional (seção 6: funis, etapas e critérios) e as listas
-- de opções que o administrador pode editar.
--
-- NÃO cria usuários, empresas, contatos, oportunidades, conversas ou vendas.
-- Usuários entram pelo Supabase Auth; o restante vem da operação e da
-- importação validada (Fase 6).
--
-- Valores marcados como "provisório" dependem de decisões pendentes da Fase 0
-- (prazos por etapa, campos obrigatórios) e são editáveis em stages /
-- stage_requirements sem alterar código.
-- =============================================================================

-- Insere uma tarefa de etapa apenas se ainda não existir (seed idempotente).
create or replace function app.seed_stage_task(
  p_org uuid, p_stage uuid, p_title text, p_type public.activity_type, p_days integer, p_position integer, p_priority public.level_3 default 'medium'
) returns void language plpgsql as $$
begin
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, position)
  select p_org, p_stage, p_title, p_type, p_days, p_priority, p_position
   where not exists (select 1 from public.stage_task_templates t where t.stage_id = p_stage and t.title = p_title);
end $$;

-- Cria (ou localiza) uma etapa e devolve o id.
create or replace function app.seed_stage(
  p_org uuid, p_funnel uuid, p_key text, p_name text, p_short text, p_objective text,
  p_position integer, p_sla integer, p_probability integer,
  p_terminal boolean default false, p_outcome public.opportunity_status default null
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (p_org, p_funnel, p_key, p_name, p_short, p_objective, p_position, p_sla, p_probability, p_terminal, p_outcome)
  on conflict (funnel_id, key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.stages where funnel_id = p_funnel and key = p_key;
  end if;
  return v_id;
end $$;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_aq    uuid;
  v_rec   uuid;
  v_stage uuid;
begin
  -- ---------------------------------------------------------------------------
  -- Organização
  -- ---------------------------------------------------------------------------
  insert into public.organizations (id, name, slug, code_prefix)
  values (v_org, 'Tawper Mangueiras e Conexões', 'tawper', 'TW')
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------------
  -- Regiões comerciais usadas na operação (carteira, filtros e rotas).
  -- Cadastro estrutural; a atribuição de vendedor × região fica para o Auth.
  -- ---------------------------------------------------------------------------
  insert into public.regions (organization_id, name, states) values
    (v_org, 'Noroeste Paulista', array['SP']::char(2)[]),
    (v_org, 'Norte Paulista',    array['SP']::char(2)[]),
    (v_org, 'Oeste Paulista',    array['SP']::char(2)[]),
    (v_org, 'Paranapanema',      array['SP']::char(2)[]),
    (v_org, 'Triângulo Mineiro', array['MG']::char(2)[]),
    (v_org, 'Goiás',             array['GO']::char(2)[]),
    (v_org, 'Mato Grosso do Sul', array['MS']::char(2)[])
  on conflict (organization_id, name) do nothing;

  -- ---------------------------------------------------------------------------
  -- Funis
  -- ---------------------------------------------------------------------------
  insert into public.funnels (organization_id, key, name, subtitle, position)
  values (v_org, 'aquisicao', 'Aquisição', 'Prospecção até a primeira venda', 1)
  on conflict (organization_id, key) do nothing;
  select id into v_aq from public.funnels where organization_id = v_org and key = 'aquisicao';

  insert into public.funnels (organization_id, key, name, subtitle, position)
  values (v_org, 'recorrencia', 'Recorrência', 'Pós-venda, relacionamento e recompra', 2)
  on conflict (organization_id, key) do nothing;
  select id into v_rec from public.funnels where organization_id = v_org and key = 'recorrencia';

  -- ---------------------------------------------------------------------------
  -- Funil de aquisição (especificação 6.1). Prazos (sla_days) provisórios.
  -- ---------------------------------------------------------------------------
  -- Etapa 1 — Lead desconhecido
  v_stage := app.seed_stage(v_org, v_aq, 'lead', 'Lead desconhecido', 'Lead', 'Entender se a empresa tem aderência.', 1, 14, 5);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, position) values
    (v_org, v_stage, 'city',     'Cidade e estado',             'field',   'city',      1),
    (v_org, v_stage, 'region',   'Região',                      'field',   'region_id', 2),
    (v_org, v_stage, 'industry', 'Ramo de atividade',           'field',   'industry',  3),
    (v_org, v_stage, 'contact',  'Pelo menos um contato ativo', 'contact', null,        4)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Identificar responsável pela manutenção agrícola', 'call', 2, 1);

  -- Etapa 2 — Qualificação
  v_stage := app.seed_stage(v_org, v_aq, 'qualificacao', 'Qualificação', 'Qualif.', 'Conhecer operação, potencial e interlocutores.', 2, 21, 10);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, position) values
    (v_org, v_stage, 'harvesters',    'Número de máquinas ou colhedoras', 'field', 'harvesters_count', 1),
    (v_org, v_stage, 'press_type',    'Tipo de prensa',                   'field', 'press_type',       2),
    (v_org, v_stage, 'current_brand', 'Marca / fornecedor atual',         'field', 'current_brand',    3),
    (v_org, v_stage, 'potential',     'Potencial e necessidade',          'field', 'potential',        4)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Mapear frota, prensa e fornecedor atual', 'whatsapp', 3, 1);

  -- Etapa 3 — Apresentação da empresa
  v_stage := app.seed_stage(v_org, v_aq, 'apresentacao_empresa', 'Apresentação da empresa', 'Apres. emp.', 'Apresentar a Tawper e validar interesse institucional.', 3, 21, 20);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'presentation_done',  'Apresentação realizada ou enviada',                              'check', 1),
    (v_org, v_stage, 'interest_confirmed', 'Interlocutor confirmou interesse em conhecer a solução técnica', 'check', 2)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Agendar apresentação da Tawper com a manutenção', 'visit', 5, 1);

  -- Etapa 4 — Apresentação técnica
  v_stage := app.seed_stage(v_org, v_aq, 'apresentacao_tecnica', 'Apresentação técnica', 'Apres. téc.', 'Apresentar produtos, diferenciais e aplicação.', 4, 21, 25);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'technical_need', 'Necessidade técnica identificada',                            'check', 1),
    (v_org, v_stage, 'path_defined',   'Caminho definido: cadastro, homologação ou orçamento direto', 'check', 2)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Apresentar produtos e aplicação para a equipe técnica', 'meeting', 5, 1);

  -- Etapa 5 — Cadastro
  v_stage := app.seed_stage(v_org, v_aq, 'cadastro', 'Cadastro', 'Cadastro', 'Cadastrar a Tawper no cliente e/ou o cliente nos sistemas internos.', 5, 20, 30);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'docs_sent',             'Documentação enviada',                      'check', 1),
    (v_org, v_stage, 'registration_approved', 'Retorno ou aprovação cadastral registrado', 'check', 2)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Enviar ficha cadastral e documentos da Tawper', 'email', 2, 1);

  -- Etapa 6 — Homologação
  v_stage := app.seed_stage(v_org, v_aq, 'homologacao', 'Homologação', 'Homol.', 'Testar e aprovar tecnicamente o produto.', 6, 45, 45);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, hint, position) values
    (v_org, v_stage, 'measurements',       'Medidas e produtos identificados',              'check', null, 1),
    (v_org, v_stage, 'kit_prepared',       'Material de teste preparado',                   'check', null, 2),
    (v_org, v_stage, 'test_installed',     'Material de teste enviado ou instalado',        'check', null, 3),
    (v_org, v_stage, 'test_followed',      'Acompanhamento do teste realizado',             'check', null, 4),
    (v_org, v_stage, 'test_result',        'Resultado do teste coletado',                   'check', null, 5),
    (v_org, v_stage, 'technical_approval', 'Aprovação técnica registrada',                  'check', 'Preferencialmente com evidência anexada', 6)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Levantar medidas das mangueiras nas colhedoras', 'visit', 4, 1);
  perform app.seed_stage_task(v_org, v_stage, 'Preparar kit de teste', 'homologation', 8, 2);

  -- Etapa 7 — Produto aprovado aguardando primeira venda
  v_stage := app.seed_stage(v_org, v_aq, 'aprovado', 'Produto aprovado', 'Aprovado', 'Transformar aprovação técnica em cotação real.', 7, 30, 60);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'quote_requested', 'Solicitação de orçamento recebida ou oportunidade comercial criada', 'check', 1)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Confirmar janela de compra e estoque atual', 'call', 3, 1);

  -- Etapa 8 — Orçamento
  v_stage := app.seed_stage(v_org, v_aq, 'orcamento', 'Orçamento', 'Orçam.', 'Enviar e acompanhar a proposta.', 8, 10, 70);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'quote_sent', 'Orçamento enviado ao cliente', 'quote', 1)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Montar e enviar orçamento', 'quote', 1, 1);

  -- Etapa 9 — Negociação
  v_stage := app.seed_stage(v_org, v_aq, 'negociacao', 'Negociação', 'Negoc.', 'Resolver objeções comerciais e fechar a primeira venda.', 9, 15, 80);
  perform app.seed_stage_task(v_org, v_stage, 'Tratar objeções e buscar decisão', 'meeting', 3, 1);

  -- Etapa 10 — Ganho (terminal)
  perform app.seed_stage(v_org, v_aq, 'ganho', 'Primeira venda', 'Ganho', 'Registrar valor e data, criar pós-venda e mover a conta para recorrência.', 10, 0, 100, true, 'won');

  -- ---------------------------------------------------------------------------
  -- Funil de recorrência (especificação 6.2)
  -- ---------------------------------------------------------------------------
  -- Etapa 1 — Pós-venda
  v_stage := app.seed_stage(v_org, v_rec, 'posvenda', 'Pós-venda', 'Pós-venda', 'Confirmar recebimento e aplicação, coletar feedback e prever recompra.', 1, 10, 20);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'delivery_confirmed',  'Recebimento e aplicação confirmados', 'check', 1),
    (v_org, v_stage, 'feedback_collected',  'Feedback do cliente coletado',        'check', 2),
    (v_org, v_stage, 'repurchase_forecast', 'Previsão de recompra definida',       'check', 3)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Pós-venda: confirmar entrega e aplicação', 'call', 5, 1, 'high');

  -- Etapa 2 — Relacionamento
  v_stage := app.seed_stage(v_org, v_rec, 'relacionamento', 'Relacionamento', 'Relac.', 'Manter contato, mapear estoque, safra, reforma e demanda; planejar visita.', 2, 45, 30);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'demand_mapped', 'Estoque, safra e reforma mapeados', 'check', 1)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Visita de relacionamento — mapear demanda', 'visit', 14, 1);

  -- Etapa 3 — Previsão de nova compra
  v_stage := app.seed_stage(v_org, v_rec, 'previsao', 'Previsão de nova compra', 'Previsão', 'Registrar o período esperado e evitar cobrança antes da janela comercial.', 3, 60, 45);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'demand_confirmed', 'Nova demanda confirmada pelo cliente', 'check', 1)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Revisar demanda na janela prevista', 'call', 20, 1);

  -- Etapa 4 — Novo orçamento
  v_stage := app.seed_stage(v_org, v_rec, 'orcamento_r', 'Novo orçamento', 'Orçam.', 'Registrar nova demanda e valor; acompanhar prazo.', 4, 10, 70);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, position) values
    (v_org, v_stage, 'quote_sent', 'Orçamento enviado ao cliente', 'quote', 1)
  on conflict (stage_id, key) do nothing;
  perform app.seed_stage_task(v_org, v_stage, 'Montar e enviar orçamento de reposição', 'quote', 1, 1);

  -- Etapa 5 — Negociação recorrente
  v_stage := app.seed_stage(v_org, v_rec, 'negociacao_r', 'Negociação recorrente', 'Negoc.', 'Acompanhar decisão; registrar concorrência, objeções e condições.', 5, 15, 80);
  perform app.seed_stage_task(v_org, v_stage, 'Acompanhar decisão de recompra', 'meeting', 3, 1);

  -- Etapa 6 — Recompra ganha (terminal). Perda de recompra = status lost na oportunidade.
  perform app.seed_stage(v_org, v_rec, 'recompra', 'Recompra', 'Recompra', 'Registrar o ganho e reiniciar o ciclo de pós-venda.', 6, 0, 100, true, 'won');

  -- ---------------------------------------------------------------------------
  -- Listas de opções (editáveis pelo administrador)
  -- ---------------------------------------------------------------------------
  insert into public.reference_options (organization_id, list_key, value, label, position) values
    -- Motivos de perda (especificação 6.1 etapa 9 exige motivo; lista inicial editável)
    (v_org, 'loss_reason', 'price',               'Preço', 1),
    (v_org, 'loss_reason', 'delivery_time',       'Prazo de entrega', 2),
    (v_org, 'loss_reason', 'lost_to_competitor',  'Perdeu para concorrente', 3),
    (v_org, 'loss_reason', 'competitor_contract', 'Contrato vigente com concorrente', 4),
    (v_org, 'loss_reason', 'failed_homologation', 'Reprovado na homologação', 5),
    (v_org, 'loss_reason', 'no_fit',              'Sem aderência / sem demanda', 6),
    (v_org, 'loss_reason', 'no_response',         'Cliente sem retorno', 7),
    -- Motivos de espera (especificação 6.3)
    (v_org, 'standby_reason', 'budget_not_released', 'Orçamento anual ainda não liberado', 1),
    (v_org, 'standby_reason', 'competitor_contract', 'Aguardando fim do contrato com concorrente', 2),
    (v_org, 'standby_reason', 'influencer_decision', 'Aguardando decisão de conta influenciadora', 3),
    (v_org, 'standby_reason', 'off_season',          'Entressafra / operação parada', 4),
    (v_org, 'standby_reason', 'contact_change',      'Troca de responsável no cliente', 5),
    -- Origem da empresa (especificação 5.1 "origem")
    (v_org, 'lead_source', 'whatsapp',      'WhatsApp', 1),
    (v_org, 'lead_source', 'referral',      'Indicação de cliente', 2),
    (v_org, 'lead_source', 'prospecting',   'Visita de prospecção', 3),
    (v_org, 'lead_source', 'event',         'Feira / evento', 4),
    (v_org, 'lead_source', 'website',       'Site', 5),
    (v_org, 'lead_source', 'moskit_import', 'Importado do Moskit', 6),
    (v_org, 'lead_source', 'spreadsheet',   'Planilha de acompanhamento', 7),
    -- Ramo de atividade (especificação 5.1 "ramo de atividade")
    (v_org, 'industry', 'sugarcane_mill',    'Usina sucroenergética', 1),
    (v_org, 'industry', 'sugarcane_group',   'Grupo sucroenergético', 2),
    (v_org, 'industry', 'cane_supplier',     'Fornecedor de cana', 3),
    (v_org, 'industry', 'ctt_service',       'Prestador de serviço (CTT)', 4),
    (v_org, 'industry', 'distillery',        'Destilaria', 5),
    (v_org, 'industry', 'reseller_workshop', 'Revenda / oficina', 6),
    -- Condições de pagamento usadas em orçamentos
    (v_org, 'payment_terms', '28d',        '28 dias', 1),
    (v_org, 'payment_terms', '28_56d',     '28/56 dias', 2),
    (v_org, 'payment_terms', '30_60_90d',  '30/60/90 dias', 3),
    (v_org, 'payment_terms', 'cash',       'À vista', 4),
    (v_org, 'payment_terms', 'boleto_21d', 'Boleto 21 dias', 5),
    -- Marcas / fornecedores atuais (especificação 5.1 e 12.3)
    (v_org, 'brand', 'parker',       'Parker', 1),
    (v_org, 'brand', 'gates',        'Gates', 2),
    (v_org, 'brand', 'manuli',       'Manuli', 3),
    (v_org, 'brand', 'continental',  'Continental', 4),
    (v_org, 'brand', 'eaton',        'Eaton', 5),
    (v_org, 'brand', 'tawper',       'Tawper', 6),
    (v_org, 'brand', 'mixed',        'Diversas / sem padrão', 7),
    -- Tipos de prensa (enum press_type; lista para rótulo na interface)
    (v_org, 'press_type', 'own',             'Própria', 1),
    (v_org, 'press_type', 'tawper_loan',     'Comodato Tawper', 2),
    (v_org, 'press_type', 'competitor_loan', 'Comodato concorrente', 3),
    (v_org, 'press_type', 'none',            'Não possui', 4)
  on conflict (organization_id, list_key, value) do nothing;
end $$;
