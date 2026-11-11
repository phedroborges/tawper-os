"use client";

import { useSearchParams } from "next/navigation";
import { LiveInbox, type Snapshot } from "@/components/chat/LiveInbox";

/**
 * Tela Conversas: o atendimento em tela cheia, com a conversa aberta guardada na URL.
 * Trocar de conversa só atualiza o endereço no navegador (history.replaceState): `router.replace`
 * refaria a página no servidor, com consultas à Stevo, antes de mostrar a conversa clicada.
 */
export function LiveConversas({ initial }: { initial: Snapshot }) {
  const params = useSearchParams();
  const select = (peer: string) => window.history.replaceState(null, "", peer ? `/conversas?c=${peer}` : "/conversas");
  return <LiveInbox initial={initial} selected={params.get("c") ?? ""} onSelect={select} />;
}
