# Tawper OS — Plano de implementação da pipeline de 12/11/2026

> Pedido do Phedro Borges em 12/11/2026. Cobre os 39 itens da lista, do lembrete por WhatsApp ao painel de configurações.
> Base lida: `origin/main` em `8ac032a` (+ `98927d0` no branch `fix/whatsapp-central`, ainda sem push).
> Estado: **PLANO, nada implementado.**

## 1. Regras de execução

Método Ponytail em todas as fases: resolver o pedido inteiro com o mínimo de código novo.

1. **Reusar antes de criar.** Tabelas que já existem no banco e hoje estão paradas (`route_plans`, `route_stops`, `notifications`, `stage_requirements`, `stage_task_templates`, `quotes.pdf_path`) entram em uso em vez de criar outras.
2. **Apagar antes de somar.** Roteiro da demo, Modo TV, Ver no celular, Reiniciar demo, catálogo e montagem de orçamento saem do código, não ficam escondidos.
3. **Sem dependência nova** sem necessidade. Gráficos seguem o padrão SVG próprio de `components/charts/HBar.tsx`.
4. **Regra nova tem teste.** Toda função com cálculo (agenda da rota, quebra de meta, lembrete, região por UF) é pura, fica em `web/src/lib/` e ganha um teste `vitest`.
5. **Nada de renomear chave de etapa no banco** (regra do `CLAUDE.md`): mudam nome e comportamento na tela, a chave continua.
6. **Banco:** eu não escrevo no banco. Cada fase entrega a migration em `supabase/migrations/` e o Phedro aplica. Nunca editar migration já aplicada.
7. **Git:** uma fase = um branch próprio em worktree (`feat/pipeline-fN-nome`), saindo do `origin/main`. `git fetch` antes de começar e antes de comitar. Push no `main` só com o ok do Phedro.
8. **Antes de comitar:** `npx tsc --noEmit`, `npx eslint` nos arquivos alterados, `npm run build`, `npm test` (em `web/`).
9. **Teste real** no app publicado ao fim de cada fase, só nas empresas de teste. Envio de WhatsApp para a equipe só depois de autorização explícita.

### Fase 0 — Registro (antes de qualquer código)

- O `PLANO_IMPLEMENTACAO.md` ainda marca "Fase 0" e exige solicitação de mudança (seção 18) para alterar o que já foi decidido. Este plano muda funil de recorrência, regiões e orçamento, então abre `docs/changes/SM-2026-11-12-001-pipeline-producao.md` apontando para este arquivo.
- **Atenção:** a pasta principal `tawper-os` tem alterações não comitadas de outra sessão em `supabase/migrations/20261019130000_0019_funis_alinhados.sql` e `web/scripts/gen-funil-sql.mjs`. Alguém está mexendo em funis. Confirmar com essa pessoa antes da Fase 5.

## 2. Todos os pedidos e onde cada um é resolvido

