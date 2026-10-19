# Evidência — revisão e validação dos agentes de IA

**Data:** 19/10/2026
**Mudança:** SM-2026-10-19-002 / ADR-004
**Fase formal:** F0 continua EM ANDAMENTO; F13 continua NÃO INICIADA.

## Resultado por agente

| # | Agente/recurso | Proteção validada | Resultado |
|---:|---|---|---|
| 1 | Registro rápido/anotações | Contrato de enums, datas, etapa e checks canônicos | OK |
| 2 | Sugestão de próximo passo | Tipo, prioridade e data válida; fallback determinístico | OK |
| 3 | Resumo de conversas | Limites de fatos/listas e normalização do resultado | OK |
| 4 | Roteamento de conversas | Dono canônico vence; desconhecido/ambíguo vai para a fila | OK |
| 5 | Roteiro de visitas | Só reordena IDs candidatos; não cria empresa | OK |
| 6 | Extração/cadastro de leads | Só propõe cadastro; papel e UF são validados | OK |
| 7 | Briefing diário | Só reordena prioridades e textos canônicos | OK |
| 8 | Resumo gerencial | Só reordena linhas canônicas; não inventa indicador | OK |
| 9 | Transcrição | MIME com codec, limite de 25 MB, normalização e fallback | OK |
| 10 | Agente de Conversas | Planeja leitura/proposta; resposta externa exige aprovação | OK |
| 11 | Agente de Operações | Gera evento idempotente; envio externo exige aprovação e flag | OK |
| 12 | Assistente Analítico | Remove Markdown solto e entrega texto/blocos visuais seguros | OK |
| 13 | Copiloto Estratégico | Reconcilia a sugestão com contatos e decisor já cadastrados | OK |
| 14 | Orquestrador | Delega tarefas, estratégia, conversa e automação ao especialista | OK |

## Evidências executadas

- `npm test`: 6 arquivos, 35 testes aprovados. Inclui cada especialista, orquestração, contratos, bloqueio de ferramentas e roteamento/fallback de modelos.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado sem erros; restam 2 avisos preexistentes de `<img>`.
- `npm run build`: aprovado no Next.js 16.4.2; 17 páginas geradas.
- `git diff --check`: aprovado.
- Smoke test real do provedor configurado: OpenAI respondeu JSON válido com `gpt-5.4-2026-03-05` e 39 tokens totais. Nenhum dado comercial foi enviado.
- `supabase db reset --local`: todas as migrations foram reaplicadas do zero em Postgres 17 + pgvector.
- `supabase db lint --local --level warning`: nenhum erro ou aviso de schema.
- `supabase test db --local`: 14 testes pgTAP aprovados. As 14 políticas ficaram instaladas e desabilitadas; RLS bloqueou usuário sem associação; busca híbrida encontrou o documento; claim, backoff e dead-letter passaram; permissões da fila ficaram restritas ao `service_role`. Um teste transacional complementar validou a recuperação de lease expirado.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades de produção após atualização do Next.js 16.3.4 para 16.4.2.

## Correções encontradas durante a revisão

- datas impossíveis e números recebidos como texto deixaram de atravessar os contratos;
- briefing, resumo gerencial e checks deixaram de aceitar fatos inventados pelo modelo;
- intenção de automação deixou de ser engolida pela classificação de conversa;
- respostas truncadas ou que não sejam objeto JSON passaram a cair no fallback;
- logs não incluem prompt, resposta bruta nem mensagem crua do provedor;
- a IA agora só liga com `TAWPER_MULTI_AGENT_ENABLED=true` explícito;
- Server Actions aceitam o limite documentado de áudio de 25 MB;
- eventos presos em `processing` voltam à fila após 15 minutos e eventos esgotados vão para dead-letter;
- o Next.js vulnerável e o Vitest vulnerável foram atualizados.

## Limites de ativação preservados

- `TAWPER_MULTI_AGENT_ENABLED=false` e todas as políticas do banco permanecem desligadas por padrão.
- `TAWPER_AGENT_WRITES_ENABLED=false` continua bloqueando ferramentas mutáveis.
- O fallback entre Gateway e OpenAI foi validado por teste controlado. O Gateway não recebeu smoke test real porque não há `AI_GATEWAY_API_KEY` neste ambiente.
- Envio real ao cliente não foi disparado. A outbox foi testada apenas no Supabase local e dentro de transação revertida.
- A autenticação server-side da F3 continua obrigatória antes de liberar qualquer escrita de agente em produção.
- O audit completo ainda aponta cinco avisos `high` somente na cadeia de desenvolvimento do `eslint-config-next`; não há correção não destrutiva publicada e o audit de produção está limpo.
