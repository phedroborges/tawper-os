# Tawper OS — Plano mestre de implementação

> Documento operacional e fonte de verdade para transformar a demonstração atual em um sistema de produção.
>
> **Versão:** 1.0  
> **Criado em:** 23/09/2026  
> **Atualizado em:** 24/09/2026  
> **Fase atual:** Fase 0 — Fechamento de produto e riscos  
> **Estado geral:** EM ANDAMENTO  
> **Responsável por aprovar os gates:** a definir na Fase 0

---

## 1. Finalidade deste documento

Este plano existe para que o Tawper OS seja construído na ordem correta, respeitando as dependências entre produto, dados, segurança, regras comerciais, integrações e interface.

Ele deve impedir quatro problemas:

1. começar telas ou integrações antes de definir os dados dos quais elas dependem;
2. considerar pronta uma funcionalidade que só funciona visualmente ou com dados simulados;
3. acoplar o produto a um fornecedor externo, especialmente ao provedor temporário de WhatsApp;
4. avançar com dúvidas ou defeitos que obriguem a reconstruir fases posteriores.

O objetivo não é afirmar que nunca haverá evolução. Sistemas reais sempre evoluem. O objetivo é garantir que uma fase aprovada tenha contratos, dados e comportamentos estáveis o bastante para que as próximas fases sejam construídas sobre ela sem refazer a fundação.

---

## 2. Regra máxima de execução

> **Só existe uma fase ativa por vez. A próxima fase só pode começar quando o gate da fase atual estiver formalmente aprovado e suas evidências estiverem registradas neste documento.**

Trabalhos exploratórios podem ocorrer antecipadamente somente quando estiverem explicitamente autorizados na seção “Trabalho antecipado permitido”. Código de produção pertencente a uma fase futura não deve ser implementado antes do gate correspondente.

### 2.1 Estados permitidos

Cada fase deve estar em exatamente um destes estados:

- `NÃO INICIADA`: ainda não pode receber implementação.
- `PRONTA PARA INICIAR`: dependências concluídas e equipe disponível.
- `EM ANDAMENTO`: única fase que pode receber trabalho de produção.
- `BLOQUEADA`: existe impedimento externo ou decisão pendente registrada.
- `EM VALIDAÇÃO`: implementação terminada, aguardando testes e aceite.
- `CONCLUÍDA`: gate aprovado, evidências anexadas e nenhuma pendência bloqueante.

### 2.2 O que não conta como conclusão

Uma fase não está concluída quando:

- funciona apenas com seed, mock, `localStorage` ou resposta simulada;
- funciona apenas para administrador;
- foi testada somente pelo desenvolvedor que a implementou;
- há migração de banco não reproduzível;
- existe autorização somente na interface, mas não no servidor ou no banco;
- erros importantes estão escondidos em `TODO`, planilha, conversa ou memória;
- não existe forma de diagnosticar falhas em produção;
- a documentação e os testes não refletem o comportamento entregue;
- o rollback ou a recuperação dos dados não foram definidos;
- alguma caixa obrigatória do gate permanece desmarcada.

### 2.3 Procedimento para concluir uma fase

1. Terminar todos os entregáveis obrigatórios.
2. Executar todos os testes do gate.
3. Corrigir falhas encontradas.
4. Registrar links, comandos, relatórios e decisões em “Evidências”.
5. Fazer a demonstração de aceite para o responsável do produto.
6. Registrar nome e data da aprovação.
7. Alterar o estado para `CONCLUÍDA`.
8. Alterar a fase seguinte para `PRONTA PARA INICIAR`.

---

## 3. Como usar o plano em toda sessão de desenvolvimento

Antes de editar código, toda pessoa ou agente deve:

1. ler este documento;
2. localizar a fase marcada como `EM ANDAMENTO`;
3. confirmar que a tarefa pertence aos entregáveis dessa fase;
4. verificar decisões e ADRs já aprovados;
5. não implementar escopo de fase futura;
6. ao finalizar, atualizar checklist, evidências e registro de mudanças.

Se uma tarefa não pertencer à fase ativa, ela deve ir para o backlog da fase correta. Se revelar uma falha estrutural de fase já concluída, deve seguir o processo de controle de mudança da seção 18.

---

## 4. Estado atual do repositório

A base atual é uma demonstração navegável em Next.js, TypeScript, Tailwind e Zustand.

### 4.1 O que já pode ser reaproveitado

- identidade visual e estrutura geral das telas;
- modelo conceitual presente em `web/src/lib/types.ts`;
- definição inicial de funis e critérios em `web/src/lib/constants.ts`;
- regras derivadas e indicadores em `web/src/lib/selectors.ts`;
- fluxos de interação e experiência já demonstrados;
- dados fictícios como fixtures para testes e homologação;
- especificação funcional em `talper-especificacao-fluxos.md`.

### 4.2 O que ainda é demonstração

- persistência em `localStorage`;
- troca de perfil sem autenticação real;
- regras críticas executadas no navegador;
- WhatsApp simulado;
- IA simulada;
- notificações e automações simuladas;
- orçamento e envio de PDF simulados;
- rotas e quilometragem simuladas;
- auditoria alterável pelo cliente;
- ausência de banco, webhooks, filas, observabilidade e testes automatizados.

### 4.3 Baseline técnica em 23/09/2026

- `npm run lint`: aprovado;
- `npm run build`: aprovado;
- testes unitários: inexistentes;
- testes de integração: inexistentes;
- testes end-to-end: inexistentes;
- backend de produção: inexistente.

Essa baseline comprova a saúde do protótipo, não a conclusão de uma fase de produção.

---

## 5. Escopo por marco

### 5.1 Marco A — V1 operacional

O primeiro sistema utilizável em produção deve conter:

- autenticação e recuperação de acesso;
- perfis e acesso por carteira;
- empresas, contatos e oportunidades;
- funis de aquisição e recorrência;
- critérios de avanço e histórico de etapa;
- atividades e próximo passo obrigatório;
- estado de espera com revisão obrigatória;
- Meu Dia, Carteira, Empresa 360° e Kanban;
- estratégia manual da conta;
- auditoria confiável;
- propostas básicas;
- WhatsApp por API não oficial, isolada por adaptador;
- automações operacionais essenciais;
- dashboard operacional básico com drill-down;
- importação validada;
- uso responsivo no celular;
- monitoramento, backup, documentação e treinamento.

### 5.2 Marco B — Estabilização e API oficial

- migração gradual para a API oficial do WhatsApp;
- coexistência controlada de provedores durante a transição;
- templates, consentimento e regras da janela de atendimento;
- desligamento seguro do provedor não oficial.

### 5.3 Marco C — Inteligência e gestão avançada

- resumo de conversa com IA;
- extração de compromissos, datas e dados técnicos;
- sugestão de próximo passo;
- copiloto estratégico com aprovação humana;
- rotas e mapas;
- modo TV avançado;
- indicadores financeiros;
- integrações de agenda, e-mail, custos e faturamento.

Os Marcos B e C não bloqueiam a entrada em produção do Marco A, salvo se o responsável do produto alterar formalmente o escopo.

---

## 6. Princípios arquiteturais que não podem ser violados

