// Central de Atendimento IA (WhatsApp da equipe): agregação de sessões, desempenho da IA e sinalização de intervenção humana.

import { formatRecordMark, recordResult, type AgentRecord } from "./registros";
import type { Activity, Company, Interaction, User } from "./types";

export type InterventionLevel = "intervencao" | "atencao" | "normal" | "revisado";

export interface IaMessageItem {
  id: string;
  at: string;
  direction: "in" | "out";
  body: string;
  audio?: boolean;
  actionPending?: boolean;
}

export interface IaRunStepAudit {
  stepNumber: number;
  kind: string;
  toolName?: string;
  status: string;
  durationMs: number;
}

export interface IaRunAudit {
  id: string;
  at: string;
  status: string;
  model?: string;
  caminho: "ferramentas" | "fluxo_antigo";
  latencyMs: number;
  tokens: number;
  pergunta: string;
  resposta: string;
  audio: boolean;
  companyId?: string;
  gravou: string[];
  marcas: string[];
  errorMessage?: string;
  steps: IaRunStepAudit[];
}

export interface IaSessionBlock {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerShort: string;
  phone: string;
  status: "active" | "closed" | "expired";
  /** Quem está à frente do atendimento neste momento. */
  attendant: string;
  modelLabel: string;
  intervention: InterventionLevel;
  interventionReasons: string[];
  messagesTotal: number;
  messagesFromSeller: number;
  messagesFromIa: number;
  audioCount: number;
  writesCount: number;
  consultsCount: number;
  errorsCount: number;
  pendingActionsCount: number;
  /** Taxa de resolução autônoma sem erros/intervenção (0-100). */
  iaScorePct: number;
  avgLatencyMs: number;
  lastActivityAt: string;
  lastQuestion: string;
  lastReply: string;
  lastGravou: string[];
  reviewedBy?: string;
  runs: IaRunAudit[];
  messages: IaMessageItem[];
}

export interface IaSessionsSummary {
  totalSessions: number;
  activeNow: number;
  needsIntervention: number;
  attentionCount: number;
  totalMessages: number;
  messagesFromSeller: number;
  messagesFromIa: number;
  totalWrites: number;
  iaScorePct: number;
  avgLatencyMs: number;
}

const PROBLEM_MARKS = new Set(["errou", "modelo_caiu", "comprovante_inventado", "limite_passos"]);

export function isProblemMark(mark: string): boolean {
  return PROBLEM_MARKS.has(mark) || mark.startsWith("excecao:") || mark.startsWith("recusado:");
}

