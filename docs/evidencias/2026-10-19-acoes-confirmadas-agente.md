# Evidências — Ações confirmadas do Agente Geral

Data: 19/10/2026

Branch de validação: `feat/whatsapp-internal-agent`

## Escopo validado

- mover oportunidade de etapa, sem permitir avanço quando requisitos canônicos ainda faltam;
- continuar a coleta dos requisitos em outra mensagem;
- concluir tarefa somente com resultado explícito;
- criar tarefa somente com empresa, título, prazo e responsável válidos;
- exigir confirmação humana no sistema e a palavra `CONFIRMAR` no WhatsApp;
- recarregar dados e escopo no servidor antes de gravar;
- impedir confirmação por outro usuário e bloquear tudo pela flag global;
- registrar mutações com origem `ai` e autor canônico;
- consumir uma proposta do WhatsApp uma única vez.

## Evidências automatizadas

- `npm test`: 13 arquivos e 63 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run lint`: sem erros; permanece um aviso anterior de `<img>` em `prova-whatsapp/ui.tsx`.
- `npm run build`: aprovado.

## Resultado

O modelo não escreve diretamente no banco. Ele produz uma intenção tipada usando somente IDs do catálogo autorizado. A camada determinística pergunta dados ausentes e gera uma proposta curta. A confirmação chama o executor server-side, que verifica flag, autor, prazo, carteira, estado atual e regras do registro antes da mutação.

No WhatsApp, a proposta fica no `metadata` da mensagem de saída. Um `UPDATE ... FOR UPDATE SKIP LOCKED` muda seu estado de `pending` para `executing`, evitando duas execuções concorrentes. Depois, o estado passa a `executed`, `failed` ou `cancelled`.

## Ativação

Após publicar este código, definir `TAWPER_AGENT_WRITES_ENABLED=true` no EasyPanel e fazer novo deploy. Com a flag falsa, o agente continua consultando normalmente e recusa qualquer confirmação mutável.
