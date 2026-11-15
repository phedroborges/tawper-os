-- =============================================================================
-- Tawper OS — 0024 — Remoção definitiva do catálogo interno de produtos/preços
-- e registro oficial do portfólio e modalidades na base de conhecimento da IA.
-- Preços, quantidades e SKUs existem apenas nos PDFs gerados no ERP externo.
-- =============================================================================

-- 1. Remove vínculo de catálogo nos itens de orçamento e apaga tabelas de catálogo
alter table if exists public.quote_items
  drop constraint if exists quote_items_organization_id_product_id_fkey;

alter table if exists public.quote_items
  drop column if exists product_id;

drop table if exists public.product_components cascade;
drop table if exists public.products cascade;

-- 2. Base de conhecimento oficial da Tawper para IA (sem preços, quantidades ou SKUs)
insert into public.ai_knowledge_documents (
  organization_id,
  company_id,
  source_type,
  source_id,
  title,
  source_updated_at,
  metadata,
  content_hash,
  status
)
values (
  '00000000-0000-4000-8000-000000000001',
  null,
  'tawper_portfolio',
  'portfolio-modalidades-v1',
  'Portfólio Técnico Tawper e Modalidades Comerciais (Sem Preços)',
  now(),
  '{"category": "portfolio", "no_prices": true}'::jsonb,
  md5('portfolio-modalidades-v1-no-prices'),
  'indexed'
)
on conflict (organization_id, source_type, source_id) do update
  set title = excluded.title,
      source_updated_at = excluded.source_updated_at,
      metadata = excluded.metadata,
      content_hash = excluded.content_hash,
      status = 'indexed';

with doc as (
  select id, organization_id
    from public.ai_knowledge_documents
   where organization_id = '00000000-0000-4000-8000-000000000001'
     and source_type = 'tawper_portfolio'
     and source_id = 'portfolio-modalidades-v1'
   limit 1
)
insert into public.ai_knowledge_chunks (
  organization_id,
  document_id,
  company_id,
  chunk_index,
  content,
  metadata,
  embedding_model
)
select
  doc.organization_id,
  doc.id,
  null,
  v.idx,
  v.content,
  v.meta,
  'lexical-seed'
from doc
cross join (
  values
    (
      0,
      'PORTFÓLIO DE PRODUTOS TAWPER (SEM PREÇO E SEM QUANTIDADE NO CRM): A Tawper é especialista em sistemas hidráulicos de alta confiabilidade para usinas sucroenergéticas, colhedoras de cana e operações agrícolas/industriais pesadas. Linhas fornecidas: (1) Mangueiras hidráulicas de tecnologia europeia certificadas (ISO, MSHA, CCS), incluindo 2 tramas (SAE 100 R2AT), 4 espirais de alta pressão (4SH) e linhas super pesadas (R13) para corte de base, elevador e picador; (2) Terminais prensáveis, flanges SAE código 62 e adaptadores (JIC 37°, ORFS, BSP); (3) Capas protetoras espirais contra abrasão; (4) Kits completos de mangueiras pré-especificados por modelo de colhedora (John Deere CH570, CH950, Case A8800, A9000 e frotas equivalentes); (5) Prensas hidráulicas com controle de final de curso para oficina; (6) Sistema de identificação por cores para evitar erro de montagem; (7) Tecnologia HydraSense de rastreabilidade por peça em campo; (8) Treinamento técnico presencial Tawper Academy para mecânicos.',
      '{"section": "produtos_e_tecnologia", "no_prices": true}'::jsonb
    ),
    (
      1,
      'MODALIDADES COMERCIAIS TAWPER E POLÍTICA DE ORÇAMENTOS: A Tawper comercializa suas soluções em quatro frentes sem tabela de preço fixa no CRM: (1) Venda direta — fornecimento programado ou sob demanda de mangueiras, terminais, conexões, capas e kits prontos conforme diagnóstico da frota; (2) Comodato de prensa e padronização — cessão de prensa hidráulica e implantação de oficina na usina atrelada a contrato de fornecimento contínuo de mangueiras e terminais; (3) Locação mensal — disponibilização de equipamento mediante mensalidade contratual; (4) Serviços inclusos/cortesia contratual — mapeamento técnico de frota, padronização visual por cores e capacitação prática Tawper Academy. IMPORTANTE: preços unitários, quantidades, descontos e cotações detalhadas são emitidos exclusivamente no ERP externo da Tawper e anexados em PDF às propostas e negociações no CRM.',
      '{"section": "modalidades_e_erp", "no_prices": true}'::jsonb
    )
) as v(idx, content, meta)
on conflict (document_id, chunk_index) do update
  set content = excluded.content,
      metadata = excluded.metadata,
      embedding_model = excluded.embedding_model;
