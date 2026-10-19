# ADR-005 — Agente Geral interno no WhatsApp

**Estado:** aceita para a etapa de leitura pela SM-2026-10-19-003.

**Data:** 19/10/2026

## Contexto

A equipe interna precisa conversar com o Agente Geral pelo número dedicado do WhatsApp para consultar empresas, oportunidades, tarefas, resultados e apoio estratégico. O canal deve reaproveitar os agentes do ADR-004 sem misturar conversas de clientes, sem confiar no nome informado pelo WhatsApp e sem dar acesso global a vendedores.

## Decisão

1. O número `17981640081` é o bot e nunca é aceito como usuário. Não é necessário escrever um prefixo porque o número é dedicado ao agente.
2. Os remetentes autorizados e seus papéis ficam em `TAWPER_WHATSAPP_AGENT_USERS_JSON`, fora do Git. A autorização ocorre antes da fila, do CRM e da IA.
3. Administrador e gestor consultam toda a organização. Vendedor precisa ser vinculado de modo inequívoco a um perfil do Tawper e recebe somente a carteira que esse perfil já pode ver. Falha de vínculo fecha o acesso.
4. Cada remetente possui sessão e histórico próprios. O histórico do canal é separado das conversas comerciais com clientes.
5. O webhook apenas valida, normaliza e enfileira. A outbox canônica fornece idempotência de entrada, lease, retentativa e dead-letter; um worker protegido recupera trabalhos que não terminarem no processamento imediato.
6. O Agente Geral usa o orquestrador multiagente existente. Perguntas estratégicas são direcionadas ao Copiloto Estratégico; consultas operacionais permanecem no Assistente Analítico.
7. A resposta estruturada é convertida para texto seguro do WhatsApp, com métricas, comparativos, barras e checklists. Markdown residual é removido.
8. A etapa é estritamente de leitura. O agente não executa mutações nem envia mensagens para clientes. Futuras ações deverão entrar como proposta aprovada e usar automação auditável.
9. A mesma conta Stevo pode ser usada. A mesma instância só pode ser reaproveitada se for dedicada/convertida ao número do bot, pois uma instância corresponde a um QR code e um número.
10. A instância SM v2 possui um único destino de webhook operacional. O endpoint compartilhado `/api/whatsapp/webhook` registra o evento no canal de Conversas e, na mesma entrada, encaminha ao agente somente mensagens recebidas de números da lista interna. Sessão, memória, autorização e outbox do agente continuam isoladas. A rota `/api/whatsapp/agent/webhook` permanece como entrada alternativa para uma instância futura exclusivamente dedicada.

## Consequências

- Um número desconhecido, o número do bot ou um evento não textual não consulta nem persiste dados.
- A lista de acesso pode ser revogada sem deploy, alterando o segredo de ambiente.
- A resposta imediata não depende de manter a requisição aberta; o worker pode retomar falhas.
- A entrega externa é pelo menos uma vez. O registro de saída e o vínculo ao evento reduzem repetição; indisponibilidades no limite entre provedor e banco continuam exigindo observabilidade operacional.
- Ativar em produção depende de conectar o número na Stevo, cadastrar segredos, aplicar a migration e agendar o worker.
- A consolidação do transporte evita que a renovação automática do webhook da Central de Conversas substitua silenciosamente a URL do agente.

## Alternativas avaliadas

- **Dois webhooks de instância em rotas separadas:** rejeitado após validação real; a renovação automática da instância substitui o destino anterior. A entrada passou a ser compartilhada, mas identidades, memória, filas e finalidade continuam separadas após a autenticação.
- **Exigir `Tawper:` em toda mensagem:** rejeitado porque o número é dedicado.
- **Liberar acesso pelo nome do WhatsApp:** rejeitado; nomes são mutáveis e não são autenticação.
- **Responder de forma síncrona sem fila:** rejeitado por timeout, perda de eventos e ausência de retentativa.
- **Dar visão total a qualquer número da lista:** rejeitado; vendedores precisam manter o escopo de carteira.