export function classifySessionIntervention(input: {
  runs: IaRunAudit[];
  messages: IaMessageItem[];
  nowMs?: number;
}): {
  level: InterventionLevel;
  reasons: string[];
  reviewedBy?: string;
  errorsCount: number;
  pendingActionsCount: number;
  writesCount: number;
  consultsCount: number;
  iaScorePct: number;
  avgLatencyMs: number;
} {
  const nowMs = input.nowMs ?? Date.now();
  const runs = [...input.runs].sort((a, b) => b.at.localeCompare(a.at));
  const messages = [...input.messages].sort((a, b) => a.at.localeCompare(b.at));

  let errorsCount = 0;
  let fallbackCount = 0;
  let writesCount = 0;
  let consultsCount = 0;
  let latencySum = 0;
  let latencyN = 0;
  const reasons: string[] = [];
  let reviewedBy: string | undefined;

  for (const r of runs) {
    const asRecord: AgentRecord = {
      id: r.id,
      at: r.at,
      userId: "",
      companyId: r.companyId,
      pergunta: r.pergunta,
      audio: r.audio,
      resposta: r.resposta,
      gravou: r.gravou,
      marcas: r.marcas,
    };
    const res = recordResult(asRecord);
    const hasProblem = res === "erro" || r.status === "failed" || Boolean(r.errorMessage);
    const revMark = r.marcas.find((m) => m.startsWith("revisado:"));
    if (revMark && !reviewedBy) reviewedBy = revMark.slice("revisado:".length);

    if (hasProblem) {
      errorsCount++;
      if (!revMark) {
        for (const m of r.marcas) {
          if (isProblemMark(m)) {
            const label = formatRecordMark(m);
            if (!reasons.includes(label)) reasons.push(label);
          }
        }
        if (r.status === "failed" && r.errorMessage) {
          const msg = `Falha na execução: ${r.errorMessage.slice(0, 80)}`;
          if (!reasons.includes(msg)) reasons.push(msg);
        }
      }
    } else if (r.gravou.length > 0) {
      writesCount += r.gravou.length;
    } else {
      consultsCount++;
    }

    if (r.caminho === "fluxo_antigo" || r.marcas.includes("fluxo_antigo")) {
      fallbackCount++;
    }
    if (r.latencyMs > 0) {
      latencySum += r.latencyMs;
      latencyN++;
    }
  }

  const lastMsg = messages.at(-1);
  const waitingReply =
    lastMsg?.direction === "in" && nowMs - new Date(lastMsg.at).getTime() > 2 * 60_000;
  if (waitingReply) {
    reasons.push("Última mensagem do vendedor ainda sem resposta da IA");
  }

  const pendingActionsCount = messages.filter((m) => m.actionPending).length;
  if (pendingActionsCount > 0) {
    reasons.push(
      pendingActionsCount === 1
        ? "1 ação aguardando confirmação do vendedor (CONFIRMAR)"
        : `${pendingActionsCount} ações aguardando confirmação do vendedor`,
    );
  }

  if (fallbackCount > 0 && reasons.length === 0) {
    reasons.push(
      fallbackCount === 1
        ? "1 atendimento caiu no modo de contingência"
        : `${fallbackCount} atendimentos caíram no modo de contingência`,
    );
  }

  const unresolvedErrors = runs.filter((r) => {
    const rev = r.marcas.some((m) => m.startsWith("revisado:"));
    const bad =
      r.status === "failed" ||
      Boolean(r.errorMessage) ||
      r.marcas.some((m) => isProblemMark(m));
    return bad && !rev;
  }).length;

  let level: InterventionLevel = "normal";
  if (unresolvedErrors > 0 || waitingReply) {
    level = "intervencao";
  } else if (pendingActionsCount > 0 || fallbackCount > 0) {
    level = "atencao";
  } else if (reviewedBy && errorsCount > 0) {
    level = "revisado";
  }

  const totalRuns = runs.length;
  const iaScorePct =
    totalRuns > 0 ? Math.max(0, Math.round(((totalRuns - errorsCount) / totalRuns) * 100)) : 100;
  const avgLatencyMs = latencyN > 0 ? Math.round(latencySum / latencyN) : 0;

  return {
    level,
    reasons,
    reviewedBy,
    errorsCount,
    pendingActionsCount,
    writesCount,
    consultsCount,
    iaScorePct,
    avgLatencyMs,
  };
}

export function summarizeIaSessions(sessions: IaSessionBlock[]): IaSessionsSummary {
  const totalSessions = sessions.length;
  const activeNow = sessions.filter((s) => s.status === "active").length;
  const needsIntervention = sessions.filter((s) => s.intervention === "intervencao").length;
  const attentionCount = sessions.filter((s) => s.intervention === "atencao").length;
  const messagesFromSeller = sessions.reduce((sum, s) => sum + s.messagesFromSeller, 0);
  const messagesFromIa = sessions.reduce((sum, s) => sum + s.messagesFromIa, 0);
  const totalMessages = sessions.reduce((sum, s) => sum + s.messagesTotal, 0);
  const totalWrites = sessions.reduce((sum, s) => sum + s.writesCount, 0);

  const allRuns = sessions.flatMap((s) => s.runs);
  const totalRuns = allRuns.length;
  const errorRuns = sessions.reduce((sum, s) => sum + s.errorsCount, 0);
  const iaScorePct =
    totalRuns > 0
      ? Math.max(0, Math.round(((totalRuns - errorRuns) / totalRuns) * 100))
      : sessions.length > 0
        ? Math.round(sessions.reduce((sum, s) => sum + s.iaScorePct, 0) / sessions.length)
        : 100;

  const latSessions = sessions.filter((s) => s.avgLatencyMs > 0);
  const avgLatencyMs =
    latSessions.length > 0
      ? Math.round(latSessions.reduce((sum, s) => sum + s.avgLatencyMs, 0) / latSessions.length)
      : 0;

  return {
    totalSessions,
    activeNow,
    needsIntervention,
    attentionCount,
    totalMessages,
    messagesFromSeller,
    messagesFromIa,
    totalWrites,
    iaScorePct,
    avgLatencyMs,
  };
}

