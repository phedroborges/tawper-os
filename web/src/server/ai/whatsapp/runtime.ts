import "server-only";

import { ASSISTANT_HELP, assistantAnswer } from "@/lib/ai";
import { systemContext } from "@/lib/ai-context";
import { canonicalWhatsApp } from "@/lib/br-ids";
import { visibleCompanies, type Data } from "@/lib/selectors";
import { invalidateCrmReadCache, loadCrmSnapshot } from "@/server/crm";
import { ensureOperators } from "@/server/persist";
import { aiAssistant } from "../actions";
import { executeAssistantAction } from "../action-engine";
import { AGENT_VERSION, agentToolsEnabled, runToolAgent } from "../agent";
import { runUndo } from "../agent/undo";
import { resolveWhatsAppAgentUser } from "./access";
import { AUDIO_FAILED, AUDIO_PREFIX } from "./audio";
import { findWhatsAppAgentIdentity } from "./config";
import { renderWhatsAppAnswer } from "./render";
import { sendWhatsAppAgentText } from "./stevo";
import {
  bindWhatsAppAgentSessionProfile,
  claimPendingWhatsAppAction,
  claimWhatsAppAgentJob,
  claimWhatsAppUndo,
  findWhatsAppAgentReply,
  finishWhatsAppAgentJob,
  finishPendingWhatsAppAction,
  finishWhatsAppUndo,
  flagLastWhatsAppAgentRun,
  loadWhatsAppAgentHistory,
  recordWhatsAppAgentReply,
  recordWhatsAppAgentRun,
  type WhatsAppAgentJob,
} from "./store";

