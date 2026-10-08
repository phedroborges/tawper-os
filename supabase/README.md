# Banco Tawper OS (Supabase)

PostgreSQL no Supabase é a fonte de verdade. A pasta `web/` continua sendo demonstração até a Fase 5; estas migrations não ligam a interface ao banco.

Não há empresas, contatos, oportunidades, conversas nem usuários de demonstração. Só entra configuração de produto definida na especificação funcional.

## O que o banco cobre

A empresa é a entidade central. O restante pertence a ela.

```text
organizations
  ├── profiles  (1:1 com auth.users)
  ├── memberships  (admin | gestor | vendedor | representante)
  ├── regions + user_region_assignments
  ├── wallet_grants
  ├── funnels → stages → stage_requirements / stage_task_templates
  ├── companies
  │     ├── company_relationships
  │     ├── contacts → data_consents
  │     ├── opportunities → history / requirement_values
  │     ├── strategies → strategy_versions
  │     ├── activities → activity_results
  │     ├── interactions
  │     ├── standby_periods
  │     ├── quotes → quote_items
  │     └── sales
  ├── conversations → messages → attachments
  ├── integration_accounts / inbound_events / outbox_events
  └── audit_events (append-only)
```

Funis seguem a seção 6 da especificação, não o atalho da demo:

- Aquisição: Lead → Qualificação → Apresentação da empresa → Apresentação técnica → Cadastro → Homologação → Produto aprovado → Orçamento → Negociação → Primeira venda
- Recorrência: Pós-venda → Relacionamento → Previsão → Novo orçamento → Negociação recorrente → Recompra

Espera (stand by) é estado com motivo, condição, responsável e data futura de reavaliação — não é etapa de funil.

## O que o seed grava

- Organização Tawper
- Sete regiões comerciais
- Dois funis, etapas, critérios e tarefas sugeridas
- Listas editáveis: perda, espera, origem, ramo, marca, prensa, pagamento

O seed **não** grava:

- Murilo, Douglas e demais usuários (entram pelo Supabase Auth; e-mails e WhatsApp ainda dependem da confirmação com o Murilo)
- Empresas da demo (Usina Vale do Sol etc.)
- Catálogo com preço (preços da demo não são fonte oficial)
- Números de WhatsApp

Clientes reais entram pela importação da Fase 6 (Moskit + planilha), com relatório por linha.

## Ligar o app (já configurado em `web/.env.local`)

A âncora e a chave `anon` vão no cliente. A **service role só no servidor**.

A senha do banco (Project Settings → Database) é diferente das chaves JWT. Sem ela as migrations não sobem. Coloque em `web/.env.local`:

```
DATABASE_URL=postgresql://postgres:SUA_SENHA@db.duimdczybtjzogxlkeud.supabase.co:5432/postgres
```

Depois, na pasta `web`:

```powershell
npm run db:push
```

## Como aplicar no Supabase Cloud

1. Criar o projeto na região de São Paulo (ADR-001).
2. Instalar a CLI: `npm install -g supabase` (ou `npx supabase`).
3. Na pasta `tawper-os-main` (esta, que contém `supabase/`):

```powershell
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

4. Conferir no Table Editor: `organizations`, `funnels`, `stages`, `regions`.
5. Guardar URL e chaves só em variáveis de ambiente. Nada disso vai para o repositório.

## Como subir localmente (Docker)

```powershell
npx supabase start
npx supabase db reset
```

Studio em `http://127.0.0.1:54323`. A aplicação Next.js na porta 4100 ainda não lê este banco.

## Regras já no PostgreSQL

- `organization_id` em toda tabela de negócio
- CNPJ único por organização quando informado
- Telefone em E.164
- Valores em `numeric` + moeda
- Uma oportunidade aberta por empresa e funil
- Uma passagem de etapa aberta por oportunidade; histórico imutável
- Etapa só avança com critérios da etapa atual cumpridos
- Ganho exige valor; perda exige motivo
- Atividade concluída exige resultado
- Espera exige reavaliação no futuro
- Webhook repetido não duplica (`inbound_events` único em provider + event id)
- Auditoria só insere
- RLS por carteira: gestor vê a organização; vendedor/representante vê a própria carteira

## Próximo passo de dados reais

1. Confirmar os cinco usuários e números com o Murilo.
2. Criá-los no Auth e em `memberships`.
3. Importar Moskit/planilha só depois do pipeline da Fase 6.
