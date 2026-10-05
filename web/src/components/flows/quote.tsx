"use client";

import { FileText, Minus, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AIBadge } from "@/components/ai/ai";
import { Modal } from "@/components/ui/overlay";
import { Badge, Button, Field, Input, Select } from "@/components/ui/primitives";
import { CATALOG, CONDICOES_PAGAMENTO, getStage, stageIndex } from "@/lib/constants";
import { useStore } from "@/lib/store";
import type { Company, QuoteItem } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { money, quoteTotals, uid } from "@/lib/utils";

function suggestItems(c: Company): QuoteItem[] {
  const n = Math.max(2, Math.min(c.colhedoras ?? 6, 12));
  const m = (c.modelos ?? "").toLowerCase();
  const kit = m.includes("a9000") ? "KIT-A9000-CB" : m.includes("a8800") ? "KIT-A8800-PC" : m.includes("ch950") && !m.includes("ch570") ? "KIT-CH950-EL" : "KIT-CH570-CB";
  const pick = (sku: string, qtd: number): QuoteItem => {
    const it = CATALOG.find((x) => x.sku === sku)!;
    return { id: uid("qi"), sku, descricao: it.descricao, unidade: it.unidade, qtd, preco: it.preco };
  };
  const items = [pick(kit, n), pick("MH-4SH-34", n * 6), pick("TP-JIC-34", n * 8), pick("CP-ESP-34", n * 4)];
  if (c.prensa !== "Própria" && c.prensa !== "Comodato Tawper") items.push(pick("PR-CMD", 1));
  items.push(pick("SV-ACAD", 1));
  return items;
}

