# CR-001 — Antecipação do assistente geral

Data: 17/10/2026
Solicitante: Phedro Borges

Problema observado: o chat lateral usa respostas por regras, sem modelo, memória conversacional ou base institucional. O usuário solicitou explicitamente integrar a API OpenAI, consultar somente fontes internas e usar a apresentação comercial fornecida.

Decisão anterior afetada: F13 somente após G11 e ordem original de entregas da IA. Esta solicitação autoriza uma exceção delimitada para o chat geral; não representa aceite dos gates anteriores nem autorização de publicação.

Fases e dados afetados: F0 (escopo), F13 (chat geral), consultas de leitura ao CRM existente, materiais comerciais internos. As demais funções simuladas ficam fora deste marco.

Alternativas avaliadas: ampliar regras; enviar todo o CRM ao modelo; modelo com ferramentas de leitura limitadas. Opção escolhida: OpenAI no servidor, consultas internas sob demanda, histórico do diálogo e referências verificáveis.

Plano de migration/backfill: nenhum schema existente será alterado. Extrair texto da apresentação por slide, com hash de origem e limitações explícitas. Catálogo da demonstração não é fonte comercial oficial.

Plano de teste: correspondência exata de empresa/pessoa, homônimos, visitas concluídas versus agendadas, fontes inexistentes, ausência de dados, perguntas técnicas ambíguas, isolamento de acesso, falhas de API, conversa com continuidade, lint, tipos e build. Teste real da OpenAI se a credencial permitir.

Plano de rollback: desativar ASSISTANT_ENABLED; retirar a rota e restaurar o painel anterior. Nenhuma escrita comercial pelo assistente.

Ajuste necessário da leitura inicial: `GET /api/crm/snapshot` passa a mapear somente operadores existentes, removendo a chamada que criava/atualizava usuários e permissões. Isso permite conectar esta cópia ao banco fornecido pelo usuário e manter os IDs da página consistentes com as consultas do chat, sem criar dados de teste. Não altera o fluxo de escrita comercial existente.

Aprovador da antecipação: Phedro Borges, por solicitação explícita nesta sessão em 17/10/2026. Aceite funcional: pendente da demonstração dos resultados. G0–G14 continuam sem aprovação.

Limite operacional: a aplicação não possui login real nesta cópia. O novo endpoint não aceitará um perfil escolhido no navegador como autenticação. Prévia local deve ser explicitamente habilitada, restrita ao desenvolvimento; acesso fora dela exige sessão verificada e RLS. Não publicar sem concluir a segurança e o aceite.
