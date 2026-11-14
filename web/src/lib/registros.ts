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
  const problem = r.marcas.some(
    (m) =>
      m === "errou" ||
      m.startsWith("excecao:") ||
      m === "modelo_caiu" ||
      m === "comprovante_inventado" ||
      m === "limite_passos",
  );
  if (problem) return "erro";
  return r.gravou.length ? "gravado" : "consulta";
}

/** Traduz sinais internos do motor para linguagem clara para o gestor. */
export function formatRecordMark(mark: string): string {
  if (mark === "errou") return "Vendedor informou que o agente errou";
  if (mark === "modelo_caiu") return "Falha temporária de conexão com a IA";
  if (mark === "comprovante_inventado") return "Tentativa de confirmar sem gravar no banco (bloqueada)";
  if (mark === "limite_passos") return "Mensagem complexa atingiu o limite de etapas";
  if (mark === "fluxo_antigo") return "Processado pelo modo de contingência";
  if (mark.startsWith("excecao:")) return `Falha ao gravar (${mark.replace("excecao:", "")})`;
  if (mark.startsWith("recusado:")) return `Ação recusada pela regra (${mark.replace("recusado:", "")})`;
  return mark;
}

export interface SellerActivity {
  userId: string;
  registros: number;
  consultas: number;
  erros: number;
  audios: number;
  ultimo?: string;
  /** Dias desde o último registro gravado; undefined = nunca registrou no período lido. */
  diasSemRegistrar?: number;
}

/** Resumo por pessoa numa janela de dias: quem mais reporta e quem parou de reportar. */
export function sellerActivity(records: AgentRecord[], userIds: string[], now: Date, days = 7): SellerActivity[] {
  const from = now.getTime() - days * 86_400_000;
  return sellerActivityInRange(records, userIds, now, (at) => new Date(at).getTime() >= from);
}

/** Resumo por pessoa respeitando qualquer filtro de período, mantendo o cálculo real de dias sem registrar até `now`. */
export function sellerActivityInRange(
  records: AgentRecord[],
  userIds: string[],
  now: Date,
  inRange: (at: string) => boolean,
): SellerActivity[] {
  return userIds
    .map((userId) => {
      const mine = [...records]
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.at.localeCompare(a.at));
      const scoped = mine.filter((r) => inRange(r.at));
      const lastWrite = mine.find((r) => recordResult(r) === "gravado");
      return {
        userId,
        registros: scoped.filter((r) => recordResult(r) === "gravado").length,
        consultas: scoped.filter((r) => recordResult(r) === "consulta").length,
        erros: scoped.filter((r) => recordResult(r) === "erro").length,
        audios: scoped.filter((r) => r.audio).length,
        ultimo: lastWrite?.at,
        diasSemRegistrar: lastWrite
          ? Math.max(0, Math.floor((now.getTime() - new Date(lastWrite.at).getTime()) / 86_400_000))
          : undefined,
      };
    })
    .sort((a, b) => b.registros - a.registros || b.audios - a.audios);
}
