export interface ConversationOwnerCandidate {
  ownerId: string;
  ownerName: string;
}

export type ConversationRoutingDecision =
  | { destination: "owner"; ownerId: string; ownerName: string; reason: "existing_owner" | "portfolio_match" }
  | { destination: "queue"; reason: "unknown_contact" | "ambiguous_portfolio" };

/** Regra canônica: nenhuma IA escolhe pessoas livremente; a carteira cadastrada decide. */
export function decideConversationRoute(input: { existingOwner?: ConversationOwnerCandidate | null; portfolioCandidates: ConversationOwnerCandidate[] }): ConversationRoutingDecision {
  if (input.existingOwner?.ownerId) return { destination: "owner", ownerId: input.existingOwner.ownerId, ownerName: input.existingOwner.ownerName, reason: "existing_owner" };
  const unique = new Map(input.portfolioCandidates.filter((item) => item.ownerId).map((item) => [item.ownerId, item]));
  if (unique.size === 1) {
    const owner = [...unique.values()][0];
    return { destination: "owner", ownerId: owner.ownerId, ownerName: owner.ownerName, reason: "portfolio_match" };
  }
  return { destination: "queue", reason: unique.size > 1 ? "ambiguous_portfolio" : "unknown_contact" };
}