const IA_FORA = "⚠️ Estou com um problema técnico agora e não consegui entender sua mensagem. Nada foi gravado. Tenta de novo daqui a pouco.";

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
function payloadString(job: WhatsAppAgentJob, key: keyof WhatsAppAgentJob["payload"]) {
  const value = job.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function answerJob(job: WhatsAppAgentJob) {
  const started = new Date();
  const sessionId = payloadString(job, "session_id") || job.aggregate_id;
  const sender = canonicalWhatsApp(payloadString(job, "sender"));
  const received = payloadString(job, "question").slice(0, 4000);
  const question = received.startsWith(AUDIO_PREFIX) ? received.slice(AUDIO_PREFIX.length).trim() : received;
  const externalMessageId = payloadString(job, "external_message_id");
  if (!sessionId || !sender || !received) throw new Error("Evento do agente interno está incompleto.");

  const existing = await findWhatsAppAgentReply(job.id);
  if (existing) return;

  const identity = findWhatsAppAgentIdentity(sender);
  if (!identity) throw new Error("Remetente não está mais autorizado.");

  let snapshot = await loadCrmSnapshot();
  let resolved = resolveWhatsAppAgentUser(identity, snapshot.users);
  if (!resolved.linked) {
    // Pessoa da equipe fixa que ainda não tem perfil no banco: cria os perfis que faltam e procura de novo.
    try {
      await ensureOperators();
      invalidateCrmReadCache();
      snapshot = await loadCrmSnapshot();
      resolved = resolveWhatsAppAgentUser(identity, snapshot.users);
    } catch (error) {
      console.warn("[agente] não foi possível criar os perfis da equipe", error instanceof Error ? error.message : error);
    }
  }
  if (!resolved.linked) {
    const text = `Olá, ${resolved.user.short}. Seu número está autorizado, mas ainda não está vinculado a um perfil do Tawper. Peça a um gestor para concluir esse vínculo (profileId na allowlist).`;
    const sent = await sendWhatsAppAgentText(sender, text);
    await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: text, externalMessageId: sent.messageId });
    return;
  }

  await bindWhatsAppAgentSessionProfile(sessionId, uuid(resolved.user.id));
  if (received === AUDIO_FAILED || !question) {
    const text = "N\u00e3o consegui ouvir esse \u00e1udio. Pode mandar de novo, ou escrever o pedido?";
    const sent = await sendWhatsAppAgentText(sender, text);
    await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: text, externalMessageId: sent.messageId });
    return;
  }
  // Pontuação e maiúsculas não contam: "Confirmar." dito em áudio também confirma.
  const normalizedQuestion = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9, ]/g, "").trim().toLowerCase();
  if (/^(confirmar|confirmo|pode confirmar|sim,? confirmar)$/.test(normalizedQuestion)) {
    const pending = await claimPendingWhatsAppAction(sessionId);
    // Sem proposta guardada, "confirmo" é resposta a uma pergunta do próprio agente: segue para a conversa normal.
    if (pending) {
      const result = await executeAssistantAction({ actorId: resolved.user.id, action: pending.action });
      await finishPendingWhatsAppAction(pending.id, result.ok ? "executed" : "failed");
      const sent = await sendWhatsAppAgentText(sender, result.message);
      await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: result.message, externalMessageId: sent.messageId });
      return;
    }
  } else if (/^(cancelar|cancela|cancelado|nao confirmar)$/.test(normalizedQuestion)) {
    const pending = await claimPendingWhatsAppAction(sessionId);
    if (pending) {
      await finishPendingWhatsAppAction(pending.id, "cancelled");
      const text = "Ação cancelada. Nada foi alterado no CRM.";
      const sent = await sendWhatsAppAgentText(sender, text);
      await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: text, externalMessageId: sent.messageId });
      return;
    }
  } else if (/^(desfazer|desfaz|desfaca|desfaz isso|pode desfazer|desfazer isso)$/.test(normalizedQuestion)) {
    const undo = await claimWhatsAppUndo(sessionId);
    let text = "Não tem nada recente para desfazer por aqui. Se algo ficou errado, me diga o que corrigir.";
    if (undo) {
      try {
        await runUndo(resolved.user.id, undo.desfazer);
        await finishWhatsAppUndo(undo.id, "done");
        text = `↩️ Desfeito: ${undo.desfazer.map((item) => item.resumo).join("; ")}.`;
      } catch (error) {
        await finishWhatsAppUndo(undo.id, "failed");
        text = `⚠️ Não consegui desfazer: ${error instanceof Error ? error.message : "erro no banco"}. Nada foi alterado; confira no sistema.`;
      }
    }
    const sent = await sendWhatsAppAgentText(sender, text);
    await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: text, externalMessageId: sent.messageId });
    return;
  } else if (/^(voce )?(errou|errado|ta errado|esta errado|ta tudo errado|esta tudo errado|errou de novo)$/.test(normalizedQuestion)) {
    // Marcação manual para a revisão: o atendimento anterior entra na lista de falhas.
    const flagged = await flagLastWhatsAppAgentRun(sessionId, "usuario_marcou_erro").catch(() => false);
    const text = flagged
      ? "Anotado como erro, vai para a revisão. O que era para eu ter feito? Pode mandar do seu jeito que eu tento de novo."
      : "Não achei a resposta anterior para marcar. Me conta o que era para eu ter feito?";
    const sent = await sendWhatsAppAgentText(sender, text);
    await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: text, externalMessageId: sent.messageId });
    return;
  }
  const data: Data = { ...snapshot, suggestions: [], conversations: [] };
  const allowedCompanies = visibleCompanies(data, resolved.user);
  const allowedCompanyIds = allowedCompanies.map((company) => company.id);
  const allowed = new Set(allowedCompanyIds);
  const turns = await loadWhatsAppAgentHistory(sessionId, externalMessageId);
  const history = turns.map(({ role, content }) => ({ role, content }));
  const fallback = assistantAnswer(data, resolved.user, question);
  const escopo = {
    gestor: resolved.user.role === "admin" || resolved.user.role === "gestor",
    telefones: snapshot.contacts.filter((contact) => allowed.has(contact.companyId) && contact.whatsapp).map((contact) => contact.whatsapp!),
  };
  const ask = (pergunta: string, skipActions: boolean) =>
    aiAssistant({
      question: pergunta,
      history: history.slice(-6),
      actorId: resolved.user.id,
      sistema: systemContext(data, resolved.user),
      fallback: pergunta === question ? fallback : assistantAnswer(data, resolved.user, pergunta),
      allowedCompanyIds,
      escopo,
      skipActions,
    });
  const toolsOn = agentToolsEnabled();
  // O agente com ferramentas vê também as anotações internas das respostas anteriores (ids), para continuar de onde parou.
  const withNotes = turns.map(({ role, content, contexto }) => ({ role, content: contexto ? `${content}\n[interno: ${contexto}]` : content }));
  const viaFerramentas = toolsOn
    ? await runToolAgent({ actor: resolved.user, question, history: withNotes, consultar: (pergunta) => ask(pergunta, true), requestId: job.id })
    : null;
  console.info("[agente] caminho da resposta", toolsOn ? (viaFerramentas ? "ferramentas" : "fluxo antigo (o modelo não respondeu com ferramentas)") : "fluxo antigo (TAWPER_AGENT_TOOLS_ENABLED ou TAWPER_AGENT_WRITES_ENABLED desligada)");
  let answer = viaFerramentas ? { texto: viaFerramentas.texto, acao: viaFerramentas.acao } : await ask(question, false);
  // Sem a IA (crédito, limite ou queda da OpenAI) o fluxo antigo só entende palavra-chave: melhor avisar do que mandar o texto de ajuda.
  if (toolsOn && !viaFerramentas && answer.texto === ASSISTANT_HELP) answer = { texto: IA_FORA };
  const desfazer = viaFerramentas?.desfazer ?? [];
  const text = `${renderWhatsAppAnswer(answer)}${desfazer.length ? "\n\n↩️ Errei? Responda DESFAZER." : ""}`;
  const sent = await sendWhatsAppAgentText(sender, text);
  const contexto = viaFerramentas?.contexto.join(" | ");
  await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: text, externalMessageId: sent.messageId, action: answer.acao, contexto, desfazer });
  await recordWhatsAppAgentRun({
    sessionId,
    correlationId: job.id,
    profileId: resolved.user.id,
    companyId: viaFerramentas?.empresaId,
    question,
    audio: received.startsWith(AUDIO_PREFIX),
    caminho: viaFerramentas ? "ferramentas" : "fluxo_antigo",
    versao: AGENT_VERSION,
    modelo: viaFerramentas?.modelo,
    resposta: text,
    gravou: viaFerramentas?.gravou ?? [],
    marcas: [...(viaFerramentas?.marcas ?? []), ...(toolsOn && !viaFerramentas ? ["caiu_no_fluxo_antigo"] : [])],
    passos: viaFerramentas?.passos ?? [],
    tokens: viaFerramentas?.tokens,
    inicio: started,
    fim: new Date(),
  });
}

export async function processWhatsAppAgentQueue(limit = 3) {
  const workerId = `whatsapp-agent-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < Math.max(1, Math.min(limit, 20)); index += 1) {
    const job = await claimWhatsAppAgentJob(workerId);
    if (!job) break;
    try {
      await answerJob(job);
      await finishWhatsAppAgentJob(job.id, true);
      processed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Falha desconhecida";
      await finishWhatsAppAgentJob(job.id, false, message);
    }
  }
  return { processed, failed };
}
