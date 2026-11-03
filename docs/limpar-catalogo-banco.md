# Limpar catálogo de produtos no banco

O Tawper OS **não usa mais** o catálogo operacional (SKU, preço, componentes).  
A IA e a proposta comercial usam só os **nomes** em `PRODUCT_NAMES` (`web/src/lib/constants.ts`).

As tabelas `public.products` e `public.product_components` podem ficar vazias. Orçamentos antigos (`quotes` / `quote_items`) **não** são apagados por este script — eles guardam cópia de SKU/descrição na emissão.

## No SQL Editor do Supabase (ou `psql`)

Rode na organização Tawper. Ajuste o `organization_id` se a sua org for outra.

```sql
-- Conferir quantos produtos existem
select count(*) as products
from public.products
where organization_id = '00000000-0000-4000-8000-000000000001';

select count(*) as components
from public.product_components
where organization_id = '00000000-0000-4000-8000-000000000001';

-- Apaga composição dos kits e depois os produtos da org
begin;

delete from public.product_components
where organization_id = '00000000-0000-4000-8000-000000000001';

delete from public.products
where organization_id = '00000000-0000-4000-8000-000000000001';

commit;
```

Se algum `quote_items.product_id` apontar para produto apagado, a FK costuma ser `on delete set null` — o item do orçamento antigo permanece com a descrição copiada.

## Depois

1. Em **Propostas** (`/propostas`), gere o deck comercial pela empresa.
2. Não cadastre mais produtos pela UI — a rota `/catalogo` redireciona para `/propostas` e a API `POST /api/catalog` responde **410**.
