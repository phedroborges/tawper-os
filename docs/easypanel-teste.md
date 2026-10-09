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
DATABASE_URL=postgresql://postgres:SENHA_CODIFICADA@db.SEU-PROJETO.supabase.co:5432/postgres
STEVO_PROOF_ENABLED=true
STEVO_API_URL=https://sm-cavalo.stevo.chat
STEVO_INSTANCE=tawper-os
STEVO_API_KEY=
STEVO_TEST_NUMBER=5564999394890
STEVO_WEBHOOK_TOKEN=
APP_PUBLIC_URL=https://metricz-tawper-os.dedobd.easypanel.host
```

O host do Postgres é `db.<ref>.supabase.co`. Se a senha tiver `#` ou `@`, esses caracteres vão codificados na URL (`#` = `%23`, `@` = `%40`). Sem isso o host vira inválido.

A API Key da Stevo, a service role e o token de webhook ficam só no EasyPanel. O domínio público deste teste já é `https://metricz-tawper-os.dedobd.easypanel.host`.

## Depois do primeiro deploy

1. Confirme `https://metricz-tawper-os.dedobd.easypanel.host/api/health`.
2. Abra `https://metricz-tawper-os.dedobd.easypanel.host/prova-whatsapp`.
3. Escaneie o QR com o `5564999394890`.
4. Clique em **Registrar na Stevo** (ou cole a URL de webhook no painel da instância `tawper-os`).
5. Envie um texto para outro celular e peça uma resposta. O POST precisa aparecer em “eventos recebidos”.

Se o Cloudflare estiver na frente, crie exceção de bot para `POST /api/whatsapp/webhook`. Sem isso a Stevo é bloqueada e a mensagem não chega.

## O que esta prova não faz

Não substitui a Fase 7. `/conversas` continua simulada. Histórico comercial não é gravado a partir da Stevo.
