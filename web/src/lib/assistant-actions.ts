import type { ActivityType, Prioridade } from "./types";

export type AssistantActionKind = "move_stage" | "complete_task" | "create_task";

export type AssistantActionPayload =
  | {
      kind: "move_stage";
      companyId: string;
      dealId: string;
      targetStageKey: string;
      confirmedRequirementKeys: string[];
    }
  | {
      kind: "complete_task";
      companyId: string;
      activityId: string;
      result: string;
    }
  | {
      kind: "create_task";
      companyId: string;
      dealId?: string;
      ownerId: string;
      title: string;
      dueAt: string;
      activityType: ActivityType;
      priority: Prioridade;
    };

export interface AssistantActionProposal {
  id: string;
  kind: AssistantActionKind;
  status: "needs_input" | "awaiting_confirmation" | "executed" | "failed" | "cancelled";
  title: string;
  summary: string;
  missing?: string[];
  confirmationText?: string;
  actorId: string;
  createdAt: string;
  expiresAt: string;
  payload?: AssistantActionPayload;
}

export interface AssistantActionExecution {
  ok: boolean;
  message: string;
  action: AssistantActionProposal;
}