| # | Pedido | Fase |
|---|---|---|
| P01 | Lembrete das atividades por WhatsApp no número pessoal de cada pessoa (do dia e de 2 dias à frente) | 7 |
| P02 | Painel de requisitos das atividades, pensando no próximo passo | 9 |
| P03 | Painel de requisitos das etapas | 9 |
| P04 | Configurações no canto inferior esquerdo, com Implementação, Auditoria e Equipe dentro | 2 |
| P05 | Minha conta: trocar senha (atual + nova), nome e telefone | 2 |
| P06 | Tirar Reiniciar demo, Modo TV, Ver no celular e Roteiro da demo | 1 |
| P07 | Barra lateral mais alinhada | 1 e 2 |
| P08 | Rotas: caminho traçado no mapa | 4 |
| P09 | Rotas: a rota em evidência, acima do mapa | 4 |
| P10 | Regiões do sistema = regiões do Brasil, automáticas pela localização | 3 |
| P11 | Filtro de rotas ajustado às novas regiões | 3 |
| P12 | Descritivo de cada seletor em Rotas (região e data) | 1 |
| P13 | Viagem possível: 8h às 18h, sem fim de semana, visita em horário útil | 4 |
| P14 | Tarefa de confirmação de visita para quem criou a rota e para o cliente | 4 |
| P15 | Mais variáveis que atrasam a viagem | 4 |
| P16 | Painel de mensagens vira painel de auditoria | 8 |
| P17 | Sai a criação de orçamento; vendedor só sobe o orçamento feito no outro sistema | 6 |
| P18 | Bug de interface na Estratégia do cliente (Bioenergia) | 1 |
| P19 | Exemplos nos seletores e campos | 1 |
| P20 | "Copecar" em Marca atual | 1 |
| P21 | Voltar etapa: só o aviso, sem abrir a tela de etapa | 1 |
| P22 | Reabrir cliente perdido, voltando para Qualificação | 5 |
| P23 | Definir Negociação recorrente x Recompra | 5 |
| P24 | Suporte deixa de ser etapa e vira marca no cliente | 5 |
| P25 | Recorrência em loop: vendeu, volta para Pós-venda | 5 |
| P26 | Coluna de vendas com um cartão por negócio (cliente, valor, 1ª/2ª/3ª venda) | 5 |
| P27 | Primeira venda da aquisição leva o cliente para a recorrência | 5 (já existe; conferir) |
| P28 | Filtro de data no funil (tags ficam para depois, como você disse) | 5 |
| P29 | Dados de demonstração verossímeis | 13 |
| P30 | Painel: filtros por cliente, vendedor, data e valor negociado | 11 |
| P31 | Painel: mais tipos de gráfico | 11 |
| P32 | Painel: dados no detalhe (quem mais registra, mais atua, atraso, participação) | 11 |
| P33 | Metas: configuração (anual que se divide sozinha, por vendedor ou para todos) | 10 |
| P34 | Metas: pódio ouro, prata e bronze por venda | 10 |
| P35 | Metas: quebra em atividades (ligações por dia, visitas por mês, reuniões, R$ por mês) | 10 |
| P36 | Metas: painel para a equipe, pedaço de cada vendedor, controle só de administrador | 10 |
| P37 | Meu dia mais visual e com menos texto | 12 |
| P38 | Este plano | feito |
| P39 | Usar Ponytail | seção 1 |

## 3. Decisões que preciso de você

Cada uma tem um padrão. Se você não responder, sigo o padrão.

| # | Decisão | Padrão que vou seguir |
|---|---|---|
| D1 | **Data da apresentação.** Define o que entra antes. | Corte para a demo: Fases 1, 2, 5, 12 e 13. O resto segue depois. |
| D2 | **Dados da demo:** zerar e recriar tudo fictício, ou corrigir o que está lá? As 4 usinas de nome real (Jalles Machado, Cerradinho, BP, Tropical) com seu contato e o da Franciele ficam? | Recriar tudo fictício, mantendo equipe, login e o agente do WhatsApp. As 4 usinas reais saem da demo. |
| D3 | **Regiões:** quase toda a carteira está em Sudeste e Centro-Oeste. Só a macrorregião filtra pouco. | Um seletor só: região e, dentro dela, o estado (Sudeste › SP, MG…). |
| D4 | **Conversas do número da empresa:** manter como aba só de leitura para gestor, ou tirar? | Manter como aba só de leitura. O código está testado e funcionando. |
| D5 | **Confirmação de visita com o cliente:** texto pronto para o vendedor mandar do próprio WhatsApp, ou envio automático pelo número da empresa? | Texto pronto com link do WhatsApp. Combina com "cada um usa o próprio número". |
| D6 | **Quem chama hoje o worker do agente** (`/api/internal/ai/whatsapp-worker`)? O lembrete usa o mesmo agendador. | Mesmo agendador, segunda a sexta às 07:30. |
| D7 | **Filtro de data do funil:** filtra por qual data? | Negócio aberto: data de entrada na etapa atual. Venda: data da venda. |

## 4. Fases

