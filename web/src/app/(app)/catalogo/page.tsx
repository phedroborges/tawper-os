"use client";

import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Badge, Button, Card, Checkbox, Empty, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { useCatalog } from "@/lib/catalog-store";
import { MODALIDADES, TIPOS_PRODUTO, UNIDADES } from "@/lib/constants";
import type { Modalidade, Product, ProductKind } from "@/lib/types";
import { money, normalize } from "@/lib/utils";

const TIPO_LABEL: Record<ProductKind, string> = { produto: "Produto", equipamento: "Equipamento", kit: "Kit", servico: "Serviço" };
const MODO_LABEL: Record<Modalidade, string> = { venda: "venda", locacao: "locação", cortesia: "cortesia" };

type Form = {
  id?: string;
  sku: string;
  descricao: string;
  linha: string;
  tipo: ProductKind;
  unidade: string;
  preco: string;
  precoLocacao: string;
  modalidades: Modalidade[];
  kitPreco: "soma" | "fixo";
  componentes: { productId: string; qtd: string }[];
  marca: string;
  bitola: string;
  norma: string;
  pressaoBar: string;
  compatibilidade: string;
  ncm: string;
  observacoes: string;
};

const EMPTY: Form = {
  sku: "", descricao: "", linha: "", tipo: "produto", unidade: "un", preco: "", precoLocacao: "", modalidades: ["venda"], kitPreco: "fixo", componentes: [],
  marca: "", bitola: "", norma: "", pressaoBar: "", compatibilidade: "", ncm: "", observacoes: "",
};

const comma = (n?: number) => (n == null ? "" : String(n).replace(".", ","));

function toForm(p: Product): Form {
  return {
    id: p.id, sku: p.sku, descricao: p.descricao, linha: p.linha, tipo: p.tipo, unidade: p.unidade, preco: comma(p.preco), precoLocacao: comma(p.precoLocacao),
    modalidades: p.modalidades, kitPreco: p.kitPreco, componentes: p.componentes.map((c) => ({ productId: c.productId ?? "", qtd: comma(c.qtd) })),
    marca: p.marca ?? "", bitola: p.bitola ?? "", norma: p.norma ?? "", pressaoBar: comma(p.pressaoBar), compatibilidade: p.compatibilidade ?? "", ncm: p.ncm ?? "",
    observacoes: p.observacoes ?? "",
  };
}

