# Talper — Especificação funcional do sistema comercial

## 1. Objetivo do produto

Criar uma operação comercial centralizada para a Talper que substitua o uso paralelo do Moskit e da planilha de acompanhamento, reduza o preenchimento manual pelos vendedores e permita que a gestão acompanhe a situação real de cada cliente.

O sistema deve garantir que todo cliente ativo possua:

- etapa comercial atual;
- estratégia registrada;
- próximo passo definido;
- responsável;
- prazo;
- histórico de execução;
- resultado da última ação;
- nova ação após a conclusão da anterior.

O sistema não deve ser tratado apenas como uma caixa de entrada de WhatsApp. Seu núcleo é a gestão da carteira e a progressão comercial orientada pelo próximo passo.

## 2. Resultado esperado

Ao abrir o sistema, o gestor deve conseguir responder sem consultar planilhas ou conversar individualmente com os vendedores:

1. Quais clientes estão sendo trabalhados?
2. Em qual etapa cada cliente está?
3. Qual foi a última interação?
4. Qual é o próximo passo?
5. Quem deve executá-lo?
6. Qual é o prazo?
7. Quais clientes estão atrasados ou estagnados?
8. Por que cada negociação não avançou?
9. Qual vendedor está executando o processo corretamente?
10. Quais ações devem acontecer hoje, nesta semana e neste mês?

## 3. Escopo e princípios

### 3.1 Princípios obrigatórios

- Uma empresa é a entidade central da operação.
- Contatos, oportunidades, tarefas, conversas, visitas e estratégias pertencem a uma empresa.
- Todo cliente ativo deve estar vinculado a um funil e a uma etapa.
- Todo cliente ativo deve possuir um próximo passo aberto, exceto os colocados formalmente em espera.
- Uma atividade concluída deve gerar ou exigir a definição do próximo passo.
- Alterações importantes devem gerar histórico auditável.
- Campos usados em relatórios devem ser estruturados, não apenas texto livre.
- O vendedor deve executar o essencial com poucos cliques.
- A IA recomenda, resume e cobra; decisões comerciais relevantes continuam sob controle humano.
- O painel só pode mostrar dados originados de registros reais no sistema.

### 3.2 Fora do MVP

- ERP, estoque e emissão fiscal.
- Financeiro completo.
- Discador telefônico próprio.
- Atendimento autônomo irrestrito da IA a grandes contas.
- Cálculo avançado de CAC, ROI e LTV antes da estruturação dos dados de custo e receita.
- Aplicativo móvel desenvolvido do zero, caso a plataforma base já ofereça aplicativo adequado.

## 4. Perfis e permissões

### 4.1 Administrador

Exemplos: Murilo e responsável técnico.

- configura usuários, campos, funis e regras;
- acessa todos os clientes e relatórios;
- altera responsáveis;
- importa, exporta e corrige dados;
- aprova automações e ações externas da IA;
- consulta o histórico de auditoria.

### 4.2 Gestor comercial

Exemplos: Murilo, esposa de Murilo e equipe de acompanhamento contratada.

- visualiza toda a carteira;
- cria e ajusta estratégias;
- atribui tarefas;
- acompanha atrasos e estagnações;
- revisa desempenho por vendedor;
- comenta e cobra ações;
- aprova sugestões estratégicas da IA.

### 4.3 Vendedor interno

Usuários iniciais previstos: Murilo, Douglas, Paulo, Nilton/Newton e Fernando.

- visualiza sua carteira e tarefas;
- registra contatos, visitas e resultados;
- move oportunidades de etapa;
- define ou confirma o próximo passo;
- consulta sugestões da IA;
- interage pelo WhatsApp integrado.

### 4.4 Representante externo

- acessa apenas sua carteira;
- registra ações essenciais;
- recebe lembretes;
- possui relatórios limitados;
- não acessa dados de outros representantes, salvo autorização.

### 4.5 Agente de IA

