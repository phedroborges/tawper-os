import "server-only";

import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { KitComponent, Modalidade, Quote, QuoteStatus } from "@/lib/types";
import { quoteTotals } from "@/lib/utils";
import { ensureOperators, resolveOwner } from "@/server/persist";

type Row = Record<string, unknown>;

const STATUS_FROM_DB: Record<string, QuoteStatus> = {
  draft: "rascunho",
  sent: "enviado",
  accepted: "aceito",
  rejected: "recusado",
  expired: "recusado",
};

const STATUS_TO_DB: Record<QuoteStatus, string> = {
  rascunho: "draft",
  enviado: "sent",
  aceito: "accepted",
  recusado: "rejected",
};

const MODE_FROM_DB: Record<string, Modalidade> = { sale: "venda", rental: "locacao", courtesy: "cortesia" };

function isUuid(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function fromRows(row: Row, items: Row[]): Quote {
  const via = row.sent_via === "whatsapp" || row.sent_via === "manual" ? row.sent_via : undefined;
  return {
    id: row.id as string,
    numero: row.number as string,
    companyId: row.company_id as string,
    dealId: row.opportunity_id as string,
    itens: items
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((it) => ({
        id: it.id as string,
        productId: (it.product_id as string) ?? undefined,
        sku: it.sku as string,
        descricao: it.description as string,
        unidade: it.unit as string,
        qtd: Number(it.quantity),
        preco: Number(it.unit_price),
        modo: MODE_FROM_DB[(it.mode as string) ?? "sale"] ?? "venda",
        meses: it.months != null ? Number(it.months) : undefined,
        precoReferencia: it.reference_price != null ? Number(it.reference_price) : undefined,
        motivoCortesia: (it.courtesy_reason as string) ?? undefined,
        prazoPagamento: (it.payment_terms as string) ?? undefined,
        componentes: Array.isArray(it.components) ? (it.components as KitComponent[]) : undefined,
      })),
    desconto: Number(row.discount_pct ?? 0),
    condicao: (row.payment_terms as string) ?? "",
    validadeDias: Number(row.validity_days ?? 15),
    status: STATUS_FROM_DB[(row.status as string) ?? "draft"] ?? "rascunho",
    createdAt: row.created_at as string,
    enviadoEm: (row.sent_at as string) ?? undefined,
    decisaoEsperada: (row.expected_decision_at as string) ?? undefined,
    autorId: (row.author_id as string) ?? "",
    observacoes: (row.notes as string) ?? undefined,
    enviadoPara: via ? { contatoId: (row.sent_to_contact_id as string) ?? undefined, via } : undefined,
    anexo: Boolean(row.pdf_path),
    numeroExterno: row.pdf_path ? (items[0]?.sku as string | undefined) : undefined,
  };
}

export async function listQuotes(): Promise<Quote[]> {
  const sb = getSupabaseAdmin();
  const [quotes, items] = await Promise.all([
    sb.from("quotes").select("*").eq("organization_id", TAWPER_ORG_ID).order("created_at", { ascending: false }),
    sb.from("quote_items").select("*").eq("organization_id", TAWPER_ORG_ID),
  ]);
  if (quotes.error) throw new Error(quotes.error.message);
  if (items.error) throw new Error(items.error.message);
  const byQuote = new Map<string, Row[]>();
  for (const it of items.data ?? []) {
    const list = byQuote.get(it.quote_id as string) ?? [];
    list.push(it);
    byQuote.set(it.quote_id as string, list);
  }
  return (quotes.data ?? []).map((q) => fromRows(q, byQuote.get(q.id as string) ?? []));
}

export async function getQuote(id: string): Promise<Quote> {
  if (!isUuid(id)) throw new Error("Orçamento não encontrado.");
  const sb = getSupabaseAdmin();
  const [quote, items] = await Promise.all([
    sb.from("quotes").select("*").eq("id", id).eq("organization_id", TAWPER_ORG_ID).maybeSingle(),
    sb.from("quote_items").select("*").eq("quote_id", id).eq("organization_id", TAWPER_ORG_ID),
  ]);
  if (quote.error) throw new Error(quote.error.message);
  if (items.error) throw new Error(items.error.message);
  if (!quote.data) throw new Error("Orçamento não encontrado.");
  return fromRows(quote.data, items.data ?? []);
}

const BUCKET = "orcamentos";
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface QuoteAttachment {
  companyId: string;
  dealId: string;
  /** Número do orçamento no sistema da empresa. */
  numeroExterno: string;
  valor: number;
  condicao?: string;
  validadeDias?: number;
  observacoes?: string;
  contactId?: string;
  file: { bytes: Uint8Array; name: string };
}

/** O bucket é privado: o PDF só sai pela rota autenticada /api/quotes/[id]/pdf. */
async function ensureBucket() {
  const created = await getSupabaseAdmin().storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_PDF_BYTES, allowedMimeTypes: ["application/pdf"] });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw new Error(`Não consegui preparar o armazenamento de orçamentos: ${created.error.message}`);
}

