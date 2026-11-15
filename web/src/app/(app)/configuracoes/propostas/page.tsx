"use client";

import { FileSpreadsheet, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Empty,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { DEFAULT_PROPOSAL_STANDARD, type ProposalStandardConfig } from "@/lib/config";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useAction } from "@/lib/use-action";

function normalizeStandard(raw?: ProposalStandardConfig | null): ProposalStandardConfig {
  if (!raw) {
    return {
      ...DEFAULT_PROPOSAL_STANDARD,
      validadesDias: [...DEFAULT_PROPOSAL_STANDARD.validadesDias],
      condicoesPagamento: [...DEFAULT_PROPOSAL_STANDARD.condicoesPagamento],
      opcoesFrete: [...DEFAULT_PROPOSAL_STANDARD.opcoesFrete],
      opcoesEntrega: [...DEFAULT_PROPOSAL_STANDARD.opcoesEntrega],
    };
  }
  return {
    ...DEFAULT_PROPOSAL_STANDARD,
    ...raw,
    validadesDias: raw.validadesDias?.length ? [...raw.validadesDias] : [...DEFAULT_PROPOSAL_STANDARD.validadesDias],
    condicoesPagamento: raw.condicoesPagamento?.length
      ? [...raw.condicoesPagamento]
      : [...DEFAULT_PROPOSAL_STANDARD.condicoesPagamento],
    opcoesFrete: raw.opcoesFrete?.length ? [...raw.opcoesFrete] : [...DEFAULT_PROPOSAL_STANDARD.opcoesFrete],
    opcoesEntrega: raw.opcoesEntrega?.length ? [...raw.opcoesEntrega] : [...DEFAULT_PROPOSAL_STANDARD.opcoesEntrega],
  };
}

