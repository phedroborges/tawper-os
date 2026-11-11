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


## Evidência de teste real — 10/11/2026 (local, Stevo simulada)

Ambiente: PostgreSQL 17 em Docker (TLS, banco `tawper_test`), app em `next dev` com a rota e a tela reais, Stevo substituída por um servidor local que só responde status e perfil. **Stevo real e WhatsApp real não foram testados.**

- Conversa de 3 dias atrás + conversa com 700 mensagens recentes: no critério antigo (500 mensagens mais recentes) a conversa antiga tinha 0 mensagens; no feed novo ela aparece com a prévia, e com `?selected=` traz o histórico inteiro (2 de 2). Feed com 3 conversas e 700 mensagens: cerca de 1 KB.
- Tela `/conversas?c=...` no navegador: a conversa antiga abre com as duas mensagens.
- Stevo travada (resposta em 20 s): a página responde em 8,2 s com a mensagem de erro explícita, sem cair na demonstração; o feed não depende da Stevo (0,02 s).
- Banco fora do ar: o feed passou a responder 500 (antes devolvia listas vazias com 200); a tela mantém as conversas já carregadas e volta ao normal quando o banco retorna.
- Suíte: 162 testes aprovados, inclusive o de integração com PostgreSQL; build aprovado.
- Não coberto: múltiplos atendentes logados ao mesmo tempo, histórico acima de 2.000 mensagens, envio/recebimento reais.

## Atraso ao clicar numa conversa — causa e correção (10/11/2026)

Causa: o clique chamava `router.replace("/conversas?c=…")`, o que refaz a página no servidor. Essa renderização espera `loadProofSnapshot` (status, proxy-info, perfil e webhook da Stevo, um depois do outro) antes de a conversa trocar na tela, embora as mensagens já estejam no banco e cheguem pelo feed em cerca de 20 ms. O cache de 10 s da Stevo fazia alguns cliques saírem rápidos e outros lentos.

Correção: a troca de conversa só atualiza a URL no navegador (`history.replaceState`); `proxy-info` e `perfil` passam a ser consultados juntos; a conferência do webhook roda em segundo plano.

Medição local (build de produção, PostgreSQL 17, Stevo simulada com 300 ms por chamada): clique até a mensagem aparecer, 1.409–1.462 ms antes e 23–72 ms depois, sem nenhuma requisição ao servidor. Abrir `/conversas` com o cache expirado: de cerca de 1,5 s para 0,65 s. Com a Stevo real a diferença deve ser proporcional à latência dela; não medido em homologação.
