-- Migration 0026: Adiciona preferência de layout do Draggable Widget Grid por usuário (Painel e Metas)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_layout jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.dashboard_layout IS 'Preferências de layout do Draggable Widget Grid por usuário (Painel e Metas).';
