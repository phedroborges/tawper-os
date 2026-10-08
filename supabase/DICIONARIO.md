# Dicionário — especificação → tabelas

Campos da seção 5 de `docs/adr/talper-especificacao-fluxos.md` e destino no banco. Tipos monetários são `numeric`; datas são `timestamptz` em UTC.

## Empresa — `companies`

| Especificação | Coluna |
|---|---|
| ID único | `id` (uuid interno) |
| Razão social | `legal_name` |
| Nome fantasia | `trade_name` |
| Código do cliente | `code` (TW-0001…) |
| CNPJ | `cnpj` (14 dígitos, único por org) |
| Status | `status`: active, standby, lost, archived, merged |
| Responsável | `owner_id` → memberships |
| Região | `region_id` → regions |
| Cidade / estado | `city`, `state` |
| Endereço e coordenadas | `address`, `latitude`, `longitude` |
| Ramo | `industry` |
| Grupo econômico | `economic_group` |
| Influenciadora | `company_relationships` (`depends_on`) |
| Origem | `source` |
| Potencial | `potential`, `monthly_potential` |
| Colhedoras | `harvesters_count`, `machine_models` |
| Prensa | `press_type` |
| Marca / concorrente | `current_brand`, `competitor` |
| Observações | `notes` |
| Criação / atualização | `created_at`, `updated_at` |

Duplicada vira `status = merged` + `merged_into_company_id`. Exclusão comercial é `archived` com motivo.

## Contato — `contacts`

| Especificação | Coluna |
|---|---|
| Empresa | `company_id` |
| Nome, cargo, área | `name`, `job_title`, `department` |
| Telefone / WhatsApp | `phone_e164`, `whatsapp_e164` |
| E-mail | `email` |
| Papel | `role` |
| Influência | `influence` (1–3) |
| Canal preferido | `preferred_channel` |
| Autorização | `contact_allowed` + `data_consents` |
| Responsável pelo relacionamento | `relationship_owner_id` |
| Ativo | `is_active` |

## Oportunidade — `opportunities`

| Especificação | Coluna |
|---|---|
| Empresa / responsável / funil / etapa | `company_id`, `owner_id`, `funnel_id`, `stage_id` |
| Entrada no funil / na etapa | `funnel_entered_at`, `stage_entered_at` |
| Valor / probabilidade / linha | `estimated_value`, `probability`, `product_line` |
| Previsão de fechamento | `expected_close_date` |
| Status | `open`, `won`, `lost`, `suspended` |
| Motivo de perda | `close_reason` |
| Encerramento | `closed_at`, `realized_value` |
| Ciclo de recompra | `cycle` |

Critérios da etapa: `stage_requirements` + `opportunity_requirement_values`.
Histórico de etapa: `opportunity_stage_history` (imutável).

## Estratégia — `strategies` / `strategy_versions`

Objetivo, diagnóstico, barreira, estratégia, resultado esperado, autor, revisão, próxima revisão, origem (`manual` ou `ai_approved`) e vínculo com `ai_suggestions`.

## Atividade — `activities` / `activity_results`

Tipo, título, descrição, responsável, vencimento, prioridade, status, origem, conclusão, resultado e `next_activity_id`. O registro simplificado da seção 7.3 fica em `activity_results`.

## Interação — `interactions`

Canal, data, autor, título, conteúdo, risco, vínculo com empresa, contato e oportunidade.

## Visita / rota — `route_plans` / `route_stops`

Vendedor, região, data, sequência, objetivo, resultado, km e custo.

## Auditoria — `audit_events`

Quem, entidade, campo, valor anterior e novo, data, origem. Sem update/delete.

## Comunicação — canônico vs provedor

O Tawper guarda `conversations`, `messages`, `message_attachments`.
O provedor fica em `integration_accounts`, `external_identities` e `inbound_events.payload`.
