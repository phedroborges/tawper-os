begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public', 'ai_model_policies', 'políticas de modelo existem');
select has_table('public', 'ai_memories', 'memória de agentes existe');
select has_table('public', 'ai_knowledge_chunks', 'chunks de conhecimento existem');
select has_function('public', 'search_ai_knowledge', array['uuid', 'text', 'extensions.vector', 'uuid', 'integer'], 'busca híbrida existe');
select is((select count(*) from public.ai_model_policies), 14::bigint, 'todos os 14 agentes têm política');
select is((select count(*) from public.ai_model_policies where enabled), 0::bigint, 'políticas começam desligadas');
select ok(not has_function_privilege('authenticated', 'app.claim_ai_outbox(text)', 'EXECUTE'), 'usuário autenticado não consome a fila');

create temporary table ai_validation_event (id uuid primary key);
with inserted as (
  insert into public.outbox_events
    (organization_id, aggregate_type, aggregate_id, event_type, idempotency_key, max_attempts)
  select id, 'test', gen_random_uuid(), 'automation.forms.send', 'pgtap-ai-retry', 2
    from public.organizations limit 1
  returning id
)
insert into ai_validation_event select id from inserted;

select is((select status::text from app.claim_ai_outbox('pgtap-worker-1')), 'processing', 'claim coloca o evento em processamento');
select is((select status::text from app.finish_ai_outbox((select id from ai_validation_event), false, 'falha temporária')), 'failed', 'falha agenda retentativa');
update public.outbox_events set next_attempt_at = now() where id = (select id from ai_validation_event);
select is((select attempts from app.claim_ai_outbox('pgtap-worker-2')), 2, 'segunda tentativa é contabilizada');
select is((select status::text from app.finish_ai_outbox((select id from ai_validation_event), false, 'falha final')), 'dead', 'tentativas esgotadas vão para dead-letter');

create temporary table ai_validation_document (id uuid primary key);
with inserted as (
  insert into public.ai_knowledge_documents
    (organization_id, source_type, source_id, title, content_hash, status)
  select id, 'validation', 'pgtap-doc', 'Manual', 'pgtap-hash', 'indexed'
    from public.organizations limit 1
  returning id
)
insert into ai_validation_document select id from inserted;
insert into public.ai_knowledge_chunks
  (organization_id, document_id, chunk_index, content, embedding_model, embedding)
select o.id, d.id, 0, 'A mangueira azul suporta alta pressão.', 'validation', array_fill(0::real, array[1536])::extensions.vector
  from public.organizations o cross join ai_validation_document d limit 1;
select ok(exists (
  select 1 from public.search_ai_knowledge(
    (select id from public.organizations limit 1),
    'mangueira azul',
    array_fill(0::real, array[1536])::extensions.vector,
    null,
    8
  )
), 'busca híbrida encontra conteúdo lexical');

set local role authenticated;
select is((select count(*) from public.ai_model_policies), 0::bigint, 'RLS esconde políticas sem associação');
select is((select count(*) from public.ai_knowledge_chunks), 0::bigint, 'RLS esconde conhecimento sem associação');
reset role;

select * from finish();
rollback;
