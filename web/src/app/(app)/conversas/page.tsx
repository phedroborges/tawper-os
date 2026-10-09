import { Suspense } from "react";
import { loadProofSnapshot } from "@/server/integrations/stevo-proof/actions";
import { DemoConversas } from "./demo";
import { LiveConversas } from "./live";

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  const initial = await loadProofSnapshot().catch(() => null);
  if (!initial?.enabled || !initial.configured) return <DemoConversas />;
  return (
    <Suspense>
      <LiveConversas initial={initial} />
    </Suspense>
  );
}
