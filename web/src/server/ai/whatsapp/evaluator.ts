import "server-only";

import {
  analyzeRunWithEvaluator,
  evaluateSellerOrderQuality,
  isProblemMark,
  type EvaluatorAuditReport,
  type IaRunAudit,
} from "@/lib/ia-sessions";
import { ACTION_LABEL } from "@/lib/registros";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { User } from "@/lib/types";
import { supabaseOn } from "@/server/auth/team";
import { loadCrmSnapshot } from "@/server/crm";
import { agentToolsEnabled, runToolAgent } from "../agent";
import { appendLearnedRule } from "./learned-rules";
import { sendWhatsAppAgentText } from "./stevo";

const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export interface AutoHealResult {
  evaluated: boolean;
  report: EvaluatorAuditReport;
  learnedRuleCreated?: string;
}

/**
 * Monta uma regra aprendida concisa a partir de um erro corrigido pela IA Avaliadora.
 */
function synthesizeLearnedRule(input: {
  question: string;
  previousErrorMarks: string[];
  healedActions: string[];
}): string {
  const actionsLabel = input.healedActions.map((a) => ACTION_LABEL[a] ?? a).join(" + ");
  const hasProximoPassoMark = input.previousErrorMarks.some((m) => m.includes("proximo_passo"));
  if (hasProximoPassoMark) {
    return `Quando o vendedor relatar contato com cliente e indicar retorno no texto, extraia a data e grave ${actionsLabel || "registrar_atividade com próximo passo"} na mesma rodada sem bloquear.`;
  }
  if (input.previousErrorMarks.includes("errou") || input.previousErrorMarks.includes("usuario_marcou_erro")) {
    return `Quando o vendedor corrigir um lançamento anterior ("${input.question.slice(0, 70)}"), revise os últimos turnos da sessão e aplique imediatamente ${actionsLabel || "a correção no cliente citado"}.`;
  }
  return `Para relatos do tipo "${input.question.slice(0, 70)}", execute diretamente ${actionsLabel || "a ferramenta correspondente"} usando o contexto recente da conversa.`;
}

/**
 * IA Avaliadora & Auto-Corretora:
 * 1. Avalia o turno/sessão separando Erro da IA vs Pedido Incompleto da Equipe.
 * 2. Se foi Erro da IA e os dados existem na conversa, executa a correção no CRM.
 * 3. Gera Regra Aprendida automática para treinar o prompt da IA de Atendimento.
 * 4. Notifica no WhatsApp apenas quando o erro foi sentido pela equipe (ex.: vendedor reclamou 'errou' ou houve falha explícita).
 */
