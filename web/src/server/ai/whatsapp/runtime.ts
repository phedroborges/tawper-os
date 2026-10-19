import "server-only";

import { assistantAnswer } from "@/lib/ai";
import { systemContext } from "@/lib/ai-context";
import { canonicalWhatsApp } from "@/lib/br-ids";
import { visibleCompanies, type Data } from "@/lib/selectors";
import { loadCrmSnapshot } from "@/server/crm";
import { aiAssistant } from "../actions";
import { resolveWhatsAppAgentUser } from "./access";
import { findWhatsAppAgentIdentity } from "./config";
import { renderWhatsAppAnswer } from "./render";
import { sendWhatsAppAgentText } from "./stevo";
import {
  bindWhatsAppAgentSessionProfile,
  claimWhatsAppAgentJob,
  findWhatsAppAgentReply,
  finishWhatsAppAgentJob,
  loadWhatsAppAgentHistory,
  recordWhatsAppAgentReply,
  type WhatsAppAgentJob,
} from "./store";

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
function payloadString(job: WhatsAppAgentJob, key: keyof WhatsAppAgentJob["payload"]) {
  const value = job.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function answerJob(job: WhatsAppAgentJob) {
  const sessionId = payloadString(job, "session_id") || job.aggregate_id;
  const sender = canonicalWhatsApp(payloadString(job, "sender"));
  const question = payloadString(job, "question").slice(0, 4000);
  const externalMessageId = payloadString(job, "external_message_id");
  if (!sessionId || !sender || !question) throw new Error("Evento do agente interno está incompleto.");

  const existing = await findWhatsAppAgentReply(job.id);
  if (existing) return;

  const identity = findWhatsAppAgentIdentity(sender);
  if (!identity) throw new Error("Remetente não está mais autorizado.");

  const snapshot = await loadCrmSnapshot();
  const resolved = resolveWhatsAppAgentUser(identity, snapshot.users);
  if (identity.role === "vendedor" && !resolved.linked) {
    const text = `Olá, ${resolved.user.short}. Seu número está autorizado, mas seu perfil de vendedor ainda não está vinculado à carteira no Tawper. Peça a um gestor para concluir esse vínculo.`;
    const sent = await sendWhatsAppAgentText(sender, text);
    await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: text, externalMessageId: sent.messageId });
    return;
  }

  await bindWhatsAppAgentSessionProfile(sessionId, uuid(resolved.user.id));
  const data: Data = { ...snapshot, suggestions: [], conversations: [] };
  const allowedCompanies = visibleCompanies(data, resolved.user);
  const allowedCompanyIds = allowedCompanies.map((company) => company.id);
  const allowed = new Set(allowedCompanyIds);
  const history = await loadWhatsAppAgentHistory(sessionId, externalMessageId);
  const fallback = assistantAnswer(data, resolved.user, question);
  const answer = await aiAssistant({
    question,
    history: history.slice(-6),
    sistema: systemContext(data, resolved.user),
    fallback,
    allowedCompanyIds,
    escopo: {
      gestor: resolved.user.role === "admin" || resolved.user.role === "gestor",
      telefones: snapshot.contacts.filter((contact) => allowed.has(contact.companyId) && contact.whatsapp).map((contact) => contact.whatsapp!),
    },
  });
  const text = renderWhatsAppAnswer(answer);
  const sent = await sendWhatsAppAgentText(sender, text);
  await recordWhatsAppAgentReply({ sessionId, outboxEventId: job.id, body: text, externalMessageId: sent.messageId });
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
