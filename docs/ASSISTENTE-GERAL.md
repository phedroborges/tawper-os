# Assistente geral Tawper — marco CR-001

Atualizado em 17/10/2026. Implementação local; aceite funcional do usuário pendente. Nenhum gate do plano mestre foi aprovado e nenhum deploy foi realizado.

## Comportamento entregue

O painel lateral chama `/api/assistant`, que usa OpenAI Responses com `OPENAI_MODEL` (configurado nesta cópia como `gpt-5.4`). O modelo escolhe ferramentas de leitura de documentos e CRM. Não há web search, navegação externa, SQL livre, escrita comercial ou envio de mensagens. A única geração externa é feita pela OpenAI, com os trechos internos necessários. `store:false` foi definido; isso não é uma promessa de retenção zero pelo fornecedor.

O painel conserva o diálogo enquanto a sessão da página estiver aberta, envia contexto da conta por UUID, permite cancelar, iniciar nova conversa e consultar os trechos usados. Não há persistência de conversas entre recarregamentos. O contexto enviado ao modelo é limitado às últimas 22 mensagens anteriores, até 30 mil caracteres.

O assistente não usa `assistantAnswer`, catálogo da demo ou dados enviados pelo navegador como fonte oficial. A apresentação não comprova visitas, e o responsável pela atividade não é automaticamente tratado como visitante presencial. A ferramenta `latest_visit` resolve empresa/pessoa, recusa ambiguidades e compara atividades concluídas e interações de visita. Agendamentos pendentes são excluídos.

## Base comercial inicial

Fonte: `apresentacao.html` fornecida pelo usuário. SHA-256: `59bf448a920e7057dfb8766a69b2412254cc3a7e1b85ef5979c66dc5a4e6a79f`.

Importação reproduzível de 33 slides em `web/src/server/assistant/knowledge/presentation.json`. O slide 33 é uma ação promocional de evento e não é disponibilizado ao agente; 32 slides podem ser consultados. Textos são extraídos sem executar HTML, scripts ou carregar URLs. Imagens não foram transcritas.

Cobertura: origem e institucional, mangueiras, terminais, adaptadores, conexões, máquina de corte, prensa, pistola de descontaminação, lacres, gravação a laser, sistema de cores, Tawper Academy, suporte, HydraSense, fornecimento e presença comercial.

Lacunas: tabela técnica de diâmetros/comprimentos/pressões, SKUs completos, compatibilidades por aplicação, estoque, garantia e condições comerciais oficiais. O valor de R$ 7.700 é exemplo ilustrativo de ocorrência; não é preço de mangueira. Certificações são atribuídas à apresentação e à linha aplicável.

Para atualizar a fonte:

```powershell
python web/scripts/import-presentation.py 'caminho/para/apresentacao.html'
```

Depois, revisar a extração, registrar a data da nova fonte e executar a avaliação. A base atual é versionada no repositório; ainda não há tela de upload ou edição documental.

## Configuração

As credenciais desta cópia estão em `web/.env.local`, ignorado pelo Git. Nunca colocar as chaves secretas no código, nos testes, nos relatórios ou em variáveis `NEXT_PUBLIC_`.

```dotenv
OPENAI_API_KEY=<somente servidor>
OPENAI_MODEL=gpt-5.4
ASSISTANT_ENABLED=true
ASSISTANT_LOCAL_PREVIEW=true
NEXT_PUBLIC_SUPABASE_URL=<url do projeto>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave pública>
SUPABASE_SERVICE_ROLE_KEY=<somente servidor>
NEXT_PUBLIC_TAWPER_USE_SUPABASE=true
```

URL e chave pública Supabase podem ser expostas ao cliente; as chaves OpenAI e service role não podem. Para configuração isolada do assistente, existem alternativas `ASSISTANT_SUPABASE_URL`, `ASSISTANT_SUPABASE_ANON_KEY` e `ASSISTANT_SUPABASE_SERVICE_ROLE_KEY`.