- não possui autonomia administrativa;
- lê apenas os dados permitidos;
- produz resumo, classificação, alertas e sugestões;
- só envia mensagem ao cliente quando existir regra e autorização explícitas;
- registra toda ação ou sugestão no histórico.

## 5. Modelo de dados

### 5.1 Empresa

Campos mínimos:

- ID único;
- razão social;
- nome fantasia;
- código do cliente no sistema atual;
- CNPJ, quando disponível;
- status: ativa, em espera, perdida, excluída ou duplicada;
- responsável principal;
- região;
- cidade;
- estado;
- endereço e coordenadas, quando disponíveis;
- ramo de atividade;
- grupo econômico;
- empresa influenciadora ou dependência comercial;
- origem;
- potencial estimado;
- número de colhedoras;
- tipo de prensa: própria, comodato Talper, comodato concorrente ou não possui;
- marca atual utilizada;
- concorrente atual;
- observações cadastrais;
- data de criação e última atualização.

### 5.2 Contato

- ID;
- empresa vinculada;
- nome;
- cargo e área;
- telefone e WhatsApp;
- e-mail;
- papel no processo: decisor, comprador, técnico, mecânico, influenciador ou outro;
- nível de influência;
- canal preferido;
- autorização de contato;
- responsável pelo relacionamento;
- ativo ou inativo.

### 5.3 Oportunidade

- ID;
- empresa;
- responsável;
- funil;
- etapa;
- data de entrada no funil;
- data de entrada na etapa atual;
- valor estimado;
- probabilidade;
- produto ou linha de interesse;
- origem;
- previsão de fechamento;
- status: aberta, ganha, perdida ou suspensa;
- motivo de perda ou suspensão;
- data de encerramento.

Uma empresa pode possuir mais de uma oportunidade, mas deve existir uma visualização consolidada da conta.

### 5.4 Estratégia da conta

- objetivo comercial atual;
- diagnóstico atual;
- barreira principal;
- estratégia definida;
- resultado esperado;
- responsável pela definição;
- data da última revisão;
- validade ou data de revisão;
- sugestão da IA;
- aprovação humana da sugestão.

### 5.5 Atividade ou próximo passo

- ID;
- empresa e oportunidade;
- tipo: ligação, WhatsApp, e-mail, visita, reunião, cotação, homologação, cadastro, suporte ou outro;
- descrição objetiva;
- responsável;
- data de vencimento;
- prioridade;
- status: pendente, em andamento, concluída, cancelada ou atrasada;
- origem: manual, regra, IA ou integração;
- data de conclusão;
- resultado;
- evidência opcional;
- atividade seguinte criada.

### 5.6 Interação

- canal;
- data e hora;
- participantes;
- conteúdo ou referência à mensagem;
- resumo;
- sentimento ou risco, caso utilizado;
- responsável;
- vínculo com empresa, contato e oportunidade;
- origem: WhatsApp, ligação, e-mail, reunião, visita ou anotação.

### 5.7 Visita e rota

- vendedor;
- região;
- empresas planejadas;
- data;
- sequência sugerida;
- objetivo de cada visita;
- resultado;
- quilometragem;
- custo;
- próximo passo gerado.

### 5.8 Histórico de auditoria

Registrar:

- quem fez a alteração;
- entidade e campo alterado;
- valor anterior e novo;
- data e hora;
- origem da mudança: usuário, IA, integração ou automação.

## 6. Funis comerciais

### 6.1 Funil de prospecção

#### Etapa 1 — Lead desconhecido

Objetivo: entender se a empresa tem aderência.

Dados mínimos para avançar:

- empresa identificada;
- cidade, estado e região;
- ramo de atividade;
- pelo menos um contato ou tarefa para obter o contato;
- responsável atribuído.

Próxima etapa: Qualificação.

#### Etapa 2 — Qualificação

Objetivo: conhecer operação, potencial e interlocutores.

Dados desejados:

- número de máquinas ou colhedoras;
- tipo de prensa;
- marca utilizada;
- fornecedor atual;
- contatos técnico e comercial;
- potencial e necessidade.