1. **PostgreSQL é a fonte de verdade.** O navegador não é a fonte oficial de nenhum dado de negócio.
2. **Regras críticas são aplicadas no servidor.** A interface pode orientar, mas não decide autorização nem integridade.
3. **Toda tabela de negócio possui `organization_id`.** Mesmo com uma única empresa inicialmente, o isolamento nasce na fundação.
4. **Toda alteração crítica é auditável.** Auditoria é append-only e não pode depender do cliente.
5. **Operações compostas são transacionais.** Etapa, histórico, tarefas e auditoria mudam juntas ou não mudam.
6. **Integrações são substituíveis.** WhatsApp, IA, armazenamento e notificações entram por contratos internos e adaptadores.
7. **Webhooks são idempotentes.** Repetir o mesmo evento não pode repetir seus efeitos.
8. **Chamadas externas não ficam dentro de transações longas.** Usar outbox/fila quando houver efeito externo.
9. **IDs externos não são chaves primárias internas.** Cada provedor possui seu próprio mapeamento.
10. **Datas são armazenadas em UTC com `timestamptz`.** A exibição usa `America/Sao_Paulo`, salvo decisão diferente.
11. **Telefones são normalizados em E.164.** A formatação visual é separada do valor canônico.
12. **Valores monetários usam tipo decimal exato e moeda explícita.** Nunca `float`.
13. **Exclusão comercial é lógica.** Registros de negócio são arquivados; exclusão física exige política específica.
14. **Migrations aplicadas nunca são reescritas.** Correções entram em novas migrations.
15. **Interfaces autenticadas não usam cache compartilhado.** Dados de uma sessão nunca podem vazar para outra.
16. **Segredos nunca chegam ao cliente.** Chaves administrativas e sessões de provedor ficam apenas no servidor.
17. **RLS e grants são explícitos e testados.** Autenticação sem autorização não é suficiente.
18. **Zustand fica restrito ao estado efêmero de interface.** Dados comerciais vêm do servidor.

---

## 7. Arquitetura alvo

```text
Navegador
  ├── Server Components: leituras iniciais e páginas
  ├── Client Components: interação, filtros, modais e estado visual
  └── Server Actions: mutações originadas pela interface
                         │
                         ▼
Camada de aplicação / casos de uso
  ├── autenticação e autorização
  ├── validação de entrada
  ├── invariantes comerciais
  ├── transações
  ├── auditoria
  └── publicação de eventos/outbox
                         │
                         ▼
PostgreSQL / Supabase
  ├── schema transacional
  ├── constraints e índices
  ├── RLS e grants
  ├── storage
  └── backups

Route Handlers
  ├── webhooks de WhatsApp
  ├── callbacks externos
  └── APIs que precisem ser consumidas fora da interface
                         │
                         ▼
Adaptadores externos
  ├── WhatsApp não oficial
  ├── WhatsApp Cloud API oficial
  ├── provedor de IA
  └── serviços futuros
```

### 7.1 Divisão de responsabilidades no Next.js

- Server Components fazem leituras diretamente pela camada de dados.
- Server Actions tratam mutações iniciadas na interface.
- Route Handlers recebem webhooks e chamadas externas.
- Client Components não recebem segredos nem executam regras críticas.
- Toda Server Action e Route Handler verifica autenticação, autorização e input novamente.

### 7.2 Estrutura lógica esperada

Os nomes podem ser ajustados na Fase 1, mas as responsabilidades devem permanecer separadas:

```text
web/src/
  app/                    rotas, páginas, actions e webhooks
  components/             apresentação e interação
  modules/
    companies/            domínio, casos de uso, queries e schemas
    deals/
    activities/
    conversations/
    quotes/
    audit/
  server/
    auth/                 sessão e autorização
    db/                   cliente e queries compartilhadas
    integrations/         contratos e adaptadores
    jobs/                 tarefas assíncronas
    observability/        logs, métricas e erros
  lib/                    utilitários sem regra de negócio específica
```

---

## 8. Mapa de dependências

```text
F0 Produto e riscos
 └── F1 Fundação de engenharia
      └── F2 Banco e modelo canônico
           └── F3 Autenticação, autorização e segurança
                └── F4 Núcleo transacional
                     └── F5 Conversão da interface
                          └── F6 Migração piloto
                               └── F7 WhatsApp não oficial
                                    └── F8 Automações
                                         └── F9 Dashboard e gestão
                                              └── F10 UAT e migração final
                                                   └── F11 Piloto, produção e estabilização
                                                        ├── F12 WhatsApp oficial
                                                        ├── F13 IA assistiva
                                                        └── F14 Gestão avançada
```

F12, F13 e F14 podem avançar separadamente depois da estabilização, mas cada uma continua submetida ao seu próprio gate.

### 8.1 Caminho crítico

O caminho crítico do Marco A é:

`F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10 → F11`

### 8.2 Trabalho antecipado permitido

Somente estas atividades podem ocorrer antes da fase correspondente:

- na Fase 0, realizar prova técnica descartável dos provedores de WhatsApp;
- o banco de dados está sendo criado sem autenticação de usuários de login. A Fase 3 — Autenticação, autorização e segurança será alinhada por último com o Murilo; até essa decisão, o schema e o uso local não dependem de login;
- durante F2–F4, preparar dados brutos de migração sem importá-los no banco final;
- durante F5–F6, solicitar acessos, verificações e documentos necessários à API oficial;
- durante F7–F10, preparar conjunto anonimizado de avaliações de IA, sem integrar IA à produção.

Protótipos antecipados não podem virar dependência de produção sem passar pela fase e pelo gate apropriados.

---

## 9. Quadro mestre de fases

| Fase | Estado | Estimativa | Dependência obrigatória | Marco |
|---|---|---:|---|---|
| F0 — Produto e riscos | EM ANDAMENTO | 1–2 semanas | Nenhuma | A |
| F1 — Fundação de engenharia | NÃO INICIADA | 1 semana | G0 | A |
| F2 — Banco e modelo canônico | NÃO INICIADA | 2 semanas | G1 | A |
| F3 — Autenticação e segurança | NÃO INICIADA | 1–2 semanas | G2 | A |
| F4 — Núcleo transacional | NÃO INICIADA | 2–3 semanas | G3 | A |
| F5 — Conversão da interface | NÃO INICIADA | 2–3 semanas | G4 | A |
| F6 — Migração piloto | NÃO INICIADA | 1–2 semanas | G5 | A |
| F7 — WhatsApp não oficial | NÃO INICIADA | 2 semanas | G6 | A |
| F8 — Automações | NÃO INICIADA | 1–2 semanas | G7 | A |
| F9 — Dashboard e gestão | NÃO INICIADA | 1–2 semanas | G8 | A |
| F10 — UAT e migração final | NÃO INICIADA | 2 semanas | G9 | A |
| F11 — Piloto e estabilização | NÃO INICIADA | 1 semana + 30 dias | G10 | A |
| F12 — WhatsApp oficial | NÃO INICIADA | 2–4 semanas | G11 | B |
| F13 — IA assistiva | NÃO INICIADA | 3–5 semanas | G11 e dados reais | C |
| F14 — Gestão avançada | NÃO INICIADA | 3–5 semanas | G11 e fontes definidas | C |

As estimativas medem duração provável, não substituem os gates. Uma fase atrasada continua ativa até estar realmente concluída.

---

## 10. Fases detalhadas e gates

### Fase 0 — Fechamento de produto e riscos