Ordem por dependência. Pequenas e visíveis primeiro; dados da demo por último, porque dependem do modelo novo.

---

### Fase 1 — Limpeza e ajustes rápidos (P06, P07, P12, P18, P19, P20, P21)

Sem banco. Um commit por item.

| Item | O que muda | Onde |
|---|---|---|
| P06 | Apagar o bloco do rodapé da barra lateral e tudo que só ele usava: `DemoGuide.tsx`, `guideOpen`/`setGuide`, páginas `/tv` e `/celular`, `resetDemo` | `components/shell/AppShell.tsx:175-204`, `components/shell/DemoGuide.tsx`, `lib/ui-store.ts`, `lib/store.ts:349`, `app/tv`, `app/celular`, referência em `dashboard/page.tsx` |
| P20 | Acrescentar `"Copecar"` em `MARCAS` (vale para cadastro, edição, etapa e filtro da carteira de uma vez) | `lib/constants.ts:367` |
| P21 | Um só aviso, sem abrir "Ver etapa": *"Você já passou por {etapa} com {cliente}. Não é possível voltar etapas."* Os 3 pontos passam a chamar a mesma função | `funis/page.tsx:69-72`, `components/flows/stage.tsx:41-43` e `:236-240` |
| P12 | Rótulo e uma linha de ajuda em cada seletor: "Região: filtra as contas da lista e do mapa" e "Data da viagem: dia da primeira visita" | `rotas/page.tsx:305-325` |
| P18 | Reproduzir no app real com um cliente "Bioenergia" antes de mexer. Suspeita: o objetivo inteiro vira título do cartão e a grade de 2 colunas não tem `min-w-0`, então texto longo estoura | `components/company/StrategyTab.tsx:192-197` |
| P19 | Texto de exemplo em todo campo livre e uma linha de exemplo sob cada seletor, no padrão que já existe em `PAPEL_GUIA` (rótulo + exemplo). Começa por Estratégia (5 campos sem exemplo), cadastro de cliente, nova atividade e mudança de etapa | `StrategyTab.tsx:208-226`, `empresas/nova/page.tsx`, `components/flows/misc.tsx`, `activity.tsx`, `stage.tsx` |

**Pronto quando:** barra lateral sem os 4 itens; arrastar cartão para trás mostra só o aviso; Copecar aparece nos 4 lugares; tela de Estratégia conferida em 1280 px e no celular com texto longo.

---

### Fase 2 — Configurações e barra lateral final (P04, P05, P07)

**Barra lateral final:** Meu dia · Carteira · Funis · Propostas · Rotas · Metas | Gestão: Gestão · Painel · Registros | rodapé: **Configurações** (engrenagem) e Recolher menu.

- Nova rota `app/(app)/configuracoes/` com menu lateral interno. As páginas atuais **mudam de pasta, sem reescrever**: `equipe`, `auditoria`, `implementacao` passam para `configuracoes/…`. Ajustar os 2 links que apontam para elas (`gestao/page.tsx:188`) e a lista `FLUID_ROUTES`.
- Abas: **Minha conta** (todos) · **Lembretes** (todos, Fase 7) · **Equipe** (admin) · **Etapas** e **Atividades** (admin, Fase 9) · **Metas** (admin, Fase 10) · **Auditoria** (gestor) · **Implementação** (admin).
- **Minha conta:** nome, nome curto, telefone e senha.
  - Perfil: reaproveita a validação de `updateMember` (`server/auth/team-admin.ts:103`), limitada à própria pessoa.
  - Senha: confere a senha atual com `signInWithPassword` (igual ao login) e grava com `auth.admin.updateUserById` (igual a `setMemberPassword`). Mínimo de 8 caracteres, nova diferente da atual.
  - Uma rota nova `POST /api/auth/conta`, autenticada pela sessão. Nunca aceita `id` de outra pessoa.
- **Teste:** `vitest` da rota (senha atual errada recusa; não troca perfil alheio).

**Pronto quando:** vendedor troca a própria senha e telefone sem pedir ao administrador; vendedor não vê Equipe, Etapas, Metas nem Auditoria.

