"use client";

import { Copy, Download, FileText, MessageCircle, Plus, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { CONDICOES_PAGAMENTO, MODALIDADES, UNIDADES, getStage, stageIndex } from "@/lib/constants";
import { useCatalog } from "@/lib/catalog-store";
import { useCurrentUser, useStore } from "@/lib/store";
import type { Company, Contact, Modalidade, Product, Quote, QuoteItem } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, money, normalize, quoteTotals, uid } from "@/lib/utils";

const MODO_LABEL: Record<Modalidade, string> = { venda: "Venda", locacao: "Locação mensal", cortesia: "Cortesia (comodato isento)" };
const MODO_HINT: Record<Modalidade, string> = {
  venda: "Pagamento único, com desconto e condição de pagamento do orçamento.",
  locacao: "Comodato pago: valor cobrado por mês durante o prazo. Fica fora do total de venda.",
  cortesia: "Comodato isento: o equipamento fica com o cliente sem cobrança. Registre o motivo.",
};
const DEFAULT_MONTHS = 12;

/** Campo numérico que aceita digitação livre (vírgula, ponto) e só repassa valores válidos. */
function NumInput({ value, onChange, className, min = 0 }: { value: number; onChange: (n: number) => void; className?: string; min?: number }) {
  const fmt = (n: number) => String(n).replace(".", ",");
  const parse = (t: string) => {
    const s = t.trim();
    if (!s) return 0;
    return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  };
  const [text, setText] = useState(fmt(value));
  return (
    <input
      inputMode="decimal"
      className={cn("h-8 rounded-[5px] border border-line bg-white px-2 text-right text-[12.5px] text-ink outline-none focus:border-navy-3", className)}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (Number.isFinite(n) && n >= min) onChange(n);
      }}
    />
  );
}

function modesOf(p?: Product): Modalidade[] {
  return p?.modalidades?.length ? p.modalidades : ["venda"];
}

/** Ajusta preço, prazo e campos da linha conforme a modalidade escolhida (usa o catálogo quando o item veio dele). */
function withMode(item: QuoteItem, modo: Modalidade, product?: Product): QuoteItem {
  const base: QuoteItem = { ...item, modo, motivoCortesia: undefined, precoReferencia: undefined, meses: undefined, prazoPagamento: undefined };
  if (modo === "venda") return { ...base, preco: product ? product.preco : item.modo === "venda" ? item.preco : item.precoReferencia ?? item.preco };
  if (modo === "locacao") return { ...base, preco: product?.precoLocacao ?? (item.modo === "cortesia" ? item.precoReferencia ?? 0 : item.modo === "locacao" ? item.preco : 0), meses: item.meses ?? DEFAULT_MONTHS };
  return { ...base, preco: 0, precoReferencia: product?.precoLocacao ?? (item.modo === "locacao" ? item.preco : item.precoReferencia ?? 0), meses: item.meses ?? DEFAULT_MONTHS, motivoCortesia: item.motivoCortesia ?? "" };
}

function itemFromProduct(p: Product, qtd?: number, modo?: Modalidade): QuoteItem {
  const first = modo ?? modesOf(p)[0];
  const blank: QuoteItem = {
    id: uid("qi"),
    productId: p.id,
    sku: p.sku,
    descricao: p.descricao,
    unidade: p.unidade,
    qtd: qtd ?? (p.unidade === "m" ? 10 : 1),
    preco: p.preco,
    modo: "venda",
    componentes: p.tipo === "kit" && p.componentes.length ? p.componentes : undefined,
  };
  return first === "venda" ? blank : withMode(blank, first, p);
}

/** Sugestão por regra (não é IA): kit pela máquina do cliente e itens de instalação proporcionais à frota. */
function suggestFromFleet(c: Company, products: Product[]): QuoteItem[] {
  const bySku = new Map(products.filter((p) => p.ativo).map((p) => [p.sku, p]));
  const n = Math.max(2, Math.min(c.colhedoras ?? 6, 12));
  const m = (c.modelos ?? "").toLowerCase();
  const kit = m.includes("a9000") ? "KIT-A9000-CB" : m.includes("a8800") ? "KIT-A8800-PC" : m.includes("ch950") && !m.includes("ch570") ? "KIT-CH950-EL" : "KIT-CH570-CB";
  const wanted: [string, number][] = [[kit, n], ["SV-ACAD", 1]];
  if (c.prensa !== "Própria" && c.prensa !== "Comodato Tawper") wanted.push(["EQ-PRENSA-500", 1]);
  return wanted.flatMap(([sku, qtd]) => {
    const p = bySku.get(sku);
    return p ? [itemFromProduct(p, qtd)] : [];
  });
}

