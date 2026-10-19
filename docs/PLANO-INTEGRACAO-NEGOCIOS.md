# Plano de integração dos negócios ao banco

> Criado em 19/10/2026. Objetivo: tudo que acontece num negócio (etapa, ganho, perda, espera, reagendamento, estratégia, histórico, união de empresas, recorrência e pós-venda) é gravado no banco, igual para todos os usuários, sem depender do navegador, e qualquer falha aparece para quem usou.

## Regras do plano

1. **O banco é a fonte única.** O navegador só guarda qual perfil está selecionado. Nenhum dado de negócio fica em `localStorage`.
2. **Quem decide é o servidor.** Critérios de avanço, histórico de etapa, encerramento e criação de recorrência são aplicados no banco, em uma transação só. A tela não decide nada sozinha.
3. **Erro sempre visível.** Nenhuma gravação é "dispare e esqueça". Se o servidor recusar, o usuário vê a mensagem (no modal, ou em aviso na tela) e a tela volta ao que o banco tem.
4. **Todo mundo vê o mesmo.** A tela relê o banco ao abrir, a cada 15 segundos, ao voltar para a aba e depois de cada ação.
5. **Uma definição de funil.** As etapas, critérios e tarefas do banco são geradas a partir das definidas no app (`web/scripts/gen-funil-sql.mjs`), para a tela e o banco nunca discordarem.

## Itens e ordem de execução

| # | Item | Como fica | Estado |
|---|---|---|---|
| 0 | Funis do banco iguais aos do app (etapas, critérios, tarefas) | migration 0019 gerada do app | código pronto; falta aplicar 0019 e 0020 e testar |
| 1 | Quem fez cada ação (autor no histórico e na auditoria) | migration 0020: `app.actor_uid()` | código pronto; falta aplicar 0019 e 0020 e testar |
| 2 | Mudar etapa com critérios, tarefas e histórico | `crm_move_stage` (transação) | código pronto; falta aplicar 0019 e 0020 e testar |
| 3 | Marcar critérios (checklist) | `crm_set_checks` | código pronto; falta aplicar 0019 e 0020 e testar |
| 4 | Registrar ganho, abrir recorrência e pós-venda, vendas | `crm_win_deal` | código pronto; falta aplicar 0019 e 0020 e testar |
| 5 | Registrar perda (e plano de recuperação na recorrência) | `crm_lose_deal` | código pronto; falta aplicar 0019 e 0020 e testar |
| 6 | Colocar em espera e retomar | `crm_set_standby`, `crm_resume_standby` | código pronto; falta aplicar 0019 e 0020 e testar |
| 7 | Reagendar atividade | `crm_reschedule_activity` | código pronto; falta aplicar 0019 e 0020 e testar |
| 8 | Estratégia da conta com versões | `crm_save_strategy` | código pronto; falta aplicar 0019 e 0020 e testar |
| 9 | Histórico de interações | `crm_add_interaction` e leitura | código pronto; falta aplicar 0019 e 0020 e testar |
| 10 | Unir empresas duplicadas | rota de servidor em sequência | código pronto; falta testar com as migrations aplicadas |
| 11 | Auditoria lida do banco (gerada pelo banco, não pela tela) | leitura de `audit_events` | código pronto; falta testar com as migrations aplicadas |
| 12 | Tela sem dados de negócio no navegador, relendo o banco | store sem persistência + atualização periódica | código pronto; falta testar com as migrations aplicadas |
| 13 | Erros visíveis em todas as gravações | avisos e recarga do que o banco tem | código pronto; falta testar com as migrations aplicadas |

## Estado em 19/10/2026

- **Código:** pronto, com tipos, lint e build aprovados. A sintaxe das migrations 0019 e 0020 foi validada com um parser de PostgreSQL.
- **Falta:** aplicar as migrations 0019 e 0020 no banco e executar o roteiro de validação abaixo. Enquanto elas não forem aplicadas, mudar etapa, ganho, perda, espera, reagendar, estratégia e nota falham com a mensagem "O banco ainda não tem os comandos desta versão".
- **Limitação conhecida:** as edições de cadastro (empresa, contato, atividade) são gravadas pelo servidor sem informar o autor, então a auditoria as mostra como "sistema". As operações novas (etapa, ganho, perda, espera, estratégia, nota) registram o autor corretamente.

## Fora desta rodada (continuam em demonstração)

- **Rotas de visita, notificações internas, sugestões da IA e conversas simuladas** do store local. Elas já estavam fora do banco e vão para a próxima rodada. Sem a persistência no navegador, elas voltam ao estado inicial ao recarregar.
- **Autenticação real:** o servidor ainda grava com a chave de serviço e confia no perfil escolhido na tela. Fica para a Fase 3 do plano mestre.

## Como validar

- Mover etapa, ganhar, perder, pôr em espera, retomar, reagendar e salvar estratégia, recarregar a página e conferir que nada voltou.
- Abrir o sistema em dois navegadores e conferir que a mudança de um aparece no outro em até 15 segundos.
- Forçar um erro (critério pendente, data passada) e conferir que a mensagem aparece.
- Rodar `npx tsc --noEmit`, `eslint` e `npm run build`.