Executar `npm.cmd run dev` em `web/`; a prévia fica em `http://127.0.0.1:4100`. O comando de desenvolvimento foi limitado ao loopback. Em produção, `ASSISTANT_LOCAL_PREVIEW` não permite acesso: o endpoint exige JWT verificado por `getUser`, membership ativa e consultas com RLS. Trocar o perfil visual da demonstração não autentica ninguém. A tela de login e a validação completa entre perfis continuam nos gates do plano mestre.

`GET /api/crm/snapshot` foi corrigido para carregar/mapear perfis existentes, sem chamar `ensureOperators`. Abrir uma página não cria nem atualiza operadores. Outras rotas antigas de escrita da aplicação continuam fora do escopo deste marco e não estão aprovadas para produção.

## Consultas e limites

- Projeções explícitas para 17 tabelas do CRM, organização fixa e RLS no modo autenticado.
- Filtros e ordenações validados; chaves relacionais exigem UUID exato.
- Paginação de até 50 registros por chamada, com contagem e indicação de páginas restantes.
- Até 8 rodadas e 20 chamadas de ferramenta por resposta, timeout de 170 segundos na rota.
- Até 12 requisições por minuto e uma em andamento por identidade, por processo. Limites distribuídos exigem infraestrutura adicional antes de expansão.
- Respostas estruturadas; referências inexistentes ou não consultadas são rejeitadas. Isso valida proveniência, não prova automaticamente cada conclusão textual.
- Erros não contêm credenciais ou payloads privados. Logs registram modelo, versão do prompt, ferramentas, tokens e duração.

## Evidências e verificações

- 13 testes determinísticos em `npm.cmd run test:assistant`: identidade, homônimos, visitas agendadas, banco indisponível, validação, fontes, origem de requisição e bloqueio de prévia fora do desenvolvimento.
- 8 cenários com API OpenAI real em `npm.cmd run test:assistant:live`: portfólio, dimensão ausente, preço ilustrativo, visita correta, ambiguidade, ausência de banco, tentativa de inventar fonte e continuidade. Visitas desta avaliação usam fixture isolada, claramente identificada. Evidência: `evidencias/assistant-live-2026-10-17.json`.
- Todas as 17 projeções SQL foram consultadas com sucesso no banco real, somente leitura. A consulta anônima não acessou empresas. Evidência: `evidencias/assistant-crm-2026-10-17.json`.
- O fluxo HTTP → OpenAI → ferramentas → Supabase retornou os totais reais de 5 empresas e 25 atividades. Evidência: `evidencias/assistant-crm-response-2026-10-17.json`.
- Banco consultado nesta sessão: 6 contatos, 5 perfis, 1 visita concluída; nenhum perfil com nome Phedro. Catálogo, conversas e interações estavam vazios. Esses totais são evidência pontual, não constantes de produto.
- Após a abertura de páginas, a contagem de perfis permaneceu 5; nenhum dado comercial de teste foi criado.

- 3 testes de navegador aprovados: resposta documental e continuidade; recuperação de falha da API; pergunta sobre a última visita usando o UUID da conta aberta e o registro real correspondente. Comando: `npm.cmd run test:assistant:browser`.
- `npm.cmd run lint` e `npm.cmd run build` aprovados, incluindo verificação TypeScript. `git diff --check` sem erros de whitespace.
- Captura da interface: `evidencias/assistant-browser.png`.

## Pendências para produção

Aceite de Phedro, autenticação operacional, matriz de acesso testada entre usuários reais, limites/custos acordados e gates anteriores permanecem pendentes. Não há promessa de infalibilidade: as ferramentas e os testes reduzem associações erradas, e respostas sem evidência devem indicar a lacuna.

Rollback: definir `ASSISTANT_ENABLED=false`. Nenhuma migration ou escrita comercial precisa ser revertida.

Referências: CR-001 e ADR-004. Integração baseada na [documentação oficial de function calling](https://developers.openai.com/api/docs/guides/function-calling), [saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs) e [verificação de usuário Supabase](https://supabase.com/docs/reference/javascript/auth-getuser).