Próxima etapa: Apresentação da empresa.

#### Etapa 3 — Apresentação da empresa

Objetivo: apresentar a Talper e validar interesse institucional.

Critério de avanço:

- apresentação realizada ou enviada;
- interlocutor confirmou interesse em conhecer a solução técnica.

Próxima etapa: Apresentação técnica.

#### Etapa 4 — Apresentação técnica

Objetivo: apresentar produtos, diferenciais e aplicação.

Critério de avanço:

- necessidade técnica identificada;
- caminho definido: cadastro, homologação ou orçamento direto.

#### Etapa 5 — Cadastro

Objetivo: cadastrar a Talper no cliente e/ou o cliente nos sistemas internos necessários.

Critério de avanço:

- documentação enviada;
- retorno ou aprovação cadastral registrado.

#### Etapa 6 — Homologação

Objetivo: testar e aprovar tecnicamente o produto.

Subpassos possíveis:

1. identificar medidas e produtos;
2. preparar material de teste;
3. enviar ou instalar;
4. acompanhar o teste;
5. coletar resultado;
6. obter aprovação formal.

Critério de avanço: aprovação técnica registrada, preferencialmente com evidência.

#### Etapa 7 — Produto aprovado aguardando primeira venda

Objetivo: transformar aprovação técnica em cotação real.

Critério de avanço: solicitação de orçamento recebida ou oportunidade comercial criada.

#### Etapa 8 — Orçamento

Objetivo: enviar e acompanhar a proposta.

Campos adicionais:

- valor;
- itens;
- data de envio;
- validade;
- data esperada de decisão.

#### Etapa 9 — Negociação

Objetivo: resolver objeções comerciais e fechar a primeira venda.

Critério de saída:

- venda ganha;
- venda perdida com motivo;
- suspensão com data obrigatória de retomada.

#### Etapa 10 — Ganho

Ao ganhar:

- registrar valor e data;
- criar atividade de pós-venda;
- criar ou mover a conta para o funil de recorrência.

### 6.2 Funil de recorrência

#### Etapa 1 — Pós-venda

- confirmar recebimento e aplicação;
- coletar feedback;
- registrar eventual suporte;
- definir previsão de recompra.

#### Etapa 2 — Relacionamento

- manter contato;
- mapear estoque, safra, reforma e demanda;
- planejar visita;
- identificar expansão.

#### Etapa 3 — Previsão de nova compra

- registrar período esperado;
- criar tarefa futura;
- evitar cobranças inadequadas antes da janela comercial.

#### Etapa 4 — Novo orçamento

- registrar nova demanda e valor;
- acompanhar prazo.

#### Etapa 5 — Negociação recorrente

- acompanhar decisão;
- registrar concorrência, objeções e condições.

#### Etapa 6 — Recompra ganha ou perdida

- em caso de ganho, reiniciar o ciclo de pós-venda;
- em caso de perda, registrar motivo e estratégia de recuperação.

### 6.3 Estado de espera

“Stand by” não deve ser uma etapa genérica do funil. Deve ser um estado controlado, com:

- motivo;
- data de início;
- data obrigatória de reavaliação;
- responsável;
- condição de retomada.

### 6.4 Urgência da conta

A urgência é calculada pelo sistema a partir de dois fatores: o calor da conta e o tempo sem contato. Quanto mais quente a conta, menos tempo ela pode ficar sem contato.

**Calor**, definido pela etapa da oportunidade aberta mais avançada da empresa:

| Calor | Aquisição | Recorrência | Contato esperado a cada |
|---|---|---|---|
| Quente | Homologação, Produto aprovado, Orçamento, Negociação | Novo orçamento, Negociação recorrente | 7 dias |
| Morna | Apresentação técnica, Cadastro | Pós-venda, Previsão de nova compra | 15 dias |
| Fria | Lead desconhecido, Qualificação, Apresentação da empresa | Relacionamento | 30 dias |

