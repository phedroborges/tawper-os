import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { prepareAutomationEvent } from "./automation-contract";

export interface ApprovedAutomation {
  organizationId: string;
  aggregateType: "company" | "contact" | "conversation";
  aggregateId: string;
  action: "send_form" | "send_whatsapp" | "send_email";
  payload: Record<string, unknown>;
  approvedBy: string;
  approvalId: string;
}

/** O agente prepara; esta função apenas enfileira uma ação que já recebeu aprovação humana. */
export async function enqueueApprovedAutomation(input: ApprovedAutomation) {
  if (process.env.TAWPER_AGENT_WRITES_ENABLED !== "true") throw new Error("Ferramentas mutáveis de agente estão desabilitadas.");
  const event = prepareAutomationEvent(input);
  const idempotencyKey = event.idempotency_key;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("outbox_events")
    .insert(event)
    .select("id, status, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return { duplicate: true, idempotencyKey };
    throw new Error(`Não foi possível enfileirar a automação: ${error.message}`);
  }
  return { duplicate: false, idempotencyKey, event: data };
}