async function api<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Falha ao falar com o servidor.");
  return data;
}

/** Montagem, PDF e envio do orçamento (etapa Orçamento). Tudo é gravado no banco. */
export function QuoteModal({ dealId, quoteId }: { dealId: string; quoteId?: string }) {
  const s = useStore();
  const user = useCurrentUser();
  const { close, open, toast } = useUI();
  const { products, load: loadCatalog, loading: catalogLoading, error: catalogError } = useCatalog();
  const deal = s.deals.find((d) => d.id === dealId);
  const company = s.companies.find((c) => c.id === deal?.companyId);
  const existing = quoteId ? s.quotes.find((q) => q.id === quoteId) : s.quotes.find((q) => q.dealId === dealId && q.status === "rascunho");
  const locked = Boolean(existing && existing.status !== "rascunho");

  const [itens, setItens] = useState<QuoteItem[]>(() => existing?.itens ?? []);
  const [desconto, setDesconto] = useState(existing?.desconto ?? 0);
  const [condicao, setCondicao] = useState(existing?.condicao ?? "28 dias");
  const [validade, setValidade] = useState(existing?.validadeDias ?? 15);
  const [obs, setObs] = useState(existing?.observacoes ?? "");
  const [savedId, setSavedId] = useState<string | undefined>(existing?.id);
  const [busy, setBusy] = useState<"" | "save" | "pdf" | "send" | "dup">("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"edit" | "send">("edit");
  const [search, setSearch] = useState("");
  const [linha, setLinha] = useState("");
  const [contactId, setContactId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const contacts = useMemo(() => s.contacts.filter((c) => c.companyId === company?.id && c.ativo), [s.contacts, company?.id]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const linhas = useMemo(() => Array.from(new Set(products.filter((p) => p.ativo).map((p) => p.linha))).sort(), [products]);
  const catalog = useMemo(() => {
    const n = normalize(search);
    return products.filter((p) => p.ativo && (!linha || p.linha === linha) && (!n || normalize(`${p.sku} ${p.descricao} ${p.norma ?? ""} ${p.compatibilidade ?? ""}`).includes(n)));
  }, [products, search, linha]);

  if (!deal || !company) return null;
  const totals = quoteTotals(itens, desconto);
  const condicoes = CONDICOES_PAGAMENTO.includes(condicao) ? CONDICOES_PAGAMENTO : [condicao, ...CONDICOES_PAGAMENTO];
  const numero = existing?.numero;
  const hasSale = itens.some((i) => i.modo === "venda");

  const patch = (id: string, change: Partial<QuoteItem>) => setItens((xs) => xs.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const remove = (id: string) => setItens((xs) => xs.filter((x) => x.id !== id));
  const changeMode = (it: QuoteItem, modo: Modalidade) => setItens((xs) => xs.map((x) => (x.id === it.id ? withMode(x, modo, it.productId ? byId.get(it.productId) : undefined) : x)));
  const addProduct = (p: Product) =>
    setItens((xs) => {
      const found = xs.find((x) => x.productId === p.id && x.modo === modesOf(p)[0]);
      return found ? xs.map((x) => (x.id === found.id ? { ...x, qtd: x.qtd + (p.unidade === "m" ? 10 : 1) } : x)) : [...xs, itemFromProduct(p)];
    });
  const addBlank = () => setItens((xs) => [...xs, { id: uid("qi"), sku: "AVULSO", descricao: "", unidade: "un", qtd: 1, preco: 0, modo: "venda" }]);
  const suggest = () => {
    const fleet = suggestFromFleet(company, products);
    if (!fleet.length) return setError("Nenhum item sugerido está no catálogo. Cadastre os produtos primeiro.");
    setError("");
    setItens((xs) => [...xs, ...fleet.filter((f) => !xs.some((x) => x.sku === f.sku))]);
  };

  const validateLocal = () => {
    if (!itens.length) return "Adicione pelo menos um item.";
    for (const i of itens) {
      if (!i.descricao.trim()) return "Há item sem descrição.";
      if (i.modo === "locacao" && !(i.preco > 0)) return `Informe o valor mensal da locação de "${i.descricao}".`;
      if (i.modo !== "venda" && !((i.meses ?? 0) >= 1)) return `Informe o prazo em meses de "${i.descricao}".`;
      if (i.modo === "cortesia" && !i.motivoCortesia?.trim()) return `Informe o motivo da cortesia de "${i.descricao}".`;
    }
    return "";
  };

  /** Grava (cria ou atualiza) o rascunho no banco e devolve o orçamento salvo. */
  const persist = async (): Promise<Quote> => {
    const { quote } = await api<{ quote: Quote }>("/api/quotes", {
      action: "save",
      actorId: user?.id,
      quote: {
        id: savedId,
        companyId: company.id,
        dealId: deal.id,
        itens: itens.map((it) => ({ ...it, id: undefined })),
        desconto,
        condicao,
        validadeDias: validade,
        observacoes: obs,
      },
    });
    setSavedId(quote.id);
    s.upsertQuote(quote);
    return quote;
  };

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    const problem = locked ? "" : validateLocal();
    if (problem && kind !== "dup") return setError(problem);
    setBusy(kind);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.");
    } finally {
      setBusy("");
    }
  };

  const saveDraft = () =>
    run("save", async () => {
      await persist();
      toast("Orçamento salvo como rascunho");
      close();
    });

  const viewPdf = () =>
    run("pdf", async () => {
      const id = locked ? existing!.id : (await persist()).id;
      window.open(`/api/quotes/${id}/pdf`, "_blank", "noopener");
    });

  const downloadPdf = () =>
    run("pdf", async () => {
      const id = locked ? existing!.id : (await persist()).id;
      const a = document.createElement("a");
      a.href = `/api/quotes/${id}/pdf?download=1`;
      a.click();
    });

  const duplicate = () =>
    run("dup", async () => {
      const { quote } = await api<{ quote: Quote }>("/api/quotes", { action: "duplicate", id: existing!.id, actorId: user?.id });
      s.upsertQuote(quote);
      toast(`Nova versão criada: ${quote.numero}`, { sub: "Rascunho com os mesmos itens" });
      close();
      setTimeout(() => open({ kind: "quote", dealId: deal.id, quoteId: quote.id }), 120);
    });

  const afterSend = (quote: Quote, sub: string) => {
    s.upsertQuote(quote);
    s.afterQuoteSent(quote);
    toast(`Orçamento ${quote.numero} enviado`, { sub });
    close();
    const targetId = deal.funnel === "aquisicao" ? "orcamento" : "orcamento_r";
    const cur = stageIndex(deal.funnel, deal.stageId);
    const tgt = stageIndex(deal.funnel, targetId);
    if (cur < tgt) setTimeout(() => open({ kind: "move", dealId: deal.id, toStageId: targetId, preChecks: deal.funnel === "aquisicao" ? { solicitacao_orcamento: true } : { demanda_confirmada: true } }), 150);
    else if (deal.funnel === "aquisicao" && deal.stageId === "orcamento") setTimeout(() => open({ kind: "move", dealId: deal.id, toStageId: "negociacao" }), 150);
  };

  const goSend = () =>
    run("save", async () => {
      await persist();
      const first = contacts.find((c) => c.whatsapp && c.autorizaContato) ?? contacts.find((c) => c.whatsapp);
      setContactId((cur) => cur || first?.id || "");
      setMessage((m) => m || `Olá! Segue o orçamento${numero ? ` ${numero}` : ""}. Qualquer dúvida estou à disposição.`);
      setStep("send");
    });

  const summary = [totals.total > 0 || hasSale ? money(totals.total, true) : "", totals.mensal > 0 ? `${money(totals.mensal, true)}/mês` : ""].filter(Boolean).join(" + ") || "sem cobrança";

  const sendWhatsApp = () =>
    run("send", async () => {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) throw new Error("Escolha o contato que vai receber o orçamento.");
      if (!user) throw new Error("Escolha seu perfil de atendente no topo da tela.");
      const id = savedId ?? (await persist()).id;
      const { quote } = await api<{ quote: Quote }>("/api/quotes", {
        action: "send",
        send: { quoteId: id, via: "whatsapp", contactId: contact.id, message, agent: { id: user.id, name: user.short || user.name, role: user.role } },
      });
      afterSend(quote, `${contact.nome} · ${summary} · follow-up em 3 dias`);
    });

  const sendManual = () =>
    run("send", async () => {
      const id = savedId ?? (await persist()).id;
      const { quote } = await api<{ quote: Quote }>("/api/quotes", { action: "send", send: { quoteId: id, via: "manual", contactId: contactId || undefined, actorId: user?.id } });
      afterSend(quote, `Registrado como enviado por fora · ${summary}`);
    });

  const title = locked ? `Orçamento ${numero}` : numero ? `Orçamento ${numero} (rascunho)` : "Novo orçamento";
  const selected: Contact | undefined = contacts.find((c) => c.id === contactId);

  const footer =
    step === "send" ? (
      <>
        <Button variant="ghost" onClick={() => setStep("edit")} disabled={busy !== ""}>
          Voltar
        </Button>
        <Button variant="outline" onClick={sendManual} disabled={busy !== ""} title="Use depois de baixar o PDF e enviar por e-mail ou outro meio">
          Já enviei por fora
        </Button>
        <Button variant="primary" onClick={sendWhatsApp} disabled={busy !== "" || !selected?.whatsapp}>
          <Send size={15} /> {busy === "send" ? "Enviando…" : "Enviar pelo WhatsApp"}
        </Button>
      </>
    ) : locked ? (
      <>
        <Button variant="ghost" onClick={close}>
          Fechar
        </Button>
        <Button variant="outline" onClick={duplicate} disabled={busy !== ""}>
          <Copy size={15} /> Criar nova versão
        </Button>
        <Button variant="outline" onClick={downloadPdf} disabled={busy !== ""}>
          <Download size={15} /> Baixar PDF
        </Button>
        <Button variant="primary" onClick={viewPdf} disabled={busy !== ""}>
          <FileText size={15} /> Ver PDF
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={close}>
          Cancelar
        </Button>
        <Button variant="outline" onClick={downloadPdf} disabled={busy !== "" || !itens.length}>
          <Download size={15} /> Baixar PDF
        </Button>
        <Button variant="outline" onClick={viewPdf} disabled={busy !== "" || !itens.length}>
          <FileText size={15} /> Ver PDF
        </Button>
        <Button variant="outline" onClick={saveDraft} disabled={busy !== "" || !itens.length}>
          {busy === "save" ? "Salvando…" : "Salvar rascunho"}
        </Button>
        <Button variant="primary" onClick={goSend} disabled={busy !== "" || !itens.length}>
          <Send size={15} /> Enviar ao cliente
        </Button>
      </>
    );

  const input = "h-8 rounded-[5px] border border-line bg-white px-2 text-[12.5px] text-ink outline-none focus:border-navy-3";

  /** Primeira coluna comum a todas as modalidades: descrição, código, kit e seletor de modalidade. */
  const itemCell = (it: QuoteItem) => {
    const p = it.productId ? byId.get(it.productId) : undefined;
    const allowed = it.productId ? modesOf(p) : (["venda", "locacao", "cortesia"] as Modalidade[]);
    const unidades = UNIDADES.some((u) => u.value === it.unidade) ? UNIDADES : [{ value: it.unidade, label: it.unidade }, ...UNIDADES];
    return (
      <td className="px-3 py-2">
        {locked ? (
          <>
            <div className="font-medium text-ink">{it.descricao}</div>
            <div className="text-[11px] text-muted">{it.sku}</div>
          </>
        ) : (
          <>
            <input className={cn(input, "w-full")} value={it.descricao} placeholder="Descrição do item" onChange={(e) => patch(it.id, { descricao: e.target.value })} />
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <input className="h-6 w-28 rounded-[4px] border border-transparent bg-transparent px-1 text-[11px] text-muted outline-none hover:border-line focus:border-navy-3" value={it.sku} onChange={(e) => patch(it.id, { sku: e.target.value.toUpperCase() })} aria-label="Código" />
              <select className="h-6 rounded-[4px] border border-line bg-white px-1 text-[11px] text-ink" value={it.modo} onChange={(e) => changeMode(it, e.target.value as Modalidade)} aria-label="Modalidade" disabled={allowed.length < 2}>
                {MODALIDADES.filter((m) => allowed.includes(m.value)).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select className="h-6 rounded-[4px] border border-line bg-white px-1 text-[11px] text-ink" value={it.unidade} onChange={(e) => patch(it.id, { unidade: e.target.value })} aria-label="Unidade">
                {unidades.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {it.componentes && it.componentes.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 border-l-2 border-line pl-2 text-[11px] text-muted">
            {it.componentes.map((c) => (
              <li key={c.sku}>
                {c.qtd} {c.unidade} · {c.descricao}
              </li>
            ))}
          </ul>
        )}
      </td>
    );
  };

  const removeCell = (it: QuoteItem) =>
    locked ? null : (
      <td className="px-2 pt-2.5">
        <button type="button" onClick={() => remove(it.id)} className="text-muted hover:text-brand" aria-label="Remover item">
          <Trash2 size={14} />
        </button>
      </td>
    );

  const head = (labels: [string, string][]) => (
    <thead className="bg-soft/40 text-left">
      <tr className="text-muted">
        {labels.map(([l, cls]) => (
          <th key={l} className={cn("px-2 py-2 font-semibold first:px-3", cls)}>
            {l}
          </th>
        ))}
        {!locked && <th className="w-8" />}
      </tr>
    </thead>
  );

  const section = (modo: Modalidade, rows: QuoteItem[], subtotal: string) =>
    rows.length === 0 ? null : (
      <div key={modo} className="mb-4">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-navy">{MODO_LABEL[modo]}</h3>
          <span className="text-[11.5px] text-muted">{MODO_HINT[modo]}</span>
          <span className="ml-auto text-[12.5px] font-semibold text-ink">{subtotal}</span>
        </div>
        <div className="overflow-x-auto rounded-[6px] border border-line">
          <table className="w-full min-w-[640px] text-[12.5px]">
            {modo === "venda" &&
              head([
                ["Item", ""],
                ["Qtd.", "w-20 text-right"],
                ["Unitário", "w-28 text-right"],
                ["Total", "w-28 !px-3 text-right"],
              ])}
            {modo === "locacao" &&
              head([
                ["Item", ""],
                ["Qtd.", "w-20 text-right"],
                ["Valor mensal", "w-28 text-right"],
                ["Prazo (meses)", "w-24 text-right"],
                ["Total mensal", "w-28 !px-3 text-right"],
              ])}
            {modo === "cortesia" &&
              head([
                ["Item", ""],
                ["Qtd.", "w-20 text-right"],
                ["Prazo (meses)", "w-24 text-right"],
                ["Referência/mês", "w-28 text-right"],
                ["Cobrado", "w-24 !px-3 text-right"],
              ])}
            <tbody>
              {rows.map((it) => (
                <tr key={it.id} className="border-t border-line/70 align-top">
                  {itemCell(it)}
                  <td className="px-2 py-2 text-right">{locked ? it.qtd : <NumInput className="w-[72px]" value={it.qtd} onChange={(n) => patch(it.id, { qtd: n })} />}</td>
                  {modo === "venda" && (
                    <>
                      <td className="px-2 py-2 text-right">{locked ? money(it.preco, true) : <NumInput className="w-[104px]" value={it.preco} onChange={(n) => patch(it.id, { preco: n })} />}</td>
                      <td className="px-3 py-2 pt-3 text-right font-semibold">{money(it.qtd * it.preco, true)}</td>
                    </>
                  )}
                  {modo === "locacao" && (
                    <>
                      <td className="px-2 py-2 text-right">{locked ? money(it.preco, true) : <NumInput className="w-[104px]" value={it.preco} onChange={(n) => patch(it.id, { preco: n })} />}</td>
                      <td className="px-2 py-2 text-right">{locked ? it.meses : <NumInput className="w-[72px]" value={it.meses ?? DEFAULT_MONTHS} min={1} onChange={(n) => patch(it.id, { meses: Math.round(n) })} />}</td>
                      <td className="px-3 py-2 pt-3 text-right font-semibold">{money(it.qtd * it.preco, true)}/mês</td>
                    </>
                  )}
                  {modo === "cortesia" && (
                    <>
                      <td className="px-2 py-2 text-right">{locked ? it.meses : <NumInput className="w-[72px]" value={it.meses ?? DEFAULT_MONTHS} min={1} onChange={(n) => patch(it.id, { meses: Math.round(n) })} />}</td>
                      <td className="px-2 py-2 text-right">
                        {locked ? money(it.precoReferencia ?? 0, true) : <NumInput className="w-[104px]" value={it.precoReferencia ?? 0} onChange={(n) => patch(it.id, { precoReferencia: n })} />}
                        {!locked && (
                          <input
                            className={cn(input, "mt-1 w-full min-w-[180px] text-left")}
                            placeholder="Motivo da cortesia"
                            value={it.motivoCortesia ?? ""}
                            onChange={(e) => patch(it.id, { motivoCortesia: e.target.value })}
                            aria-label="Motivo da cortesia"
                          />
                        )}
                        {locked && it.motivoCortesia && <div className="mt-1 text-left text-[11px] text-muted">Motivo: {it.motivoCortesia}</div>}
                      </td>
                      <td className="px-3 py-2 pt-3 text-right font-semibold text-ok">{money(0, true)}</td>
                    </>
                  )}
                  {removeCell(it)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

  return (
    <Modal onClose={close} size="xl" kicker={`${company.nome} · ${getStage(deal.funnel, deal.stageId).nome}`} title={title} icon={<FileText size={18} />} footer={footer}>
      {error && <div className="mb-3 rounded-[6px] border border-brand/25 bg-brand-soft px-3 py-2 text-[12.5px] text-brand">{error}</div>}

      {step === "send" ? (
        <div className="mx-auto max-w-xl space-y-4">
          <div className="rounded-[6px] border border-line bg-soft/40 p-3 text-[12.5px]">
            <div className="font-semibold text-ink">
              {numero} · {summary}
            </div>
            <div className="text-muted">
              {itens.length} itens · {hasSale ? `${condicao} · ` : ""}validade {validade} dias
            </div>
          </div>
          <div>
            <div className="label mb-2">Para quem enviar</div>
            {contacts.length === 0 && <p className="text-[12.5px] text-muted">Esta empresa não tem contatos ativos. Cadastre um contato na empresa ou use &quot;Já enviei por fora&quot;.</p>}
            <ul className="space-y-1.5">
              {contacts.map((c) => {
                const ok = Boolean(c.whatsapp);
                return (
                  <li key={c.id}>
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded-[6px] border px-3 py-2.5", contactId === c.id ? "border-navy bg-soft/50" : "border-line bg-white", !ok && "opacity-55")}>
                      <input type="radio" name="contato" className="accent-navy" checked={contactId === c.id} disabled={!ok} onChange={() => setContactId(c.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink">
                          {c.nome} {c.cargo && <span className="font-normal text-muted">· {c.cargo}</span>}
                        </span>
                        <span className="text-[11.5px] text-muted">{ok ? c.whatsapp : "sem WhatsApp cadastrado"}</span>
                      </span>
                      {ok && !c.autorizaContato && <Badge tone="amber">sem autorização de contato</Badge>}
                      {ok && <MessageCircle size={15} className="text-ok" />}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <Field label="Mensagem que acompanha o PDF">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <p className="text-[12px] text-muted">O PDF {`Orcamento_${numero}.pdf`} é anexado na conversa pelo número de WhatsApp conectado. O orçamento só vira &quot;enviado&quot; depois que o WhatsApp aceitar a mensagem.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          {!locked && (
            <aside className="space-y-3">
              <Button variant="ghost" size="sm" className="w-full border border-line" onClick={suggest}>
                <Sparkles size={14} /> Sugerir pela frota ({company.colhedoras ?? "?"} colhedoras)
              </Button>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
                <Input className="h-9 pl-8 text-[12.5px]" placeholder="Buscar no catálogo…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select className="h-9 text-[12.5px]" value={linha} onChange={(e) => setLinha(e.target.value)}>
                <option value="">Todas as linhas</option>
                {linhas.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
              <ul className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto pr-1">
                {catalogLoading && !products.length && <li className="py-4 text-center text-[12px] text-muted">Carregando catálogo…</li>}
                {catalogError && <li className="py-2 text-[12px] text-brand">{catalogError}</li>}
                {!catalogLoading && !catalogError && catalog.length === 0 && <li className="py-4 text-center text-[12px] text-muted">{products.length ? "Nada encontrado." : "Catálogo vazio. Cadastre produtos em Catálogo."}</li>}
                {catalog.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => addProduct(p)} className="flex w-full items-start gap-2 rounded-[5px] border border-line bg-white px-2.5 py-2 text-left hover:border-navy/40">
                      <Plus size={14} className="mt-0.5 shrink-0 text-brand" />
                      <span className="min-w-0">
                        <span className="block text-[12px] leading-snug font-medium text-ink">{p.descricao}</span>
                        <span className="text-[11px] text-muted">
                          {p.sku} · {p.preco ? money(p.preco, true) : "sem preço"} / {p.unidade}
                          {p.precoLocacao != null && ` · locação ${money(p.precoLocacao, true)}/mês`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" className="w-full" onClick={addBlank}>
                <Plus size={14} /> Item avulso (fora do catálogo)
              </Button>
            </aside>
          )}

          <section className={cn("min-w-0", locked && "lg:col-span-2")}>
            {itens.length === 0 && (
              <div className="rounded-[6px] border border-dashed border-line px-3 py-10 text-center text-[12.5px] text-muted">
                Orçamento em branco. Clique num produto do catálogo, adicione um item avulso ou peça a sugestão pela frota.
              </div>
            )}
            {section("venda", itens.filter((i) => i.modo === "venda"), `Subtotal ${money(totals.bruto, true)}`)}
            {section("locacao", itens.filter((i) => i.modo === "locacao"), `${money(totals.mensal, true)} por mês`)}
            {section("cortesia", itens.filter((i) => i.modo === "cortesia"), "não cobrado")}

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_280px]">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Desconto % (na venda)">
                    <Input type="number" min={0} max={100} value={desconto} disabled={locked} onChange={(e) => setDesconto(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
                  </Field>
                  <Field label="Pagamento da venda">
                    <Select value={condicao} disabled={locked} onChange={(e) => setCondicao(e.target.value)}>
                      {condicoes.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Validade (dias)">
                    <Input type="number" min={1} value={validade} disabled={locked} onChange={(e) => setValidade(Math.max(1, Number(e.target.value) || 1))} />
                  </Field>
                </div>
                <Field label="Observações no PDF" hint="prazo de entrega, frete, garantia…">
                  <Textarea value={obs} disabled={locked} onChange={(e) => setObs(e.target.value)} className="min-h-16" />
                </Field>
              </div>
              <div className="space-y-2 self-start rounded-[6px] bg-navy p-4 text-white">
                {hasSale && (
                  <div>
                    <div className="flex justify-between text-[12px] text-white/70">
                      <span>Subtotal de venda</span>
                      <span>{money(totals.bruto, true)}</span>
                    </div>
                    <div className="flex justify-between text-[12px] text-white/70">
                      <span>Desconto ({desconto}%)</span>
                      <span>− {money(totals.desconto, true)}</span>
                    </div>
                    <div className="mt-1 flex items-end justify-between border-t border-white/15 pt-1.5">
                      <span className="label text-white/60">Total da venda</span>
                      <span className="text-[19px] font-bold">{money(totals.total, true)}</span>
                    </div>
                  </div>
                )}
                {totals.mensal > 0 && (
                  <div className="border-t border-white/15 pt-2">
                    <div className="flex items-end justify-between">
                      <span className="label text-white/60">Locação mensal</span>
                      <span className="text-[17px] font-bold">{money(totals.mensal, true)}/mês</span>
                    </div>
                    <div className="text-right text-[11px] text-white/60">{money(totals.contratoLocacao, true)} no contrato</div>
                  </div>
                )}
                {itens.some((i) => i.modo === "cortesia") && (
                  <div className="flex justify-between border-t border-white/15 pt-2 text-[12px] text-white/70">
                    <span>Cortesia (não cobrado)</span>
                    <span>ref. {money(totals.cortesiaRef, true)}</span>
                  </div>
                )}
                {!itens.length && <div className="text-[12px] text-white/60">Sem itens.</div>}
              </div>
            </div>
            {desconto > 5 && hasSale && (
              <div className="mt-3">
                <Badge tone="amber">Desconto acima de 5% — confirme com o gestor antes de enviar</Badge>
              </div>
            )}
            {locked && existing && (
              <p className="mt-3 text-[12px] text-muted">
                Orçamento {existing.status}
                {existing.enviadoPara?.via === "manual" ? " (enviado por fora do sistema)" : existing.enviadoPara?.via === "whatsapp" ? " pelo WhatsApp" : ""}. Para mudar valores, crie uma nova versão.
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
