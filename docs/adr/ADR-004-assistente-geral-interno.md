# ADR-004 — Assistente geral com fontes internas

Data: 17/10/2026. Estado: decisão de implementação no escopo da CR-001; aceite operacional pendente.

## Contexto

O painel lateral precisa responder sobre operação comercial e produtos, mantendo associações corretas entre registros. A apresentação recebida é uma fonte parcial, não o catálogo técnico completo. A stack existente é Next.js; não haverá migração de framework.

## Decisão

- API OpenAI Responses no servidor, modelo configurável em OPENAI_MODEL e chave somente em OPENAI_API_KEY.
- Ferramentas permitidas: pesquisar/ler material interno e consultar registros do CRM com filtros validados. Sem navegador, web search, URLs arbitrárias, SQL livre ou escrita.
- Resolver nomes para IDs antes de relacionar visitas, pessoas e empresas. Empates exigem esclarecimento; ausência não significa inexistência no mundo real.
- Manter histórico do diálogo e contexto da página, sem tratá-los como prova. Evidências vêm das ferramentas nesta requisição.
- Respostas estruturadas com IDs de fontes; o servidor rejeita referências não consultadas. Fontes comerciais são exibidas com slide e trecho.
- Separar capacidade de máquinas, dimensão de mangueira, pressão e comprimento. Alegações da apresentação são atribuídas à fonte; não completar tabelas ausentes por conhecimento geral.
- Dados fictícios do navegador não entram no contexto como CRM real. Falha de banco é informada, sem fallback silencioso para seed.
- Consultas autenticadas usam JWT validado e cliente Supabase com RLS. Prévia local sem login é uma exceção explícita de desenvolvimento, desligada em produção.
- Limites de entrada, tempo, chamadas e concorrência; erros sem segredos; store:false na OpenAI. Isso não equivale a promessa de retenção zero pelo fornecedor.

## Consequências

O assistente passa a interpretar pedidos e escolher ferramentas; qualidade será demonstrada por testes, sem promessa de infalibilidade. A base documental versionada permite acrescentar fontes e revisar conteúdo. A evolução para uploads e banco documental poderá ocorrer separadamente. Consultas ao CRM dependem da configuração real do banco.

## Referências

- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://supabase.com/docs/reference/javascript/auth-getuser
