import "server-only";

import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { KitComponent, Modalidade, Quote, QuoteItem, QuoteStatus } from "@/lib/types";
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
const MODE_TO_DB: Record<Modalidade, string> = { venda: "sale", locacao: "rental", cortesia: "courtesy" };

export interface QuoteInput {
  id?: string;
  companyId: string;
  dealId: string;
  itens: Omit<QuoteItem, "id">[];
  desconto: number;
  condicao: string;
  validadeDias: number;
  observacoes?: string;
}

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

function validate(input: QuoteInput) {
  if (!isUuid(input.companyId) || !isUuid(input.dealId)) {
    throw new Error("Esta empresa ainda não está no banco. Salve o cadastro antes de montar o orçamento.");
  }
  const itens = input.itens.filter((i) => Number(i.qtd) > 0);
  if (!itens.length) throw new Error("Adicione pelo menos um item ao orçamento.");
  for (const it of itens) {
    if (!it.descricao.trim()) throw new Error("Todo item precisa de descrição.");
    if (!MODE_TO_DB[it.modo]) throw new Error(`Modalidade inválida em "${it.descricao}".`);
    if (!Number.isFinite(Number(it.preco)) || Number(it.preco) < 0) throw new Error(`Preço inválido em "${it.descricao}".`);
    if (it.modo !== "venda" && !(Number(it.meses) >= 1)) throw new Error(`Informe o prazo em meses de "${it.descricao}".`);
    if (it.modo === "locacao" && Number(it.preco) <= 0) throw new Error(`Informe o valor mensal da locação de "${it.descricao}".`);
    if (it.modo === "cortesia" && !it.motivoCortesia?.trim()) throw new Error(`Informe o motivo da cortesia de "${it.descricao}".`);
  }
  const desconto = Number(input.desconto);
  if (!Number.isFinite(desconto) || desconto < 0 || desconto > 100) throw new Error("Desconto deve ficar entre 0 e 100%.");
  const validade = Math.round(Number(input.validadeDias));
  if (!Number.isFinite(validade) || validade < 1) throw new Error("A validade deve ser de pelo menos 1 dia.");
  return { itens, desconto, validade };
}

export async function saveQuoteRecord(input: QuoteInput, actorId?: string): Promise<Quote> {
  const { itens, desconto, validade } = validate(input);
  const sb = getSupabaseAdmin();
  const actors = await ensureOperators();
  const fields = {
    discount_pct: desconto,
    payment_terms: input.condicao.trim() || null,
    validity_days: validade,
    notes: input.observacoes?.trim() || null,
  };

  let quoteId = input.id;
  if (quoteId) {
    if (!isUuid(quoteId)) throw new Error("Orçamento não encontrado.");
    const current = await sb.from("quotes").select("status").eq("id", quoteId).eq("organization_id", TAWPER_ORG_ID).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) throw new Error("Orçamento não encontrado.");
    if (current.data.status !== "draft") throw new Error("Orçamento já enviado não pode ser alterado. Crie uma nova versão.");
    const upd = await sb.from("quotes").update(fields).eq("id", quoteId);
    if (upd.error) throw new Error(upd.error.message);
    const del = await sb.from("quote_items").delete().eq("quote_id", quoteId);
    if (del.error) throw new Error(del.error.message);
  } else {
    const ins = await sb
      .from("quotes")
      .insert({
        ...fields,
        organization_id: TAWPER_ORG_ID,
        company_id: input.companyId,
        opportunity_id: input.dealId,
        number: "",
        status: "draft",
        author_id: await resolveOwner(actorId, actors),
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "Falha ao gravar o orçamento.");
    quoteId = ins.data.id as string;
  }

  const rows = itens.map((it, position) => ({
    organization_id: TAWPER_ORG_ID,
    quote_id: quoteId,
    product_id: isUuid(it.productId) ? it.productId : null,
    sku: it.sku.trim() || "AVULSO",
    description: it.descricao.trim(),
    unit: it.unidade.trim() || "un",
    quantity: it.qtd,
    unit_price: it.modo === "cortesia" ? 0 : Math.round(Number(it.preco) * 100) / 100,
    position,
    mode: MODE_TO_DB[it.modo],
    months: it.modo === "venda" ? null : Math.round(Number(it.meses)),
    reference_price: it.modo === "cortesia" ? Math.round(Number(it.precoReferencia ?? 0) * 100) / 100 : null,
    courtesy_reason: it.modo === "cortesia" ? it.motivoCortesia!.trim() : null,
    payment_terms: it.modo === "venda" ? it.prazoPagamento?.trim() || null : null,
    components: it.componentes?.length ? it.componentes.map(({ productId, sku, descricao, unidade, qtd }) => ({ productId, sku, descricao, unidade, qtd })) : null,
  }));
  const insItems = await sb.from("quote_items").insert(rows);
  if (insItems.error) throw new Error(insItems.error.message);
  return getQuote(quoteId!);
}

export async function setQuoteStatusRecord(id: string, status: QuoteStatus): Promise<Quote> {
  const sb = getSupabaseAdmin();
  const patch: Row = { status: STATUS_TO_DB[status] };
  if (status === "aceito" || status === "recusado") patch.decided_at = new Date().toISOString();
  const upd = await sb.from("quotes").update(patch).eq("id", id).eq("organization_id", TAWPER_ORG_ID);
  if (upd.error) throw new Error(upd.error.message);
  return getQuote(id);
}

/** Cria um novo rascunho com os mesmos itens de um orçamento já emitido. */
export async function duplicateQuoteRecord(id: string, actorId?: string): Promise<Quote> {
  const q = await getQuote(id);
  return saveQuoteRecord(
    {
      companyId: q.companyId,
      dealId: q.dealId,
      itens: q.itens.map((i) => ({ ...i, id: undefined })),
      desconto: q.desconto,
      condicao: q.condicao,
      validadeDias: q.validadeDias,
      observacoes: q.observacoes,
    },
    actorId,
  );
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
