"use client";

import { FileUp, Paperclip } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { CONDICOES_PAGAMENTO, papelRotulo, stageIndex } from "@/lib/constants";
import { useStore } from "@/lib/store";
import type { Quote } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { useAction } from "@/lib/use-action";
import { money } from "@/lib/utils";

const MAX_MB = 10;

/**
 * Anexar orçamento: o orçamento é feito no sistema da empresa; aqui o vendedor sobe o PDF,
 * informa número e valor, e o CRM cuida do resto (valor do negócio, follow-up e etapa).
 */
export function QuoteModal({ dealId }: { dealId: string; quoteId?: string }) {
  const s = useStore();
  const { close, open, toast } = useUI();
  const action = useAction();
  const deal = s.deals.find((d) => d.id === dealId);
  const company = s.companies.find((c) => c.id === deal?.companyId);
  const contacts = s.contacts.filter((c) => c.companyId === company?.id && c.ativo);
  const [file, setFile] = useState<File | null>(null);
  const [numero, setNumero] = useState("");
  const [valor, setValor] = useState("");
  const [condicao, setCondicao] = useState("28 dias");
  const [validade, setValidade] = useState(15);
  const [contactId, setContactId] = useState("");
  const [obs, setObs] = useState("");
  if (!deal || !company) return null;

  const total = Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
  const tooBig = Boolean(file && file.size > MAX_MB * 1024 * 1024);
  const ready = Boolean(file) && !tooBig && numero.trim() && total > 0;

  const save = () =>
    void action.run(async () => {
      const form = new FormData();
      form.set("arquivo", file!);
      form.set("companyId", company.id);
      form.set("dealId", deal.id);
      form.set("numero", numero.trim());
      form.set("valor", String(total));
      form.set("condicao", condicao);
      form.set("validade", String(validade));
      form.set("contactId", contactId);
      form.set("observacoes", obs);
      const res = await fetch("/api/quotes", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string; quote?: Quote };
      if (!res.ok || !data.quote) throw new Error(data.error || "Não foi possível anexar o orçamento.");
      s.upsertQuote(data.quote);
      s.afterQuoteSent(data.quote);
      toast(`Orçamento ${numero.trim()} anexado`, { sub: `${money(total)} · follow-up agendado para 3 dias` });
      close();
      // Mesmo caminho de antes: orçamento enviado puxa o negócio para a etapa de orçamento.
      const targetId = deal.funnel === "aquisicao" ? "orcamento" : "orcamento_r";
      if (stageIndex(deal.funnel, deal.stageId) < stageIndex(deal.funnel, targetId)) {
        setTimeout(() => open({ kind: "move", dealId: deal.id, toStageId: targetId, preChecks: deal.funnel === "aquisicao" ? { solicitacao_orcamento: true } : { demanda_confirmada: true } }), 150);
      }
    });

  return (
    <Modal
      onClose={close}
      size="md"
      kicker="Orçamento feito no sistema da empresa"
      title={`Anexar orçamento — ${company.nome}`}
      icon={<Paperclip size={18} />}
      footer={
        <>
          {action.error && <span className="mr-auto text-[12.5px] font-medium text-brand">{action.error}</span>}
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!ready || action.busy}>
            <FileUp size={15} /> {action.busy ? "Enviando…" : "Anexar orçamento"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="PDF do orçamento" hint={`até ${MAX_MB} MB`} required>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full rounded-[6px] border border-dashed border-line bg-soft/40 px-3 py-3 text-[13px] text-ink file:mr-3 file:rounded-[5px] file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-white"
          />
        </Field>
        {tooBig && <div className="-mt-2 text-[12.5px] font-medium text-brand">O arquivo passa de {MAX_MB} MB.</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Número do orçamento" hint="como está no outro sistema" required>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 004512" maxLength={40} />
          </Field>
          <Field label="Valor total (R$)" required>
            <Input value={valor} inputMode="decimal" onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Ex.: 42.500,00" />
          </Field>
          <Field label="Condição de pagamento">
            <Select value={condicao} onChange={(e) => setCondicao(e.target.value)}>
              {CONDICOES_PAGAMENTO.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Validade" hint="em dias">
            <Input type="number" min={1} max={180} value={validade} onChange={(e) => setValidade(Math.max(1, Number(e.target.value) || 15))} />
          </Field>
        </div>
        <Field label="Enviado para" hint="quem recebeu no cliente">
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Não informar</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {papelRotulo(c.papel)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Observações">
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Ex.: Preço válido para retirada em dezembro; frete por conta do cliente" />
        </Field>
        <p className="rounded-[6px] bg-soft/60 px-3 py-2 text-[12px] text-muted">Ao anexar, o valor entra no negócio e o sistema agenda o follow-up do orçamento. O PDF fica guardado e só abre para quem está logado.</p>
      </div>
    </Modal>
  );
}
