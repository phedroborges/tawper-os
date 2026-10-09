import { ProvaWhatsAppClient } from "./ui";
import { loadProofSnapshot } from "@/server/integrations/stevo-proof/actions";

export const dynamic = "force-dynamic";

export default async function ProvaWhatsAppPage() {
  const initial = await loadProofSnapshot();
  return <ProvaWhatsAppClient initial={initial} />;
}