**Estado:** EM ANDAMENTO  
**Objetivo:** eliminar decisões ambíguas antes que elas virem schema, permissão ou integração errada.

#### Entradas obrigatórias

- demonstração atual;
- especificação funcional;
- acesso a uma amostra real da planilha;
- exportação ou documentação do Moskit;
- identificação do provedor não oficial de WhatsApp pretendido;
- disponibilidade do responsável comercial para decisões.

#### Entregáveis

- [ ] Nome, e-mail, telefone, perfil e região dos usuários iniciais.
- [ ] Matriz de acesso: quem vê, cria, edita, transfere, exporta e arquiva cada tipo de dado.
- [ ] Definição final dos dois funis e suas etapas.
- [ ] Campos obrigatórios de entrada e saída por etapa.
- [ ] Prazos, alertas e escalonamentos por etapa.
- [ ] Definição de urgência, estagnação, espera, retomada, ganho, perda e arquivamento.
- [ ] Decisão sobre múltiplas oportunidades simultâneas por empresa.
- [ ] Definição da fonte oficial de venda e faturamento.
- [ ] Dicionário de dados com tipo, obrigatoriedade, origem e responsável por cada campo.
- [ ] Estratégia de migração: planilha, Moskit, coexistência, corte e histórico necessário.
- [ ] Inventário de números do WhatsApp, proprietários e vendedores responsáveis.
- [ ] Prova técnica descartável do provedor não oficial com um número secundário.
- [ ] Registro dos recursos do provedor: texto, mídia, status, webhook, QR, reconexão e limites.
- [ ] Plano inicial de consentimento, retenção e exclusão para LGPD.
- [ ] Critérios de aceite escritos para os cinco cenários principais.
- [ ] Nomeação do responsável por aprovar cada gate.
- [ ] ADR-001: stack e hospedagem aprovadas. Redigida em `docs/adr/ADR-001-stack-e-hospedagem.md`; aguarda aprovação formal.
- [ ] ADR-002: estratégia de autenticação aprovada.
- [ ] ADR-003: estratégia temporária e futura do WhatsApp aprovada.
- [x] Painel visual do plano mestre disponível em `/implementacao`.

#### Testes e validações

- [ ] Workshop de regras realizado com os responsáveis.
- [ ] Pelo menos cinco registros reais percorridos do início ao fim nos funis.
- [ ] Amostra de dados classificada em: importável, corrigível e não importável.
- [ ] Provedor não oficial recebeu e enviou mensagem em ambiente de prova.
- [ ] Riscos comerciais e técnicos documentados com responsável e mitigação.

#### Gate G0 — Produto fechado para fundação

- [ ] Nenhuma decisão estrutural está marcada como “a definir”.
- [ ] Dicionário de dados aprovado.
- [ ] Matriz de permissões aprovada.
- [ ] Funis e invariantes aprovados.
- [ ] Escopo do Marco A assinado.
- [ ] Riscos do WhatsApp não oficial aceitos explicitamente.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 1 — Fundação de engenharia

**Estado:** NÃO INICIADA  
**Objetivo:** criar uma base repetível de desenvolvimento, teste, implantação e diagnóstico.

#### Dependência

- Gate G0 aprovado.

#### Entregáveis

- [ ] Estratégia de branches, revisão e releases definida.
- [ ] Ambientes local, homologação e produção separados.
- [ ] Variáveis de ambiente documentadas sem segredos no repositório.
- [ ] Projeto Supabase local e remoto configurado por ambiente.
- [ ] CLI e bibliotecas com versões fixadas no lockfile.
- [ ] Migrations versionadas e reproduzíveis desde banco vazio.
- [ ] Pipeline de CI com instalação, lint, typecheck, testes e build.
- [ ] Framework de testes unitários configurado.
- [ ] Framework de testes end-to-end configurado.
- [ ] Logs estruturados, correlação de requisição e captura de erros configurados.
- [ ] Health check da aplicação e dependências.
- [ ] Estratégia de backup, restauração e retenção documentada.
- [ ] Feature flags para integrações externas.
- [ ] Convenção de módulos e fronteiras server/client documentada.
- [ ] Páginas de erro, acesso negado, não encontrado e loading base.

#### Testes e validações

- [ ] Um novo ambiente pode ser criado apenas com documentação e scripts versionados.
- [ ] Uma migration sobe do zero e pode ser aplicada novamente sem divergência.
- [ ] CI bloqueia lint, tipos, testes ou build quebrados.
- [ ] Um erro intencional aparece no monitoramento com correlation ID.
- [ ] Backup de teste é restaurado em ambiente descartável.

#### Gate G1 — Fundação reproduzível

- [ ] CI completamente verde.
- [ ] Homologação publicada automaticamente.
- [ ] Banco reproduzível por migrations.
- [ ] Segredos auditados.
- [ ] Restauração comprovada.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 2 — Banco e modelo canônico

**Estado:** NÃO INICIADA  
**Objetivo:** criar a fonte de verdade que sustentará todo o sistema.

#### Dependência

- Gate G1 aprovado.

#### Entidades mínimas

**Identidade e organização**

- [ ] `organizations`
- [ ] `profiles`
- [ ] `memberships`
- [ ] `regions`
- [ ] `user_region_assignments`

**CRM**

- [ ] `companies`
- [ ] `company_relationships`
- [ ] `contacts`
- [ ] `opportunities`
- [ ] `funnels`
- [ ] `stages`
- [ ] `stage_requirements`
- [ ] `opportunity_stage_history`
- [ ] `opportunity_requirement_values`
- [ ] `strategies`
- [ ] `strategy_versions`

**Execução**

- [ ] `activities`
- [ ] `activity_results`
- [ ] `interactions`
- [ ] `standby_periods`
- [ ] `notifications`

**Comercial**

- [ ] `quotes`
- [ ] `quote_items`
- [ ] `sales`

**Comunicação e integrações**

- [ ] `integration_accounts`
- [ ] `conversations`
- [ ] `conversation_participants`
- [ ] `messages`
- [ ] `message_attachments`
- [ ] `external_identities`
- [ ] `inbound_events`
- [ ] `outbox_events`
- [ ] `job_attempts`

**Governança**

- [ ] `audit_events`
- [ ] `import_batches`
- [ ] `import_rows`
- [ ] `data_consents`

#### Regras de modelagem obrigatórias

- [ ] Chaves primárias internas independentes de fornecedores.
- [ ] `organization_id` em todas as tabelas de negócio.
- [ ] Chaves estrangeiras com comportamento de exclusão explícito.
- [ ] Índice em toda chave estrangeira usada em filtros ou joins.
- [ ] Unicidade de CNPJ normalizado por organização, quando disponível.
- [ ] Estratégia documentada para empresas sem CNPJ.
- [ ] Telefone canônico e índice para busca de duplicidade.
- [ ] Constraints de status e coerência temporal.
- [ ] No máximo uma etapa atual válida por oportunidade.
- [ ] Histórico de etapa imutável após fechamento, salvo correção administrativa auditada.
- [ ] Auditoria append-only.
- [ ] Payload bruto de integração separado dos dados canônicos.
- [ ] Chave única `(provider, external_event_id)` para idempotência de webhook.
- [ ] Chave idempotente para comandos externos e eventos de outbox.
- [ ] Índices alinhados aos filtros de Carteira, Meu Dia, Kanban e Dashboard.
- [ ] Paginação por cursor para listas potencialmente grandes.

