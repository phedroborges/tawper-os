# Tawper OS — demonstração

Base do sistema operacional comercial da Tawper Mangueiras e Conexões. É um app Next.js + TypeScript + Tailwind em conversão progressiva para Supabase. O repositório já contém integrações reais de CRM, WhatsApp, orçamento e IA; módulos ainda não convertidos continuam usando a demonstração local até seus respectivos gates.

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

## Agentes de IA, em linguagem simples

- **Orquestrador:** é o professor que lê a pergunta e chama o ajudante certo.
- **Assistente Analítico:** procura tarefas e números e monta a resposta em cartões, listas e gráficos.
- **Copiloto Estratégico:** olha o cadastro da empresa e sugere um plano sem esquecer pessoas já conhecidas.
- **Registro Rápido:** arruma a anotação do vendedor em caixinhas organizadas.
- **Próximo Passo:** sugere qual tarefa fazer depois e quando fazê-la.
- **Resumo de Conversas:** lê a conversa e separa assunto, pedidos, promessas e datas.
- **Roteador de Conversas:** manda o WhatsApp para o dono da empresa; se não tiver certeza, deixa na fila.
- **Roteiro de Visitas:** põe as empresas reais na melhor ordem para o vendedor visitar, sem inventar paradas.
- **Extrator de Leads:** prepara uma ficha de novo cliente, mas espera uma pessoa confirmar.
- **Briefing Diário:** monta a listinha mais importante do dia.
- **Resumo Gerencial:** transforma vários números em poucas frases para o gestor.
- **Transcrição:** escuta um áudio e escreve o que foi dito.
- **Agente de Conversas:** coordena os ajudantes que trabalham com WhatsApp, mas não envia sozinho.
- **Agente de Operações:** prepara trabalhos automáticos; só coloca na fila depois da aprovação humana.

## Onde está cada coisa (para quem for desenvolver)

| Arquivo | O que tem |
|---|---|
| `src/lib/types.ts` | Modelo de domínio (seção 5 da especificação) |
| `src/lib/constants.ts` | Usuários, funis, etapas, critérios de saída, tarefas por etapa, catálogo |
| `src/lib/seed.ts` | Os clientes fictícios e todo o histórico da demo |
| `src/lib/store.ts` | Todas as ações (cadastro, etapas, venda, recorrência, orçamento, auditoria). É o contrato a trocar por um backend real, como o Supabase |
| `src/lib/selectors.ts` | Regras de negócio derivadas (RN-01 a RN-08): alertas, estagnação, indicadores |
| `src/lib/ai.ts` | Regras determinísticas, fallbacks e contratos de resposta visual da IA |
| `src/server/ai/*` | Agentes, roteamento multi-provedor, proteções, RAG e automações aprovadas |
| `src/lib/sim.ts` | O "cliente" simulado do WhatsApp |
| `src/app/(app)/*` | As telas |
