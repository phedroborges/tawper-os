-- Rotas gravadas no banco: horário de cada parada (agenda dentro da jornada) e o filtro de região usado ao montar a rota.
-- Só acrescenta colunas opcionais; nenhuma rota existente muda. Idempotente.
-- Rode ANTES de publicar a versão do app que grava rotas.
alter table public.route_plans add column if not exists region_label text;
alter table public.route_stops add column if not exists scheduled_at timestamptz;