#### Testes e validações

- [ ] Testes de constraints com casos válidos e inválidos.
- [ ] Testes de unicidade e duplicidade.
- [ ] Testes de deleção e arquivamento.
- [ ] Testes de concorrência em operações sensíveis.
- [ ] Plano de queries das telas críticas revisado.
- [ ] Migrations aplicam em banco vazio e em cópia da versão anterior.
- [ ] Schema comparado com todo o dicionário de dados da Fase 0.

#### Gate G2 — Fonte de verdade aprovada

- [ ] Todas as entidades do Marco A têm representação canônica.
- [ ] Nenhuma tela futura depende de JSON opaco para dado que será filtrado ou relatado.
- [ ] Constraints impedem estados estruturalmente inválidos.
- [ ] Índices básicos revisados.
- [ ] Migrations reproduzíveis e testadas.
- [ ] Diagrama do banco atualizado.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 3 — Autenticação, autorização e segurança

**Estado:** NÃO INICIADA  
**Objetivo:** garantir identidade real e acesso correto antes de expor dados comerciais.

#### Dependência

- Gate G2 aprovado.

#### Entregáveis

- [ ] Login, logout, convite e recuperação de acesso.
- [ ] Sessão SSR por cookies seguros.
- [ ] Renovação de sessão compatível com Next.js 16.
- [ ] Perfis `admin`, `gestor`, `vendedor` e `representante` implementados.
- [ ] Escopo por organização, carteira e região implementado.
- [ ] Verificação de autorização em Server Actions e Route Handlers.
- [ ] RLS habilitada em toda tabela exposta.
- [ ] Grants explícitos por tabela e operação.
- [ ] Policies separadas para leitura, inserção, alteração e exclusão.
- [ ] Nenhuma decisão de autorização baseada em `user_metadata` editável.
- [ ] Chave administrativa restrita ao servidor.
- [ ] Views acessíveis configuradas com `security_invoker` ou isoladas.
- [ ] Storage privado com policies para anexos.
- [ ] Logs sem tokens, senhas ou conteúdo sensível desnecessário.
- [ ] Proteção contra acesso direto por ID de registro de outra carteira.

#### Matriz mínima de testes

- [ ] Usuário não autenticado não acessa páginas ou dados protegidos.
- [ ] Vendedor acessa somente sua carteira autorizada.
- [ ] Representante não acessa carteira de outro representante.
- [ ] Gestor acessa as carteiras definidas na matriz.
- [ ] Administrador executa apenas ações administrativas previstas.
- [ ] Usuário não pode trocar `owner_id` para obter acesso indevido.
- [ ] Policies testadas para `select`, `insert`, `update` e `delete`.
- [ ] Testes negativos existem para todas as tabelas expostas.

#### Gate G3 — Segurança antes dos dados reais

- [ ] Matriz de permissões da Fase 0 está integralmente coberta por testes.
- [ ] Testes RLS allow/deny estão verdes.
- [ ] Testes de IDOR/BOLA estão verdes.
- [ ] Nenhum segredo foi enviado ao bundle do navegador.
- [ ] Rotas autenticadas não usam cache compartilhado.
- [ ] Auditoria de segurança da configuração não possui achados críticos.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 4 — Núcleo transacional e regras comerciais

**Estado:** NÃO INICIADA  
**Objetivo:** transformar as regras do protótipo em casos de uso seguros, atômicos e testáveis.

#### Dependência

- Gate G3 aprovado.

#### Casos de uso obrigatórios

- [ ] Criar empresa, contato, oportunidade e primeiro próximo passo.
- [ ] Pesquisar possíveis duplicidades por CNPJ, telefone e nome normalizado.
- [ ] Unir empresas preservando contatos, negócios, mensagens e histórico.
- [ ] Atualizar cadastro com auditoria de antes/depois.
- [ ] Criar, reagendar, concluir e cancelar atividade.
- [ ] Concluir atividade e criar próximo passo na mesma transação.
- [ ] Validar critérios de saída no servidor antes de mudar etapa.
- [ ] Mudar etapa, fechar histórico, abrir histórico e criar tarefas atomicamente.
- [ ] Colocar em espera com motivo, condição e revisão obrigatórios.
- [ ] Retomar conta em espera.
- [ ] Registrar perda com motivo obrigatório.
- [ ] Registrar primeira venda, fechar aquisição, abrir recorrência e criar pós-venda atomicamente.
- [ ] Registrar recompra e iniciar novo ciclo.
- [ ] Criar e versionar estratégia.
- [ ] Criar, revisar, enviar e decidir proposta.
- [ ] Registrar comentário/cobrança interna.
- [ ] Registrar auditoria pelo servidor para todas as ações críticas.

#### Invariantes obrigatórias

- [ ] Empresa ativa tem responsável.
- [ ] Oportunidade aberta tem funil, etapa, responsável e histórico coerente.
- [ ] Empresa ativa com oportunidade aberta possui próximo passo ou espera válida.
- [ ] Atividade concluída possui resultado.
- [ ] Espera possui data de reavaliação futura no momento da criação.
- [ ] Ganho possui valor, data e responsável.
- [ ] Perda possui motivo.
- [ ] Mudança de etapa inválida nunca pode ser forçada pela interface.
- [ ] Toda operação recebe uma chave de idempotência quando puder ser repetida por rede.
- [ ] Concorrência não cria duas recorrências ou duas atividades obrigatórias iguais.

#### Estratégia de transação e efeitos externos

- [ ] Transações contêm apenas leitura/validação e escrita no banco.
- [ ] Envio de WhatsApp, IA ou outro HTTP nunca ocorre dentro da transação.
- [ ] Efeitos externos são gravados em `outbox_events` na mesma transação do negócio.
- [ ] Worker processa a outbox com tentativas, backoff e dead-letter.

#### Testes e validações

- [ ] Testes unitários das regras puras.
- [ ] Testes de integração dos casos de uso contra banco real local.
- [ ] Testes de rollback: falha no meio não deixa estado parcial.
- [ ] Testes de concorrência e idempotência.
- [ ] Testes de auditoria: autor, origem, antes e depois.
- [ ] Fixtures cobrem os cinco cenários da especificação.

#### Gate G4 — Domínio confiável

- [ ] Todos os casos de uso obrigatórios estão cobertos.
- [ ] Todas as invariantes estão protegidas no servidor ou banco.
- [ ] Operações compostas são atômicas.
- [ ] Auditoria é gerada sem depender do navegador.
- [ ] Suíte unitária e de integração está verde.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 5 — Conversão da interface para dados reais

**Estado:** NÃO INICIADA  
**Objetivo:** preservar a experiência validada substituindo o store de demonstração pelo sistema real.

#### Dependência

- Gate G4 aprovado.

#### Ordem obrigatória de conversão

1. [ ] Shell autenticado, sessão e navegação.
2. [ ] Cadastro, edição, busca de duplicidade e união de empresa.
3. [ ] Carteira e filtros.
4. [ ] Empresa 360°.
5. [ ] Atividades e Meu Dia.
6. [ ] Kanban e mudança validada de etapa.
7. [ ] Espera, ganho, perda e recorrência.
8. [ ] Estratégia da conta.
9. [ ] Propostas.
10. [ ] Auditoria.
11. [ ] Gestão básica por exceção.

