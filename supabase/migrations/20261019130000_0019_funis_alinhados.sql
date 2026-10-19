-- =============================================================================
-- Tawper OS — 0019 — Funis do banco alinhados aos funis do app
-- Gerada por web/scripts/gen-funil-sql.mjs a partir de web/src/lib/constants.ts.
-- Etapas, probabilidades, prazos, critérios de saída e tarefas das etapas passam a ser
-- exatamente os que a tela mostra; o banco aplica essas regras ao mudar de etapa.
-- Negócios em etapas que deixam de existir são movidos para a etapa equivalente.
-- =============================================================================

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001';
  v_f   uuid;
  v_s   uuid;
  v_old uuid;
begin
  perform set_config('app.bypass_stage_rules', 'on', true);
  perform set_config('app.admin_correction', 'on', true);

  -- ---------------------------------------------------------------- aquisicao
  select id into v_f from public.funnels where organization_id = v_org and key = 'aquisicao';

  -- Lead desconhecido
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'lead', 'Lead desconhecido', 'Lead', 'Identificar empresa, aderência e caminho de entrada.', 1001, 14, 5, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'lead';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'cidade', 'Cidade e estado', 'field', 'city', null, 1);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'regiao', 'Região', 'field', 'region_id', null, 2);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'ramo', 'Ramo de atividade', 'field', 'industry', null, 3);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'contato', 'Pelo menos um contato', 'contact', null, null, 4);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Identificar responsável pela manutenção agrícola', 'call', 2, 'medium', false, 1);

  -- Qualificação
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'qualificacao', 'Qualificação', 'Qualif.', 'Conhecer operação, potencial e interlocutores.', 1002, 21, 10, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'qualificacao';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'colhedoras', 'Número de colhedoras', 'field', 'harvesters_count', null, 1);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'prensa', 'Tipo de prensa', 'field', 'press_type', null, 2);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'marca_atual', 'Marca / fornecedor atual', 'field', 'current_brand', null, 3);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'potencial', 'Potencial estimado', 'field', 'potential', null, 4);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Mapear frota, prensa e fornecedor atual', 'whatsapp', 3, 'medium', false, 1);

  -- Apresentação
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'apresentacao', 'Apresentação', 'Apres.', 'Apresentar a Tawper e avançar para o interesse técnico.', 1003, 21, 20, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'apresentacao';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'apresentacao_realizada', 'Apresentação institucional/técnica realizada', 'check', null, null, 1);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'interesse_tecnico', 'Interlocutor confirmou interesse técnico', 'check', null, null, 2);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Agendar apresentação da Tawper com a manutenção', 'visit', 5, 'medium', false, 1);

  -- Cadastro
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'cadastro', 'Cadastro', 'Cadastro', 'Concluir documentação para habilitar a relação comercial.', 1004, 20, 30, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'cadastro';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'documentacao_enviada', 'Documentação cadastral enviada', 'check', null, null, 1);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'cadastro_aprovado', 'Cadastro aprovado pelo cliente', 'check', null, null, 2);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Enviar ficha cadastral e documentos da Tawper', 'email', 2, 'medium', false, 1);

  -- Homologação
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'homologacao', 'Homologação', 'Homol.', 'Identificar itens, enviar material, acompanhar teste e formalizar aprovação.', 1005, 45, 45, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'homologacao';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'medidas', 'Medidas e produtos identificados', 'check', null, null, 1);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'teste_instalado', 'Material de teste enviado ou instalado', 'check', null, null, 2);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'aprovacao_tecnica', 'Aprovação técnica registrada', 'check', null, 'de preferência com evidência', 3);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Levantar medidas das mangueiras nas colhedoras', 'visit', 4, 'medium', false, 1);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Preparar kit de teste', 'homologation', 8, 'medium', false, 2);

  -- Produto aprovado
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'aprovado', 'Produto aprovado', 'Aprovado', 'Converter a aprovação técnica em uma demanda concreta.', 1006, 30, 60, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'aprovado';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'solicitacao_orcamento', 'Solicitação de orçamento recebida', 'check', null, null, 1);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Confirmar janela de compra e estoque atual', 'call', 3, 'medium', false, 1);

  -- Orçamento
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'orcamento', 'Orçamento', 'Orçam.', 'Enviar proposta e controlar validade, valor e decisão.', 1007, 10, 70, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'orcamento';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'orcamento_enviado', 'Orçamento enviado ao cliente', 'quote', null, null, 1);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Montar e enviar orçamento', 'quote', 1, 'medium', false, 1);

  -- Negociação
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'negociacao', 'Negociação', 'Negoc.', 'Tratar objeções e obter uma decisão explícita.', 1008, 15, 80, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'negociacao';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Tratar objeções e buscar decisão', 'meeting', 3, 'medium', false, 1);

  -- Primeira venda
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'ganho', 'Primeira venda', 'Ganho', 'Registrar o resultado e iniciar a jornada de recorrência.', 1009, 0, 100, true, 'won')
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'ganho';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;

  select id into v_old from public.stages where funnel_id = v_f and key = 'apresentacao_empresa';
  if v_old is not null then
    select id into v_s from public.stages where funnel_id = v_f and key = 'apresentacao';
    update public.opportunities set stage_id = v_s where stage_id = v_old;
    update public.opportunity_stage_history set stage_id = v_s where stage_id = v_old;
    update public.activity_results set suggested_stage_id = v_s where suggested_stage_id = v_old;
    delete from public.stages where id = v_old;
  end if;

  select id into v_old from public.stages where funnel_id = v_f and key = 'apresentacao_tecnica';
  if v_old is not null then
    select id into v_s from public.stages where funnel_id = v_f and key = 'apresentacao';
    update public.opportunities set stage_id = v_s where stage_id = v_old;
    update public.opportunity_stage_history set stage_id = v_s where stage_id = v_old;
    update public.activity_results set suggested_stage_id = v_s where suggested_stage_id = v_old;
    delete from public.stages where id = v_old;
  end if;

  -- renumera na ordem do app (a unicidade de posição é verificada só no fim)
  update public.stages set position = position - 1000 where funnel_id = v_f and position > 1000;
  delete from public.stages where funnel_id = v_f and key <> all (array['lead', 'qualificacao', 'apresentacao', 'cadastro', 'homologacao', 'aprovado', 'orcamento', 'negociacao', 'ganho']);

  -- ---------------------------------------------------------------- recorrencia
  select id into v_f from public.funnels where organization_id = v_org and key = 'recorrencia';

  -- Pós-venda
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'posvenda', 'Pós-venda', 'Pós-venda', 'Confirmar entrega, aplicação e satisfação.', 1001, 10, 20, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'posvenda';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'entrega_confirmada', 'Entrega e aplicação confirmadas', 'check', null, null, 1);
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'feedback', 'Feedback do cliente coletado', 'check', null, null, 2);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Pós-venda: confirmar entrega e aplicação', 'call', 5, 'medium', false, 1);

  -- Suporte
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'suporte', 'Suporte', 'Suporte', 'Resolver dúvidas e chamados sem consumir o vendedor.', 1002, 7, 20, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'suporte';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'suporte_resolvido', 'Chamado técnico resolvido', 'check', null, null, 1);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Resolver chamado técnico', 'support', 1, 'medium', false, 1);

  -- Relacionamento
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'relacionamento', 'Relacionamento', 'Relac.', 'Manter presença e mapear estoque, safra, reforma e expansão.', 1003, 45, 30, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'relacionamento';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'demanda_mapeada', 'Estoque, safra e reforma mapeados', 'check', null, null, 1);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Visita de relacionamento — mapear demanda', 'visit', 14, 'medium', false, 1);

  -- Previsão de compra
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'previsao', 'Previsão de compra', 'Previsão', 'Registrar a janela esperada e evitar cobrança fora de hora.', 1004, 60, 45, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'previsao';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'demanda_confirmada', 'Nova demanda confirmada pelo cliente', 'check', null, null, 1);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Revisar demanda na janela prevista', 'call', 20, 'medium', false, 1);

  -- Novo orçamento
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'orcamento_r', 'Novo orçamento', 'Orçam.', 'Transformar a necessidade em proposta.', 1005, 10, 70, false, null)
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'orcamento_r';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;
  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, 'orcamento_enviado', 'Orçamento enviado ao cliente', 'quote', null, null, 1);
  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, 'Montar e enviar orçamento de reposição', 'quote', 1, 'medium', false, 1);

  -- Recompra
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, 'recompra', 'Recompra', 'Recompra', 'Registrar o ganho e reiniciar o ciclo.', 1006, 0, 100, true, 'won')
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = 'recompra';
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;

  select id into v_old from public.stages where funnel_id = v_f and key = 'negociacao_r';
  if v_old is not null then
    select id into v_s from public.stages where funnel_id = v_f and key = 'orcamento_r';
    update public.opportunities set stage_id = v_s where stage_id = v_old;
    update public.opportunity_stage_history set stage_id = v_s where stage_id = v_old;
    update public.activity_results set suggested_stage_id = v_s where suggested_stage_id = v_old;
    delete from public.stages where id = v_old;
  end if;

  -- renumera na ordem do app (a unicidade de posição é verificada só no fim)
  update public.stages set position = position - 1000 where funnel_id = v_f and position > 1000;
  delete from public.stages where funnel_id = v_f and key <> all (array['posvenda', 'suporte', 'relacionamento', 'previsao', 'orcamento_r', 'recompra']);

  perform set_config('app.bypass_stage_rules', '', true);
  perform set_config('app.admin_correction', '', true);
end $$;