**Tempo sem contato**: dias corridos desde a última interação registrada com a empresa (WhatsApp, ligação, e-mail, reunião ou visita). Empresa sem nenhuma interação conta a partir da data de cadastro.

**Urgência resultante:**

- **Alta:** o tempo sem contato atingiu ou passou o intervalo esperado para o calor da conta, ou existe próximo passo vencido.
- **Média:** o tempo sem contato passou da metade do intervalo esperado.
- **Baixa:** contato em dia.

Regras complementares:

- Conta em espera não gera urgência até a data de reavaliação; vencida a reavaliação, a urgência é Alta.
- Conta perdida ou arquivada não tem urgência.
- Os intervalos (7, 15 e 30 dias) são configuráveis pelo administrador.
- Administrador e gestor podem fixar a urgência manualmente, com motivo; a alteração fica na auditoria e vale até ser removida. Vendedor e representante não alteram a urgência.
- A urgência ordena o Meu Dia e a Carteira e alimenta o alerta de cliente sem interação (seção 8.1).

## 7. Fluxos operacionais

### 7.1 Entrada de novo cliente

1. Usuário ou integração cria a empresa.
2. Sistema pesquisa possível duplicidade por CNPJ, nome e telefone.
3. Usuário confirma cadastro ou une registros.
4. Sistema atribui responsável.
5. Oportunidade entra em Lead desconhecido.
6. Sistema solicita os dados mínimos.
7. Primeiro próximo passo é criado.
8. Cliente aparece na agenda do responsável.

### 7.2 Rotina diária do vendedor

1. Vendedor recebe resumo diário no aplicativo e, opcionalmente, WhatsApp.
2. Visualiza atividades vencidas, de hoje e próximas.
3. Executa uma ação.
4. Registra resultado por formulário curto ou comando conversacional.
5. Sistema atualiza histórico.
6. Sistema sugere mudança de etapa quando aplicável.
7. Vendedor confirma a etapa.
8. Sistema exige ou sugere o próximo passo.
9. Nova atividade é agendada.

### 7.3 Registro simplificado de atividade

O vendedor deve conseguir registrar algo como:

> Falei com João. Ele enviará as medidas até sexta. Cobrar na segunda se não enviar.

O sistema ou a IA deve propor:

- resultado: contato realizado;
- pendência do cliente: envio das medidas;
- próximo passo: verificar recebimento e cobrar;
- vencimento: segunda-feira indicada;
- responsável: vendedor atual;
- etapa sugerida: Homologação.

O vendedor confirma antes da gravação definitiva.

### 7.4 Alteração de etapa

1. Usuário solicita mover a oportunidade.
2. Sistema valida os campos obrigatórios da etapa atual.
3. Se faltar dado, informa objetivamente o que precisa ser preenchido.
4. Usuário confirma a nova etapa.
5. Sistema registra tempo na etapa anterior.
6. Regras da nova etapa criam tarefas sugeridas ou obrigatórias.
7. Mudança fica registrada no histórico.

### 7.5 Cliente estagnado

1. Regra identifica ausência de avanço ou interação conforme limite da etapa.
2. Sistema marca risco de estagnação.
3. IA resume o contexto e sugere ação.
4. Vendedor recebe alerta.
5. Se não agir, gestor recebe escalonamento.
6. Gestor mantém, redefine estratégia, coloca em espera ou encerra.

Os limites devem ser configuráveis por etapa, pois uma homologação pode legitimamente durar mais do que uma qualificação.

### 7.6 Revisão semanal da carteira

1. Sistema prepara lista de exceções, não uma lista completa de clientes.
2. Gestor revisa:
   - atrasados;
   - sem próximo passo;
   - estagnados;
   - dados incompletos;
   - oportunidades de alto valor;
   - sugestões estratégicas pendentes.
3. Gestor comenta, reatribui ou redefine estratégia.
4. Decisões geram tarefas e notificações.

### 7.7 Revisão mensal

