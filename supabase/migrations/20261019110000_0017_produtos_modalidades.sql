-- =============================================================================
-- Tawper OS — 0017 — Produtos completos, kits compostos e modalidades no orçamento
--  * produto: tipo (produto/equipamento/serviço/kit), unidade fechada, preço de locação,
--    modalidades permitidas e preço do kit (soma dos componentes ou fixo);
--  * kit: composto por produtos unitários (product_components);
--  * orçamento: cada linha é venda, locação (mensal) ou cortesia (comodato isento);
--    os totais de venda e de locação mensal ficam separados.
-- Dados de exemplo são fictícios e marcados nas observações para conferência.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------
alter table public.products drop constraint if exists products_kind_check;
alter table public.products
  add constraint products_kind_check check (kind in ('product', 'equipment', 'service', 'kit'));

alter table public.products
  add column if not exists rental_price   numeric(14,2) check (rental_price is null or rental_price >= 0),
  add column if not exists allowed_modes  text[] not null default array['sale']::text[],
  add column if not exists kit_price_mode text not null default 'fixed';

alter table public.products drop constraint if exists products_kit_price_mode_check;
alter table public.products
  add constraint products_kit_price_mode_check check (kit_price_mode in ('sum', 'fixed'));

alter table public.products drop constraint if exists products_allowed_modes_check;
alter table public.products
  add constraint products_allowed_modes_check
  check (cardinality(allowed_modes) >= 1 and allowed_modes <@ array['sale', 'rental', 'courtesy']::text[]);

alter table public.products drop constraint if exists products_unit_check;
alter table public.products
  add constraint products_unit_check
  check (unit in ('un', 'm', 'par', 'jogo', 'kit', 'cj', 'pç', 'h', 'dia', 'mês', 'turma', 'serv'));

comment on column public.products.rental_price   is 'Valor mensal de locação/comodato pago. Só para quem aceita a modalidade rental ou courtesy.';
comment on column public.products.allowed_modes  is 'Modalidades em que o item pode entrar num orçamento: sale (venda), rental (locação mensal), courtesy (comodato isento).';
comment on column public.products.kit_price_mode is 'sum = preço é a soma dos componentes; fixed = usa list_price.';

-- Componentes de um kit: produtos unitários e a quantidade de cada um.
create table if not exists public.product_components (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  kit_id           uuid not null,
  component_id     uuid not null,
  quantity         numeric(12,3) not null check (quantity > 0),
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, kit_id)       references public.products (organization_id, id) on delete cascade,
  foreign key (organization_id, component_id) references public.products (organization_id, id) on delete restrict,
  constraint product_components_not_self check (kit_id <> component_id),
  unique (kit_id, component_id)
);
create index if not exists product_components_kit_idx on public.product_components (kit_id, position);
create index if not exists product_components_component_idx on public.product_components (component_id);

alter table public.product_components enable row level security;
do $$ begin
  call app.policy_org_config('product_components');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Orçamento: modalidade por linha e totais separados
-- -----------------------------------------------------------------------------
alter table public.quote_items
  add column if not exists mode              text not null default 'sale',
  add column if not exists months            integer check (months is null or months >= 1),
  add column if not exists reference_price   numeric(14,2) check (reference_price is null or reference_price >= 0),
  add column if not exists courtesy_reason   text,
  add column if not exists payment_terms     text,
  add column if not exists components        jsonb;

alter table public.quote_items drop constraint if exists quote_items_mode_check;
alter table public.quote_items
  add constraint quote_items_mode_check check (mode in ('sale', 'rental', 'courtesy'));

comment on column public.quote_items.mode is 'sale = venda; rental = locação mensal (unit_price é o valor por mês); courtesy = comodato isento (unit_price 0, reference_price é o valor mensal que seria cobrado).';
comment on column public.quote_items.components is 'Cópia da composição do kit no momento do orçamento (sku, descrição, unidade, quantidade).';

alter table public.quotes
  add column if not exists monthly_total numeric(14,2) not null default 0;

comment on column public.quotes.gross_total   is 'Subtotal de VENDA (linhas mode = sale), antes do desconto.';
comment on column public.quotes.monthly_total is 'Soma mensal das linhas de locação (mode = rental). Não entra no total de venda.';