/** Montagem e envio de orçamento (etapa Orçamento). */
export function QuoteModal({ dealId, quoteId }: { dealId: string; quoteId?: string }) {
  const s = useStore();
  const { close, open, toast } = useUI();
  const deal = s.deals.find((d) => d.id === dealId);
  const company = s.companies.find((c) => c.id === deal?.companyId);
  const existing = quoteId ? s.quotes.find((q) => q.id === quoteId) : s.quotes.find((q) => q.dealId === dealId && q.status === "rascunho");
  const companyForInit = s.companies.find((c) => c.id === deal?.companyId);
  const [itens, setItens] = useState<QuoteItem[]>(() => existing?.itens ?? (companyForInit ? suggestItems(companyForInit) : []));
  const [desconto, setDesconto] = useState(existing?.desconto ?? 0);
  const [condicao, setCondicao] = useState(existing?.condicao ?? "28 dias");
  const [validade, setValidade] = useState(existing?.validadeDias ?? 15);
  const [linha, setLinha] = useState("Kits para colhedoras");
  const [aiUsed, setAiUsed] = useState(!existing);
  const [thinking, setThinking] = useState(false);
  const linhas = useMemo(() => Array.from(new Set(CATALOG.map((c) => c.linha))), []);
  if (!deal || !company) return null;
  const totals = quoteTotals(itens, desconto);

  const add = (sku: string) => {
    const it = CATALOG.find((x) => x.sku === sku)!;
    setItens((xs) => {
      const found = xs.find((x) => x.sku === sku);
      if (found) return xs.map((x) => (x.sku === sku ? { ...x, qtd: x.qtd + 1 } : x));
      return [...xs, { id: uid("qi"), sku, descricao: it.descricao, unidade: it.unidade, qtd: it.unidade === "m" ? 10 : 1, preco: it.preco }];
    });
  };
  const setQty = (id: string, qtd: number) => setItens((xs) => xs.map((x) => (x.id === id ? { ...x, qtd: Math.max(0, qtd) } : x)).filter((x) => x.qtd > 0));

  const suggest = () => {
    setThinking(true);
    setTimeout(() => {
      setItens(suggestItems(company));
      setAiUsed(true);
      setThinking(false);
    }, 1300);
  };

  const persist = () => s.saveQuote({ id: existing?.id, companyId: company.id, dealId: deal.id, itens, desconto, condicao, validadeDias: validade });

  const saveDraft = () => {
    persist();
    toast("Orçamento salvo como rascunho");
    close();
  };

  const send = () => {
    const id = persist();
    useStore.getState().sendQuote(id);
    const q = useStore.getState().quotes.find((x) => x.id === id);
    toast(`Orçamento ${q?.numero} enviado`, { sub: `${money(totals.total)} · follow-up agendado em 3 dias` });
    close();
    const targetId = deal.funnel === "aquisicao" ? "orcamento" : "orcamento_r";
    const cur = stageIndex(deal.funnel, deal.stageId);
    const tgt = stageIndex(deal.funnel, targetId);
    if (cur < tgt) setTimeout(() => open({ kind: "move", dealId: deal.id, toStageId: targetId, preChecks: deal.funnel === "aquisicao" ? { solicitacao_orcamento: true } : { demanda_confirmada: true } }), 150);
    else if (deal.funnel === "aquisicao" && deal.stageId === "orcamento") setTimeout(() => open({ kind: "move", dealId: deal.id, toStageId: "negociacao" }), 150);
  };

  return (
    <Modal
      onClose={close}
      size="xl"
      kicker={`${company.nome} · ${getStage(deal.funnel, deal.stageId).nome}`}
      title={existing ? `Orçamento ${existing.numero}` : "Novo orçamento"}
      icon={<FileText size={18} />}
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted">O PDF é gerado e enviado pelo WhatsApp da conta (simulado).</span>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={saveDraft} disabled={!itens.length}>
            Salvar rascunho
          </Button>
          <Button variant="primary" onClick={send} disabled={!itens.length}>
            <Send size={15} /> Enviar ao cliente
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <p className="rounded-[6px] border border-ai/20 bg-ai-soft/60 p-3 text-[12px] leading-relaxed text-ink">
            <Sparkles size={13} className="mr-1 inline text-ai" />
            Itens sugeridos pela frota do cliente ({company.colhedoras ?? "?"} colhedoras{company.modelos ? `, ${company.modelos}` : ""}). Ajuste o que precisar.
          </p>
          <Button variant="ghost" size="sm" className="w-full" onClick={suggest} disabled={thinking}>
            <Sparkles size={14} /> {thinking ? "recalculando…" : "Refazer sugestão"}
          </Button>
          <Field label="Catálogo Tawper">
            <Select value={linha} onChange={(e) => setLinha(e.target.value)}>
              {linhas.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
          <ul className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto pr-1">
            {CATALOG.filter((c) => c.linha === linha).map((c) => (
              <li key={c.sku}>
                <button type="button" onClick={() => add(c.sku)} className="flex w-full items-start gap-2 rounded-[5px] border border-line bg-white px-2.5 py-2 text-left hover:border-navy/40">
                  <Plus size={14} className="mt-0.5 shrink-0 text-brand" />
                  <span className="min-w-0">
                    <span className="block text-[12px] leading-snug font-medium text-ink">{c.descricao}</span>
                    <span className="text-[11px] text-muted">
                      {c.sku} · {c.preco ? money(c.preco, true) : "sem custo"} / {c.unidade}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0">
          <div className="overflow-x-auto rounded-[6px] border border-line">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead className="bg-soft/40 text-left">
                <tr className="text-muted">
                  <th className="px-3 py-2 font-semibold">Item {aiUsed && <AIBadge className="ml-1" label="sugerido pela IA" />}</th>
                  <th className="w-32 px-3 py-2 font-semibold">Qtd.</th>
                  <th className="w-28 px-3 py-2 text-right font-semibold">Unitário</th>
                  <th className="w-28 px-3 py-2 text-right font-semibold">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-muted">
                      Adicione itens do catálogo ou peça uma sugestão para a IA.
                    </td>
                  </tr>
                )}
                {itens.map((it) => (
                  <tr key={it.id} className="border-t border-line/70">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{it.descricao}</div>
                      <div className="text-[11px] text-muted">{it.sku}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button type="button" className="grid size-6 place-items-center rounded-[4px] border border-line" onClick={() => setQty(it.id, it.qtd - (it.unidade === "m" ? 10 : 1))}>
                          <Minus size={12} />
                        </button>
                        <input className="h-6 w-14 rounded-[4px] border border-line text-center" value={it.qtd} onChange={(e) => setQty(it.id, Number(e.target.value) || 0)} />
                        <button type="button" className="grid size-6 place-items-center rounded-[4px] border border-line" onClick={() => setQty(it.id, it.qtd + (it.unidade === "m" ? 10 : 1))}>
                          <Plus size={12} />
                        </button>
                        <span className="text-[11px] text-muted">{it.unidade}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{it.preco ? money(it.preco, true) : "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(it.qtd * it.preco, true)}</td>
                    <td className="px-2">
                      <button type="button" onClick={() => setQty(it.id, 0)} className="text-muted hover:text-brand" aria-label="Remover">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Desconto %">
                <Input type="number" min={0} max={30} value={desconto} onChange={(e) => setDesconto(Number(e.target.value) || 0)} />
              </Field>
              <Field label="Pagamento">
                <Select value={condicao} onChange={(e) => setCondicao(e.target.value)}>
                  {CONDICOES_PAGAMENTO.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Validade (dias)">
                <Input type="number" min={1} value={validade} onChange={(e) => setValidade(Number(e.target.value) || 1)} />
              </Field>
            </div>
            <div className="rounded-[6px] bg-navy p-4 text-white">
              <div className="flex justify-between text-[12px] text-white/70">
                <span>Subtotal</span>
                <span>{money(totals.bruto, true)}</span>
              </div>
              <div className="flex justify-between text-[12px] text-white/70">
                <span>Desconto ({desconto}%)</span>
                <span>− {money(totals.desconto, true)}</span>
              </div>
              <div className="mt-2 flex items-end justify-between border-t border-white/15 pt-2">
                <span className="label text-white/60">Total</span>
                <span className="text-[22px] font-bold">{money(totals.total, true)}</span>
              </div>
            </div>
          </div>
          {desconto > 5 && (
            <div className="mt-3">
              <Badge tone="amber">Desconto acima de 5% — o gestor será notificado</Badge>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
