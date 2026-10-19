import type { ApprovedAutomation } from "./automation";

export function prepareAutomationEvent(input: ApprovedAutomation) {
  if (!input.organizationId || !input.aggregateId) throw new Error("Automação exige organização e alvo válidos.");
  if (!input.approvedBy || !input.approvalId) throw new Error("Automação externa exige aprovação humana registrada.");
  const idempotencyKey = `automation:${input.action}:${input.aggregateId}:${input.approvalId}`;
  return {
    organization_id: input.organizationId,
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    event_type: `automation.${input.action}`,
    payload: { ...input.payload, approved_by: input.approvedBy, approval_id: input.approvalId },
    idempotency_key: idempotencyKey,
    status: "pending" as const,
  };
}
