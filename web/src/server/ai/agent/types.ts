import type { AssistantAnswer } from "@/lib/ai";
import type { AssistantActionProposal } from "@/lib/assistant-actions";
import type { ChatTurn } from "../openai";
import type { User } from "@/lib/types";

export type JsonSchema = Record<string, unknown>;

/** O que uma ferramenta devolve ao modelo. `reply` encerra a conversa com esse texto, sem nova rodada do modelo. */
export type ToolOutput = { data: unknown; reply?: string; wrote?: boolean };

export interface AgentContext {
  actor: User;
  /** Pergunta do usuário na rodada atual. */
  question: string;
  history: ChatTurn[];
  /** Leitura livre da base (a mesma do assistente analítico). */
  consultar: (pergunta: string) => Promise<AssistantAnswer>;
  /** Ação que aguarda "confirmar" no WhatsApp; preenchida por ferramentas que propõem em vez de executar. */
  acao?: AssistantActionProposal;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  /** Ferramenta que grava no CRM. Só o retorno `ok: true` de uma delas autoriza a IA a dizer que fez. */
  writes: boolean;
  run: (args: Record<string, unknown>, ctx: AgentContext) => Promise<ToolOutput>;
}

export interface AgentResult {
  texto: string;
  acao?: AssistantActionProposal;
  /** Nomes das ferramentas de escrita que terminaram com sucesso nesta rodada. */
  gravou: string[];
}
