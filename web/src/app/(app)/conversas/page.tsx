import { Suspense } from "react";
import { loadProofSnapshot } from "@/server/integrations/stevo-proof/actions";
import { DemoConversas } from "./demo";
import { LiveConversas } from "./live";

export const dynamic = "force-dynamic";

async function ConversasContent() {
  const initial = await loadProofSnapshot().catch(() => null);
  if (!initial) return <div role="alert" className="p-6">Não foi possível carregar o WhatsApp. Verifique a conexão e atualize a página para tentar novamente.</div>;
  if (!initial.enabled || !initial.configured) return <DemoConversas />;
  return <LiveConversas initial={initial} />;
}

export default function ConversasPage() {
  return <Suspense fallback={<div role="status" className="p-6">Carregando conversas…</div>}><ConversasContent /></Suspense>;
}