export default function ConfigPropostasPage() {
  const user = useCurrentUser();
  const s = useStore();
  const toast = useUI((x) => x.toast);
  const saveAction = useAction();

  const [form, setForm] = useState<ProposalStandardConfig>(() => normalizeStandard(s.config.proposalStandard));
  const [newPayment, setNewPayment] = useState("");
  const [newValidity, setNewValidity] = useState("");
  const [newFreight, setNewFreight] = useState("");
  const [newDelivery, setNewDelivery] = useState("");

  if (user?.role !== "admin") {
    return (
      <Empty
        icon={<FileSpreadsheet size={20} />}
        title="Área do administrador"
        text="Somente o administrador pode criar ou alterar condições comerciais e o padrão oficial das propostas."
      />
    );
  }

  const addOption = (field: "condicoesPagamento" | "opcoesFrete" | "opcoesEntrega", rawValue: string, clear: () => void) => {
    const val = rawValue.trim();
    if (!val) return;
    if (form[field].some((x) => x.toLowerCase() === val.toLowerCase())) {
      toast("Opção já cadastrada", { tone: "warn" });
      return;
    }
    setForm((cur) => ({ ...cur, [field]: [...cur[field], val] }));
    clear();
  };

  const removeOption = (
    listField: "condicoesPagamento" | "opcoesFrete" | "opcoesEntrega",
    defaultField: "condicaoPagamento" | "frete" | "prazoEntrega",
    val: string,
  ) => {
    if (form[listField].length <= 1) {
      toast("Mantenha ao menos 1 opção cadastrada", { tone: "warn" });
      return;
    }
    setForm((cur) => {
      const next = cur[listField].filter((x) => x !== val);
      const nextDefault = cur[defaultField] === val ? (next[0] ?? "") : cur[defaultField];
      return { ...cur, [listField]: next, [defaultField]: nextDefault };
    });
  };

  const addValidity = () => {
    const n = Math.round(Number(newValidity));
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      toast("Informe entre 1 e 365 dias", { tone: "warn" });
      return;
    }
    if (form.validadesDias.includes(n)) {
      toast("Prazo de validade já cadastrado", { tone: "warn" });
      return;
    }
    setForm((cur) => ({
      ...cur,
      validadesDias: [...cur.validadesDias, n].sort((a, b) => a - b),
    }));
    setNewValidity("");
  };

  const removeValidity = (days: number) => {
    if (form.validadesDias.length <= 1) {
      toast("Mantenha ao menos 1 validade cadastrada", { tone: "warn" });
      return;
    }
    setForm((cur) => {
      const next = cur.validadesDias.filter((d) => d !== days);
      const nextDefault = cur.validadeDias === days ? (next[0] ?? 15) : cur.validadeDias;
      return { ...cur, validadesDias: next, validadeDias: nextDefault };
    });
  };

  const handleSave = () => {
    void saveAction.run(async () => {
      await s.saveConfig("proposalStandard", form);
      toast("Condições comerciais salvas", {
        sub: "Toda a equipe já passa a usar as novas opções e padrões no gerador de propostas.",
      });
    });
  };

  const handleReset = () => {
    setForm(normalizeStandard(null));
    toast("Padrão restaurado no formulário", { sub: "Clique em Salvar alterações para aplicar." });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Condições da Proposta Comercial"
        subtitle="Cadastre formas de pagamento, validades em dias, frete e prazos de entrega disponíveis para a equipe ao montar propostas com orçamento ERP."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={handleReset} disabled={saveAction.busy}>
              <RotateCcw size={14} /> Restaurar padrão
            </Button>
            <Button size="sm" variant="primary" onClick={handleSave} disabled={saveAction.busy}>
              <Save size={14} /> {saveAction.busy ? "Salvando…" : "Salvar alterações"}
            </Button>
          </>
        }
      />

      {saveAction.error && (
        <div className="rounded-[8px] border border-brand/30 bg-brand-soft px-4 py-2.5 text-[12.5px] font-medium text-brand">
          {saveAction.error}
        </div>
      )}

      {/* Pagamento e Validade */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            kicker="Pagamento"
            title="Condições de Pagamento"
            action={<Badge tone="navy">{form.condicoesPagamento.length} opções</Badge>}
          />
          <div className="space-y-4 border-t border-line/70 px-4 py-4">
            <Field label="Condição padrão nas novas propostas">
              <Select
                value={form.condicaoPagamento}
                onChange={(e) => setForm((cur) => ({ ...cur, condicaoPagamento: e.target.value }))}
              >
                {form.condicoesPagamento.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-1.5">
              <div className="text-[12px] font-semibold text-ink">Opções disponíveis</div>
              <ul className="divide-y divide-line/60 rounded-[6px] border border-line bg-white">
                {form.condicoesPagamento.map((opt) => (
                  <li key={opt} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-ink">
                      {opt}
                      {form.condicaoPagamento === opt && (
                        <Badge tone="green" className="ml-2">
                          Padrão
                        </Badge>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeOption("condicoesPagamento", "condicaoPagamento", opt)}
                      className="rounded p-1 text-muted hover:bg-brand-soft hover:text-brand"
                      title="Remover condição"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-2">
              <Input
                value={newPayment}
                onChange={(e) => setNewPayment(e.target.value)}
                placeholder="Ex.: 30/60/90/120 dias ou Sinal 30% + 28 DDL"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption("condicoesPagamento", newPayment, () => setNewPayment(""));
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => addOption("condicoesPagamento", newPayment, () => setNewPayment(""))}
              >
                <Plus size={14} /> Adicionar
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            kicker="Vigência"
            title="Validade da Proposta (dias)"
            action={<Badge tone="navy">{form.validadesDias.length} opções</Badge>}
          />
          <div className="space-y-4 border-t border-line/70 px-4 py-4">
            <Field label="Validade padrão nas novas propostas">
              <Select
                value={String(form.validadeDias)}
                onChange={(e) => setForm((cur) => ({ ...cur, validadeDias: Number(e.target.value) || 15 }))}
              >
                {form.validadesDias.map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-1.5">
              <div className="text-[12px] font-semibold text-ink">Prazos disponíveis</div>
              <div className="flex flex-wrap gap-2">
                {form.validadesDias.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 rounded-[6px] border border-line bg-soft/45 px-2.5 py-1.5 text-[12.5px] font-medium text-ink"
                  >
                    {d} dias
                    {form.validadeDias === d && <Badge tone="green">Padrão</Badge>}
                    <button
                      type="button"
                      onClick={() => removeValidity(d)}
                      className="ml-0.5 rounded p-0.5 text-muted hover:text-brand"
                      title="Remover prazo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={newValidity}
                onChange={(e) => setNewValidity(e.target.value)}
                placeholder="Ex.: 10, 45 ou 60 dias"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addValidity();
                  }
                }}
              />
              <Button size="sm" variant="outline" onClick={addValidity}>
                <Plus size={14} /> Adicionar dias
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Frete e Prazo de Entrega */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader kicker="Logística" title="Opções de Frete" />
          <div className="space-y-4 border-t border-line/70 px-4 py-4">
            <Field label="Frete padrão">
              <Select
                value={form.frete}
                onChange={(e) => setForm((cur) => ({ ...cur, frete: e.target.value }))}
              >
                {form.opcoesFrete.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </Field>
            <ul className="divide-y divide-line/60 rounded-[6px] border border-line bg-white">
              {form.opcoesFrete.map((opt) => (
                <li key={opt} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate text-ink">{opt}</span>
                  <button
                    type="button"
                    onClick={() => removeOption("opcoesFrete", "frete", opt)}
                    className="rounded p-1 text-muted hover:bg-brand-soft hover:text-brand"
                    title="Remover opção de frete"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newFreight}
                onChange={(e) => setNewFreight(e.target.value)}
                placeholder="Nova opção de frete..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption("opcoesFrete", newFreight, () => setNewFreight(""));
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => addOption("opcoesFrete", newFreight, () => setNewFreight(""))}
              >
                <Plus size={14} /> Adicionar
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader kicker="Atendimento" title="Prazos de Entrega / Implantação" />
          <div className="space-y-4 border-t border-line/70 px-4 py-4">
            <Field label="Prazo de entrega padrão">
              <Select
                value={form.prazoEntrega}
                onChange={(e) => setForm((cur) => ({ ...cur, prazoEntrega: e.target.value }))}
              >
                {form.opcoesEntrega.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </Field>
            <ul className="divide-y divide-line/60 rounded-[6px] border border-line bg-white">
              {form.opcoesEntrega.map((opt) => (
                <li key={opt} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate text-ink">{opt}</span>
                  <button
                    type="button"
                    onClick={() => removeOption("opcoesEntrega", "prazoEntrega", opt)}
                    className="rounded p-1 text-muted hover:bg-brand-soft hover:text-brand"
                    title="Remover prazo"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newDelivery}
                onChange={(e) => setNewDelivery(e.target.value)}
                placeholder="Novo prazo de entrega / implantação..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption("opcoesEntrega", newDelivery, () => setNewDelivery(""));
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => addOption("opcoesEntrega", newDelivery, () => setNewDelivery(""))}
              >
                <Plus size={14} /> Adicionar
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Regras de Exibição e Texto Padrão */}
      <Card>
        <CardHeader kicker="Política Padrão" title="Formato e Observações Oficiais" />
        <div className="space-y-4 border-t border-line/70 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox
              checked={form.mostrarValores}
              onChange={(on) => setForm((cur) => ({ ...cur, mostrarValores: on }))}
              label="Destacar valor total do orçamento ERP na capa e resumo"
              sub="O valor é lido do PDF do ERP anexado pelo vendedor."
            />
            <Checkbox
              checked={form.incluirInstitucional}
              onChange={(on) => setForm((cur) => ({ ...cur, incluirInstitucional: on }))}
              label="Incluir apresentação executiva Tawper (8 páginas A4)"
              sub="Sempre antes das páginas originais do orçamento do ERP."
            />
          </div>
          <Field
            label="Observações padrão da proposta"
            hint="Incluídas automaticamente nas condições comerciais"
          >
            <Textarea
              value={form.observacoesPadrao}
              onChange={(e) => setForm((cur) => ({ ...cur, observacoesPadrao: e.target.value }))}
              placeholder="Ex.: Preços e quantidades descritos no orçamento oficial do ERP Tawper anexo."
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