---

### Fase 3 — Regiões do Brasil automáticas (P10, P11)

- `lib/regions.ts` (85 linhas, mapa cidade → região comercial) vira um mapa de 27 UFs para as 5 regiões. `REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"]`.
- **Ninguém digita região.** Sai o seletor de região do cadastro (`empresas/nova/page.tsx:419`), da edição (`flows/misc.tsx:308`) e da etapa (`flows/stage.tsx:140`). A região é calculada da UF que vem do CEP/GPS, no servidor (`server/persist.ts:137` e `:310`).
- O critério "Região" da etapa Lead passa a ser cumprido sozinho quando há cidade e UF.
- Filtros de Carteira, Funis e Rotas: um seletor com região e estado dentro (D3).
- Agente do WhatsApp: tirar o parâmetro `regiao` de `tools/cliente.ts` e `tools/criar-cliente.ts`; `lib/ai-context.ts:176` segue lendo `REGIOES`.
- **Banco (migration 0023):** inserir as 5 regiões em `regions` com seus estados; preencher `companies.region_id` pela UF; marcar as 7 antigas como inativas (não apagar).
- **Teste:** `regions.test.ts` com as 27 UFs; bateria do agente (`AGENT_BATTERY=1`) porque o cadastro pelo WhatsApp muda.

**Pronto quando:** cadastrar cliente com CEP de Goiás grava Centro-Oeste sem ninguém escolher; nenhum cliente sem região no banco.

---

### Fase 4 — Rotas (P08, P09, P13, P14, P15)

1. **Rota acima do mapa (P09):** o cartão "Rota sugerida" sobe para antes do `RouteMap` (`rotas/page.tsx:329-337` e `:433-508`), com paradas, horários, km e botões.
2. **Caminho traçado (P08):** o mapa já desenha o trajeto pelo Google (`RouteMap.tsx:108`), mas só enquanto se monta a rota. Falta: desenhar ao clicar numa rota já salva; marcadores numerados; linha reta entre as paradas quando o Google não responde. Conferir no app real se o traçado atual aparece (pode ser a chave do Google).
3. **Rota gravada no banco:** hoje a rota mora só no navegador (`lib/store.ts:843`), então some em outro aparelho e o gestor não vê a rota do vendedor. Passa a usar `route_plans` e `route_stops`, que já existem. Dois comandos novos em `server/commands.ts` e leitura no snapshot.
4. **Agenda possível (P13, P15):** nova função pura `lib/route-schedule.ts`, que troca a conta atual de "uma visita a cada 2h30" (`lib/store.ts:331`).
   - Jornada das 08:00 às 18:00, almoço das 12:00 às 13:00, sem sábado e domingo.
   - Tempo de estrada de cada trecho pelo Google; sem ele, distância a 60 km/h.
   - Visita de 60 minutos (ajustável por parada).
   - **Folgas que atrasam:** 20% sobre o tempo de estrada (trânsito, estrada de terra, chuva); 20 minutos por parada em usina (portaria e integração de segurança); 10 minutos de espera pelo contato; volta à base contada dentro do dia.
   - Não coube até as 18:00: o resto vai para o próximo dia útil e a tela avisa "esta rota precisa de 2 dias". Feriado nacional pula o dia.
   - O campo de data recusa fim de semana. Cada parada mostra a hora de chegada e de saída.
5. **Confirmação da visita (P14):** ao confirmar a rota, além da visita, cada parada cria a tarefa "Confirmar visita com {contato}" para quem criou a rota, um dia útil antes, às 09:00. A tarefa traz o texto pronto e o link do WhatsApp do contato (D5). Visita sem confirmação concluída aparece como alerta em Gestão.

**Teste:** `route-schedule.test.ts` (6 paradas não cabem num dia; sexta à tarde empurra para segunda; almoço respeitado; nada começa antes das 8 nem termina depois das 18).

**Fora desta fase:** custo por visita e quilometragem real do veículo (dependem do rastreador).

---

