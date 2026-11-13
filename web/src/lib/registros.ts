// Registros: cada mensagem que um vendedor mandou ao agente do WhatsApp e o que o sistema gravou com ela.

export interface AgentRecord {
  id: string;
  at: string;
  userId: string;
  companyId?: string;
  pergunta: string;
  audio: boolean;
  resposta: string;
  /** Ferramentas que gravaram alguma coisa (nomes internos do agente). */
  gravou: string[];
  /** Sinais de problema anotados pelo motor ou pelo usuário ("errou"). */
  marcas: string[];
}

/** Nome de cada ação gravada, do jeito que o gestor fala. */
export const ACTION_LABEL: Record<string, string> = {
  registrar_atividade: "atividade registrada",
  criar_tarefa: "tarefa criada",
  concluir_tarefa: "tarefa concluída",
  reagendar_tarefa: "tarefa reagendada",
  cancelar_tarefa: "tarefa cancelada",
  mover_etapa: "etapa alterada",
  ganhar_negocio: "venda registrada",
  perder_negocio: "perda registrada",
  colocar_em_espera: "conta em espera",
  retomar_espera: "conta retomada",
  criar_cliente: "cliente cadastrado",
  atualizar_cliente: "cadastro atualizado",
  adicionar_contato: "contato adicionado",
  atualizar_contato: "contato atualizado",
  excluir_contato: "contato excluído",
};

export type RecordResult = "gravado" | "consulta" | "erro";

/** "erro" = o vendedor respondeu "errou", o motor travou ou uma ferramenta falhou. */
export function recordResult(r: AgentRecord): RecordResult {
  const problem = r.marcas.some((m) => m === "errou" || m.startsWith("excecao:") || m === "modelo_caiu" || m === "comprovante_inventado" || m === "limite_passos");
  if (problem) return "erro";
  return r.gravou.length ? "gravado" : "consulta";
}

export interface SellerActivity {
  userId: string;
  registros: number;
  consultas: number;
  erros: number;
  ultimo?: string;
  /** Dias desde o último registro gravado; undefined = nunca registrou no período lido. */
  diasSemRegistrar?: number;
}

/** Resumo por pessoa numa janela de dias: quem mais reporta e quem parou de reportar. */
export function sellerActivity(records: AgentRecord[], userIds: string[], now: Date, days = 7): SellerActivity[] {
  const from = now.getTime() - days * 86_400_000;
  return userIds
    .map((userId) => {
      const mine = records.filter((r) => r.userId === userId);
      const recent = mine.filter((r) => new Date(r.at).getTime() >= from);
      const lastWrite = mine.find((r) => r.gravou.length > 0);
      return {
        userId,
        registros: recent.filter((r) => recordResult(r) === "gravado").length,
        consultas: recent.filter((r) => recordResult(r) === "consulta").length,
        erros: recent.filter((r) => recordResult(r) === "erro").length,
        ultimo: lastWrite?.at,
        diasSemRegistrar: lastWrite ? Math.floor((now.getTime() - new Date(lastWrite.at).getTime()) / 86_400_000) : undefined,
      };
    })
    .sort((a, b) => b.registros - a.registros);
}
