# ADR-001 — Stack e hospedagem

**Data:** 06/10/2026
**Estado:** Aprovada por Phedro Borges em 10/10/2026
**Fase:** F0 — Fechamento de produto e riscos

## Contexto

O Tawper OS precisa hospedar quatro tipos de carga com perfis diferentes:

- aplicação Next.js, leve e sem estado;
- PostgreSQL como fonte de verdade, com autenticação, storage e backups;
- processos contínuos: workers da outbox, agendador e fila;
- integrações com estado próprio: WhatsApp por API não oficial e automações no n8n.

Já existe uma VPS KVM 2 da Hostinger (2 vCPU, 8 GB), administrada com EasyPanel e compartilhada com outros projetos. O código está no GitHub. A decisão "Qual será a hospedagem do Next.js e dos workers?" estava pendente na seção 20 do plano.

## Decisão

### Stack

- Next.js (App Router) com React e TypeScript, conforme a arquitetura alvo da seção 7 do plano.
- PostgreSQL gerenciado pelo Supabase Cloud, incluindo Auth e Storage.
- Redis para filas, quando a fase de WhatsApp exigir.

### Hospedagem em duas etapas

**Etapa 1 — testes**

| Peça | Onde |
|---|---|
| PostgreSQL, Auth, Storage | Supabase Cloud |
| Next.js, n8n, WhatsApp não oficial | VPS KVM 2 existente, via EasyPanel |
| DNS, SSL, WAF | Cloudflare na frente da VPS |

**Etapa 2 — produção**

| Peça | Onde |
|---|---|
| PostgreSQL, Auth, Storage | Supabase Cloud (plano pago, com backup) |
| Next.js, workers, Redis | VPS 1, dedicada ao projeto |
| WhatsApp não oficial, n8n | VPS 2, dedicada ao projeto |
| DNS, SSL, WAF | Cloudflare |

As duas VPS de produção são exclusivas do Tawper OS, sem outros projetos.

### Regras que tornam a separação possível

1. Endereços de banco, Redis e provedores só por variável de ambiente.
2. Schema só por migrations versionadas; o banco de produção é recriado a partir delas, não copiado do ambiente de teste.
3. Nenhum dado real de cliente no ambiente de teste.
4. Um serviço por peça no EasyPanel.
5. Número de WhatsApp secundário na etapa de testes.

## Consequências

- O banco fica fora da VPS desde o início, então uma falha da VPS não perde dados.
- Na etapa de testes, o build e as demais cargas disputam recursos com os outros projetos da VPS; lentidão é esperada e aceita.
- Em produção, queda ou bloqueio do WhatsApp não derruba o CRM, por estar em VPS separada.
- Webhooks do WhatsApp e do n8n precisam de regra de exceção na proteção contra bots da Cloudflare.
- Painéis do n8n e da API de WhatsApp ficam atrás de autenticação (Cloudflare Access), não expostos na internet.
- O custo de produção é o plano pago do Supabase mais duas VPS.

## Alternativas avaliadas

- **Tudo na mesma VPS, incluindo o banco (Supabase self-hosted):** descartada. Cerca de dez containers, 2 a 4 GB de RAM, e backup, atualização e restauração por conta própria.
- **AWS ou Google Cloud:** descartadas. Custo em dólar e imprevisível, e operação mais complexa, sem que o sistema exija o que oferecem.
- **Vercel para o Next.js:** descartada. Não roda workers nem WhatsApp, então a VPS seria necessária de qualquer forma.
- **VPS fora do Brasil:** descartada. A aplicação precisa ficar na mesma região do banco.

## Pontos em aberto

- Região do projeto Supabase e localização das VPS: devem coincidir (São Paulo), a confirmar na criação.
- Dimensionamento das duas VPS de produção: depende do volume diário de mensagens e da quantidade de números, ainda pendentes na Fase 0.
- Provedor de WhatsApp não oficial: tratado no ADR-003.
