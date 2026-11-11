import type { AssistantAnswer } from "@/lib/ai";
import type { AssistantActionProposal } from "@/lib/assistant-actions";
import type { ChatTurn } from "../openai";
import type { User } from "@/lib/types";
import type { Undo } from "./undo";

export type JsonSchema = Record<string, unknown>;

/**
 * O que uma ferramenta devolve ao modelo. `reply` encerra a conversa com esse texto, sem nova rodada do modelo.
 * `recibo` é a linha que o usuário vê confirmando o que foi gravado: sai do resultado real, nunca do modelo.
 * `memo` é uma anotação interna (ids, nomes) que volta ao modelo nas próximas mensagens da conversa.
 * `desfazer` é o contrário do que foi gravado: o usuário aplica respondendo DESFAZER.
 */
export type ToolOutput = { data: unknown; reply?: string; wrote?: boolean; recibo?: string; memo?: string; empresaId?: string; desfazer?: Undo };

export interface AgentContext {
  actor: User;
  /** Pergunta do usuário na rodada atual. */
  question: string;
  history: ChatTurn[];
  /** Leitura livre da base (a mesma do assistente analítico). */
  consultar: (pergunta: string) => Promise<AssistantAnswer>;
  /** Ação que aguarda "confirmar" no WhatsApp; preenchida por ferramentas que propõem em vez de executar. */
  acao?: AssistantActionProposal;
  /** Todas as ações que aguardam CONFIRMAR nesta rodada (acao é a primeira). */
  acoes?: AssistantActionProposal[];
  /** Identifica a mensagem: a mesma gravação repetida (nova tentativa da fila) não duplica no banco. */
  requestId?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  /** Ferramenta que grava no CRM. Só o retorno `ok: true` de uma delas autoriza a IA a dizer que fez. */
  writes: boolean;
  run: (args: Record<string, unknown>, ctx: AgentContext) => Promise<ToolOutput>;
}

/** Um passo do atendimento, guardado para revisão: chamada do modelo ou de ferramenta. */
export type AgentStep = {
  kind: "model" | "tool";
  tool?: string;
  ok: boolean;
  request: unknown;
  response: unknown;
  ms: number;
};

export interface AgentResult {
  texto: string;
  acao?: AssistantActionProposal;
  acoes?: AssistantActionProposal[];
  /** Nomes das ferramentas de escrita que terminaram com sucesso nesta rodada. */
  gravou: string[];
  passos: AgentStep[];
  /** Anotações internas para as próximas mensagens (ids e nomes do que foi lido ou gravado). */
  contexto: string[];
  /** Como desfazer o que foi gravado nesta rodada, na ordem em que foi gravado. */
  desfazer: Undo[];
  /** Sinais para a revisão: ferramenta recusou, exceção, limite de passos, modelo caiu no meio. */
  marcas: string[];
  empresaId?: string;
  modelo?: string;
  tokens: { entrada: number; saida: number };
}