function num(v: string) {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** Modalidades que fazem sentido para cada tipo. */
function modosPermitidos(tipo: ProductKind): Modalidade[] {
  return tipo === "equipamento" ? ["venda", "locacao", "cortesia"] : ["venda"];
}

function ProductModal({ initial, linhas, onClose }: { initial: Form; linhas: string[]; onClose: () => void }) {
  const { save, products } = useCatalog();
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const isKit = f.tipo === "kit";
  const allowed = modosPermitidos(f.tipo);
  const hasRental = f.modalidades.includes("locacao") || f.modalidades.includes("cortesia");
  const unitProducts = useMemo(() => products.filter((p) => p.ativo && p.tipo !== "kit" && p.id !== f.id), [products, f.id]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const somaComponentes = f.componentes.reduce((acc, c) => acc + (byId.get(c.productId)?.preco ?? 0) * (Number.isFinite(num(c.qtd)) ? num(c.qtd) : 0), 0);

  const changeTipo = (tipo: ProductKind) =>
    setF((x) => ({
      ...x,
      tipo,
      modalidades: x.modalidades.filter((m) => modosPermitidos(tipo).includes(m)).length ? x.modalidades.filter((m) => modosPermitidos(tipo).includes(m)) : ["venda"],
      unidade: tipo === "kit" ? "kit" : x.unidade,
    }));
  const toggleModo = (m: Modalidade, on: boolean) =>
    setF((x) => {
      const next = on ? Array.from(new Set([...x.modalidades, m])) : x.modalidades.filter((y) => y !== m);
      return { ...x, modalidades: next.length ? next : x.modalidades };
    });
  const addComponent = () => {
    if (!pick || f.componentes.some((c) => c.productId === pick)) return;
    setF((x) => ({ ...x, componentes: [...x.componentes, { productId: pick, qtd: "1" }] }));
    setPick("");
  };

  const submit = async () => {
    const preco = isKit && f.kitPreco === "soma" ? 0 : f.preco.trim() === "" ? 0 : num(f.preco);
    if (Number.isNaN(preco)) return setError("Preço inválido. Use o formato 1234,56.");
    const locacao = f.precoLocacao.trim() === "" ? undefined : num(f.precoLocacao);
    if (locacao !== undefined && Number.isNaN(locacao)) return setError("Valor de locação inválido.");
    const pressao = f.pressaoBar.trim() === "" ? undefined : num(f.pressaoBar);
    if (pressao !== undefined && Number.isNaN(pressao)) return setError("Pressão inválida.");
    const componentes = f.componentes.map((c) => ({ productId: c.productId, qtd: num(c.qtd) }));
    if (isKit && componentes.some((c) => !(c.qtd > 0))) return setError("Informe a quantidade de cada componente do kit.");
    setBusy(true);
    setError("");
    try {
      await save({
        id: f.id, sku: f.sku, descricao: f.descricao, linha: f.linha, tipo: f.tipo, unidade: f.unidade, preco, precoLocacao: hasRental ? locacao : undefined,
        modalidades: f.modalidades, kitPreco: f.kitPreco, componentes: isKit ? componentes : [],
        marca: f.marca, bitola: f.bitola, norma: f.norma, pressaoBar: pressao, compatibilidade: f.compatibilidade, ncm: f.ncm, observacoes: f.observacoes,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="lg"
      icon={<Package size={18} />}
      kicker="Catálogo"
      title={f.id ? "Editar produto" : "Novo produto"}
      footer={
        <>
          {error && <span className="mr-auto text-[12.5px] text-brand">{error}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || !f.sku.trim() || !f.descricao.trim()}>
            {busy ? "Salvando…" : "Salvar produto"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Tipo" required hint={TIPOS_PRODUTO.find((t) => t.value === f.tipo)?.hint}>
          <Select value={f.tipo} onChange={(e) => changeTipo(e.target.value as ProductKind)}>
            {TIPOS_PRODUTO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Código (SKU)" required>
          <Input value={f.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} placeholder="MH-4SH-34" />
        </Field>
        <Field label="Linha" hint="agrupa no catálogo">
          <Input value={f.linha} onChange={(e) => set("linha", e.target.value)} list="linhas-catalogo" placeholder="Mangueiras" />
          <datalist id="linhas-catalogo">
            {linhas.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Descrição" required className="md:col-span-3">
          <Input value={f.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder='Mangueira 4 espirais 4SH 3/4" — alta pressão' />
        </Field>
        <Field label="Unidade de medida" required>
          <Select value={f.unidade} onChange={(e) => set("unidade", e.target.value)}>
            {UNIDADES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={isKit && f.kitPreco === "soma" ? "Preço de venda (soma dos componentes)" : "Preço de venda (R$)"}>
          {isKit && f.kitPreco === "soma" ? (
            <Input value={money(somaComponentes, true)} disabled readOnly />
          ) : (
            <Input inputMode="decimal" value={f.preco} onChange={(e) => set("preco", e.target.value)} placeholder="0,00" />
          )}
        </Field>
        <Field label="NCM">
          <Input value={f.ncm} onChange={(e) => set("ncm", e.target.value)} placeholder="4009.42.90" />
        </Field>
      </div>

      <div className="label mt-5 mb-2">Como pode ser oferecido no orçamento</div>
      <div className="grid gap-2 md:grid-cols-3">
        {MODALIDADES.map((m) => (
          <Checkbox key={m.value} checked={f.modalidades.includes(m.value)} disabled={!allowed.includes(m.value)} onChange={(v) => toggleModo(m.value, v)} label={m.label} sub={m.hint} />
        ))}
      </div>
      {f.tipo !== "equipamento" && <p className="mt-1.5 text-[12px] text-muted">Locação e cortesia (comodato) valem só para equipamento. {isKit ? "Kit" : "Este tipo"} é vendido.</p>}
      {hasRental && (
        <div className="mt-3 max-w-xs">
          <Field label="Valor mensal de locação (R$)" required hint="também é a referência da cortesia">
            <Input inputMode="decimal" value={f.precoLocacao} onChange={(e) => set("precoLocacao", e.target.value)} placeholder="0,00" />
          </Field>
        </div>
      )}

      {isKit && (
        <>
          <div className="label mt-5 mb-2">Composição do kit</div>
          <div className="mb-2 flex flex-wrap gap-4 text-[12.5px]">
            <label className="flex items-center gap-2">
              <input type="radio" className="accent-navy" checked={f.kitPreco === "soma"} onChange={() => set("kitPreco", "soma")} /> Preço = soma dos componentes
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" className="accent-navy" checked={f.kitPreco === "fixo"} onChange={() => set("kitPreco", "fixo")} /> Preço fechado (informado acima)
            </label>
          </div>
          <div className="overflow-hidden rounded-[6px] border border-line">
            <table className="w-full text-[12.5px]">
              <tbody>
                {f.componentes.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-muted">Adicione os produtos unitários que formam o kit.</td>
                  </tr>
                )}
                {f.componentes.map((c, i) => {
                  const p = byId.get(c.productId);
                  return (
                    <tr key={c.productId} className="border-b border-line/70 last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="text-ink">{p?.descricao ?? "Produto removido"}</div>
                        <div className="text-[11px] text-muted">
                          {p?.sku} · {p ? money(p.preco, true) : "—"} / {p?.unidade}
                        </div>
                      </td>
                      <td className="w-28 px-2 py-2">
                        <Input
                          className="h-8 text-right"
                          inputMode="decimal"
                          value={c.qtd}
                          onChange={(e) => set("componentes", f.componentes.map((x, k) => (k === i ? { ...x, qtd: e.target.value } : x)))}
                          aria-label="Quantidade"
                        />
                      </td>
                      <td className="w-10 px-2">
                        <button type="button" className="text-muted hover:text-brand" aria-label="Remover componente" onClick={() => set("componentes", f.componentes.filter((_, k) => k !== i))}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex gap-2">
            <Select className="flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Escolha um produto para incluir…</option>
              {unitProducts
                .filter((p) => !f.componentes.some((c) => c.productId === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.descricao}
                  </option>
                ))}
            </Select>
            <Button variant="outline" onClick={addComponent} disabled={!pick}>
              <Plus size={14} /> Incluir
            </Button>
          </div>
          <p className="mt-1.5 text-[12px] text-muted">Soma dos componentes a preço de tabela: {money(somaComponentes, true)}.</p>
        </>
      )}

      <div className="label mt-5 mb-2">Especificação técnica</div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Bitola / diâmetro / medida">
          <Input value={f.bitola} onChange={(e) => set("bitola", e.target.value)} placeholder='3/4"' />
        </Field>
        <Field label="Norma / padrão" hint="SAE, JIC, ORFS, BSP…">
          <Input value={f.norma} onChange={(e) => set("norma", e.target.value)} placeholder="SAE 100 R2AT" />
        </Field>
        <Field label="Pressão de trabalho (bar)">
          <Input inputMode="decimal" value={f.pressaoBar} onChange={(e) => set("pressaoBar", e.target.value)} placeholder="350" />
        </Field>
        <Field label="Marca / fabricante">
          <Input value={f.marca} onChange={(e) => set("marca", e.target.value)} />
        </Field>
        <Field label="Compatibilidade" hint="máquina ou modelo" className="md:col-span-2">
          <Input value={f.compatibilidade} onChange={(e) => set("compatibilidade", e.target.value)} placeholder="John Deere CH570" />
        </Field>
        <Field label="Observações" className="md:col-span-3">
          <Textarea value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function CatalogoPage() {
  const { products, loaded, loading, error, load, setActive } = useCatalog();
  const [q, setQ] = useState("");
  const [linha, setLinha] = useState("");
  const [tipo, setTipo] = useState("");
  const [mostrar, setMostrar] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [editing, setEditing] = useState<Form | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  const linhas = useMemo(() => Array.from(new Set(products.map((p) => p.linha))).sort(), [products]);
  const rows = useMemo(() => {
    const n = normalize(q);
    return products.filter((p) => {
      if (mostrar === "ativos" && !p.ativo) return false;
      if (mostrar === "inativos" && p.ativo) return false;
      if (linha && p.linha !== linha) return false;
      if (tipo && p.tipo !== tipo) return false;
      if (!n) return true;
      return normalize([p.sku, p.descricao, p.norma, p.bitola, p.marca, p.compatibilidade, p.ncm].filter(Boolean).join(" ")).includes(n);
    });
  }, [products, q, linha, tipo, mostrar]);

  const toggle = async (p: Product) => {
    setActionError("");
    try {
      await setActive(p.id, !p.ativo);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Não foi possível alterar o produto.");
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Catálogo de produtos"
        subtitle="Produtos, equipamentos, kits e serviços usados nos orçamentos. Sem controle de estoque. A modalidade (venda, locação ou cortesia) é escolhida em cada orçamento."
        actions={
          <Button variant="primary" onClick={() => setEditing({ ...EMPTY, linha: linha || "" })}>
            <Plus size={15} /> Novo produto
          </Button>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Buscar por código, descrição, norma, bitola, máquina…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-40" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TIPOS_PRODUTO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select className="w-48" value={linha} onChange={(e) => setLinha(e.target.value)}>
            <option value="">Todas as linhas</option>
            {linhas.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
          <Select className="w-36" value={mostrar} onChange={(e) => setMostrar(e.target.value as typeof mostrar)}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </Select>
        </div>
      </Card>

      {(error || actionError) && <div className="mb-3 rounded-[6px] border border-brand/25 bg-brand-soft px-3 py-2 text-[12.5px] text-brand">{error || actionError}</div>}

      <Card className="overflow-hidden">
        {loading && !loaded ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">Carregando catálogo…</div>
        ) : rows.length === 0 ? (
          <Empty
            icon={<Package size={18} />}
            title={products.length ? "Nenhum produto com esse filtro" : "Nenhum produto cadastrado"}
            text={products.length ? "Ajuste a busca ou os filtros." : "Cadastre o primeiro produto para usá-lo nos orçamentos."}
            action={
              !products.length && (
                <Button variant="primary" size="sm" onClick={() => setEditing(EMPTY)}>
                  <Plus size={14} /> Novo produto
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-[12.5px]">
              <thead className="bg-soft/40 text-left text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Código</th>
                  <th className="px-3 py-2.5 font-semibold">Descrição</th>
                  <th className="px-3 py-2.5 font-semibold">Especificação</th>
                  <th className="px-3 py-2.5 font-semibold">Un.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Preços</th>
                  <th className="w-40 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const spec = [p.bitola, p.norma, p.pressaoBar != null ? `${p.pressaoBar} bar` : "", p.compatibilidade].filter(Boolean).join(" · ");
                  return (
                    <tr key={p.id} className="border-t border-line/70 align-top hover:bg-soft/30">
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap text-ink">{p.sku}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-ink">{p.descricao}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          {p.linha}
                          <Badge tone="outline">{TIPO_LABEL[p.tipo]}</Badge>
                          {p.tipo === "kit" && <Badge tone="neutral">{p.componentes.length} componentes</Badge>}
                          {p.modalidades.filter((m) => m !== "venda").map((m) => (
                            <Badge key={m} tone="ai">
                              {MODO_LABEL[m]}
                            </Badge>
                          ))}
                          {!p.ativo && <Badge tone="neutral">inativo</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{spec || "—"}</td>
                      <td className="px-3 py-2.5">{p.unidade}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="font-semibold text-ink">{p.preco ? money(p.preco, true) : "—"}</div>
                        {p.precoLocacao != null && <div className="text-[11.5px] text-muted">{money(p.precoLocacao, true)} / mês</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <Button size="xs" variant="outline" onClick={() => setEditing(toForm(p))}>
                            <Pencil size={12} /> Editar
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => toggle(p)}>
                            {p.ativo ? "Inativar" : "Reativar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[12px] text-muted">
        {rows.length} de {products.length} itens. Mudar o preço aqui não altera orçamentos já criados: cada orçamento guarda o preço do momento.
      </p>

      {editing && <ProductModal key={editing.id ?? "novo"} initial={editing} linhas={linhas} onClose={() => setEditing(null)} />}
    </div>
  );
}
