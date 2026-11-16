# Confirmação de visitas e lembretes — 16/11/2026

Autorização: SM-2026-11-16-002, Phedro Borges. F0 permanece ativa.

A aplicação opera em Node contínuo no EasyPanel. instrumentation inicia a verificação a cada 30 segundos quando TAWPER_COMMUNICATIONS_ENABLED=true. A fila persistente é compartilhada entre instâncias e usa claim atômico com SKIP LOCKED. Um reinício não perde solicitações. Lembretes: dias úteis a partir de 07:30 Brasília, recuperação até 10h; dedupe por vendedor/dia existente. O endpoint de saúde informa execução do agendador.

Pedido de envio exige contato autorizado, vendedor responsável com telefone, visita pendente futura com horário confirmado e objetivo. Uma confirmação ativa por telefone evita associar respostas à visita errada. O recebimento de clientes não concede acesso ao agente interno: só enfileira resposta para solicitação existente. Classificador isolado só produz categorias; textos de envio são fixos. Mudanças de horário exigem o vendedor. Áudio sem texto é sinalizado para conferência manual.

Após duas horas sem resposta: aviso único. Escuta até o compromisso; sem resposta encerra, sem cancelar a tarefa. Alterações ou conclusão da visita encerram o acompanhamento anterior. Confirmações, respostas e mensagens ficam persistidas; resposta entra no histórico da empresa. Falhas geram notificação no app. Envio interrompido fica incerto e não é repetido automaticamente, evitando duplicatas (provedor sem idempotência). Verificar entrega antes de repetir.

Limite: lembrete diário depende do processo estar ativo entre 07:30 e 10h. Se houver demanda por execução com app indisponível por toda a manhã, mover o agendador para serviço externo. Configuração TAWPER_REMINDERS_ONLY ainda pode limitar destinatários. Rollback: desligar flag e voltar deploy; manter tabelas.
