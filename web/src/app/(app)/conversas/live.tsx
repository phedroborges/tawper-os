"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LiveInbox, type Snapshot } from "@/components/chat/LiveInbox";

/** Tela Conversas: o atendimento em tela cheia, com a conversa aberta guardada na URL. */
export function LiveConversas({ initial }: { initial: Snapshot }) {
  const params = useSearchParams();
  const router = useRouter();
  return <LiveInbox initial={initial} selected={params.get("c") ?? ""} onSelect={(peer) => router.replace(peer ? `/conversas?c=${peer}` : "/conversas")} />;
}
