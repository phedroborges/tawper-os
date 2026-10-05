# Tawper OS — demonstração

Base do sistema operacional comercial da Tawper Mangueiras e Conexões. É um app real (Next.js + TypeScript + Tailwind), mas tudo é **simulado**: não há backend, WhatsApp de verdade nem chamadas de IA. Os dados ficam no navegador (localStorage) e são fictícios.

## Como abrir

- **Duplo clique** em `Abrir Tawper OS.command`, na pasta `tawper-os`. Na primeira vez ele instala e gera a versão otimizada (leva uns minutos). Depois abre o Chrome em http://localhost:4100.
- Para desligar, use `Parar Tawper OS.command`.
- Pelo terminal: `npm run demo` (gera a versão otimizada e sobe na porta 4100) ou `npm run dev` para desenvolver.

Não há login: o sistema abre como **Murilo (gestor)**. O seletor de perfil no topo troca para **Douglas (vendedor)** ou outro vendedor.

## Antes de apresentar

1. Menu lateral → **Reiniciar demo**. Todos os clientes voltam ao estado inicial, com datas recalculadas para o dia de hoje.
2. Menu lateral → **Roteiro da demo**. É o passo a passo da apresentação, com links diretos para cada tela (cerca de 15 minutos).

## O fluxo completo que dá para mostrar

1. Chega um WhatsApp de um número desconhecido (Rafael, Usina Vale do Sol). Clique em **Cadastrar empresa com IA**.
2. A IA preenche o cadastro a partir da conversa, e o sistema encontra um cadastro antigo do Moskit (duplicidade). Una os registros.
3. Converse com o cliente simulado. Ele responde de acordo com o que você pergunta: frota, medidas, visita, teste, orçamento, desconto, pedido.
4. **Resumir com IA** extrai frota, marca e prensa e atualiza o cadastro.
5. **Avançar etapa**: quando não falta nada, avança em um clique e já cria a tarefa da etapa seguinte. Se faltar algo, o sistema abre a validação pedindo só o que falta.
6. **Registrar** (texto livre): a IA lê enquanto você escreve e estrutura resultado, pendência do cliente, próximo passo, data e etapa. Uma tela, uma confirmação.
7. **Orçamento**: abre já preenchido pela frota do cliente. Ao enviar, o PDF vai para o WhatsApp e o follow-up é agendado.
8. **Copiloto estratégico**: diagnóstico, hipóteses, perguntas e rascunho. Tudo precisa de aprovação humana.
9. **Registrar venda**: a conta vai sozinha para o funil de Recorrência, com o pós-venda agendado.
10. Na Recorrência, avance até **Novo orçamento** e registre a **recompra**. Começa o ciclo 2.

Também estão prontos: Meu Dia, Carteira, Funis (Kanban com arrastar e soltar), Gestão por exceção, Dashboard (todo número abre a lista de origem), Auditoria, Rotas, assistente "Pergunte à IA", **Modo TV** e **Ver no celular**.

## Onde está cada coisa (para quem for desenvolver)

| Arquivo | O que tem |
|---|---|
| `src/lib/types.ts` | Modelo de domínio (seção 5 da especificação) |
| `src/lib/constants.ts` | Usuários, funis, etapas, critérios de saída, tarefas por etapa, catálogo |
| `src/lib/seed.ts` | Os clientes fictícios e todo o histórico da demo |
| `src/lib/store.ts` | Todas as ações (cadastro, etapas, venda, recorrência, orçamento, auditoria). É o contrato a trocar por um backend real, como o Supabase |
| `src/lib/selectors.ts` | Regras de negócio derivadas (RN-01 a RN-08): alertas, estagnação, indicadores |
| `src/lib/ai.ts` | A IA **simulada** (regras e modelos de texto). As funções têm o formato certo para trocar por um modelo de linguagem real |
| `src/lib/sim.ts` | O "cliente" simulado do WhatsApp |
| `src/app/(app)/*` | As telas |