#### Regras da conversão

- [ ] Leituras iniciais ocorrem em Server Components sempre que adequado.
- [ ] Mutações da interface usam Server Actions.
- [ ] Componentes cliente recebem somente dados serializáveis.
- [ ] Zustand mantém apenas filtros temporários, modais, toasts e estados similares.
- [ ] `localStorage` não guarda dados comerciais.
- [ ] Cada tela tem loading, vazio, erro, acesso negado e sucesso.
- [ ] Filtros relevantes aparecem na URL ou em estado persistente controlado.
- [ ] Listas grandes usam paginação.
- [ ] Experiência mobile cobre as tarefas essenciais do vendedor.

#### Testes end-to-end obrigatórios

- [ ] Administrador cria e atribui uma empresa sem duplicar cadastro.
- [ ] Vendedor registra contato, resultado e próximo passo pelo celular.
- [ ] Oportunidade avança apenas após cumprir critérios.
- [ ] Primeira venda cria recorrência e pós-venda.
- [ ] Gestor vê exceções e chega ao registro de origem.
- [ ] Usuário não acessa uma empresa fora de sua carteira alterando a URL.

#### Gate G5 — CRM real utilizável

- [ ] As telas essenciais não dependem mais do store de demonstração.
- [ ] Cinco jornadas end-to-end estão verdes.
- [ ] Desktop e celular foram validados.
- [ ] Erros são apresentados de maneira recuperável.
- [ ] A demonstração original continua disponível apenas como fixture ou ambiente isolado, se necessário.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 6 — Migração piloto e qualidade dos dados

**Estado:** NÃO INICIADA  
**Objetivo:** provar que dados reais cabem no modelo antes de construir relatórios e integrações sobre eles.

#### Dependência

- Gate G5 aprovado.

#### Pipeline obrigatório

1. [ ] Extrair fontes sem alterar os originais.
2. [ ] Armazenar arquivo e checksum do lote.
3. [ ] Normalizar responsáveis, regiões, etapas, marcas, prensas, telefones e CNPJ.
4. [ ] Separar observação, estratégia, histórico e tarefa.
5. [ ] Detectar duplicidades com score e motivo.
6. [ ] Mapear IDs de origem para IDs internos.
7. [ ] Validar linhas antes de gravar.
8. [ ] Importar de forma idempotente em homologação.
9. [ ] Produzir relatório por linha: criada, atualizada, ignorada ou rejeitada.
10. [ ] Reconciliar totais e registros críticos.

#### Amostra mínima

- [ ] 20–50 empresas reais.
- [ ] Pelo menos um caso de cada etapa principal.
- [ ] Pelo menos cinco duplicidades reais ou simuladas de forma representativa.
- [ ] Empresas com e sem CNPJ.
- [ ] Empresas com múltiplos contatos.
- [ ] Histórico, estratégia, tarefas abertas e responsáveis.

#### Gate G6 — Dados reais compatíveis

- [ ] Nenhuma perda silenciosa de dado.
- [ ] Toda rejeição possui motivo legível.
- [ ] Reprocessar o mesmo lote não duplica registros.
- [ ] Totais reconciliados com as fontes.
- [ ] Amostra aprovada pelos responsáveis comerciais.
- [ ] Ajustes necessários ao modelo foram feitos antes do WhatsApp e dashboard.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 7 — WhatsApp por API não oficial, isolada por adaptador

**Estado:** NÃO INICIADA  
**Objetivo:** disponibilizar comunicação real sem tornar o produto dependente do fornecedor temporário.

#### Dependência

- Gate G6 aprovado.
- Prova técnica da Fase 0 aprovada.

#### Contrato interno obrigatório

O restante do Tawper OS conhece apenas um contrato interno equivalente a:

- [ ] conectar e desconectar conta;
- [ ] consultar saúde da conexão;
- [ ] enviar texto;
- [ ] enviar mídia/documento;
- [ ] normalizar webhook recebido;
- [ ] mapear status de mensagem;
- [ ] obter ou baixar mídia;
- [ ] identificar capacidades e limitações do provedor.

Nenhuma tela ou regra comercial importa o SDK do provedor diretamente.

#### Entregáveis

- [ ] Adaptador do provedor não oficial.
- [ ] Route Handler de webhook com validação disponível no provedor.
- [ ] Persistência do payload bruto antes do processamento.
- [ ] Deduplicação por evento externo.
- [ ] Normalização para conversa e mensagem canônicas.
- [ ] Vínculo assistido por telefone com contato e empresa.
- [ ] Atribuição por número e vendedor.
- [ ] Fila/outbox para mensagens de saída.
- [ ] Retentativas com backoff e dead-letter.
- [ ] Status enviado, entregue, lido e falhou quando suportados.
- [ ] Armazenamento privado de anexos.
- [ ] Monitor de sessão, QR/reconexão e alerta de queda.
- [ ] Feature flag por número.
- [ ] Fallback manual para contato quando a API estiver indisponível.
- [ ] Limites de envio conservadores e bloqueio de disparo em massa.
- [ ] Política de retenção e acesso ao conteúdo.
- [ ] Painel mínimo de saúde da integração.

#### Testes obrigatórios

- [ ] Mensagem de entrada cria apenas uma mensagem, mesmo com webhook repetido.
- [ ] Mensagem de saída repetida com a mesma chave não é duplicada.
- [ ] Falha temporária é reenviada dentro do limite.
- [ ] Falha permanente vai para dead-letter e gera alerta.
- [ ] Reconexão não perde nem duplica mensagens.
- [ ] Mídia indisponível não bloqueia o restante da conversa.
- [ ] Número desconhecido permanece desvinculado até decisão do usuário.
- [ ] Usuário sem permissão não acessa conversa de outra carteira.
- [ ] Credenciais e sessão não aparecem no cliente ou nos logs.

#### Piloto obrigatório

- [ ] Um número secundário por pelo menos cinco dias úteis.
- [ ] Volume e falhas registrados.
- [ ] Plano de desconexão e recuperação testado.
- [ ] Expansão número por número, nunca todos simultaneamente.

#### Gate G7 — Comunicação temporária controlada

- [ ] Histórico fica preservado no Tawper, não apenas no provedor.
- [ ] Integração pode ser desligada por feature flag.
- [ ] Nenhuma dependência do provedor vazou para o domínio ou a interface.
- [ ] Idempotência e recuperação passaram nos testes.
- [ ] Piloto foi aceito com riscos documentados.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 8 — Automações e notificações

**Estado:** NÃO INICIADA  
**Objetivo:** automatizar somente regras que já foram comprovadas com dados e usuários reais.

#### Dependência

- Gate G7 aprovado.

#### Entregáveis

- [ ] Atividade vencida.
- [ ] Conta ativa sem próximo passo.
- [ ] Oportunidade estagnada conforme limite da etapa.
- [ ] Cliente sem interação dentro do período definido.
- [ ] Espera com reavaliação vencida.
- [ ] Orçamento próximo do vencimento ou vencido.
- [ ] Escalonamento ao gestor após prazo configurado.
- [ ] Resumo diário por vendedor.
- [ ] Resumo semanal para o gestor.
- [ ] Central de notificações com leitura e link de origem.
- [ ] Agendador, worker, tentativas, dead-letter e observabilidade.
- [ ] Configuração por organização e regra.