create or replace function app.recalc_quote_totals(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.quotes q
     set gross_total    = t.gross,
         monthly_total  = t.monthly,
         discount_total = round(t.gross * q.discount_pct / 100, 2),
         net_total      = t.gross - round(t.gross * q.discount_pct / 100, 2)
    from (select coalesce(sum(line_total) filter (where mode = 'sale'), 0)   as gross,
                 coalesce(sum(line_total) filter (where mode = 'rental'), 0) as monthly
            from public.quote_items where quote_id = p_quote) t
   where q.id = p_quote;
end $$;

-- -----------------------------------------------------------------------------
-- Dados de exemplo (fictícios) — catálogo completo
-- -----------------------------------------------------------------------------
do $$
declare
  org constant uuid := '00000000-0000-4000-8000-000000000001';
  nota constant text := 'Dado de exemplo: conferir preço, norma e NCM antes de usar em proposta.';
begin
  -- Mangueiras
  insert into public.products (organization_id, sku, description, unit, list_price, product_line, kind, brand, size, standard, pressure_bar, ncm, notes, allowed_modes)
  values
    (org, 'MH-R2-12',  'Mangueira hidráulica 2 tramas SAE 100 R2AT 1/2"', 'm',  38.90, 'Mangueiras', 'product', 'Tawper', '1/2"', 'SAE 100 R2AT', 275, '4009.42.90', nota, array['sale']),
    (org, 'MH-R2-34',  'Mangueira hidráulica 2 tramas SAE 100 R2AT 3/4"', 'm',  54.50, 'Mangueiras', 'product', 'Tawper', '3/4"', 'SAE 100 R2AT', 215, '4009.42.90', nota, array['sale']),
    (org, 'MH-4SH-34', 'Mangueira 4 espirais 4SH 3/4" — alta pressão',    'm',  96.80, 'Mangueiras', 'product', 'Tawper', '3/4"', 'SAE 100 R4SH / EN 856 4SH', 420, '4009.42.90', nota, array['sale']),
    (org, 'MH-4SH-1',  'Mangueira 4 espirais 4SH 1"',                     'm', 128.40, 'Mangueiras', 'product', 'Tawper', '1"',   'SAE 100 R4SH / EN 856 4SH', 350, '4009.42.90', nota, array['sale']),
    (org, 'MH-R13-1',  'Mangueira R13 1" — corte de base',                'm', 162.00, 'Mangueiras', 'product', 'Tawper', '1"',   'SAE 100 R13', 350, '4009.42.90', nota, array['sale'])
  on conflict (organization_id, sku) do update set
    brand = excluded.brand, size = excluded.size, standard = excluded.standard, pressure_bar = excluded.pressure_bar,
    ncm = excluded.ncm, notes = excluded.notes, allowed_modes = excluded.allowed_modes, kind = excluded.kind, unit = excluded.unit;

  -- Terminais, adaptadores e proteção
  insert into public.products (organization_id, sku, description, unit, list_price, product_line, kind, brand, size, standard, pressure_bar, ncm, notes, allowed_modes)
  values
    (org, 'TP-JIC-12',    'Terminal prensável JIC fêmea 37° 1/2"',  'un',  21.90, 'Terminais e conexões', 'product', 'Tawper', '1/2"', 'JIC 37° (SAE J514)', 400, '7307.99.00', nota, array['sale']),
    (org, 'TP-JIC-34',    'Terminal prensável JIC fêmea 37° 3/4"',  'un',  34.50, 'Terminais e conexões', 'product', 'Tawper', '3/4"', 'JIC 37° (SAE J514)', 350, '7307.99.00', nota, array['sale']),
    (org, 'TP-ORFS-34',   'Terminal prensável ORFS fêmea 3/4"',     'un',  41.20, 'Terminais e conexões', 'product', 'Tawper', '3/4"', 'ORFS (ISO 8434-3)', 420, '7307.99.00', nota, array['sale']),
    (org, 'TP-FLG-1',     'Terminal flange SAE código 62 — 1"',     'un', 118.00, 'Terminais e conexões', 'product', 'Tawper', '1"',   'SAE J518 código 62', 420, '7307.91.00', nota, array['sale']),
    (org, 'AD-JICBSP-34', 'Adaptador JIC x BSP 3/4"',               'un',  27.60, 'Terminais e conexões', 'product', 'Tawper', '3/4"', 'JIC x BSP', 350, '7307.99.00', nota, array['sale']),
    (org, 'CP-ESP-34',    'Capa protetora espiral 3/4"',            'm',   12.40, 'Proteção',             'product', 'Tawper', '3/4"', 'Espiral de polietileno', null, '3917.39.00', nota, array['sale'])
  on conflict (organization_id, sku) do update set
    brand = excluded.brand, size = excluded.size, standard = excluded.standard, pressure_bar = excluded.pressure_bar,
    ncm = excluded.ncm, notes = excluded.notes, allowed_modes = excluded.allowed_modes, kind = excluded.kind, unit = excluded.unit;

  -- Equipamentos (venda, locação mensal ou cortesia)
  insert into public.products (organization_id, sku, description, unit, list_price, rental_price, product_line, kind, brand, size, standard, pressure_bar, compatibility, ncm, notes, allowed_modes)
  values
    (org, 'EQ-PRENSA-500', 'Prensa hidráulica de bancada para mangueiras PH-500', 'un', 38500.00, 1450.00, 'Equipamentos', 'equipment', 'Tawper', 'Até 2"', 'Crimpagem de mangueiras de 1 a 6 espirais', 700, 'Mangueiras 4SH e R13 até 2"', '8462.99.90', nota, array['sale', 'rental', 'courtesy']),
    (org, 'EQ-CORTE-300',  'Máquina de corte de mangueiras MC-300',                'un', 14900.00,  690.00, 'Equipamentos', 'equipment', 'Tawper', 'Até 2"', 'Corte por disco, 220 V trifásico', null, 'Mangueiras até 6 espirais', '8461.50.00', nota, array['sale', 'rental', 'courtesy']),
    (org, 'EQ-BANCADA-01', 'Bancada de montagem de mangueiras com suporte de moldes', 'un', 3200.00, null, 'Equipamentos', 'equipment', 'Tawper', '1,80 m', 'Aço carbono com pintura epóxi', null, 'Prensa PH-500 e máquina MC-300', '9403.20.00', nota, array['sale'])
  on conflict (organization_id, sku) do update set
    description = excluded.description, list_price = excluded.list_price, rental_price = excluded.rental_price, product_line = excluded.product_line,
    kind = excluded.kind, brand = excluded.brand, size = excluded.size, standard = excluded.standard, pressure_bar = excluded.pressure_bar,
    compatibility = excluded.compatibility, ncm = excluded.ncm, notes = excluded.notes, allowed_modes = excluded.allowed_modes, unit = excluded.unit;

  -- Serviços
  insert into public.products (organization_id, sku, description, unit, list_price, product_line, kind, brand, standard, notes, allowed_modes)
  values
    (org, 'SV-ACAD',    'Treinamento Tawper Academy — prensagem (até 8 mecânicos)', 'turma', 1800.00, 'Serviços', 'service', 'Tawper Academy', 'Carga horária de 8 h', nota, array['sale']),
    (org, 'SV-INSTAL',  'Instalação e start-up de prensa ou máquina de corte',      'dia',     950.00, 'Serviços', 'service', 'Tawper', 'Diária de técnico, deslocamento à parte', nota, array['sale']),
    (org, 'SV-MANUT',   'Manutenção preventiva de prensa hidráulica',               'h',       280.00, 'Serviços', 'service', 'Tawper', 'Hora técnica', nota, array['sale'])
  on conflict (organization_id, sku) do update set
    description = excluded.description, list_price = excluded.list_price, kind = excluded.kind, brand = excluded.brand, standard = excluded.standard,
    notes = excluded.notes, allowed_modes = excluded.allowed_modes, unit = excluded.unit;

  -- "Prensa em comodato" deixa de ser um serviço: a prensa é um equipamento que entra como locação/cortesia no orçamento.
  update public.products set is_active = false,
         notes = 'Substituído por EQ-PRENSA-500: a modalidade (venda, locação ou cortesia) agora é escolhida em cada orçamento.'
   where organization_id = org and sku = 'PR-CMD';

  -- Kits: preço fixo (mantém o valor de tabela anterior); a composição vem de produtos unitários.
  insert into public.products (organization_id, sku, description, unit, list_price, product_line, kind, brand, compatibility, ncm, notes, allowed_modes, kit_price_mode)
  values
    (org, 'KIT-CH570-CB',   'Kit mangueiras corte de base — John Deere CH570', 'kit', 4890.00, 'Kits para colhedoras', 'kit', 'Tawper', 'John Deere CH570', '4009.42.90', nota, array['sale'], 'fixed'),
    (org, 'KIT-CH950-EL',   'Kit mangueiras elevador — John Deere CH950',      'kit', 6120.00, 'Kits para colhedoras', 'kit', 'Tawper', 'John Deere CH950', '4009.42.90', nota, array['sale'], 'fixed'),
    (org, 'KIT-A8800-PC',   'Kit mangueiras picador — Case A8800',             'kit', 5640.00, 'Kits para colhedoras', 'kit', 'Tawper', 'Case A8800',       '4009.42.90', nota, array['sale'], 'fixed'),
    (org, 'KIT-A9000-CB',   'Kit mangueiras corte de base — Case A9000',       'kit', 5980.00, 'Kits para colhedoras', 'kit', 'Tawper', 'Case A9000',       '4009.42.90', nota, array['sale'], 'fixed'),
    (org, 'KIT-MANUT-BASE', 'Kit manutenção básica de mangueiras (1/2" e 3/4")', 'kit', 0.00,   'Kits de manutenção',   'kit', 'Tawper', 'Uso geral em oficina', '4009.42.90', nota, array['sale'], 'sum')
  on conflict (organization_id, sku) do update set
    kind = excluded.kind, brand = excluded.brand, compatibility = excluded.compatibility, ncm = excluded.ncm,
    notes = excluded.notes, allowed_modes = excluded.allowed_modes, kit_price_mode = excluded.kit_price_mode, unit = excluded.unit,
    product_line = excluded.product_line;
end $$;

-- Composição dos kits (quantidades de exemplo).
with comp(kit, item, qty, pos) as (
  values
    ('KIT-CH570-CB', 'MH-4SH-34',    20, 1), ('KIT-CH570-CB', 'MH-R13-1',     6, 2), ('KIT-CH570-CB', 'TP-JIC-34',   16, 3),
    ('KIT-CH570-CB', 'TP-FLG-1',      4, 4), ('KIT-CH570-CB', 'AD-JICBSP-34', 4, 5), ('KIT-CH570-CB', 'CP-ESP-34',   20, 6),
    ('KIT-CH950-EL', 'MH-4SH-1',     24, 1), ('KIT-CH950-EL', 'TP-FLG-1',     8, 2), ('KIT-CH950-EL', 'TP-JIC-34',   10, 3),
    ('KIT-CH950-EL', 'AD-JICBSP-34',  6, 4), ('KIT-CH950-EL', 'CP-ESP-34',   24, 5),
    ('KIT-A8800-PC', 'MH-4SH-34',    22, 1), ('KIT-A8800-PC', 'MH-R2-34',    10, 2), ('KIT-A8800-PC', 'TP-JIC-34',   14, 3),
    ('KIT-A8800-PC', 'TP-ORFS-34',    8, 4), ('KIT-A8800-PC', 'CP-ESP-34',   22, 5),
    ('KIT-A9000-CB', 'MH-4SH-34',    24, 1), ('KIT-A9000-CB', 'MH-R13-1',     8, 2), ('KIT-A9000-CB', 'TP-JIC-34',   18, 3),
    ('KIT-A9000-CB', 'TP-FLG-1',      4, 4), ('KIT-A9000-CB', 'AD-JICBSP-34', 4, 5), ('KIT-A9000-CB', 'CP-ESP-34',   24, 6),
    ('KIT-MANUT-BASE', 'MH-R2-12',   10, 1), ('KIT-MANUT-BASE', 'MH-R2-34',  10, 2), ('KIT-MANUT-BASE', 'TP-JIC-12', 10, 3),
    ('KIT-MANUT-BASE', 'TP-JIC-34',  10, 4)
)
insert into public.product_components (organization_id, kit_id, component_id, quantity, position)
select '00000000-0000-4000-8000-000000000001', k.id, i.id, c.qty, c.pos
  from comp c
  join public.products k on k.organization_id = '00000000-0000-4000-8000-000000000001' and k.sku = c.kit
  join public.products i on i.organization_id = '00000000-0000-4000-8000-000000000001' and i.sku = c.item
on conflict (kit_id, component_id) do nothing;
