# SM-2026-10-19-001 — Fundação de IA multiagente antecipada

ID: SM-2026-10-19-001
Data: 19/10/2026
Solicitante: Phedro Borges
Problema observado: o assistente geral devolve texto sem hierarquia visual e apenas atalhos para empresas; o copiloto pode ignorar fatos já cadastrados, como o decisor. A solução atual também depende de um único provedor, envia contexto em massa e não possui memória, busca semântica, execução controlada de ferramentas, planejamento em etapas nem controle operacional completo das chamadas.
Decisão anterior afetada: `PLANO_IMPLEMENTACAO.md`, Fase 13, que só começaria depois do Gate G11.
Fases e dados afetados: F0 permanece ativa. É antecipada somente a fundação reversível da F13 e a correção dos dois agentes já presentes na demonstração. São adicionados contratos de resposta, roteamento de modelos, tabelas de execução/memória/conhecimento/avaliação e integração com a outbox existente.
Alternativas avaliadas: manter o assistente atual até a F13; corrigir apenas o HTML; adotar um framework de agentes com estado próprio; criar uma camada interna sobre o app atual e os contratos canônicos.
Opção escolhida: camada interna multiagente e independente de provedor. O Assistente Analítico e o Copiloto Estratégico são os primeiros especialistas. As respostas visuais usam blocos estruturados validados, nunca HTML produzido pelo modelo. RAG usa Postgres, full-text search e pgvector. A outbox canônica executa automações somente depois de aprovação humana.
Plano de migration/backfill: migration `ai_multiagent_foundation`; não há backfill de clientes nem geração automática de embeddings. Políticas padrão são semeadas para organizações existentes. A indexação é incremental e explícita.
Plano de teste: testes unitários dos contratos visuais e da consistência do decisor; lint, typecheck, build; migration aplicada primeiro em banco não produtivo; avaliação com conjunto de perguntas reais antes de habilitar ferramentas ou RAG em produção.
Plano de rollback: desligar `TAWPER_MULTI_AGENT_ENABLED`, voltar aos fallbacks determinísticos e publicar a versão anterior. As tabelas novas são aditivas; não removem nem transformam dados comerciais. Eventos pendentes de automação podem ser marcados como `dead` sem envio.
Aprovador: autorização explícita de Phedro Borges nesta sessão ("aplique isso").

## Limites desta autorização

- A F13 continua formalmente **NÃO INICIADA** até seus pré-requisitos e gate serem atendidos.
- Nenhuma mensagem externa pode ser enviada diretamente pelo modelo.
- Toda ação externa exige política, aprovação humana registrada, idempotência e consumo assíncrono da outbox.
- Enquanto a autenticação server-side da F3 não estiver concluída, ferramentas mutáveis permanecem desabilitadas.
- Fine-tuning não será contratado nem iniciado sem conjunto de avaliação e exemplos aprovados.
