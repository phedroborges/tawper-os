-- Migration 0027: Separa a permissão de Administrador (is_admin) da função na empresa (gestor, vendedor, representante)
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE public.memberships
SET is_admin = true
WHERE role = 'admin';

UPDATE public.memberships
SET role = 'vendedor', is_admin = true
WHERE profile_id = '420249ec-1514-46ac-8134-ecc5fbf2faa4'::uuid;

UPDATE public.memberships
SET role = 'gestor', is_admin = true
WHERE profile_id = 'bf9b04a6-3bbe-4e65-8ed2-cf7b8cc4c576'::uuid;

COMMENT ON COLUMN public.memberships.is_admin IS 'Permissão administrativa (plus) independente da função operacional (gestor, vendedor, representante).';
