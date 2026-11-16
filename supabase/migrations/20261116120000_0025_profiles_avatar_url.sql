-- Migration 0025: Adiciona suporte a foto de perfil (avatar_url) nos usuários (public.profiles)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS 'Foto de perfil do usuário (Data URL compactada 256x256 ou URL HTTPS).';