### Fase 5 — Funis: recorrência em loop, reabrir e filtro de data (P22 a P28)

**Como fica a recorrência:**

```
Pós-venda → Relacionamento → Previsão de compra → Novo orçamento → Negociação → [ Vendas ]
    ↑                                                                               │
    └────────────────── cliente volta sozinho ao registrar a venda ─────────────────┘
```

- **P23 Negociação x Recompra:** "Negociação" passa a significar o que você descreveu: cliente pedindo orçamentos em sequência, sinal de compra próxima. A recompra deixa de ser um lugar onde o cliente fica.
- **P25 Loop:** o banco **já faz isso** (`crm_win_deal`: fecha o negócio, grava a venda, abre um novo em Pós-venda com o ciclo seguinte). Falta a tela mostrar.
- **P26 Coluna "Vendas":** a coluna terminal muda de nome na tela (a chave `recompra` fica igual no banco) e mostra um cartão por venda: cliente, valor, "2ª venda", data. Sai o limite fixo de 45 dias (`funis/page.tsx:45`); quem manda é o filtro de data. O mesmo cartão vale para "Primeira venda" na aquisição.
- **Registro da venda mais claro:** ao confirmar a venda, a tela mostra o fechamento num cartão só ("3ª venda · R$ 42.000 · {cliente} voltou para Pós-venda"), em vez de só um aviso no canto.
- **P24 Suporte:** sai da lista de etapas em `lib/constants.ts:258-267` e do mapa em `lib/crm-map.ts:5`. No banco ele nunca foi etapa (a tela já gravava como Relacionamento), então não há migração. Vira a marca **"Em suporte"**, que aparece enquanto o cliente tiver uma atividade pendente do tipo Suporte. Abrir chamado = criar essa atividade; resolver = concluí-la. Sem campo novo. A marca aparece no cartão do funil, na carteira e no topo do cliente.
- **P27:** já funciona. Conferir no app real com a empresa de teste.
- **P28 Filtro de data:** período (este mês, 30 dias, 90 dias, tudo, ou datas escolhidas) ao lado de vendedor e região (D7).
- **P22 Reabrir:** no cliente perdido, o botão "Marcar como perdida" (`empresas/[id]/page.tsx:211`) vira **"Reabrir"**. Faz sentido como você pensou: ele volta para **Qualificação**, não para Lead, porque já é conhecido. Vale só para a aquisição; na recorrência a perda já abre um negócio de recuperação.
  - **Banco (migration 0024):** função `crm_reopen_company`: cliente volta a ativo, abre negócio em Qualificação, cria a tarefa "Retomar contato" para 2 dias úteis e registra no histórico.
  - Comando `reopenCompany` em `server/commands.ts` e botão na tela.

**Teste:** teste do comando; no app real, vender em recorrência e ver o cliente voltar a Pós-venda com o cartão em Vendas.

**Fora desta fase:** tags (você disse que não é agora); reabrir pelo agente do WhatsApp.

---

### Fase 6 — Orçamento vira anexo (P17)

- `QuoteModal` (`components/flows/quote.tsx`, 640 linhas) vira **"Anexar orçamento"**: arquivo PDF, número do orçamento no outro sistema, valor total, validade e condição de pagamento. Cai para perto de 150 linhas.
- Arquivo num bucket **privado** do Supabase Storage; o caminho vai em `quotes.pdf_path`, que já existe. Download só por rota autenticada. Aceita só PDF, até 10 MB.
- **Sai do código:** `server/quote-pdf.ts`, `server/catalog.ts`, `lib/catalog-store.ts`, `app/api/catalog`, `CATALOG` em `constants.ts` e os itens de orçamento do `seed.ts`.
- **Fica igual:** status do orçamento, follow-up automático depois do envio (`afterQuoteSent`), o critério "Proposta comercial enviada" e a tela **Propostas** (apresentação da Tawper sem preço, que é outra coisa).
- **Banco:** nenhuma tabela é apagada. `products` e `quote_items` ficam paradas.

