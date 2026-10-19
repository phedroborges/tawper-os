# SM-2026-10-19-004 — Unificação do transporte do WhatsApp

ID: SM-2026-10-19-004

Data: 19/10/2026

Solicitante: Phedro Borges

Problema observado: mensagens reais do número interno chegavam ao webhook da Central de Conversas, mas não ao webhook separado do Agente Geral. A renovação automática da instância Stevo substituía o destino configurado manualmente para o agente.

Decisão anterior afetada: item 9 do ADR-005 e instrução de ativação que previa rotas de webhook separadas na mesma instância.

Fases e dados afetados: exceção aditiva da Fase 0 para WhatsApp/IA; nenhum dado existente precisa ser migrado.

Alternativas avaliadas: desativar a renovação automática da Central de Conversas; contratar uma segunda instância; usar um webhook de conta adicional; compartilhar apenas a entrada de transporte e manter autorização, memória e filas separadas.

Opção escolhida: compartilhar `/api/whatsapp/webhook` na instância atual. O evento continua alimentando a Central de Conversas e somente mensagens recebidas de números autorizados são enfileiradas para o agente. `/api/whatsapp/agent/webhook` permanece disponível para uma instância futura exclusivamente dedicada.

Plano de migration/backfill: nenhuma migration e nenhum backfill. Os eventos anteriores não atendidos não serão reprocessados automaticamente.

Plano de teste: parser com JID brasileiro sem nono dígito; suíte unitária; typecheck; lint; build; replay do payload real capturado; confirmação de outbox processada e resposta aceita pela Stevo após deploy.

Plano de rollback: reverter o encaminhamento do endpoint compartilhado e configurar uma instância separada no endpoint exclusivo do agente.

Aprovador: Phedro Borges, pela solicitação explícita para diagnosticar e corrigir o agente até funcionar, mantendo autorização anterior para commit, push e merge.
