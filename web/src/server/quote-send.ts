import "server-only";

import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { Quote } from "@/lib/types";
import { sendProofMedia, type MediaAgent } from "@/server/integrations/stevo-proof/outbound";
import { buildQuotePdf, loadQuotePdfContext } from "@/server/quote-pdf";
import { getQuote, markQuoteSentRecord } from "@/server/quotes";

export type SendQuoteInput =
  | { quoteId: string; via: "whatsapp"; contactId: string; message?: string; agent: MediaAgent }
  | { quoteId: string; via: "manual"; contactId?: string; actorId?: string };

/**
 * Envia o orçamento ao contato escolhido pelo WhatsApp (PDF anexado) ou apenas registra
 * que ele foi enviado por fora (PDF baixado e mandado por e-mail, por exemplo).
 * O orçamento só vira "enviado" depois que a Stevo aceita a mensagem.
 */
export async function sendQuote(input: SendQuoteInput): Promise<Quote> {
  const quote = await getQuote(input.quoteId);
  if (quote.status !== "rascunho" && input.via === "manual") throw new Error("Este orçamento já foi enviado.");
  if (!quote.itens.length) throw new Error("O orçamento está sem itens.");

  if (input.via === "manual") {
    return markQuoteSentRecord(quote.id, { via: "manual", contactId: input.contactId, actorId: input.actorId });
  }

  const contact = await getSupabaseAdmin()
    .from("contacts")
    .select("id, company_id, name, whatsapp_e164, contact_allowed")
    .eq("id", input.contactId)
    .eq("organization_id", TAWPER_ORG_ID)
    .maybeSingle();
  if (contact.error) throw new Error(contact.error.message);
  if (!contact.data || contact.data.company_id !== quote.companyId) throw new Error("Contato não pertence a esta empresa.");
  if (!contact.data.whatsapp_e164) throw new Error(`${contact.data.name} não tem WhatsApp cadastrado.`);
  if (contact.data.contact_allowed === false) throw new Error(`${contact.data.name} não autorizou contato.`);

  const ctx = await loadQuotePdfContext(quote, input.contactId);
  const bytes = await buildQuotePdf({ ...quote, enviadoEm: quote.enviadoEm ?? new Date().toISOString() }, ctx);
  const caption = input.message?.trim() || `Segue o orçamento ${quote.numero}. Qualquer dúvida estou à disposição.`;

  await sendProofMedia({
    to: contact.data.whatsapp_e164 as string,
    agent: input.agent,
    caption,
    file: { bytes: Buffer.from(bytes), mime: "application/pdf", name: `Orcamento_${quote.numero}.pdf` },
  });

  try {
    return await markQuoteSentRecord(quote.id, { via: "whatsapp", contactId: input.contactId, actorId: input.agent.id });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`O PDF foi enviado pelo WhatsApp, mas não consegui registrar o envio: ${detail}`);
  }
}
