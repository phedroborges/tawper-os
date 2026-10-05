"use client";

import { Check, Circle, FileText, Plus, Send, Trophy, XCircle } from "lucide-react";
import { StagePill } from "@/components/crm/crm";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import { FUNNELS, getStage } from "@/lib/constants";
import { dayDiff, fmtDate, fmtDateShort } from "@/lib/dates";
import { criterionMet, openDealOf, quoteExpiresAt } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Company, QuoteStatus } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, money, quoteTotals } from "@/lib/utils";

const QUOTE_TONE: Record<QuoteStatus, "neutral" | "ai" | "green" | "red"> = { rascunho: "neutral", enviado: "ai", aceito: "green", recusado: "red" };

export function DealTab({ company }: { company: Company }) {
  const s = useStore();
  const { open } = useUI();
  const deal = openDealOf(s, company.id);
  const deals = s.deals.filter((d) => d.companyId === company.id).sort((a, b) => (b.closedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.createdAt));
  const quotes = s.quotes.filter((q) => q.companyId === company.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="grid gap-5 p-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        {deal ? (
          <Card className="shadow-none">
            <CardHeader kicker="Oportunidade aberta" title={deal.titulo} action={<StagePill deal={deal} />} />
            <dl className="grid grid-cols-2 gap-3 p-4 text-[12.5px]">
              {[
                ["Valor estimado", money(deal.valor)],
                ["Probabilidade", `${deal.probabilidade ?? getStage(deal.funnel, deal.stageId).probabilidade}%`],
                ["Previsão", deal.previsaoFechamento ? fmtDateShort(deal.previsaoFechamento) : "—"],
                ["Entrou no funil", fmtDateShort(deal.createdAt)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="label">{k}</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {deal.objecao && (
              <div className="mx-4 mb-3 rounded-[5px] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                <b>Objeção registrada:</b> {deal.objecao}
              </div>
            )}
            <div className="border-t border-line/70 px-4 py-3">
              <div className="label mb-2">Critérios do funil</div>
              <ol className="space-y-2">
                {FUNNELS[deal.funnel].stages
                  .filter((st) => st.criterios.length)
                  .map((st) => (
                    <li key={st.id}>
                      <div className={cn("text-[11.5px] font-semibold", st.id === deal.stageId ? "text-brand" : "text-muted")}>
                        {st.nome}
                        {st.id === deal.stageId && " · etapa atual"}
                      </div>
                      <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                        {st.criterios.map((c) => {
                          const ok = criterionMet(s, deal, company, c);
                          return (
                            <li key={c.id} className={cn("inline-flex items-center gap-1.5 text-[12px]", ok ? "text-ink" : "text-muted")}>
                              {ok ? <Check size={13} className="text-ok" /> : <Circle size={11} />}
                              {c.label}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
              </ol>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line/70 bg-soft/40 px-4 py-3">
              <Button size="sm" variant="dark" onClick={() => open({ kind: "move", dealId: deal.id })}>
                Mover etapa
              </Button>
              <Button size="sm" variant="success" onClick={() => open({ kind: "win", dealId: deal.id })}>
                <Trophy size={14} /> Registrar venda
              </Button>
              <Button size="sm" variant="danger" onClick={() => open({ kind: "lose", dealId: deal.id })}>
                <XCircle size={14} /> Perda
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-4 text-[13px] text-muted shadow-none">Nenhuma oportunidade aberta.</Card>
        )}

        <Card className="shadow-none">
          <CardHeader title="Histórico comercial" kicker={`${deals.length} oportunidade(s)`} />
          <ul>
            {deals.map((d) => (
              <li key={d.id} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 text-[12.5px] last:border-b-0">
                <span className={cn("grid size-7 place-items-center rounded-full", d.status === "ganha" ? "bg-ok text-white" : d.status === "perdida" ? "bg-brand-soft text-brand" : "bg-soft text-navy-3")}>
                  {d.status === "ganha" ? <Trophy size={13} /> : d.status === "perdida" ? <XCircle size={13} /> : <Circle size={10} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{d.titulo}</div>
                  <div className="text-[11.5px] text-muted">
                    {FUNNELS[d.funnel].nome} · {d.status === "aberta" ? `em ${getStage(d.funnel, d.stageId).nome}` : d.status === "ganha" ? `ganha em ${fmtDate(d.closedAt)}` : `perdida em ${fmtDate(d.closedAt)} — ${d.motivo}`}
                  </div>
                </div>
                <span className="font-semibold text-ink">{money(d.valorRealizado ?? d.valor)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="self-start shadow-none">
        <CardHeader
          title="Orçamentos"
          kicker={quotes.length ? `${quotes.length} no total` : "nenhum ainda"}
          action={
            deal && (
              <Button size="xs" variant="primary" onClick={() => open({ kind: "quote", dealId: deal.id })}>
                <Plus size={13} /> Novo orçamento
              </Button>
            )
          }
        />
        {quotes.length === 0 && <div className="px-4 py-8 text-center text-[12.5px] text-muted">Monte o primeiro orçamento com a sugestão da IA baseada na frota.</div>}
        <ul>
          {quotes.map((q) => {
            const t = quoteTotals(q.itens, q.desconto).total;
            const left = dayDiff(quoteExpiresAt(q));
            const qDeal = s.deals.find((d) => d.id === q.dealId);
            return (
              <li key={q.id} className="border-b border-line/70 px-4 py-3 last:border-b-0">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-brand" />
                  <span className="text-[13px] font-semibold text-ink">{q.numero}</span>
                  <Badge tone={QUOTE_TONE[q.status]}>{q.status}</Badge>
                  {q.status === "enviado" && <Badge tone={left < 0 ? "red" : left <= 5 ? "amber" : "outline"}>{left < 0 ? `vencido há ${-left}d` : `vence em ${left}d`}</Badge>}
                  <span className="ml-auto text-[14px] font-bold text-ink">{money(t)}</span>
                </div>
                <div className="mt-1 text-[11.5px] text-muted">
                  {q.itens.length} itens · {q.condicao} · desconto {q.desconto}% · {q.enviadoEm ? `enviado em ${fmtDateShort(q.enviadoEm)}` : `criado em ${fmtDateShort(q.createdAt)}`}
                </div>
                <div className="mt-1.5 truncate text-[11.5px] text-ink/70">{q.itens.map((i) => `${i.qtd}${i.unidade === "m" ? "m" : "×"} ${i.descricao.split(" — ")[0]}`).join(" · ")}</div>
                {qDeal?.status === "aberta" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.status === "rascunho" && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => open({ kind: "quote", dealId: q.dealId, quoteId: q.id })}>
                          Editar
                        </Button>
                        <Button size="xs" variant="primary" onClick={() => open({ kind: "quote", dealId: q.dealId, quoteId: q.id })}>
                          <Send size={12} /> Revisar e enviar
                        </Button>
                      </>
                    )}
                    {q.status === "enviado" && (
                      <Button size="xs" variant="success" onClick={() => open({ kind: "win", dealId: q.dealId })}>
                        <Trophy size={12} /> Cliente aprovou — registrar venda
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
