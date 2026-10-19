# SM-2026-10-19-003 — Agente Geral interno no WhatsApp, somente leitura

ID: SM-2026-10-19-003

Data: 19/10/2026

Solicitante: Phedro Borges

Problema observado: a equipe precisa consultar projetos, tarefas, resultados e próximos passos pelo WhatsApp, usando o mesmo contexto autorizado do Tawper, sem abrir o sistema e sem permitir alterações nesta primeira etapa.

Decisão anterior afetada: `PLANO_IMPLEMENTACAO.md`, Fases 7 e 13; ADR-003 e ADR-004. A F0 permanece ativa e esta entrega é uma exceção aditiva e reversível autorizada pelo solicitante.

Escopo aprovado: número dedicado `17981640081`; lista fechada de pessoas e papéis mantida em segredo de ambiente; sem prefixo `Tawper:`; empresas representam os projetos; uma empresa pode ter várias oportunidades; nenhuma ferramenta de escrita é liberada.

Opção escolhida: webhook exclusivo, autorização antes de qualquer acesso ou chamada de IA, sessões próprias por remetente, leitura do snapshot canônico do CRM, filtro de carteira para vendedores, resposta visual adaptada a texto do WhatsApp e processamento durável pela outbox existente. A instância Stevo atual pode ser reaproveitada se passar a ser a instância dedicada ao número do agente.

Plano de migration/backfill: migration aditiva para mensagens do canal, vínculo externo da sessão e funções de enqueue/claim. Não há backfill.

Plano de teste: parser e configuração; isolamento de carteira; renderização; suíte completa; typecheck; lint; build; reset integral do Supabase; privilégios/RLS; idempotência; webhook, worker e envio ponta a ponta com Stevo simulada.

Plano de rollback: `TAWPER_WHATSAPP_AGENT_ENABLED=false` interrompe novas entradas; o webhook pode ser removido da Stevo; tabelas e eventos existentes permanecem para auditoria.
Aprovador: Phedro Borges, por solicitação explícita nesta sessão para continuar até finalizar, com autorização anterior para commit, push e merge.

## Limites

- Esta etapa apenas lê e responde. `TAWPER_AGENT_WRITES_ENABLED` continua `false`.
- Vendedor sem perfil inequívoco no Tawper recebe aviso de vínculo e nenhum dado comercial.
- Gestor e administrador da lista autorizada veem a organização inteira; vendedores veem somente a própria carteira.
- A conexão do número por QR code, a troca do webhook na Stevo e os segredos do ambiente são operações externas e não ficam no Git.
- Uma instância Stevo representa um número. Reaproveitar a instância atual substitui o número/webhook usados por ela; manter os dois canais ao mesmo tempo exige outra instância.
