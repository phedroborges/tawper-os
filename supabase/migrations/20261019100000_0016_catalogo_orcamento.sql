-- =============================================================================
-- Tawper OS — 0016 — Catálogo cadastrável e orçamento real
-- Produtos ganham os campos técnicos de mangueiras, terminais e kits;
-- orçamentos registram para quem e por onde foram enviados.
-- Só adiciona colunas e dados: nada existente é alterado ou removido.
-- =============================================================================

alter table public.products
  add column if not exists kind            text not null default 'product',
  add column if not exists brand           text,
  add column if not exists size            text,
  add column if not exists standard        text,
  add column if not exists pressure_bar    numeric(8,1),
  add column if not exists compatibility   text,
  add column if not exists ncm             text,
  add column if not exists notes           text;

alter table public.products
  drop constraint if exists products_kind_check;
alter table public.products
  add constraint products_kind_check check (kind in ('product', 'service'));

comment on column public.products.kind is 'product ou service. Serviços não têm estoque nem unidade física.';
comment on column public.products.size is 'Bitola/diâmetro, ex.: 3/4", 1", DN19.';
comment on column public.products.standard is 'Norma ou padrão, ex.: SAE 100 R2AT, JIC 37°, ORFS, BSP.';
comment on column public.products.pressure_bar is 'Pressão de trabalho em bar, quando aplicável.';
comment on column public.products.compatibility is 'Máquina/modelo a que se destina, ex.: John Deere CH570.';

alter table public.quotes
  add column if not exists sent_to_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists sent_via           text,
  add column if not exists sent_by            uuid references public.profiles(id) on delete set null;

alter table public.quotes
  drop constraint if exists quotes_sent_via_check;
alter table public.quotes
  add constraint quotes_sent_via_check check (sent_via is null or sent_via in ('whatsapp', 'manual'));

comment on column public.quotes.sent_via is 'whatsapp = enviado pelo Tawper; manual = PDF baixado e enviado fora do sistema (e-mail, etc.).';

-- Carga inicial: os 18 itens que estavam fixos no código.
insert into public.products (organization_id, sku, description, unit, list_price, product_line, kind, size, standard, compatibility)
values
  ('00000000-0000-4000-8000-000000000001', 'MH-R2-12',     'Mangueira hidráulica 2 tramas SAE 100 R2AT 1/2"',            'm',     38.90,  'Mangueiras',            'product', '1/2"', 'SAE 100 R2AT', null),
  ('00000000-0000-4000-8000-000000000001', 'MH-R2-34',     'Mangueira hidráulica 2 tramas SAE 100 R2AT 3/4"',            'm',     54.50,  'Mangueiras',            'product', '3/4"', 'SAE 100 R2AT', null),
  ('00000000-0000-4000-8000-000000000001', 'MH-4SH-34',    'Mangueira 4 espirais 4SH 3/4" — alta pressão',               'm',     96.80,  'Mangueiras',            'product', '3/4"', '4SH',          null),
  ('00000000-0000-4000-8000-000000000001', 'MH-4SH-1',     'Mangueira 4 espirais 4SH 1"',                                'm',    128.40,  'Mangueiras',            'product', '1"',   '4SH',          null),
  ('00000000-0000-4000-8000-000000000001', 'MH-R13-1',     'Mangueira R13 1" — corte de base',                           'm',    162.00,  'Mangueiras',            'product', '1"',   'R13',          null),
  ('00000000-0000-4000-8000-000000000001', 'TP-JIC-12',    'Terminal prensável JIC fêmea 37° 1/2"',                      'un',    21.90,  'Terminais e conexões',  'product', '1/2"', 'JIC 37°',      null),
  ('00000000-0000-4000-8000-000000000001', 'TP-JIC-34',    'Terminal prensável JIC fêmea 37° 3/4"',                      'un',    34.50,  'Terminais e conexões',  'product', '3/4"', 'JIC 37°',      null),
  ('00000000-0000-4000-8000-000000000001', 'TP-ORFS-34',   'Terminal prensável ORFS fêmea 3/4"',                         'un',    41.20,  'Terminais e conexões',  'product', '3/4"', 'ORFS',         null),
  ('00000000-0000-4000-8000-000000000001', 'TP-FLG-1',     'Terminal flange SAE código 62 — 1"',                         'un',   118.00,  'Terminais e conexões',  'product', '1"',   'SAE código 62', null),
  ('00000000-0000-4000-8000-000000000001', 'AD-JICBSP-34', 'Adaptador JIC x BSP 3/4"',                                   'un',    27.60,  'Terminais e conexões',  'product', '3/4"', 'JIC x BSP',    null),
  ('00000000-0000-4000-8000-000000000001', 'CP-ESP-34',    'Capa protetora espiral 3/4"',                                'm',     12.40,  'Proteção',              'product', '3/4"', null,           null),
  ('00000000-0000-4000-8000-000000000001', 'KIT-CH570-CB', 'Kit mangueiras corte de base — John Deere CH570',            'kit', 4890.00,  'Kits para colhedoras',  'product', null,   null,           'John Deere CH570'),
  ('00000000-0000-4000-8000-000000000001', 'KIT-CH950-EL', 'Kit mangueiras elevador — John Deere CH950',                 'kit', 6120.00,  'Kits para colhedoras',  'product', null,   null,           'John Deere CH950'),
  ('00000000-0000-4000-8000-000000000001', 'KIT-A8800-PC', 'Kit mangueiras picador — Case A8800',                        'kit', 5640.00,  'Kits para colhedoras',  'product', null,   null,           'Case A8800'),
  ('00000000-0000-4000-8000-000000000001', 'KIT-A9000-CB', 'Kit mangueiras corte de base — Case A9000',                  'kit', 5980.00,  'Kits para colhedoras',  'product', null,   null,           'Case A9000'),
  ('00000000-0000-4000-8000-000000000001', 'PR-CMD',       'Prensa hidráulica em comodato (contrato 12 meses)',          'un',     0.00,  'Serviços',              'service', null,   null,           null),
  ('00000000-0000-4000-8000-000000000001', 'SV-ACAD',      'Treinamento Tawper Academy — prensagem (até 8 mecânicos)',   'turma', 1800.00, 'Serviços',             'service', null,   null,           null)
on conflict (organization_id, sku) do nothing;