/** Fallback para visualização local quando não há sessão de WhatsApp IA gravada no Supabase. */
export function buildDemoIaSessions(input: {
  users: User[];
  interactions: Interaction[];
  activities: Activity[];
  companies: Company[];
  now?: Date;
}): IaSessionBlock[] {
  const now = input.now ?? new Date();
  const team = input.users.filter((u) => u.role === "vendedor" || u.role === "representante");
  const blocks: IaSessionBlock[] = team.map((u, idx) => {
    const mineInts = input.interactions
      .filter((i) => i.autorId === u.id && i.kind !== "cobranca")
      .sort((a, b) => b.at.localeCompare(a.at));
    const mineActs = input.activities
      .filter((a) => a.ownerId === u.id && a.status === "concluida")
      .sort((a, b) => (b.completedAt ?? b.dueAt).localeCompare(a.completedAt ?? a.dueAt));

    const comp = mineInts[0] ? input.companies.find((c) => c.id === mineInts[0].companyId) : undefined;
    const baseAt = mineInts[0]?.at ?? mineActs[0]?.completedAt ?? new Date(now.getTime() - (idx + 1) * 3_600_000).toISOString();
    const lastQuestion =
      mineInts[0]?.conteudo ||
      mineInts[0]?.titulo ||
      (mineActs[0] ? `Concluí ${mineActs[0].tipo.toLowerCase()} — ${mineActs[0].titulo}` : `Bom dia, atualizando carteira de clientes`);
    const needsHelp = idx === 1 && mineInts.length > 0;

    const runs: IaRunAudit[] = [
      {
        id: `demo-run-${u.id}-1`,
        at: baseAt,
        status: needsHelp ? "completed" : "completed",
        model: "gpt-4o-mini",
        caminho: "ferramentas",
        latencyMs: 1450 + idx * 240,
        tokens: 820 + idx * 90,
        pergunta: lastQuestion,
        resposta: needsHelp
          ? `Registrei a nota${comp ? ` em ${comp.nome}` : ""}, porém faltou confirmar o próximo passo.`
          : `Gravado no CRM${comp ? ` · ${comp.nome}` : ""}.`,
        audio: idx % 2 === 0,
        companyId: comp?.id,
        gravou: needsHelp ? ["registrar_atividade"] : ["registrar_atividade", "concluir_tarefa"],
        marcas: needsHelp ? ["recusado:proximo_passo_obrigatorio"] : [],
        steps: [
          { stepNumber: 1, kind: "model", status: "completed", durationMs: 740 },
          {
            stepNumber: 2,
            kind: "tool",
            toolName: "registrar_atividade",
            status: needsHelp ? "failed" : "completed",
            durationMs: 420,
          },
        ],
      },
    ];

    const messages: IaMessageItem[] = [
      { id: `m-${u.id}-1`, at: baseAt, direction: "in", body: lastQuestion, audio: idx % 2 === 0 },
      { id: `m-${u.id}-2`, at: baseAt, direction: "out", body: runs[0].resposta, actionPending: needsHelp },
    ];

    const msgsSeller = Math.max(3, mineInts.length + mineActs.length);
    const msgsIa = msgsSeller;

    return {
      id: `demo-session-${u.id}`,
      sellerId: u.id,
      sellerName: u.name,
      sellerShort: u.short,
      phone: u.phone || "",
      status: "active",
      attendant: needsHelp ? "Escalar para gestor" : "Agente Tawper IA",
      modelLabel: "gpt-4o-mini",
      intervention: needsHelp ? "intervencao" : "normal",
      interventionReasons: needsHelp ? ["Regra bloqueou gravação sem próximo passo definido"] : [],
      messagesTotal: msgsSeller + msgsIa,
      messagesFromSeller: msgsSeller,
      messagesFromIa: msgsIa,
      audioCount: idx % 2 === 0 ? Math.max(1, Math.floor(msgsSeller / 2)) : 0,
      writesCount: Math.max(1, mineInts.length),
      consultsCount: 1,
      errorsCount: needsHelp ? 1 : 0,
      pendingActionsCount: needsHelp ? 1 : 0,
      iaScorePct: needsHelp ? 78 : 100,
      avgLatencyMs: 1450 + idx * 240,
      lastActivityAt: baseAt,
      lastQuestion,
      lastReply: runs[0].resposta,
      lastGravou: runs[0].gravou,
      runs,
      messages,
    };
  });

  const weight = { intervencao: 0, atencao: 1, normal: 2, revisado: 3 };
  return blocks.sort(
    (a, b) => weight[a.intervention] - weight[b.intervention] || b.lastActivityAt.localeCompare(a.lastActivityAt),
  );
}