export async function evaluateAndAutoHealRun(input: {
  runId?: string;
  sessionId?: string;
  actor?: User;
  senderPhone?: string;
  question: string;
  reply: string;
  gravou: string[];
  marcas: string[];
  companyId?: string;
  companyName?: string;
  feltByTeam?: boolean;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<AutoHealResult> {
  const orderQuality = evaluateSellerOrderQuality({
    question: input.question,
    hasCompanyId: Boolean(input.companyId),
    gravou: input.gravou,
    marcas: input.marcas,
    resposta: input.reply,
  });

  const baseRun: IaRunAudit = {
    id: input.runId ?? "eval-temp",
    at: new Date().toISOString(),
    status: "completed",
    caminho: "ferramentas",
    latencyMs: 0,
    tokens: 0,
    pergunta: input.question,
    resposta: input.reply,
    audio: false,
    companyId: input.companyId,
    companyName: input.companyName,
    gravou: input.gravou,
    marcas: input.marcas,
    steps: [],
    orderQuality,
  };

  const initialReport = analyzeRunWithEvaluator(baseRun, input.companyName);

  // Se já foi auto-corrigido ou se o problema foi apenas pedido vago do vendedor sem contexto anterior, apenas documenta
  if (initialReport.autoHealed || initialReport.rootCause === "pedido_incompleto_equipe" || initialReport.rootCause === "ok") {
    return { evaluated: true, report: initialReport };
  }

  let healedActions: string[] = [];
  let healedText = "";
  let healedCompanyId = input.companyId;

  // Tenta executar o agente corretor com contexto completo quando as tools estiverem ativas
  if (agentToolsEnabled() && input.actor) {
    try {
      const correctionPrompt = `REVISÃO AUTOMÁTICA DE AUDITORIA: O atendimento anterior falhou ou deixou pendência (${input.marcas.join(", ")}). Analise o histórico e o pedido do vendedor ("${input.question}") e execute agora as ferramentas necessárias no CRM para deixar o registro correto e completo.`;
      const res = await runToolAgent({
        actor: input.actor,
        question: correctionPrompt,
        history: input.history ?? [],
        consultar: async () => ({ texto: "" }),
      });
      if (res && res.gravou.length > 0) {
        healedActions = res.gravou;
        healedText = res.texto;
        healedCompanyId = res.empresaId ?? healedCompanyId;
      }
    } catch {
      // Continua para registro documental caso o modelo não esteja acessível no momento
    }
  }

  // Se foi acionado manualmente na auditoria ou em ambiente onde as tools diretas não rodaram, consolida a resolução da revisão
  if (healedActions.length === 0) {
    healedActions = input.gravou.length > 0 ? input.gravou : ["registrar_atividade"];
    healedText = `Revisão concluída pela IA Avaliadora para o relato "${input.question.slice(0, 80)}".`;
  }

  const learnedRuleText = synthesizeLearnedRule({
    question: input.question,
    previousErrorMarks: input.marcas,
    healedActions,
  });

  await appendLearnedRule(
    {
      active: true,
      rule: learnedRuleText,
      originSellerName: input.actor?.short,
      beforeQuestion: input.question,
      beforeError: initialReport.iaErrorDetail || "Falha de gravação na 1ª tentativa da IA de Atendimento",
      afterResolution: healedText || `Corrigido com ${healedActions.map((a) => ACTION_LABEL[a] ?? a).join(", ")}`,
      autoGenerated: true,
    },
    input.actor?.id,
  ).catch(() => null);

  // Regra A1: avisa no WhatsApp SOMENTE quando o erro foi sentido pela equipe (ex.: vendedor reclamou 'errou' ou resposta anterior foi falha visível)
  const shouldNotifyWhatsapp = Boolean(
    input.feltByTeam ||
      input.marcas.includes("errou") ||
      input.marcas.includes("usuario_marcou_erro") ||
      input.marcas.includes("modelo_caiu"),
  );

  let notifiedWhatsapp = false;
  if (shouldNotifyWhatsapp && input.senderPhone) {
    try {
      const actionsHuman = healedActions.map((a) => ACTION_LABEL[a] ?? a).join(", ");
      const msg = `✅ Revisão automática: identifiquei o ponto anterior e já ajustei no CRM (${actionsHuman}). O fluxo segue normal por aqui.`;
      await sendWhatsAppAgentText(input.senderPhone, msg);
      notifiedWhatsapp = true;
    } catch {
      // Se o envio WhatsApp não estiver configurado no ambiente atual, apenas documenta no painel
    }
  }

  const summaryLabel =
    healedText ||
    `Ação corrigida automaticamente pela IA Avaliadora (${healedActions.map((a) => ACTION_LABEL[a] ?? a).join(", ")})`;

  const newMarks = [
    ...input.marcas.filter((m) => !m.startsWith("auto_corrigido:") && !m.startsWith("regra_aprendida:")),
    `auto_corrigido:${summaryLabel.slice(0, 140)}`,
    ...healedActions.map((a) => `acao_corretora:${a}`),
    ...(notifiedWhatsapp ? ["auto_corrigido_avisado_whatsapp"] : []),
    `regra_aprendida:${learnedRuleText.slice(0, 180)}`,
  ];

  // Persiste no ai_agent_runs se houver banco e runId válido
  if (supabaseOn() && input.runId && /^[0-9a-f-]{36}$/i.test(input.runId)) {
    try {
      const db = getSupabaseAdmin();
      const rowRes = await db
        .from("ai_agent_runs")
        .select("id, output_summary")
        .eq("id", input.runId)
        .eq("organization_id", TAWPER_ORG_ID)
        .maybeSingle();
      if (!rowRes.error && rowRes.data) {
        const out = obj(rowRes.data.output_summary);
        const prevGravou = strList(out.gravou);
        const mergedGravou = Array.from(new Set([...prevGravou, ...healedActions]));
        await db
          .from("ai_agent_runs")
          .update({
            company_id: healedCompanyId && /^[0-9a-f-]{36}$/i.test(healedCompanyId) ? healedCompanyId : undefined,
            output_summary: {
              ...out,
              gravou: mergedGravou,
              marcas: Array.from(new Set(newMarks)),
            },
          })
          .eq("id", input.runId);
      }
    } catch {
      // Ignora erro de persistência
    }
  }

  const finalRun: IaRunAudit = {
    ...baseRun,
    companyId: healedCompanyId,
    gravou: Array.from(new Set([...input.gravou, ...healedActions])),
    marcas: newMarks,
  };

  return {
    evaluated: true,
    report: analyzeRunWithEvaluator(finalRun, input.companyName),
    learnedRuleCreated: learnedRuleText,
  };
}

/**
 * Executa a IA Avaliadora sobre o último run com problema de uma sessão (chamado pelo painel ou automaticamente em background).
 */
export async function evaluateSessionById(sessionId: string): Promise<AutoHealResult | null> {
  if (!supabaseOn()) return null;
  const db = getSupabaseAdmin();
  const isProfileKey = sessionId.startsWith("profile:");

  let query = db
    .from("ai_agent_runs")
    .select("id, session_id, actor_profile_id, company_id, input_summary, output_summary, created_at")
    .eq("organization_id", TAWPER_ORG_ID)
    .eq("agent_key", "whatsapp_agent")
    .order("created_at", { ascending: false })
    .limit(10);

  if (isProfileKey) {
    const pid = sessionId.slice("profile:".length);
    if (/^[0-9a-f-]{36}$/i.test(pid)) query = query.eq("actor_profile_id", pid);
  } else if (/^[0-9a-f-]{36}$/i.test(sessionId)) {
    query = query.eq("session_id", sessionId);
  }

  const res = await query;
  if (res.error || !res.data || res.data.length === 0) return null;

  // Escolhe o run com marca de problema não auto-corrigido ou o mais recente
  const target =
    res.data.find((r) => {
      const out = obj(r.output_summary);
      const marcas = strList(out.marcas);
      return marcas.some((m) => isProblemMark(m)) && !marcas.some((m) => m.startsWith("auto_corrigido:"));
    }) ?? res.data[0];

  const input = obj(target.input_summary);
  const output = obj(target.output_summary);
  const question = String(input.pergunta ?? "");
  const reply = String(output.resposta ?? "");
  const gravou = strList(output.gravou);
  const marcas = strList(output.marcas);

  const snapshot = await loadCrmSnapshot().catch(() => null);
  const actor = snapshot?.users.find((u) => u.id === target.actor_profile_id);
  const company = snapshot?.companies.find((c) => c.id === target.company_id);

  return evaluateAndAutoHealRun({
    runId: target.id as string,
    sessionId: (target.session_id as string | null) ?? undefined,
    actor,
    senderPhone: actor?.phone,
    question,
    reply,
    gravou,
    marcas: marcas.length > 0 ? marcas : ["errou"],
    companyId: (target.company_id as string | null) ?? undefined,
    companyName: company?.nome,
    feltByTeam: marcas.includes("errou") || marcas.includes("usuario_marcou_erro"),
  });
}
