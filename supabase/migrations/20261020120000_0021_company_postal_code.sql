-- CEP da empresa para geolocalização das rotas (fluxo 7.8 / Maps).
alter table public.companies
  add column if not exists postal_code text
  check (postal_code is null or postal_code ~ '^[0-9]{8}$');

comment on column public.companies.postal_code is 'CEP com 8 dígitos. Usado com address/latitude/longitude no planejamento de rotas.';

create index if not exists companies_postal_code_idx
  on public.companies (organization_id, postal_code)
  where postal_code is not null;