1. Consolidar esforço, avanço e resultados.
2. Comparar vendedores.
3. Avaliar tempo médio por etapa.
4. Avaliar ganhos, perdas e motivos.
5. Revisar clientes recorrentes sem compra no período.
6. Planejar rotas e contas prioritárias do mês seguinte.
7. Registrar plano de ação mensal.

### 7.8 Planejamento de rota

1. Gestor seleciona região e período.
2. Sistema lista clientes com visita necessária ou recomendada.
3. IA prioriza considerando urgência, potencial, etapa e atraso.
4. Gestor confirma a rota.
5. Sistema cria atividades de visita.
6. Após cada visita, vendedor registra resultado e próximo passo.

### 7.9 Cliente dependente de outra conta

Exemplo observado: empresas que só avançam se a Agrocana avançar.

1. Usuário vincula empresa dependente à empresa influenciadora.
2. Registra a condição de avanço.
3. Sistema evita cobranças repetitivas sem contexto.
4. Mudança relevante na conta influenciadora gera alerta nas dependentes.
5. Estratégias relacionadas aparecem juntas para o gestor.

### 7.10 Duplicidade e exclusão

1. Sistema identifica possível duplicidade.
2. Administrador compara registros.
3. Ao unir, contatos, atividades e históricos são preservados.
4. Exclusão comercial deve preferir arquivamento ou marcação como inválido.
5. O motivo deve ser obrigatório.

## 8. Automações

### 8.1 Regras do MVP

- Alertar atividade vencida ao vendedor.
- Escalonar atraso ao gestor após prazo configurável.
- Alertar cliente ativo sem próximo passo.
- Alertar cliente sem interação por período configurável.
- Alertar oportunidade parada na mesma etapa.
- Criar pós-venda após primeira venda.
- Criar revisão futura para cliente em espera.
- Sugerir mudança de etapa com base no resultado registrado.
- Gerar resumo diário por vendedor.
- Gerar resumo semanal para o gestor.
- Detectar campos essenciais ausentes.

### 8.2 Regras posteriores

- Recomendar clientes para rota.
- Detectar risco de perda.
- Sugerir prioridade com base em potencial e probabilidade.
- Cruzar venda recorrente com ausência de novo pedido.
- Identificar oportunidades de expansão.
- Enviar mensagens externas automaticamente em cenários autorizados.

## 9. Agentes de IA

### 9.1 Agente de acompanhamento

Entradas:

- etapa;
- último contato;
- atividades;
- prazo;
- estratégia;
- histórico recente;
- regras do processo.

Saídas:

- resumo diário;
- lista priorizada;
- alertas;
- sugestão de próximo passo;
- identificação de atraso e inconsistência;
- mensagem interna de cobrança.

O agente não deve alterar etapa, encerrar negócio ou enviar mensagem ao cliente sem regra explícita ou confirmação.

### 9.2 Agente estratégico

Entradas:

- cadastro e potencial;
- pessoas envolvidas;
- histórico completo;
- concorrente;
- etapa;
- objeções;
- estratégia anterior e seus resultados;
- casos semelhantes aprovados pela Talper.

Saídas:

- diagnóstico;
- hipóteses de bloqueio;
- próximas ações possíveis;
- sugestão de abordagem;
- rascunho de e-mail ou WhatsApp;
- preparação de reunião;
- perguntas que o vendedor deve fazer.

Toda recomendação deve indicar em quais dados se baseou. Quando faltarem dados, o agente deve solicitar informação em vez de inventar.

### 9.3 Resumo de conversa

Após uma conversa relevante, gerar:

- assunto;
- necessidade;
- objeções;
- compromissos da Talper;
- compromissos do cliente;
- datas mencionadas;
- próximo passo sugerido;
- nível de confiança.

### 9.4 Contato externo por IA

Inicialmente permitido apenas para cenários aprovados, como:

- confirmação simples;
- solicitação padronizada de informação;
- suporte de primeiro nível;
- lembrete previamente autorizado.

Grandes contas, usinas, negociações e mensagens estratégicas exigem ação ou aprovação humana.

## 10. Telas necessárias

### 10.1 Visão “Meu dia”

