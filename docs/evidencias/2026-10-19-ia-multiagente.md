# Evidência — fundação de IA multiagente

**Data:** 19/10/2026
**Mudança:** SM-2026-10-19-001 / ADR-004
**Fase formal:** F0 continua EM ANDAMENTO; F13 continua NÃO INICIADA.

## Escopo entregue

- registro central de 14 agentes e versões de prompt;
- perfis de modelo com Gateway multi-provedor e fallback direto para OpenAI;
- limites de entrada, saída, tempo e tentativas;
- contratos determinísticos para impedir IDs, números, datas e fatos inventados;
- assistente com texto limpo, tarefas visuais e comparação de métricas;
- copiloto reconciliado com contatos canônicos;
- pgvector, memória, documentos, chunks, busca lexical + semântica e casos de avaliação;
- sessões, runs, passos, tokens, custo estimado e correlação;
- outbox idempotente com claim atômico, backoff, lease e dead-letter;
- ferramentas de escrita/efeito externo bloqueadas até autenticação e aprovação humana.

## Validação

A evidência consolidada, incluindo os 14 agentes, suíte, build, provedor real, migrations, RLS, RAG e outbox, está em `docs/evidencias/2026-10-19-agentes-ia-restantes.md`.

O gate G13 não foi antecipado. A fundação é aditiva e reversível, permanece desligada por padrão e não autoriza ativação produtiva antes dos gates previstos no plano.
