# ADR-003 — WhatsApp temporário: Stevo, uma instância e vários atendentes

**Estado:** aceita para o ambiente de teste (Fase 0, SM-2026-10-14-001). A versão definitiva é revista no Gate G7.
**Data:** 14/10/2026

## Contexto

O plano contratado na Stevo dá direito a uma instância. Cada instância corresponde a um QR code e a um número de WhatsApp. A operação precisa que vários atendentes usem esse mesmo número, cada um com seu perfil no Tawper, respondendo pelas conversas que são suas.

A prova da Fase 0 já envia e recebe mensagens, mas trata o número como se fosse de uma pessoa só: todas as conversas aparecem para todos e nenhuma mensagem registra quem respondeu.

## Decisão

1. **Provedor temporário:** Stevo (motor SM v2), com uma instância (`STEVO_INSTANCE`), acessada apenas pelo servidor.
2. **Um número, vários atendentes.** O WhatsApp é único; a divisão do trabalho acontece dentro do Tawper.
3. **Toda conversa tem no máximo um responsável.** Conversa sem responsável fica na fila "Sem responsável".
4. **Atribuição automática pela carteira:** mensagem de um telefone cadastrado como WhatsApp de contato vai para o responsável da empresa desse contato.
5. **Assumir, liberar e transferir:** qualquer atendente assume uma conversa da fila; o responsável libera ou transfere; administrador e gestor assumem ou transferem qualquer conversa.
6. **Só o responsável responde.** Enviar numa conversa da fila torna o atendente responsável por ela.
7. **Visibilidade:** vendedor e representante veem as próprias conversas e a fila; administrador e gestor veem todas (matriz da seção 4 da especificação).
8. **Autor de cada mensagem enviada** fica gravado. Por padrão a mensagem sai assinada como `*Nome:*` para o cliente saber quem responde (`STEVO_SIGN_MESSAGES=false` desliga).
9. **Mensagens enviadas pelo próprio celular** entram no histórico sem autor ("pelo aparelho").
10. **Estado da sessão** é consultado na Stevo no máximo a cada 10 segundos por processo, e renovado quando chega evento de conexão, para não estourar o limite de requisições com vários atendentes abertos.

## Consequências

- Sem login (Fase 3), o perfil do atendente vem do seletor de perfil do app. A atribuição organiza o trabalho, mas **não é controle de acesso**: quem acessa o app pode trocar de perfil. O isolamento real depende da Fase 3.
- A instância única é ponto único de falha: queda ou bloqueio do número para todos os atendentes. Mitigações: proxy dedicado da Stevo (STProxy), alerta de queda e limites de envio conservadores (Fase 7).
- As tabelas `whatsapp_live_*` são operacionais e temporárias. Na Fase 7 os dados passam para o modelo canônico já existente (`integration_accounts`, `conversations.owner_id`, `messages.author_id`, `inbound_events`, `outbox_events`), atrás de um adaptador `WhatsAppProvider`.

## Alternativas avaliadas

- **Uma instância por atendente:** exige um plano e um número por pessoa, e o cliente passa a falar com números diferentes. Rejeitada pelo custo e pela experiência do cliente.
- **API oficial (Cloud API):** cobra por mensagem e exige templates. Fica para a Fase 12.
- **Webhook de conta assinado da Stevo (HMAC, `event_id`, reentrega):** melhor que o webhook da instância usado hoje. Adotar na Fase 7, junto com `Idempotency-Key` no envio.