- atrasadas;
- tarefas de hoje;
- próximas tarefas;
- clientes sem próximo passo;
- alertas da IA;
- atalho para registrar resultado.

### 10.2 Carteira

- tabela e cartões;
- busca;
- filtros por responsável, região, estado, urgência, funil, etapa, marca, prensa e estagnação;
- ações em lote limitadas;
- indicador de qualidade cadastral.

### 10.3 Página da empresa

- cabeçalho com dados essenciais;
- contatos;
- oportunidade atual;
- etapa;
- estratégia;
- próximo passo destacado;
- linha do tempo;
- conversas;
- atividades;
- visitas;
- dados técnicos;
- empresas relacionadas;
- sugestões da IA.

### 10.4 Kanban dos funis

- cartões com empresa, responsável, tempo na etapa, próximo passo e atraso;
- movimentação controlada;
- filtros;
- totais por etapa;
- identificação visual de risco.

### 10.5 Central de conversas

- WhatsApp por número e responsável;
- vínculo da conversa com empresa e contato;
- nota interna;
- resumo da IA;
- criação de atividade a partir da conversa;
- sugestão de atualização do funil.

### 10.6 Estratégia

- diagnóstico atual;
- objetivo;
- bloqueio;
- plano acordado;
- sugestões da IA;
- histórico de estratégias;
- data da próxima revisão.

### 10.7 Gestão e auditoria

- clientes sem próximo passo;
- atrasados;
- parados;
- inconsistências cadastrais;
- atividades por vendedor;
- comentários e cobranças;
- alterações recentes.

### 10.8 Dashboard executivo e modo TV

Exibir inicialmente:

- oportunidades por etapa;
- propostas abertas;
- clientes estagnados;
- tarefas atrasadas;
- atividades feitas no período;
- avanço por vendedor;
- ganhos e perdas;
- recorrentes sem compra;
- valor em negociação, quando disponível.

O clique em qualquer indicador deve abrir a lista que originou o número.

## 11. Indicadores e fórmulas

### 11.1 Indicadores do MVP

- clientes ativos por vendedor;
- clientes por etapa;
- clientes sem próximo passo;
- atividades criadas, concluídas e atrasadas;
- taxa de execução = concluídas no prazo / atividades vencidas no período;
- tempo médio por etapa;
- negócios estagnados por faixa de dias;
- taxa de avanço entre etapas;
- oportunidades ganhas e perdidas;
- conversão geral = ganhos / oportunidades encerradas;
- recorrentes sem compra no período;
- qualidade cadastral por carteira.

### 11.2 Indicadores futuros

- ciclo médio até a primeira venda;
- ticket médio;
- receita por cliente e vendedor;
- CAC;
- ROI por rota, vendedor ou canal;
- LTV;
- custo por visita;
- conversão por região;
- receita e margem por segmento.

As fórmulas financeiras só devem entrar em produção depois que fontes, periodicidade e responsabilidade pelos dados forem definidas.

### 11.3 Fonte oficial de venda e faturamento

A fonte oficial é o próprio Tawper OS. Venda e faturamento são o que estiver registrado no sistema: empresas, oportunidades ganhas e seus valores. Não há sistema externo de referência; sem registro no sistema, o indicador fica zerado.

## 12. Migração da planilha e do Moskit

### 12.1 Fontes

- Moskit: cadastro, contatos, negócios, atividades e histórico.
- Planilha: revisão interpretada da carteira, estratégia, observações mais recentes e dados técnicos.

### 12.2 Processo

1. Extrair dados das duas fontes.
2. Criar identificador de correspondência.
3. Detectar duplicidades.
4. Padronizar responsáveis, regiões, etapas, marcas e tipos de prensa.
5. Converter `0`, `?` e vazios para estados coerentes.
6. Separar observação, estratégia e atividade.
7. Validar amostra com Murilo.
8. Importar em ambiente de homologação.
9. Emitir relatório de erros e itens não vinculados.
10. Validar totais e clientes críticos.
11. Realizar corte para produção.

