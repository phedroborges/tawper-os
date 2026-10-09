import { ProvaWhatsAppClient } from "./ui";
import { loadProofSnapshot } from "@/server/integrations/stevo-proof/actions";
import { PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function ProvaWhatsAppPage() {
  const initial = await loadProofSnapshot();
  return (
    <div>
      <PageHeader
        title="Prova WhatsApp — Fase 0"
        subtitle="Experimento descartável com a Stevo. O CRM continua simulado até a Fase 7."
      />
      <ProvaWhatsAppClient initial={initial} />
    </div>
  );
}