#### Regras obrigatórias

- [ ] Jobs são idempotentes.
- [ ] Reexecutar uma janela não duplica alertas.
- [ ] Toda automação registra versão da regra e evidência de origem.
- [ ] Horário e timezone são explícitos.
- [ ] Mensagem externa automática continua desabilitada no Marco A, salvo decisão formal.

#### Gate G8 — Automação confiável

- [ ] Todas as regras têm testes temporais.
- [ ] Reexecução não duplica efeitos.
- [ ] Falhas geram alerta operacional.
- [ ] Usuários confirmaram utilidade e frequência.
- [ ] Não existe automação externa sem autorização explícita.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 9 — Dashboard e gestão por exceção

**Estado:** NÃO INICIADA  
**Objetivo:** produzir indicadores auditáveis apenas sobre dados transacionais estabilizados.

#### Dependência

- Gate G8 aprovado.

#### Indicadores mínimos

- [ ] Contas ativas por vendedor.
- [ ] Empresas por etapa.
- [ ] Contas sem próximo passo.
- [ ] Atividades criadas, concluídas, vencidas e no prazo.
- [ ] Tempo médio por etapa.
- [ ] Estagnação por faixa de dias.
- [ ] Avanço entre etapas.
- [ ] Ganhos e perdas.
- [ ] Conversão geral.
- [ ] Propostas abertas.
- [ ] Recorrentes sem compra na janela.
- [ ] Qualidade cadastral.

#### Regras obrigatórias

- [ ] Fórmula, período, timezone e filtros documentados por indicador.
- [ ] Todo cartão abre exatamente os registros que formam o número.
- [ ] Permissões dos detalhes são iguais às permissões do agregado.
- [ ] Consultas usam índices adequados e paginação.
- [ ] Nenhum indicador financeiro sem fonte oficial aprovada.
- [ ] Dados de teste e produção nunca são misturados.

#### Gate G9 — Números confiáveis

- [ ] Cada indicador foi reconciliado com consulta de referência.
- [ ] Drill-down corresponde ao total exibido.
- [ ] Filtros de período, vendedor, região e funil foram testados.
- [ ] Desempenho atende aos limites definidos na Fase 0/F1.
- [ ] Gestor aprovou as fórmulas.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 10 — UAT, migração final e preparação do corte

**Estado:** NÃO INICIADA  
**Objetivo:** comprovar o sistema completo do Marco A e ensaiar a entrada em produção.

#### Dependência

- Gate G9 aprovado.

#### Entregáveis

- [ ] Plano de UAT com responsáveis e massa de teste.
- [ ] Execução dos critérios de aceite da especificação.
- [ ] Ensaio completo de migração em homologação.
- [ ] Relatório de reconciliação por entidade e responsável.
- [ ] Correção de duplicidades e rejeições.
- [ ] Teste de carga proporcional ao volume esperado.
- [ ] Teste de segurança e revisão de permissões.
- [ ] Teste de backup e restauração final.
- [ ] Plano de congelamento das fontes antigas.
- [ ] Plano de corte com horários e responsáveis.
- [ ] Plano de rollback com limite de decisão.
- [ ] Runbook de incidentes.
- [ ] Material de treinamento e suporte.
- [ ] Termos e política de privacidade aplicáveis.

#### Critérios de severidade

- `P0`: perda/vazamento de dados ou sistema indisponível — impede o corte.
- `P1`: fluxo essencial bloqueado — impede o corte.
- `P2`: fluxo possui alternativa segura — pode cortar apenas com aceite registrado.
- `P3`: melhoria visual ou de conveniência — vai para backlog.

#### Gate G10 — Autorização de produção

- [ ] Nenhum defeito P0 ou P1 aberto.
- [ ] Defeitos P2 aceitos e com prazo.
- [ ] Migração ensaiada e reconciliada.
- [ ] Rollback testado.
- [ ] Usuários-chave treinados.
- [ ] Go/no-go aprovado formalmente.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 11 — Piloto, produção e estabilização

**Estado:** NÃO INICIADA  
**Objetivo:** colocar o Marco A em uso real de forma gradual e observável.

#### Dependência

- Gate G10 aprovado.

#### Sequência

1. [ ] Congelar fontes antigas conforme plano.
2. [ ] Executar migração final.
3. [ ] Reconciliar totais antes de liberar acesso.
4. [ ] Liberar dois usuários e um número de WhatsApp.
5. [ ] Acompanhar por cinco dias úteis.
6. [ ] Corrigir problemas críticos.
7. [ ] Expandir usuários e números gradualmente.
8. [ ] Manter acompanhamento intensivo por 30 dias.

#### Métricas de estabilização

- [ ] Disponibilidade.
- [ ] Erros por fluxo.
- [ ] Latência das páginas e ações essenciais.
- [ ] Filas pendentes e dead-letter.
- [ ] Saúde das conexões de WhatsApp.
- [ ] Mensagens duplicadas ou perdidas.
- [ ] Atividades sem próximo passo.
- [ ] Divergências de permissão.
- [ ] Adoção por usuário.

#### Gate G11 — Marco A estabilizado

- [ ] Trinta dias sem defeito P0 aberto.
- [ ] Nenhum P1 recorrente.
- [ ] Backups e restauração continuam válidos.
- [ ] Filas e webhooks estão saudáveis.
- [ ] Operação consegue trabalhar sem planilha paralela para o escopo migrado.
- [ ] Responsável comercial aceita o Marco A.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 12 — Migração para WhatsApp oficial

**Estado:** NÃO INICIADA  
**Objetivo:** substituir o provedor temporário sem reconstruir o CRM ou perder o histórico interno.

#### Dependência

- Gate G11 aprovado.
- Empresa, números e conta Meta aptos para a API oficial.

#### Entregáveis

- [ ] Revisão da documentação e changelog oficiais no início da fase.
- [ ] Cadastro empresarial, números e permissões aprovados.
- [ ] Consentimentos e categorias de mensagem formalizados.
- [ ] Templates necessários aprovados.
- [ ] Adaptador `MetaCloudWhatsAppProvider` implementado no mesmo contrato interno.
- [ ] Mapeamento de status e erros oficiais para estados canônicos.
- [ ] Validação de assinatura dos webhooks.
- [ ] Controle da janela de atendimento e uso de templates.
- [ ] Caminho de escalonamento para atendimento humano.
- [ ] Feature flag de provedor por número.
- [ ] Plano de migração e rollback número por número.
- [ ] Desligamento e revogação das credenciais do provedor antigo.

#### Testes obrigatórios

- [ ] Mesma suíte de contrato executada contra os dois adaptadores.
- [ ] Histórico anterior permanece acessível.
- [ ] Troca de provedor não altera empresa, contato ou conversa canônica.
- [ ] Mensagens em trânsito são conciliadas no corte.
- [ ] Templates e janela de atendimento bloqueiam envio inválido.
- [ ] Rollback foi ensaiado antes do primeiro número real.

#### Gate G12 — Provedor oficial estabilizado

- [ ] Todos os números planejados foram migrados.
- [ ] Provedor temporário está sem tráfego e sem credenciais ativas.
- [ ] Métricas e alertas oficiais estão operacionais.
- [ ] Nenhuma perda de histórico ou vínculo.
- [ ] Operação aceitou a nova conexão.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 13 — IA assistiva