### 12.3 Mapeamento inicial da planilha

| Coluna atual | Destino proposto |
|---|---|
| Nome | Empresa: nome e possível código |
| Responsável | Empresa/oportunidade: responsável |
| Urgência | Prioridade da conta |
| Região | Empresa: região |
| Estado | Empresa: estado |
| Observações 16/06 | Histórico importado |
| Estratégia — próximo passo | Estratégia + atividade pendente, após validação |
| Atividades feitas | Histórico de atividade importado |
| Observações 20/08 | Histórico importado mais recente |
| Funil de vendas | Funil e etapa, após normalização |
| Número de colhedora | Empresa: número de colhedoras |
| Prensa | Empresa: tipo de prensa |
| Marca | Empresa: marca/fornecedor atual |

## 13. Integrações

### 13.1 WhatsApp

Validar antes da proposta final:

- cinco números iniciais;
- API oficial ou conexão alternativa;
- propriedade e portabilidade dos números;
- histórico disponível;
- templates e custos;
- limites de envio;
- atribuição por vendedor;
- regras de privacidade;
- funcionamento no aplicativo móvel.

### 13.2 Moskit

Decidir entre:

- migração única e desligamento;
- convivência temporária;
- sincronização por API.

A convivência permanente de dois CRMs deve ser evitada.

### 13.3 E-mail, agenda e ligações

Evoluções possíveis:

- Google Calendar ou Microsoft Calendar;
- envio e registro de e-mail;
- gravação e transcrição de ligações, mediante consentimento e validação jurídica;
- extração de técnicas de venda a partir de interações aprovadas.

### 13.4 Rastreamento e custos

Integração futura com rastreador de veículos e fonte financeira para cálculo de quilometragem, viagens e retorno comercial.

## 14. Requisitos não funcionais

- Interface web responsiva e aplicativo móvel adequado à rotina do vendedor.
- Controle de acesso por perfil e carteira.
- Registro de auditoria.
- Backup e recuperação.
- Exportação de dados.
- Observabilidade de integrações e automações.
- Filas e repetição segura para mensagens e tarefas automáticas.
- LGPD: base legal, retenção, acesso e exclusão de dados.
- Segredos e tokens fora do código.
- Tempo de carregamento aceitável para carteira e dashboard.
- Dados de relatórios consistentes com a origem transacional.

## 15. MVP recomendado

### Fase 0 — Descoberta e validação

Entregáveis:

- acesso ao Moskit e à planilha;
- inventário de dados;
- desenho final dos dois funis;
- dicionário de campos;
- matriz de permissões;
- regras de estagnação;
- definição dos cinco usuários e números;
- protótipo navegável;
- escopo e estimativa técnica.

### Fase 1 — Operação comercial básica

- login e permissões;
- empresas e contatos;
- dois funis;
- oportunidades;
- estratégia da conta;
- próximo passo obrigatório;
- agenda do vendedor;
- histórico;
- filtros;
- importação inicial;
- dashboard operacional básico.

### Fase 2 — WhatsApp e automações

- central de conversas;
- vínculo automático ou assistido com clientes;
- notas internas;
- criação de atividade a partir da conversa;
- lembretes;
- atrasos e escalonamento;
- resumo diário e semanal.

### Fase 3 — IA assistiva

- resumo de conversa;
- extração de pendências e datas;
- sugestão de próximo passo;
- agente de acompanhamento;
- agente estratégico com aprovação humana.

### Fase 4 — Gestão avançada

- modo TV personalizado;
- rotas;
- empresas relacionadas;
- indicadores financeiros;
- integração de custos;
- mensagens externas automatizadas em cenários aprovados.

## 16. Critérios de aceite do MVP

O MVP será considerado operacional quando:

