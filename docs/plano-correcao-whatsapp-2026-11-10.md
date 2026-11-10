# Plano de correção da central de WhatsApp — 10/11/2026

Objetivo: corrigir os quatro problemas observados na revisão, mantendo a integração Stevo temporária e os dados existentes. A Fase 0 permanece em andamento; isso não aprova nenhum gate.

1. [x] Exibir carregamento e erro explícito; limitar a espera pela Stevo e iniciar status e consultas de dados em paralelo.
2. [ ] Separar listagem de conversas do histórico (prévia por conversa e histórico selecionado implementados; paginação ainda pendente): paginação estável para conversas e mensagens, busca abrangente e preservação dos responsáveis e mensagens pendentes.
3. [ ] Reduzir a atualização repetida (intervalo ampliado para 10 s e prévias implementadas; consulta incremental pendente): consultar alterações ou dados mínimos e manter as ações de envio, exclusão e atribuição sincronizadas.
4. [ ] Testar com conversas anteriores às 500 mensagens mais recentes, histórico longo, múltiplos atendentes, falha da Stevo e banco indisponível; medir abertura e tráfego antes e depois em homologação.
5. [ ] Rodar lint, typecheck, testes e build; registrar evidências e testar em homologação antes de publicação.

Rollback: publicar a versão anterior da aplicação. Não há alteração de schema na etapa 1. A medição depende de ambiente com dados representativos e Stevo acessível.

## Evidência local — 10/11/2026

- PostgreSQL 17 isolado em Docker, com conexão TLS: duas conversas e 552 mensagens inseridas temporariamente; a prévia da conversa antiga e suas duas mensagens foram recuperadas apesar das 550 mensagens mais recentes da outra conversa. O teste limpa os dados inseridos e só aceita banco local chamado `tawper_test`.
- Suíte completa: 36 testes aprovados, incluindo o teste de integração com PostgreSQL real. Build e lint concluídos; dois avisos existentes de imagem.
- A Stevo real não foi testada: esta cópia local não tem as credenciais da integração. A paginação, testes com histórico superior a 2.000 mensagens e homologação na interface permanecem pendentes.

## Atualização — 10/11/2026 (sobre o `main` af9f4f2)

- Refeito sobre o `main` atual, que moveu a tela para `LiveInbox`/`live-engine` e passou a atualizar por `/api/whatsapp/live` (3 s).
- O feed da lista agora devolve a última mensagem de cada conversa (`listLivePreviews`) e, com `?selected=`, o histórico completo só da conversa aberta; sem corte de 500 em conversas.
- `loadProofSnapshot(selectedPeer)` usa o mesmo critério e mantém a checagem de sessão e o timeout de 8 s nas chamadas `/instance/` da Stevo.
- Pendente: paginação do histórico longo, consulta incremental e homologação com a Stevo real.
- Validação local: 161 testes aprovados (o de integração com PostgreSQL fica ignorado sem banco local), build aprovado, lint sem erros.

