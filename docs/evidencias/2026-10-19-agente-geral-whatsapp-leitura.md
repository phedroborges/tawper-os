# Evidências — Agente Geral interno no WhatsApp (leitura)

Data: 19/10/2026

Branch de validação: `feat/whatsapp-internal-agent`

## Resultado

O fluxo autorizado foi validado de ponta a ponta: webhook → deduplicação → sessão/memória → outbox → snapshot do CRM → Agente Geral → renderização para WhatsApp → adaptador Stevo → registro de saída → conclusão da fila.

Durante o primeiro ensaio, a Stevo simulada recebeu a resposta, mas o PostgreSQL recusou o registro de saída porque o parâmetro usado em `jsonb_build_object` não tinha cast explícito. O defeito foi corrigido com `::text`; o banco foi recriado e todo o ensaio foi repetido desde o início.

## Evidências automatizadas

- `npm test`: 11 arquivos e 51 testes aprovados.
- `npm run typecheck`: aprovado.
- ESLint dos arquivos alterados: aprovado.
- `npm run build`: aprovado; as rotas do webhook e do worker constam no build de produção.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades de produção.
- `supabase db reset --local`: todas as migrations, inclusive `20261019174541_whatsapp_internal_agent_readonly.sql`, aplicadas do zero.
- `supabase db lint --local --level warning`: nenhum erro do schema novo.
- Teste de privilégios: RLS habilitada; `anon` sem leitura; `authenticated` sem inserção/execução; `service_role` com somente os acessos operacionais necessários.
- Teste transacional da fila: duplicidade detectada; claim único com `SKIP LOCKED`; finalização em `processed`.

Os avisos remanescentes dos advisors referem-se a policies e funções anteriores a esta mudança; não houve aviso novo associado às tabelas ou funções do agente interno.

## Evidência ponta a ponta

- Primeira entrega: `queued: true`.
- Repetição do mesmo ID: `duplicate: true`, sem novo trabalho.
- Remetente desconhecido: `unauthorized_sender`, sem linha em `inbound_events`.
- Número do próprio bot: `unauthorized_sender`, sem linha em `inbound_events`.
- Token incorreto no webhook: HTTP 401.
- Token incorreto no worker: HTTP 401.
- Destino recebido pela Stevo simulada: o mesmo remetente autorizado do evento de teste.
- Conteúdo recebido: resposta comercial formatada com resultado, comparação e gráfico textual.
- Outbox final: `processed`, uma tentativa, sem erro.
- Mensagens persistidas: uma de entrada e uma de saída.
- Resposta vinculada ao evento da outbox e ao ID externo devolvido pelo provedor.
- Worker de recuperação, após a conclusão: zero trabalhos pendentes e zero falhas.

## Aceite e pendência externa

Código, migration, segurança e fluxo simulado estão aprovados para integração. A operação real só começa depois que o número `17981640081` for conectado por QR code na Stevo, os segredos forem cadastrados no ambiente, a migration for aplicada no banco alvo e o worker for agendado. Essas ações exigem acesso à conta/infraestrutura externa e não são reproduzíveis no repositório.
