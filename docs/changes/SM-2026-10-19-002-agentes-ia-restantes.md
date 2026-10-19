# SM-2026-10-19-002 — Migração dos agentes de IA restantes

ID: SM-2026-10-19-002
Data: 19/10/2026
Solicitante: Phedro Borges
Problema observado: dez recursos de IA da demonstração ainda chamavam o modelo isoladamente, sem registro individual de agente, versão de prompt, política de modelo, contrato testável e telemetria atribuível.
Decisão anterior afetada: `PLANO_IMPLEMENTACAO.md`, Fase 13, e o limite inicial de `SM-2026-10-19-001`, que conectava apenas o Assistente Analítico e o Copiloto Estratégico.
Fases e dados afetados: F0 permanece ativa e F13 permanece não iniciada. A exceção reversível passa a cobrir registro rápido, próximo passo, resumo e roteamento de conversas, extração de lead, briefing diário, resumo gerencial, transcrição e os agentes agregadores de Conversas e Operações. Nenhum dado comercial é alterado pela migration.
Alternativas avaliadas: manter chamadas independentes; criar dez serviços separados; usar um agente genérico com prompt variável; registrar especialistas com contratos próprios sobre o mesmo roteador e fallbacks existentes.
Opção escolhida: especialistas registrados e versionados, normalização determinística de saída, fallback local, telemetria por agente e perfil de custo. Conversas apenas lê e propõe. Operações apenas enfileira efeitos externos com aprovação, idempotência e outbox. Como a hospedagem aprovada é VPS/EasyPanel com Supabase, mantém-se a outbox Postgres em vez de acrescentar Vercel Queues/Workflow.
Plano de migration/backfill: migration aditiva `ai_remaining_agent_policies`, apenas com políticas desabilitadas por organização. Sem backfill.
Plano de teste: um teste de contrato por item; suíte completa; typecheck; lint dos arquivos alterados; build; migration em ambiente não produtivo antes de ativação.
Plano de rollback: `TAWPER_MULTI_AGENT_ENABLED=false` restaura os fallbacks; `TAWPER_AGENT_WRITES_ENABLED=false` bloqueia a outbox de automações; remover/desabilitar as políticas novas não afeta o CRM.
Aprovador: autorização explícita de Phedro Borges nesta sessão ("prossiga fazendo para cada um desses, um a um e testando um a um").

## Limites

## Complemento de revisão autorizado em 19/10/2026

Phedro solicitou nova revisão, correção, validação e publicação por commit/push/merge. O aceite anterior referia-se a testes de normalização, não à prontidão produtiva. Esta revisão inclui testes reais das Server Actions (adaptadores externos simulados), smoke tests sintéticos do provedor configurado, migrations em Postgres descartável, isolamento RLS e recuperação de outbox. Problemas encontrados serão corrigidos e os resultados efetivos substituirão qualquer afirmação anterior mais ampla. A F0 continua ativa; não se considera o G13 aprovado apenas porque a suíte passa.

- A implementação é da arquitetura e dos contratos da demonstração; não antecipa o Gate G12 nem ativa formalmente a F13.
- Nenhuma saída do modelo grava lead, atividade, nota ou mensagem sem confirmação humana.
- Nenhum envio externo é feito no teste.
- Ativação real depende de autenticação server-side, migration em homologação, chaves dos provedores e avaliação com dados autorizados.

## Resultado da revisão

As três migrations foram reaplicadas do zero no Supabase local e os testes transacionais de RLS, RAG e outbox passaram. Os 14 agentes registrados foram cobertos pela suíte de 35 testes e o provedor OpenAI configurado respondeu ao smoke test sintético. O Gateway multi-provedor permanece sem teste externo por ausência de chave; seu fallback foi validado com adaptadores controlados. As flags e políticas continuam desabilitadas por padrão, portanto esta aprovação autoriza integrar a fundação, mas não liberar escrita autônoma em produção.
