# Plano de integração dos negócios ao banco

> Criado em 19/10/2026. Objetivo: tudo que acontece num negócio (etapa, ganho, perda, espera, reagendamento, estratégia, histórico, união de empresas, recorrência e pós-venda) é gravado no banco, igual para todos os usuários, sem depender do navegador, e qualquer falha aparece para quem usou.

## Regras do plano

1. **O banco é a fonte única.** O navegador só guarda qual perfil está selecionado. Nenhum dado de negócio fica em `localStorage`.
2. **Quem decide é o servidor.** Critérios de avanço, histórico de etapa, encerramento e criação de recorrência são aplicados no banco, em uma transação só. A tela não decide nada sozinha.
3. **Erro sempre visível.** Nenhuma gravação é "dispare e esqueça". Se o servidor recusar, o usuário vê a mensagem (no modal, ou em aviso na tela) e a tela volta ao que o banco tem.
4. **Todo mundo vê o mesmo.** A tela relê o banco ao abrir, a cada 15 segundos, ao voltar para a aba e depois de cada ação.
5. **Funis:** a tela e o banco usam chaves de etapa diferentes e o mapeamento está em `web/src/lib/crm-map.ts`. Não renomeie nem apague etapas do banco sem combinar com quem mantém esse mapeamento.

## Divisão com o trabalho do Carlos (19/10/2026)

O Carlos comitou no `main` (`a6f9fcf`) a mudança de etapa gravada no banco, com mapeamento entre as etapas da tela e as do banco (`web/src/lib/crm-map.ts`), avanço automático e retorno com motivo. Esta rodada **segue o caminho dele** para etapas, critérios e checklist, e **não altera** os funis do banco.

Daqui em diante, o que é de cada um:

- **Etapas, critérios, avanço automático e retorno:** Carlos (`moveDealRecord`, `crm-map.ts`). A tela muda na hora e grava em seguida; falha agora aparece como aviso e a tela volta ao que está no banco.
- **Ganho, perda, espera, retomada, reagendar, estratégia, nota, união de empresas, auditoria e releitura periódica:** esta rodada.

## Itens e estado

| # | Item | Como fica | Estado |
|---|---|---|---|
| 1 | Autor de cada ação na auditoria e no histórico de etapa | migration 0020: `app.actor_uid()` | código pronto; falta aplicar a 0020 |
| 2 | Registrar ganho, abrir recorrência e pós-venda, vendas | `crm_win_deal` | código pronto; falta aplicar a 0020 e testar |
| 3 | Registrar perda (e plano de recuperação na recorrência) | `crm_lose_deal` | código pronto; falta aplicar a 0020 e testar |
| 4 | Colocar em espera e retomar | `crm_set_standby`, `crm_resume_standby` | código pronto; falta aplicar a 0020 e testar |
| 5 | Reagendar atividade | `crm_reschedule_activity` | código pronto; falta aplicar a 0020 e testar |
| 6 | Estratégia da conta com versões | `crm_save_strategy` | código pronto; falta aplicar a 0020 e testar |
| 7 | Histórico de interações | `crm_add_interaction` e leitura | código pronto; falta aplicar a 0020 e testar |
| 8 | Unir empresas duplicadas | rota de servidor em sequência | código pronto; falta testar |
| 9 | Auditoria e histórico de etapas lidos do banco | leitura de `audit_events` e do histórico | código pronto; falta testar |
| 10 | Tela relê o banco (15 s, ao voltar à aba, depois de cada ação) | `CrmSync` + `refreshCrm` | código pronto; falta testar |
| 11 | Erros visíveis em todas as gravações | avisos, erro no modal e recarga do que o banco tem | código pronto; falta testar |

## Estado em 19/10/2026

- **Código:** pronto, com tipos e build aprovados, já integrado ao `main` do Carlos. A sintaxe da migration 0020 foi validada com um parser de PostgreSQL.
- **Falta:** aplicar a migration 0020 no banco e executar o roteiro de validação. Enquanto ela não for aplicada, ganho, perda, espera, retomada, reagendar, estratégia e nota falham com a mensagem "O banco ainda não tem os comandos desta versão".
- **Limitação conhecida:** as edições de cadastro (empresa, contato, atividade) e a mudança de etapa são gravadas sem informar o autor, então a auditoria as mostra como "sistema". As operações da migration 0020 registram o autor corretamente.
- **A combinar com o Carlos:** a gravação da etapa dele pula a validação dos critérios do banco (usa `bypass_stage_rules` e marca os critérios da etapa como cumpridos ao avançar). A validação fica só na tela.

## Fora desta rodada (continuam em demonstração)

- **Rotas de visita, notificações internas, sugestões da IA e conversas simuladas** do store local. Elas já estavam fora do banco e vão para a próxima rodada. Sem a persistência no navegador, elas voltam ao estado inicial ao recarregar.
- **Autenticação real:** o servidor ainda grava com a chave de serviço e confia no perfil escolhido na tela. Fica para a Fase 3 do plano mestre.

## Como validar

- Ganhar, perder, pôr em espera, retomar, reagendar e salvar estratégia, recarregar a página e conferir que nada voltou.
- Abrir o sistema em dois navegadores e conferir que a mudança de um aparece no outro em até 15 segundos.
- Forçar um erro (critério pendente, data passada) e conferir que a mensagem aparece.
- Rodar `npx tsc --noEmit`, `eslint` e `npm run build`.