**Estado:** NÃO INICIADA  
**Objetivo:** adicionar inteligência somente depois de existir contexto real, governado e avaliável.

#### Dependências

- Gate G11 aprovado.
- Volume mínimo de conversas e atividades reais definido e atingido.
- Política de dados e fornecedor de IA aprovados.

#### Ordem obrigatória

1. [ ] Conjunto de avaliação anonimizado e aprovado.
2. [ ] Resumo de conversa sem escrita automática.
3. [ ] Extração de compromissos, datas e dados técnicos com confirmação.
4. [ ] Sugestão de próximo passo com confirmação.
5. [ ] Resumo diário e semanal.
6. [ ] Copiloto estratégico com fontes exibidas.
7. [ ] Somente depois, avaliar mensagens externas autorizadas.

#### Controles obrigatórios

- [ ] Prompt e modelo versionados.
- [ ] Input e output estruturados e validados.
- [ ] Confirmação humana para alterações comerciais.
- [ ] Evidências utilizadas exibidas ao usuário.
- [ ] Proteção contra invenção de dados ausentes.
- [ ] Métricas de qualidade, latência, custo e rejeição.
- [ ] Redação/minimização de dados conforme política.
- [ ] Feature flag e fallback sem IA.

#### Gate G13 — IA confiável para assistência

- [ ] Avaliação atinge limites acordados por caso de uso.
- [ ] Nenhuma escrita crítica ocorre sem aprovação humana.
- [ ] Custos e limites estão monitorados.
- [ ] Usuários entendem que a saída é uma sugestão.
- [ ] Desligar a IA não interrompe o CRM.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

### Fase 14 — Gestão avançada e ecossistema

**Estado:** NÃO INICIADA  
**Objetivo:** evoluir recursos que dependem de fontes e operação estabilizadas.

#### Dependências

- Gate G11 aprovado.
- Fonte oficial de cada indicador adicional definida.

#### Entregas possíveis, cada uma com subgate próprio

- [ ] Rotas, mapas e sequência de visitas.
- [ ] Custos de quilometragem e viagem.
- [ ] Modo TV avançado.
- [ ] Receita, margem e recorrência financeira.
- [ ] CAC, ROI e LTV.
- [ ] Agenda e e-mail.
- [ ] Rastreamento de veículos.
- [ ] Aplicativo móvel dedicado, se ainda necessário.

Nenhum indicador financeiro será implementado antes de definir fonte, periodicidade, reconciliação e proprietário do dado.

#### Gate G14 — Visão completa

- [ ] Cada módulo possui fonte confiável, testes, observabilidade e aceite.
- [ ] Indicadores reconciliam com os sistemas de origem.
- [ ] Custos operacionais estão documentados.
- [ ] Documentação final e treinamento estão atualizados.

**Aprovado por:** —  
**Data:** —  
**Evidências:** —

---

## 11. Definition of Done global

Além do gate específico, toda entrega deve satisfazer:

- [ ] Requisito e critério de aceite identificados.
- [ ] Input validado no servidor.
- [ ] Autenticação e autorização verificadas no servidor.
- [ ] RLS/grants revisados quando houver acesso a dados.
- [ ] Regras críticas cobertas por teste unitário ou de integração.
- [ ] Jornada crítica coberta por teste end-to-end quando aplicável.
- [ ] Migração de banco reproduzível quando houver alteração de schema.
- [ ] Índices e planos das queries relevantes revisados.
- [ ] Estados de loading, vazio, erro e acesso negado tratados.
- [ ] Logs e métricas suficientes para diagnosticar falha.
- [ ] Nenhum segredo ou dado sensível indevido em logs/cliente.
- [ ] Acessibilidade e uso mobile verificados quando houver interface.
- [ ] Documentação atualizada.
- [ ] Rollback ou mitigação descritos.
- [ ] `lint`, typecheck, testes e build aprovados.
- [ ] Aceite funcional registrado.

---

## 12. Estratégia de testes

### 12.1 Pirâmide mínima

- **Unitários:** datas, normalização, critérios, cálculos e regras puras.
- **Banco:** constraints, funções, migrations, RLS e grants.
- **Integração:** casos de uso contra PostgreSQL real local.
- **Contrato:** todos os adaptadores de WhatsApp obedecem ao mesmo contrato.
- **End-to-end:** jornadas do vendedor, gestor e administrador.
- **Carga:** Carteira, Meu Dia, Kanban, dashboard, webhooks e workers.
- **Recuperação:** backup, restore, reprocessamento e rollback.

### 12.2 Cenários permanentes de regressão

1. Lead desconhecido vira empresa sem duplicidade e recebe primeiro próximo passo.
2. Cliente em homologação aguarda medidas e não avança sem critério.
3. Produto aprovado recebe orçamento e follow-up.
4. Primeira venda abre recorrência e pós-venda.
5. Cliente estagnado gera alerta e aparece para o gestor.
6. Cliente em espera reaparece na data de revisão.
7. Vendedor não acessa carteira alheia.
8. Webhook duplicado não duplica mensagem.
9. Job repetido não duplica atividade ou notificação.
10. Importação repetida não duplica empresa.

---

## 13. Estratégia de migrations e compatibilidade

1. Toda alteração de schema nasce em migration versionada.
2. Migration aplicada em ambiente compartilhado nunca é editada.
3. Mudanças destrutivas usam expandir → migrar → validar → contrair.
4. Colunas novas entram opcionais ou com default seguro antes de se tornarem obrigatórias.
5. Código compatível com schema antigo e novo é publicado antes da remoção.
6. Backfill é observável, reiniciável e idempotente.
7. Constraints pesadas são validadas de modo seguro para o volume existente.
8. Toda chave estrangeira relevante recebe índice.
9. Cada release registra versão do app e versão das migrations.
10. Produção nunca é o primeiro ambiente a executar uma migration.

---

## 14. Estratégia de WhatsApp sem aprisionamento

### 14.1 Modelo canônico

O Tawper guarda sua própria representação de:

- conta/número conectado;
- conversa;
- participantes;
- mensagem;
- anexo;
- status de entrega;
- evento recebido;
- tentativa de envio;
- consentimento;
- vínculo com empresa, contato e responsável.

### 14.2 Dados específicos do provedor

Devem ficar restritos a `integration_accounts`, `external_identities`, `inbound_events` e metadados técnicos controlados:

- nome do provedor;
- ID da instância;
- ID externo da mensagem;
- ID externo da conversa;
- payload bruto;
- capacidades;
- credenciais criptografadas ou referência ao cofre de segredos.

### 14.3 Regra de migração

Trocar de provedor só pode exigir:

1. adicionar um novo adaptador;
2. configurar contas e credenciais;
3. executar a mesma suíte de contrato;
4. migrar número por feature flag;
5. reconciliar mensagens em trânsito;
6. desativar o adaptador anterior.

Se a troca exigir alterar telas, contatos, empresas ou regras comerciais, a abstração da Fase 7 foi considerada incorreta e o gate não deve ser aprovado.

---

## 15. Segurança e LGPD

