```text
ID: SM-2026-10-07-001
Data: 07/10/2026
Solicitante: Carlos Lisboa
Problema observado: a equipe precisa do modelo canônico no Supabase para avançar o entendimento do domínio, sem esperar o Gate G0/G1.
Decisão anterior afetada: PLANO_IMPLEMENTACAO.md, seção 23 — não iniciar banco antes do Gate G0; Fase 2 depende de G1.
Fases e dados afetados: F2 (schema e migrations). F0 permanece a fase ativa. A interface em web/ não foi convertida.
Alternativas avaliadas: esperar G0/G1; rascunho descartável fora do repositório; schema versionado no repositório sem dados operacionais.
Opção escolhida: schema versionado em supabase/migrations, com seed apenas de configuração da especificação (funis, etapas, regiões, listas). Sem empresas, usuários ou vendas fictícias.
Plano de migration/backfill: migrations 0001–0010 aplicadas em banco vazio. Sem backfill de cliente.
Plano de teste: aplicar em projeto Supabase vazio e conferir funis/etapas/regiões. Testes de constraint, RLS e concorrência continuam no Gate G2.
Plano de rollback: não aplicar em produção; se o Gate G0 alterar funis ou campos, novas migrations corrigem (as já aplicadas não são reescritas).
Aprovador: autorização explícita do solicitante nesta sessão.
```
