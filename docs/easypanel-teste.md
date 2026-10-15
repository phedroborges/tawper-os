# EasyPanel — ambiente de teste (Fase 0)

O app sobe pelo [GitHub phedroborges/tawper-os](https://github.com/phedroborges/tawper-os). Use o `Dockerfile` da raiz. A pasta `web/` sozinha não basta: o build precisa do `PLANO_IMPLEMENTACAO.md`.

## Serviço

| Campo | Valor |
|---|---|
| Tipo | App a partir de Git |
| Repositório | `phedroborges/tawper-os` |
| Branch | `main` |
| Dockerfile | `Dockerfile` (raiz) |
| Porta do container | `4100` |
| Domínio já criado | `https://metricz-tawper-os.dedobd.easypanel.host` |
| Healthcheck | `GET /api/health` |

Não use Nixpacks: o Next.js não está na raiz.

## Build args (vão para o bundle)

Estas variáveis `NEXT_PUBLIC_*` precisam existir no **build**, não só em runtime:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_TAWPER_USE_SUPABASE=true
```

## Runtime env (nunca no Git)

```
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL=postgresql://postgres.SEU-PROJETO:SENHA_CODIFICADA@aws-0-us-east-1.pooler.supabase.com:5432/postgres
STEVO_PROOF_ENABLED=true
STEVO_API_URL=https://sm-cavalo.stevo.chat
STEVO_INSTANCE=tawper-os
STEVO_API_KEY=
STEVO_TEST_NUMBER=5564999394890
STEVO_WEBHOOK_TOKEN=
APP_PUBLIC_URL=https://metricz-tawper-os.dedobd.easypanel.host
STEVO_SIGN_MESSAGES=true   # opcional; false tira o "*Nome:*" das mensagens dos atendentes
```

`DATABASE_URL` é obrigatória para o atendimento com vários atendentes: o responsável de cada conversa fica no banco.

Use o pooler (modo sessão, porta 5432), com usuário `postgres.<ref>`. O host direto `db.<ref>.supabase.co` só tem IPv6 e a VPS do EasyPanel não alcança: o app parece funcionar, mas nada é gravado no banco e o envio falha. Se a senha tiver `#` ou `@`, esses caracteres vão codificados na URL (`#` = `%23`, `@` = `%40`). Sem isso o host vira inválido.

A API Key da Stevo, a service role e o token de webhook ficam só no EasyPanel. O domínio público deste teste já é `https://metricz-tawper-os.dedobd.easypanel.host`.

## Depois do primeiro deploy

1. Confirme `https://metricz-tawper-os.dedobd.easypanel.host/api/health`.
2. Abra `https://metricz-tawper-os.dedobd.easypanel.host/prova-whatsapp`.
3. Escaneie o QR com o `5564999394890`.
4. Clique em **Registrar na Stevo** (ou cole a URL de webhook no painel da instância `tawper-os`).
5. Envie um texto para outro celular e peça uma resposta. O POST precisa aparecer em “eventos recebidos”.

Se o Cloudflare estiver na frente, crie exceção de bot para `POST /api/whatsapp/webhook`. Sem isso a Stevo é bloqueada e a mensagem não chega.

## Atendimento: um número, vários atendentes (ADR-003)

A instância Stevo é uma só (um QR, um número). Em `/conversas` cada atendente usa o próprio perfil (seletor no topo):

- **Minhas:** conversas sob sua responsabilidade. Só o responsável responde.
- **Sem responsável:** fila. **Assumir** ou responder torna a conversa sua.
- **Todas:** só administrador e gestor.
- **Liberar** devolve para a fila; **Transferir** passa para outro atendente (responsável, administrador ou gestor).
- Mensagem de um telefone cadastrado como WhatsApp de contato vai direto para o responsável da empresa.
- Cada mensagem enviada grava o autor e, por padrão, sai como `*Nome:*` para o cliente.

Teste de aceite: abra duas abas com perfis diferentes, mande uma mensagem de outro celular, confira que ela cai na fila, assuma numa aba e verifique que a outra não consegue responder; depois transfira.

## O que esta prova não faz

Não substitui a Fase 7. Sem login (Fase 3), o perfil é escolhido no seletor: a atribuição organiza o atendimento, mas não impede alguém de trocar de perfil. Histórico comercial não é gravado a partir da Stevo.