- [ ] Base legal e finalidades documentadas.
- [ ] Consentimento de contato registrado quando aplicável.
- [ ] Política de retenção por categoria de dado.
- [ ] Processo de acesso, correção, exportação e exclusão.
- [ ] Minimização de conteúdo enviado para IA e integrações.
- [ ] Criptografia em trânsito e proteção de segredos.
- [ ] Menor privilégio em banco, storage e provedores.
- [ ] Auditoria de acesso administrativo.
- [ ] Plano de resposta a incidente.
- [ ] Contratos e subprocessadores registrados.
- [ ] Backup com acesso restrito e retenção definida.

---

## 16. Observabilidade mínima

O sistema não entra em produção sem conseguir responder:

- a aplicação está disponível?
- o banco está saudável?
- autenticação está falhando?
- qual usuário e correlation ID executaram a ação?
- há migrations pendentes?
- webhooks estão chegando?
- eventos estão duplicando?
- mensagens estão presas na fila?
- qual número de WhatsApp caiu?
- jobs executaram no horário?
- existem dead-letters?
- qual release introduziu o erro?
- o backup mais recente é restaurável?

Alertas devem ter responsável, canal e procedimento de resposta.

---

## 17. Riscos permanentes

| Risco | Impacto | Mitigação obrigatória |
|---|---|---|
| Bloqueio ou instabilidade da API não oficial | Alto | adaptador, feature flag, limites, monitor, fallback e migração oficial |
| Dados inconsistentes do Moskit/planilha | Alto | pipeline idempotente, relatório por linha e reconciliação |
| Permissão aplicada apenas na interface | Crítico | autorização no servidor, RLS e testes negativos |
| Duas ações simultâneas criarem registros duplicados | Alto | constraints, transação, idempotência e testes de concorrência |
| Dashboard divergir da operação | Alto | fonte transacional, fórmula documentada e drill-down |
| IA inventar dados ou agir sem aprovação | Alto | avaliação, output estruturado, fontes e confirmação humana |
| Escopo da demo ser confundido com produto pronto | Alto | marcos e gates deste documento |
| Dependência de uma pessoa | Médio | runbooks, documentação, CI e ambientes reproduzíveis |
| Falha sem diagnóstico | Alto | logs, métricas, correlation ID, filas e alertas |
| Migration destrutiva | Crítico | expand/migrate/contract, backup, ensaio e rollback |

---

## 18. Controle de mudanças e prevenção de retrabalho

Não é permitido alterar silenciosamente uma decisão de fase concluída.

### 18.1 Quando abrir uma solicitação de mudança

- nova necessidade contradiz uma invariante aprovada;
- alteração de provedor modifica contrato interno;
- dados reais não cabem no modelo aprovado;
- regra comercial aprovada estava incorreta;
- requisito legal ou de segurança exige mudança;
- uma fase futura revela ausência estrutural anterior.

### 18.2 Conteúdo obrigatório

```text
ID:
Data:
Solicitante:
Problema observado:
Decisão anterior afetada:
Fases e dados afetados:
Alternativas avaliadas:
Opção escolhida:
Plano de migration/backfill:
Plano de teste:
Plano de rollback:
Aprovador:
```

### 18.3 ADRs

Decisões arquiteturais duráveis devem ser registradas em `docs/adr/` com contexto, decisão, consequências e alternativas. O número do ADR deve ser citado neste plano e no pull request correspondente.

---

## 19. Registro de execução

Atualizar esta tabela sempre que uma fase mudar de estado.

| Data | Fase | Estado anterior | Estado novo | Responsável | Evidência/observação |
|---|---|---|---|---|---|
| 23/09/2026 | F0 | NÃO INICIADA | PRONTA PARA INICIAR | — | Plano mestre criado |
| 24/09/2026 | F0 | PRONTA PARA INICIAR | EM ANDAMENTO | Codex | Painel visual do plano concluído e validado em `/implementacao`; F0 permanece aberta até o Gate G0 |

---

## 20. Decisões pendentes da Fase 0

Estas decisões impedem o Gate G0:

- [ ] Quem aprova formalmente cada fase?
- [ ] Quais são os usuários, e-mails, telefones e regiões corretos?
- [ ] Quem enxerga a carteira de quem?
- [ ] Uma empresa pode ter oportunidades simultâneas?
- [ ] Quais campos e evidências são obrigatórios por etapa?
- [ ] Quais limites definem atenção e estagnação?
- [ ] Quando e por quanto tempo uma conta pode ficar em espera?
- [ ] Quais critérios formais definem ganho, perda e arquivamento?
- [ ] Qual é a fonte oficial de venda e faturamento?
- [ ] O Moskit será migrado integralmente ou haverá convivência?
- [ ] Qual provedor não oficial será utilizado primeiro?
- [ ] Quais números entram no piloto e quem é proprietário deles?
- [ ] Qual volume diário esperado de mensagens?
- [ ] Quais dados e históricos precisam ser retidos?
- [x] Qual será a hospedagem do Next.js e dos workers? Respondida no ADR-001: Supabase Cloud para o banco; VPS com EasyPanel para o restante, compartilhada nos testes e duas VPS dedicadas em produção; Cloudflare na frente.
- [ ] Quais indicadores são indispensáveis no primeiro dashboard?
- [ ] Quais tempos máximos de resposta e indisponibilidade são aceitáveis?

---

## 21. Checklist para iniciar qualquer fase

- [ ] Fase anterior está `CONCLUÍDA`.
- [ ] Gate anterior possui aprovador, data e evidências.
- [ ] Dependências externas estão disponíveis.
- [ ] Critérios de aceite da fase estão compreendidos.
- [ ] Riscos específicos foram revisados.
- [ ] Responsável técnico e responsável de produto estão definidos.
- [ ] Ambiente e dados de teste estão prontos.
- [ ] Não há decisão estrutural pendente para esta fase.

Se qualquer item estiver desmarcado, a fase permanece `NÃO INICIADA` ou `BLOQUEADA`.

---

## 22. Referências obrigatórias

- Especificação funcional: `talper-especificacao-fluxos.md`
- Apresentação/especificação visual: `tawper-os-especificacao.html`
- Estado atual da demo: `web/README.md`
- Modelo conceitual atual: `web/src/lib/types.ts`
- Funis e critérios atuais: `web/src/lib/constants.ts`
- Regras derivadas atuais: `web/src/lib/selectors.ts`
- Ações simuladas atuais: `web/src/lib/store.ts`
- Documentação Next.js instalada: `web/node_modules/next/dist/docs/`
- Supabase Auth SSR: <https://supabase.com/docs/guides/auth/server-side>
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Database Testing: <https://supabase.com/docs/guides/database/testing>
- Supabase changelog: <https://supabase.com/changelog?types=breaking-change>
- WhatsApp Business Policy: <https://business.whatsapp.com/policy/preview?lang=pt_BR>

Antes de implementar Next.js, Supabase ou WhatsApp, revisar a documentação e o changelog atuais. Este plano fixa princípios e dependências; APIs externas podem mudar.

---

## 23. Próxima ação autorizada

A única próxima ação de produção autorizada por este plano é executar a **Fase 0 — Fechamento de produto e riscos**.

Não iniciar banco, autenticação, integração real ou conversão das telas antes do Gate G0.

Ao concluir a Fase 0:

1. preencher todas as caixas e evidências;
2. registrar aprovador e data;
3. mudar F0 para `CONCLUÍDA`;
4. mudar F1 para `PRONTA PARA INICIAR`;
5. adicionar uma linha no Registro de execução.