/**
 * Registra o orçamento que o vendedor fez no sistema da empresa: guarda o PDF, o número e o valor,
 * e já marca como enviado (follow-up e valor do negócio seguem a regra de sempre).
 */
export async function attachQuoteRecord(input: QuoteAttachment, actorId?: string): Promise<Quote> {
  if (!isUuid(input.companyId) || !isUuid(input.dealId)) throw new Error("Esta empresa ainda não está no banco.");
  const numero = input.numeroExterno.trim().slice(0, 40);
  if (!numero) throw new Error("Informe o número do orçamento.");
  const valor = Math.round(Number(input.valor) * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Informe o valor total do orçamento.");
  const validade = Math.max(1, Math.round(Number(input.validadeDias) || 15));
  const bytes = input.file.bytes;
  if (!bytes.length) throw new Error("Anexe o PDF do orçamento.");
  if (bytes.length > MAX_PDF_BYTES) throw new Error("O PDF passa de 10 MB.");
  // Todo PDF começa com "%PDF": o nome do arquivo não prova nada.
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") throw new Error("O arquivo precisa ser um PDF.");

  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const ins = await sb
    .from("quotes")
    .insert({
      organization_id: TAWPER_ORG_ID, company_id: input.companyId, opportunity_id: input.dealId, number: "", status: "draft",
      discount_pct: 0, payment_terms: input.condicao?.trim() || null, validity_days: validade, notes: input.observacoes?.trim() || null,
      author_id: await resolveOwner(actorId, actors),
    })
    .select("id")
    .single();
  if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "Falha ao gravar o orçamento.");
  const quoteId = ins.data.id as string;
  try {
    const item = await sb.from("quote_items").insert({
      organization_id: TAWPER_ORG_ID, quote_id: quoteId, sku: numero, description: `Orçamento nº ${numero} (sistema da empresa)`, unit: "un", quantity: 1, unit_price: valor, position: 0, mode: "sale",
    });
    if (item.error) throw new Error(item.error.message);
    await ensureBucket();
    const path = `${quoteId}.pdf`;
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(`Não consegui guardar o PDF: ${up.error.message}`);
    const upd = await sb.from("quotes").update({ pdf_path: path }).eq("id", quoteId);
    if (upd.error) throw new Error(upd.error.message);
  } catch (e) {
    // Sem o PDF guardado, o orçamento não fica pela metade.
    await sb.from("quotes").delete().eq("id", quoteId);
    throw e;
  }
  return markQuoteSentRecord(quoteId, { via: "manual", contactId: input.contactId, actorId });
}

/** PDF anexado, lido do armazenamento privado. */
export async function readQuotePdf(id: string): Promise<{ bytes: ArrayBuffer; name: string }> {
  if (!isUuid(id)) throw new Error("Orçamento não encontrado.");
  const sb = getSupabaseAdmin();
  const row = await sb.from("quotes").select("number, pdf_path").eq("id", id).eq("organization_id", TAWPER_ORG_ID).maybeSingle();
  if (row.error) throw new Error(row.error.message);
  if (!row.data?.pdf_path) throw new Error("Este orçamento não tem PDF anexado.");
  const file = await sb.storage.from(BUCKET).download(row.data.pdf_path as string);
  if (file.error || !file.data) throw new Error(file.error?.message ?? "PDF não encontrado.");
  return { bytes: await file.data.arrayBuffer(), name: `Orcamento_${row.data.number}.pdf` };
}

export async function setQuoteStatusRecord(id: string, status: QuoteStatus): Promise<Quote> {
  const sb = getSupabaseAdmin();
  const patch: Row = { status: STATUS_TO_DB[status] };
  if (status === "aceito" || status === "recusado") patch.decided_at = new Date().toISOString();
  const upd = await sb.from("quotes").update(patch).eq("id", id).eq("organization_id", TAWPER_ORG_ID);
  if (upd.error) throw new Error(upd.error.message);
  return getQuote(id);
}

export async function markQuoteSentRecord(id: string, sent: { via: "whatsapp" | "manual"; contactId?: string; actorId?: string }): Promise<Quote> {
  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const now = new Date();
  const decision = new Date(now.getTime() + 5 * 86_400_000);
  const upd = await sb
    .from("quotes")
    .update({
      status: "sent",
      sent_at: now.toISOString(),
      expected_decision_at: decision.toISOString(),
      sent_via: sent.via,
      sent_to_contact_id: isUuid(sent.contactId) ? sent.contactId : null,
      sent_by: sent.actorId ? await resolveOwner(sent.actorId, actors) : null,
    })
    .eq("id", id)
    .eq("organization_id", TAWPER_ORG_ID);
  if (upd.error) throw new Error(upd.error.message);
  const quote = await getQuote(id);
  const { total } = quoteTotals(quote.itens, quote.desconto);
  await sb.from("opportunities").update({ estimated_value: total }).eq("id", quote.dealId).eq("organization_id", TAWPER_ORG_ID);
  return quote;
}
