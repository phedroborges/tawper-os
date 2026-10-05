"use client";

import { useUI } from "@/lib/ui-store";
import { CompleteActivityModal, NewActivityModal, RescheduleModal } from "./activity";
import { CobrancaModal, ContactModal, DrillModal, EditCompanyModal } from "./misc";
import { QuickRegisterModal } from "./quick";
import { QuoteModal } from "./quote";
import { LoseDealModal, MoveStageModal, StandbyModal, WinDealModal } from "./stage";

/** Renderiza o fluxo (modal) ativo. Qualquer tela abre fluxos via useUI().open(...). */
export function FlowHost() {
  const flow = useUI((s) => s.flow);
  if (!flow) return null;
  const key = JSON.stringify(flow);
  switch (flow.kind) {
    case "quick":
      return <QuickRegisterModal key={key} companyId={flow.companyId} text={flow.text} />;
    case "complete":
      return <CompleteActivityModal key={key} activityId={flow.activityId} />;
    case "newActivity":
      return <NewActivityModal key={key} companyId={flow.companyId} preset={flow.preset} />;
    case "reschedule":
      return <RescheduleModal key={key} activityId={flow.activityId} />;
    case "move":
      return <MoveStageModal key={key} dealId={flow.dealId} toStageId={flow.toStageId} preChecks={flow.preChecks} nota={flow.nota} />;
    case "win":
      return <WinDealModal key={key} dealId={flow.dealId} />;
    case "lose":
      return <LoseDealModal key={key} dealId={flow.dealId} />;
    case "standby":
      return <StandbyModal key={key} companyId={flow.companyId} />;
    case "quote":
      return <QuoteModal key={key} dealId={flow.dealId} quoteId={flow.quoteId} />;
    case "contact":
      return <ContactModal key={key} companyId={flow.companyId} />;
    case "editCompany":
      return <EditCompanyModal key={key} companyId={flow.companyId} />;
    case "cobranca":
      return <CobrancaModal key={key} companyId={flow.companyId} texto={flow.texto} />;
    case "drill":
      return <DrillModal key={key} title={flow.title} subtitle={flow.subtitle} companyIds={flow.companyIds} />;
    default:
      return null;
  }
}