**Fora desta fase:** mandar o PDF para o agente pelo WhatsApp e ele anexar sozinho. É o próximo passo natural.

---

### Fase 7 — Lembretes por WhatsApp (P01)

- `server/reminders.ts`:
  - `montarLembrete(pessoa, atividades, hoje)`, função pura que devolve o texto: tarefas de hoje com hora e cliente, atrasadas, e as de daqui a 2 dias úteis.
  - envio pelo número do agente com `sendWhatsAppAgentText` (`server/ai/whatsapp/stevo.ts:22`) para o telefone do perfil (`profiles.phone_e164`).
- **Não manda duas vezes:** grava antes em `notifications` com `dedupe_key = lembrete:{pessoa}:{data}`. A tabela e o índice único já existem.
- Rota `POST /api/internal/lembretes`, com a mesma proteção por token do worker.
- **Agendamento (D6):** segunda a sexta, 07:30. Quem não tem tarefa não recebe mensagem.
- **Liga e desliga** por pessoa em Configurações › Lembretes (migration 0025: `profiles.reminders_enabled`, ligado por padrão).
- Como a mensagem sai do número do agente, o vendedor responde ali mesmo para registrar o que fez.
- **Teste:** `reminders.test.ts` (dia sem tarefa, sexta olhando segunda, pessoa sem telefone). No real, primeiro só para o número do Phedro, por uma variável de ambiente com a lista liberada; a equipe entra depois do ok.

**Fora desta fase:** horário escolhido por pessoa e lembrete na hora de cada tarefa. Entram se a equipe pedir.

---

### Fase 8 — Conversas vira Registros (P16)

Você perguntou "como?". Proposta: o painel deixa de ser lugar de conversar e passa a responder **"o que cada vendedor informou e o que o sistema gravou com isso"**.

- **Nome e acesso:** "Conversas" vira **"Registros"**, só para gestor. Sai do menu do vendedor, da barra do celular, do botão de caixa de entrada no topo e do cartão "WhatsApp" do Meu dia.
- **Aba 1 — Registros pelo WhatsApp** (nova). Uma linha por mensagem que o vendedor mandou ao agente: quando, quem, o que disse (resumo), **o que foi gravado** (atividade, etapa, venda, cliente novo, com link), e o resultado: gravado, desfeito, falhou ou só consulta. Os dados já existem em `ai_channel_messages`, `ai_agent_runs` e `ai_agent_steps`.
- **Indicadores no topo:** registros por vendedor nos últimos 7 dias, dias sem registrar, percentual marcado como erro.
- **Filtros:** vendedor, período, cliente e tipo de ação.
- **"Marcar como erro":** o botão já grava; passa a ter uma lista onde alguém lê. Hoje ninguém lê.
- **Aba 2 — Conversas do número da empresa:** a caixa atual, só leitura, para gestor (D4).

Essa fase alimenta "quem mais reporta" da Fase 11.

---

### Fase 9 — Requisitos de etapas e de atividades (P02, P03)

**Problema de hoje:** a regra de cada etapa existe em dois lugares, `lib/constants.ts` (tela) e as tabelas `stages`, `stage_requirements` e `stage_task_templates` (banco, que é quem barra). Editar pela tela exige um dono só: o banco.

1. **Tela lê do banco.** O snapshot passa a trazer a configuração das etapas. `getStage` e `stageIndex` mantêm a assinatura (25 arquivos usam) e só trocam a origem dos dados; `constants.ts` fica de reserva para quando o banco não responder.
2. **Configurações › Etapas (admin).** Por etapa: limite de dias; critérios para avançar (texto, obrigatório ou não, incluir e remover); tarefas criadas ao entrar na etapa (título, tipo, prazo em dias, obrigatória).
3. **Configurações › Atividades (admin).** Por tipo de atividade: exige resultado escrito? exige próximo passo? tipo e prazo sugeridos para o próximo passo.
   - **Banco (migration 0026):** tabela `activity_rules`, uma linha por tipo.
   - Vale nos três caminhos: tela (`components/flows/activity.tsx:68-110`), servidor (`completeActivityRecord`, `server/persist.ts:627`) e agente (`tools/registrar-atividade.ts`).
