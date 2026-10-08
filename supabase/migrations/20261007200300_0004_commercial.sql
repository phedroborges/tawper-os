-- =============================================================================
-- Tawper OS — 0004 — Comercial
-- Catálogo, orçamentos, itens e vendas.
-- Fonte: especificação 6.1 etapa 8 (campos do orçamento) e 6.1 etapa 10 (ganho).
-- Valores monetários sempre em numeric com moeda explícita (nunca float).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo de produtos e serviços
-- -----------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  sku              text not null,
  description      text not null,
  unit             text not null default 'un',
  list_price       numeric(14,2) not null default 0 check (list_price >= 0),
  currency         char(3) not null default 'BRL',
  product_line     text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, sku)
);
create index products_line_idx on public.products (organization_id, product_line) where is_active;

create trigger products_set_updated_at before update on public.products
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Orçamentos
-- -----------------------------------------------------------------------------
create table public.quotes (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  company_id            uuid not null,
  opportunity_id        uuid not null,
  number                text not null,
  status                public.quote_status not null default 'draft',
  discount_pct          numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  payment_terms         text,
  validity_days         integer not null default 15 check (validity_days > 0),
  currency              char(3) not null default 'BRL',
  gross_total           numeric(14,2) not null default 0,
  discount_total        numeric(14,2) not null default 0,
  net_total             numeric(14,2) not null default 0,
  sent_at               timestamptz,
  expected_decision_at  timestamptz,
  decided_at            timestamptz,
  pdf_path              text,
  notes                 text,
  author_id             uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, company_id)     references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade,
  constraint quotes_sent_has_date    check (status = 'draft' or sent_at is not null),
  constraint quotes_decided_has_date check (status not in ('accepted', 'rejected') or decided_at is not null)
);
comment on column public.quotes.pdf_path is 'Caminho do PDF no Storage privado.';
comment on column public.quotes.gross_total is 'Totais recalculados por trigger a partir de quote_items e discount_pct.';
create index quotes_opportunity_idx on public.quotes (opportunity_id, status);
create index quotes_company_idx     on public.quotes (company_id, status);
create index quotes_open_idx        on public.quotes (organization_id, sent_at) where status = 'sent';

create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function app.set_updated_at();

-- Número sequencial por organização e ano.
create or replace function app.tg_quote_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_seq integer;
  v_prefix text;
begin
  if new.number is null or new.number = '' then
    update public.organizations
       set quote_seq = quote_seq + 1
     where id = new.organization_id
    returning quote_seq, code_prefix into v_seq, v_prefix;
    new.number := v_prefix || '-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end $$;

create trigger quotes_number before insert on public.quotes
  for each row execute function app.tg_quote_number();

create table public.quote_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  quote_id         uuid not null,
  product_id       uuid,
  sku              text not null,
  description      text not null,
  unit             text not null default 'un',
  quantity         numeric(12,3) not null check (quantity > 0),
  unit_price       numeric(14,2) not null check (unit_price >= 0),
  line_total       numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, quote_id)   references public.quotes (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete set null
);
comment on column public.quote_items.sku is 'Cópia do SKU/descrição no momento do orçamento: mudanças no catálogo não alteram propostas já emitidas.';
create index quote_items_quote_idx on public.quote_items (quote_id, position);

create or replace function app.recalc_quote_totals(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.quotes q
     set gross_total    = t.gross,
         discount_total = round(t.gross * q.discount_pct / 100, 2),
         net_total      = t.gross - round(t.gross * q.discount_pct / 100, 2)
    from (select coalesce(sum(line_total), 0) as gross from public.quote_items where quote_id = p_quote) t
   where q.id = p_quote;
end $$;

create or replace function app.tg_quote_items_totals()
returns trigger language plpgsql as $$
begin
  perform app.recalc_quote_totals(coalesce(new.quote_id, old.quote_id));
  if tg_op = 'UPDATE' and new.quote_id <> old.quote_id then
    perform app.recalc_quote_totals(old.quote_id);
  end if;
  return null;
end $$;

create trigger quote_items_totals after insert or update or delete on public.quote_items
  for each row execute function app.tg_quote_items_totals();

create or replace function app.tg_quote_discount_totals()
returns trigger language plpgsql as $$
begin
  if new.discount_pct <> old.discount_pct then
    perform app.recalc_quote_totals(new.id);
  end if;
  return null;
end $$;

create trigger quotes_discount_totals after update of discount_pct on public.quotes
  for each row execute function app.tg_quote_discount_totals();

-- -----------------------------------------------------------------------------
-- Vendas registradas (ganho e recompra)
-- A fonte oficial de venda/faturamento é decisão pendente da Fase 0 (item 11).
-- -----------------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  company_id       uuid not null,
  opportunity_id   uuid not null,
  quote_id         uuid,
  kind             public.sale_kind not null,
  cycle            integer not null default 1 check (cycle >= 1),
  amount           numeric(14,2) not null check (amount >= 0),
  currency         char(3) not null default 'BRL',
  sold_at          timestamptz not null default now(),
  registered_by    uuid references public.profiles(id) on delete set null,
  source_system    text,
  external_ref     text,
  notes            text,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, company_id)     references public.companies (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete restrict,
  foreign key (organization_id, quote_id)       references public.quotes (organization_id, id) on delete set null,
  unique (opportunity_id)
);
comment on column public.sales.source_system is 'Sistema de origem quando a fonte oficial de faturamento for integrada (ERP).';
create index sales_company_idx on public.sales (company_id, sold_at desc);
create index sales_org_date_idx on public.sales (organization_id, sold_at desc);
