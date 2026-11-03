# Limpar catálogo de produtos no banco

O Tawper OS **não usa mais** o catálogo operacional (SKU, preço, componentes).  
A IA e a proposta comercial usam só os **nomes** em `PRODUCT_NAMES` (`web/src/lib/constants.ts`).

As tabelas `public.products` e `public.product_components` podem ficar vazias. Orçamentos antigos (`quotes` / `quote_items`) **não** são apagados — só perdem o vínculo com o produto; SKU e descrição copiados na emissão ficam.

## Por que o delete direto falha

A FK de `quote_items` é composta `(organization_id, product_id) … on delete set null`.  
No Postgres, isso tenta zerar **as duas** colunas. `organization_id` é `not null` → erro `23502`.

Por isso o script **desvincula** `product_id` antes de apagar os produtos.

## No SQL Editor do Supabase (ou `psql`)

Ajuste o `organization_id` se a sua org for outra.

```sql
-- Conferir
select count(*) as products
from public.products
where organization_id = '00000000-0000-4000-8000-000000000001';

select count(*) as quote_items_com_produto
from public.quote_items
where organization_id = '00000000-0000-4000-8000-000000000001'
  and product_id is not null;

begin;

-- 1) Solta o vínculo (mantém organization_id e a cópia sku/descrição)
update public.quote_items
set product_id = null
where organization_id = '00000000-0000-4000-8000-000000000001'
  and product_id is not null;

-- 2) Composição dos kits (componentes referenciam products com ON DELETE RESTRICT)
delete from public.product_components
where organization_id = '00000000-0000-4000-8000-000000000001';

-- 3) Produtos
delete from public.products
where organization_id = '00000000-0000-4000-8000-000000000001';

commit;
```

## Depois

1. Em **Propostas** (`/propostas`), gere o deck comercial pela empresa.
2. Não cadastre mais produtos pela UI — `/catalogo` redireciona para `/propostas` e `POST /api/catalog` responde **410**.