1. Um administrador conseguir cadastrar e atribuir uma empresa.
2. Um vendedor conseguir atualizar uma conta em poucos passos.
3. Toda oportunidade ativa possuir etapa, responsável e próximo passo ou estado de espera válido.
4. Uma atividade concluída permitir a criação imediata da próxima.
5. O sistema identificar contas sem próximo passo e tarefas atrasadas.
6. O gestor filtrar carteira por vendedor, região, etapa e atraso.
7. O histórico mostrar quem alterou etapa, estratégia e atividade.
8. Os dois funis funcionarem com suas regras de entrada e saída.
9. Uma venda ganha iniciar o processo de recorrência.
10. O dashboard permitir abrir a lista por trás de cada indicador.
11. A amostra migrada bater com Moskit e planilha após validação do Murilo.
12. O vendedor conseguir usar os fluxos essenciais no celular.

## 17. Casos mínimos para demonstração ao Murilo

Criar pelo menos cinco contas fictícias ou copiadas com autorização:

1. Lead desconhecido que precisa de visita.
2. Cliente em homologação aguardando medidas.
3. Produto aprovado aguardando primeira cotação.
4. Cliente recorrente com previsão de recompra.
5. Cliente estagnado, com alerta e sugestão estratégica.

A demonstração deve mostrar, na prática:

- mudança de etapa;
- registro de contato;
- criação do próximo passo;
- alerta de atraso;
- resumo da IA;
- visão por vendedor;
- clique do dashboard até a lista de clientes;
- uso pelo celular.

## 18. Decisões pendentes

Antes do desenvolvimento, confirmar com Murilo:

1. Nome correto dos cinco usuários iniciais e números de WhatsApp.
2. Quem pode enxergar a carteira de quem.
3. Campos obrigatórios por etapa.
4. Prazo esperado em cada etapa.
5. Regras exatas para classificar estagnação.
6. O que significa urgência e quem pode alterá-la.
7. Quando um cliente pode ficar em espera e por quanto tempo.
8. Critérios formais de ganho, perda e exclusão.
9. Se uma empresa pode ter várias oportunidades simultâneas.
10. Quais mensagens a IA poderá enviar ao cliente.
11. Qual será a fonte oficial de vendas e faturamento.
12. Como regiões e rotas devem ser cadastradas.
13. Quais dados do Moskit precisam ser preservados integralmente.
14. Se haverá migração total ou fase de convivência.
15. Quais indicadores são indispensáveis no primeiro dashboard.

## 19. Histórias de usuário prioritárias

### Vendedor

- Como vendedor, quero ver minhas tarefas do dia para saber quem devo contatar.
- Como vendedor, quero registrar o resultado rapidamente para não preencher vários cadastros.
- Como vendedor, quero receber sugestão do próximo passo para avançar a negociação.
- Como vendedor, quero consultar o resumo do cliente para não reler todo o histórico.
- Como vendedor, quero receber alerta antes e depois do vencimento de uma atividade.

### Gestor

- Como gestor, quero ver clientes parados por vendedor para agir antes de perder oportunidades.
- Como gestor, quero saber por que um negócio está em uma etapa.
- Como gestor, quero abrir os clientes que formam cada número do dashboard.
- Como gestor, quero comparar execução e avanço, não apenas vendas finais.
- Como gestor, quero identificar cadastros incompletos e contas sem estratégia.

### Administrador

- Como administrador, quero configurar etapas e regras sem alterar código sempre que possível.
- Como administrador, quero importar e normalizar a carteira.
- Como administrador, quero consultar o histórico de mudanças.
- Como administrador, quero controlar o acesso dos representantes.

## 20. Diretriz de arquitetura funcional

O produto pode usar uma plataforma existente para conversas e aplicativo, mas precisa manter uma camada de domínio comercial própria para:

- empresas e relacionamentos;
- estratégias;
- próximos passos;
- regras de funil;
- histórico auditável;
- indicadores;
- agentes de IA.

Antes de escolher tecnologia, o time deve realizar uma prova técnica para confirmar se a plataforma base suporta os fluxos sem adaptações frágeis. Se o Chatwoot for utilizado, ele deve ser avaliado principalmente como central de atendimento, não presumido automaticamente como CRM completo.

