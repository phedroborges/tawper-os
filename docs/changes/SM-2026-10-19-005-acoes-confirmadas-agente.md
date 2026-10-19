# SM-2026-10-19-005 — Ações confirmadas pelo Agente Geral

ID: SM-2026-10-19-005

Data: 19/10/2026

Solicitante: Phedro Borges

Problema observado: o Agente Geral recuperava bem o contexto, mas era incapaz de executar ações no CRM. Não coletava requisitos de etapa, não concluía tarefas e não criava tarefas, tanto no sistema quanto no WhatsApp.

Decisões anteriores afetadas: item 6 e consequência de bloqueio da escrita no ADR-004; item 8 e estado somente leitura do ADR-005.

Fases e dados afetados: exceção aditiva da Fase 0 para IA/WhatsApp. Nenhuma tabela, coluna, migration ou backfill novo. A proposta pendente no WhatsApp usa o `metadata` já existente em `ai_channel_messages`.

Alternativas avaliadas: liberar escrita direta pelo texto do modelo; executar toda ordem sem confirmação; aguardar a autenticação da Fase 3; permitir ações tipadas com confirmação humana, revalidação canônica e auditoria.

Opção escolhida: ações tipadas para mover oportunidade, concluir tarefa e criar tarefa. O modelo apenas seleciona IDs e extrai os dados da solicitação. O servidor recarrega o CRM, valida identidade/escopo, pergunta campos e critérios ausentes, gera uma proposta por 15 minutos e executa somente após confirmação explícita. A execução relê o banco, respeita a flag global, registra origem `ai` e impede confirmação por outro usuário. No WhatsApp, `CONFIRMAR` reivindica atomicamente uma única proposta; `CANCELAR` a descarta.

Limitação consciente: a interface web da Fase 0 ainda usa o seletor de perfil já adotado pela demonstração, sem autenticação real. A ação da IA não amplia o acesso que as rotas mutáveis atuais já possuem. No WhatsApp, identidade e escopo continuam vinculados à allow-list e ao perfil canônico.

Plano de teste: separar consulta de ordem; exigir requisito de etapa; continuar coleta em várias mensagens; exigir resultado ao concluir tarefa; exigir título/prazo ao criar tarefa; bloquear escrita desligada, ação expirada, outro usuário e empresa fora do escopo; confirmar uma vez no WhatsApp; rodar testes, typecheck, lint e build.

Plano de rollback: definir `TAWPER_AGENT_WRITES_ENABLED=false` para bloqueio imediato e reverter os arquivos da SM. Propostas pendentes permanecem inertes e expiram; não há rollback de schema.

Aprovador: Phedro Borges, pela solicitação explícita de corrigir e efetivar as ações nos dois canais.
