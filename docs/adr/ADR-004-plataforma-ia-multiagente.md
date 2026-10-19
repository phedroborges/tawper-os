# ADR-004 — Plataforma de IA multiagente, RAG e automações controladas

**Estado:** aceita como fundação antecipada da F13 por `SM-2026-10-19-001`; ativação produtiva sujeita aos gates do plano.
**Data:** 19/10/2026

## Contexto

O Tawper possui várias funções de IA, mas todas compartilham uma chamada direta ao mesmo provedor e recebem grandes recortes do estado do navegador. O assistente livre devolve texto e links; o copiloto usa o cadastro, porém um rascunho genérico pode induzir o modelo a pedir um decisor que já existe. Não há trilha unificada de execução, memória do agente, recuperação semântica nem contrato para ferramentas autônomas.

## Decisão

1. **Orquestrador e especialistas.** Um orquestrador classifica a intenção e delega a especialistas com contratos próprios: Assistente Analítico, Copiloto Estratégico, Registro Rápido, Próximo Passo, Resumo de Conversas, Roteador de Conversas, Roteiro de Visitas, Extrator de Leads, Briefing Diário, Resumo Gerencial, Transcrição, Conversas e Operações. A SM-2026-10-19-002 conecta os especialistas restantes às funções já existentes na demonstração.
2. **Roteador de modelos.** Cada tarefa usa um perfil (`fast`, `reasoning` ou `embedding`) com modelo primário e fallbacks configuráveis. AI Gateway é o caminho preferencial para múltiplos provedores; a OpenAI direta continua como fallback de implantação.
3. **Resposta estruturada.** O modelo não devolve HTML. Ele devolve blocos tipados e validados (`text`, `metric`, `task_list`, `bar_chart`, `table`), renderizados por componentes React seguros.
4. **RAG híbrido.** Postgres continua como fonte de verdade. Consultas transacionais usam SQL; documentos e memórias usam full-text search + pgvector, combinados por reciprocal rank fusion. RAG não substitui filtros de permissão nem cálculos comerciais.
5. **Memória explícita.** Memórias têm escopo (`session`, `user`, `company`, `organization`), origem, confiança, validade e evidência. Fatos canônicos do CRM sempre vencem memórias e texto gerado.
6. **Ferramentas tipadas.** O registro informa nome e risco de cada ferramenta. Pela SM-2026-10-19-005, mover etapa, concluir tarefa e criar tarefa geram proposta e só executam após confirmação humana, nova leitura canônica, validação de escopo, expiração e auditoria. Efeitos externos continuam usando `outbox_events` e aprovação humana.
7. **Planejamento limitado.** Os planos atuais são determinísticos e têm limite de etapas, timeout e saída. O schema de runs/passos receberá persistência quando a identidade autenticada estiver disponível. Loops abertos e ferramentas genéricas de SQL/HTTP não são permitidos.
8. **Operação durável.** A outbox já existente é a fila canônica, com idempotência, `SKIP LOCKED`, backoff e dead-letter. O mesmo contrato serve ao envio de formulário, WhatsApp e futuras integrações.
9. **Avaliação antes de fine-tuning.** Prompts, modelos e conjuntos de avaliação são versionados. Fine-tuning só será considerado para comportamento repetitivo que RAG, ferramentas e prompts não resolvam.

## Consequências

- O app pode trocar de provedor sem alterar telas nem regras comerciais.
- O assistente passa a entregar a informação na própria conversa, com tarefas, comparações e gráficos compactos.
- O copiloto passa por uma barreira determinística que impede recomendações incompatíveis com pessoas já cadastradas.
- A busca semântica exige geração assíncrona de embeddings e monitoramento da cobertura do índice.
- Logs seguros já atribuem tokens e latência por agente, tarefa e modelo; o schema de execução está pronto para persistência por organização após a F3.
- As três ferramentas internas aprovadas pela SM-2026-10-19-005 podem ser ativadas por configuração na F0, sob a mesma identidade operacional já usada pelas mutações da demonstração. A autenticação real da F3 continua obrigatória antes de ampliar esse conjunto ou expô-lo a usuários externos.

## Alternativas avaliadas

- **Um modelo para tudo:** simples, mas caro nas tarefas fáceis e frágil nas complexas.
- **Um banco vetorial separado:** rejeitado agora; pgvector reduz operação e preserva RLS/transações no Supabase.
- **HTML gerado pelo modelo:** rejeitado por segurança, acessibilidade e inconsistência visual.
- **Fine-tuning imediato:** rejeitado por ausência de dataset aprovado e por não corrigir falta de contexto factual.
- **Agente enviando diretamente:** rejeitado; efeitos externos precisam de aprovação, idempotência, auditoria e retentativa.
