# Ativação do Agente Geral interno no WhatsApp

Esta entrega prepara o número dedicado para consultas internas somente de leitura. Não é necessário iniciar a mensagem com `Tawper:`.

## 1. Conectar o número

Na Stevo, conecte `17981640081` por QR code. A mesma conta pode ser usada. Se a instância atual for reaproveitada, ela passa a representar esse número e deixa de representar o número anterior; para manter os dois números simultaneamente, contrate/crie outra instância.

Quando a instância também estiver conectada à Central de Conversas do Tawper, configure o webhook único como:

```text
https://SEU_DOMINIO/api/whatsapp/webhook?token=SEU_STEVO_WEBHOOK_TOKEN
```

Esse endpoint registra o evento de Conversas e encaminha ao agente apenas remetentes autorizados. A rota `/api/whatsapp/agent/webhook` é alternativa para uma instância futura exclusivamente dedicada; não configure as duas na mesma instância porque a SM v2 mantém apenas um destino operacional.

## 2. Configurar o ambiente

Cadastre no EasyPanel/servidor:

```dotenv
TAWPER_WHATSAPP_AGENT_ENABLED=true
TAWPER_WHATSAPP_AGENT_BOT_NUMBER=5517981640081
TAWPER_WHATSAPP_AGENT_WEBHOOK_TOKEN=<segredo-longo-e-aleatorio>
TAWPER_AI_WORKER_TOKEN=<outro-segredo-longo-e-aleatorio>
TAWPER_WHATSAPP_AGENT_USERS_JSON=<lista-json-aprovada>
TAWPER_MULTI_AGENT_ENABLED=true
TAWPER_AGENT_WRITES_ENABLED=false
```

A lista JSON tem objetos com `phone`, `name` e `role`. Os papéis aceitos são `admin`, `gestor` e `vendedor`. Mantenha a lista real somente no ambiente, porque contém dados pessoais.

O piloto pode reutilizar `STEVO_API_URL`/`STEVO_API_KEY`. Se o agente usar outra instância ou outro servidor, preencha `STEVO_AGENT_API_URL` e `STEVO_AGENT_API_KEY`; esses valores têm prioridade.

Vendedores precisam corresponder a um perfil do Tawper por telefone ou nome inequívoco e ter carteira atribuída. Sem vínculo, recebem apenas um aviso para procurar o gestor. Gestores e administradores cadastrados na lista autorizada têm visão organizacional.

## 3. Banco e worker

Aplique `supabase/migrations/20261019174541_whatsapp_internal_agent_readonly.sql` antes de ligar a flag.

Agende uma chamada recorrente, idealmente a cada minuto:

```http
POST https://SEU_DOMINIO/api/internal/ai/whatsapp-worker
Authorization: Bearer SEU_TAWPER_AI_WORKER_TOKEN
```

O webhook tenta processar logo após responder à Stevo; o worker recupera timeouts, quedas e retentativas.

## 4. Checklist de ativação

- `GET /api/whatsapp/agent/webhook?token=...` retorna `ok: true`, `enabled: true`, número configurado e a quantidade esperada de usuários.
- Uma mensagem real recebida em `/api/whatsapp/webhook` retorna `agent.queued: true` para remetente autorizado.
- Número fora da lista é ignorado e não aparece em `inbound_events`.
- Um gestor consegue perguntar “Como está o dia hoje?” e recebe métricas e comparativos.
- Um vendedor vê apenas empresas e tarefas da própria carteira.
- Reenviar o mesmo evento não cria segunda entrada nem segunda resposta.
- O worker rejeita token incorreto com 401.
- `TAWPER_AGENT_WRITES_ENABLED` permanece `false`.

Para desligar imediatamente, defina `TAWPER_WHATSAPP_AGENT_ENABLED=false` e refaça o deploy.