4. Rota `/api/admin/config`, só administrador, no molde de `/api/admin/equipe`. Toda alteração cai na auditoria.

**Fora desta fase, de propósito:** criar, apagar ou reordenar etapas pela tela. A chave da etapa amarra o mapa (`crm-map.ts`), o agente e o histórico; trocar pela tela quebraria os três.

---

### Fase 10 — Metas (P33 a P36)

- **Banco (migration 0027):** tabela `goals`: ano, pessoa (vazio = empresa), valor anual e metas de atividade (ex.: Ligação 10 por dia, Visita 2 por mês, Reunião 3 por mês).
- **Cálculo em `lib/goals.ts` (puro, com teste):**
  - **Regressivo:** falta = meta anual − vendido. Meta do mês = falta ÷ meses que restam. Trimestre e semestre saem da mesma conta. Vendeu abaixo num mês, os próximos sobem sozinhos.
  - **Quebra em atividade:** vendas necessárias = meta do mês ÷ ticket médio; orçamentos = vendas ÷ taxa de orçamento que vira venda; visitas e ligações pelas taxas do histórico. Com pouco histórico, usa os números que o administrador digitar. O sistema sugere, o administrador ajusta por vendedor.
  - Vendas vêm dos negócios ganhos que a tela já carrega; nenhuma leitura nova.
- **Página `/metas` (toda a equipe):**
  - **Pódio** ouro, prata e bronze por valor vendido no período, com % da meta de cada um; ranking completo abaixo.
  - Seletor de período: mês, trimestre, semestre, ano.
  - **Minha meta:** quanto falta no mês, ritmo (acima ou abaixo) e a lista do dia: "Ligações 4 de 10 · Visitas no mês 1 de 2 · Vendido R$ 18 mil de R$ 40 mil".
- **Configurações › Metas (admin):** meta anual da empresa, divisão por vendedor (igual para todos com um clique, ou manual) e metas de atividade.

**Pronto quando:** lançar R$ 2,4 milhões no ano mostra para cada vendedor o que ele precisa fazer hoje, no mês e no trimestre, e o pódio muda ao registrar uma venda.

**Fora desta fase:** comissão, premiação e histórico de pódios. Você disse que ainda vamos conversar sobre esse painel.

---

### Fase 11 — Painel (P30, P31, P32)

- **Filtros (P30):** período, vendedor, cliente (busca), faixa de valor negociado e funil. Aplicados uma vez sobre os dados, antes dos cálculos de `lib/selectors.ts`; todos os gráficos respondem juntos.
- **Gráficos (P31):** três componentes SVG pequenos ao lado do `HBar`: **colunas** (vendas por mês, atividades por semana), **rosca** (atividades por tipo, perdas por motivo, origem dos clientes) e **linha** (vendido x meta no ano). Não entra 3D: distorce a leitura do número, e o avaliador é criterioso.
- **Detalhe por vendedor (P32):** tabela ordenável com atividades concluídas, % no prazo, atrasadas agora, atraso médio em dias, registros criados, registros pelo WhatsApp, dias sem registrar, participação no total da equipe, negócios que avançaram e valor vendido.
- **Atraso:** colunas por vendedor em faixas (1 a 3 dias, 4 a 7, mais de 7).
- Mantida a regra atual: todo número abre a lista que o formou.

Depende das Fases 8 (registros pelo WhatsApp) e 10 (meta).

---

### Fase 12 — Meu dia (P37)

Arquivo: `app/(app)/meu-dia/page.tsx` (205 linhas).

- **Topo:** 4 blocos de número: hoje, atrasadas, visitas da semana e meta do mês com barra.
- **Agenda do dia** em linha do tempo por hora, com ícone e cor por tipo, no lugar da lista de texto.
- **Atenção na carteira** vira etiquetas curtas e clicáveis.
- O resumo em texto encolhe para uma linha.
- Sai o cartão "WhatsApp" (Fase 8).
- Conferir no navegador em tela grande e no celular.

O bloco de meta só aparece depois da Fase 10; a fase pode entrar antes sem ele.

---

### Fase 13 — Dados de demonstração (P29)

Script `web/scripts/demo-seed.mjs` que gera o SQL, no molde de `gen-funil-sql.mjs`. Eu entrego o SQL, o Phedro aplica.

- **Datas relativas ao dia em que roda.** Tem de rodar de novo na véspera da apresentação, senão as tarefas "de hoje" viram atraso.
- **O que o script garante:**
  1. Cópia de segurança antes de qualquer coisa.
  2. Saem os dados de teste: empresas "ZZ TESTE", vendas de teste (R$ 31.800 e R$ 10.000) e as tarefas duplicadas (o SQL já está em `limpeza-dados-teste-2026-11-11.md`).
  3. Todo cliente com contato, telefone, CEP, cidade, UF, coordenadas e região.
  4. **Novembro fechando bem:** perto de 90% das atividades concluídas no prazo, com resultado e próximo passo; algumas concluídas com atraso; 3 a 5 atrasadas hoje, espalhadas entre dois vendedores.
  5. **Dezembro organizado:** todo cliente ativo com próximo passo em dia útil, das 8h às 18h.
  6. Negócios distribuídos nas etapas, com tempo de etapa dentro do limite e 2 ou 3 parados, para a Gestão ter o que mostrar sem estar "tudo para cobrar".
  7. Vendas de outubro e novembro por vendedor (alimentam Metas, pódio e Painel), estratégias nas contas grandes, orçamentos anexados e rotas de dezembro.
- **Conferência no fim:** zero tarefa duplicada, zero cliente sem contato ou sem localização, e a contagem de alertas da Gestão.

Roda depois das Fases 3, 5, 6 e 10, que mudam o modelo. Para uma demo antes disso, roda uma versão sem metas e roda de novo depois.

## 5. Ordem e tamanho

| Fase | Tema | Banco | Tamanho | Depende de |
|---|---|---|---|---|
| 0 | Registro da mudança | não | muito pequeno | — |
| 1 | Limpeza e ajustes rápidos | não | pequeno | — |
| 2 | Configurações e barra lateral | não | médio | 1 |
| 3 | Regiões do Brasil | 0023 | médio | — |
| 4 | Rotas | não (tabelas já existem) | grande | 3 |
| 5 | Funis | 0024 | médio | — |
| 6 | Orçamento como anexo | bucket | médio | — |
| 7 | Lembretes por WhatsApp | 0025 | pequeno | 2 |
| 8 | Registros | não | médio | 2 |
| 9 | Requisitos de etapas e atividades | 0026 | grande | 2, 5 |
| 10 | Metas | 0027 | grande | 2 |
| 11 | Painel | não | grande | 8, 10 |
| 12 | Meu dia | não | médio | 8 (10 para o bloco de meta) |
| 13 | Dados de demonstração | SQL de dados | médio | 3, 5, 6, 10 |

As Fases 3, 5 e 6 não dependem uma da outra e podem andar em paralelo, cada uma em seu branch.

## 6. Riscos

1. **Banco compartilhado e sem desfazer.** As migrations 0023 a 0027 e o SQL da demo só rodam depois de `git fetch` e de conferir se outra sessão mexeu na mesma tabela.
2. **Outra sessão em funis** (alterações não comitadas na pasta principal). Conflito provável com a Fase 5.
3. **Lembrete manda mensagem para o telefone pessoal de gente real.** Começa só no número do Phedro.
4. **Demo e produção no mesmo banco.** Recriar os dados apaga o que estiver lá. A cópia de segurança é obrigatória e a decisão D2 precisa ser sua.
5. **Pendência antiga fora desta lista:** a tela diz "atendendo como Murilo" com a sessão do Phedro. Não foi pedida aqui; aparece na demo se alguém abrir Registros › Conversas.
