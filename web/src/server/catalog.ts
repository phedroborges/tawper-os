import "server-only";

import { UNIDADES } from "@/lib/constants";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import type { KitComponent, Modalidade, Product, ProductKind } from "@/lib/types";

type Row = Record<string, unknown>;

const KIND_FROM_DB: Record<string, ProductKind> = { product: "produto", equipment: "equipamento", service: "servico", kit: "kit" };
const KIND_TO_DB: Record<ProductKind, string> = { produto: "product", equipamento: "equipment", servico: "service", kit: "kit" };
const MODE_FROM_DB: Record<string, Modalidade> = { sale: "venda", rental: "locacao", courtesy: "cortesia" };
const MODE_TO_DB: Record<Modalidade, string> = { venda: "sale", locacao: "rental", cortesia: "courtesy" };

function text(v: unknown): string | undefined {
  const t = typeof v === "string" ? v.trim() : "";
  return t || undefined;
}

function isUuid(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function productFromRow(row: Row, componentes: KitComponent[]): Product {
  const modes = Array.isArray(row.allowed_modes) ? (row.allowed_modes as string[]) : ["sale"];
  const kitPreco = row.kit_price_mode === "sum" ? "soma" : "fixo";
  const tipo = KIND_FROM_DB[(row.kind as string) ?? "product"] ?? "produto";
  let preco = Number(row.list_price ?? 0);
  if (tipo === "kit" && kitPreco === "soma") {
    preco = Math.round(componentes.reduce((acc, c) => acc + c.qtd * (c.preco ?? 0), 0) * 100) / 100;
  }
  return {
    id: row.id as string,
    sku: row.sku as string,
    descricao: row.description as string,
    unidade: (row.unit as string) || "un",
    preco,
    precoLocacao: row.rental_price != null ? Number(row.rental_price) : undefined,
    linha: (row.product_line as string) || "Sem linha",
    tipo,
    modalidades: modes.map((m) => MODE_FROM_DB[m]).filter(Boolean),
    kitPreco,
    componentes,
    ativo: Boolean(row.is_active),
    marca: text(row.brand),
    bitola: text(row.size),
    norma: text(row.standard),
    pressaoBar: row.pressure_bar != null ? Number(row.pressure_bar) : undefined,
    compatibilidade: text(row.compatibility),
    ncm: text(row.ncm),
    observacoes: text(row.notes),
  };
}

/** Lê produtos e composições de uma vez e resolve o preço dos kits "soma". */
async function loadAll(): Promise<Product[]> {
  const sb = getSupabaseAdmin();
  const [products, components] = await Promise.all([
    sb.from("products").select("*").eq("organization_id", TAWPER_ORG_ID).order("product_line", { ascending: true }).order("sku", { ascending: true }),
    sb.from("product_components").select("kit_id, component_id, quantity, position").eq("organization_id", TAWPER_ORG_ID),
  ]);
  if (products.error) throw new Error(products.error.message);
  if (components.error) throw new Error(components.error.message);

  const byId = new Map((products.data ?? []).map((p) => [p.id as string, p]));
  const byKit = new Map<string, KitComponent[]>();
  const ordered = [...(components.data ?? [])].sort((a, b) => Number(a.position) - Number(b.position));
  for (const c of ordered) {
    const base = byId.get(c.component_id as string);
    if (!base) continue;
    const list = byKit.get(c.kit_id as string) ?? [];
    list.push({
      productId: base.id as string,
      sku: base.sku as string,
      descricao: base.description as string,
      unidade: base.unit as string,
      qtd: Number(c.quantity),
      preco: Number(base.list_price ?? 0),
    });
    byKit.set(c.kit_id as string, list);
  }
  return (products.data ?? []).map((p) => productFromRow(p, byKit.get(p.id as string) ?? []));
}

export async function listProducts(): Promise<Product[]> {
  return loadAll();
}

export type ProductInput = Omit<Product, "id" | "ativo" | "componentes" | "kitPreco"> & {
  id?: string;
  ativo?: boolean;
  kitPreco?: "soma" | "fixo";
  componentes?: { productId: string; qtd: number }[];
};

const UNIT_VALUES = new Set(UNIDADES.map((u) => u.value));

function toRow(input: ProductInput) {
  const sku = input.sku.trim().toUpperCase();
  const descricao = input.descricao.trim();
  if (!sku) throw new Error("Informe o código (SKU) do produto.");
  if (!descricao) throw new Error("Informe a descrição do produto.");
  if (!KIND_TO_DB[input.tipo]) throw new Error("Escolha o tipo do produto.");
  if (!UNIT_VALUES.has(input.unidade)) throw new Error("Escolha a unidade de medida na lista.");

  const preco = Number(input.preco);
  if (!Number.isFinite(preco) || preco < 0) throw new Error("Preço inválido.");
  const locacao = input.precoLocacao == null || Number.isNaN(Number(input.precoLocacao)) ? null : Number(input.precoLocacao);
  if (locacao != null && locacao < 0) throw new Error("Valor de locação inválido.");
  const pressao = input.pressaoBar == null || Number.isNaN(Number(input.pressaoBar)) ? null : Number(input.pressaoBar);
  if (pressao != null && pressao < 0) throw new Error("Pressão inválida.");

  const modes = Array.from(new Set(input.modalidades ?? [])).filter((m) => MODE_TO_DB[m]);
  if (!modes.length) throw new Error("Marque pelo menos uma modalidade (venda, locação ou cortesia).");
  if (input.tipo === "servico" && modes.some((m) => m !== "venda")) throw new Error("Serviço só pode ser vendido.");
  if (input.tipo === "kit" && modes.some((m) => m !== "venda")) throw new Error("Kit só pode ser vendido.");
  if (modes.some((m) => m === "locacao" || m === "cortesia") && locacao == null) {
    throw new Error("Para aceitar locação ou cortesia, informe o valor mensal de locação (usado como referência na cortesia).");
  }

  return {
    sku,
    description: descricao,
    unit: input.unidade,
    list_price: Math.round(preco * 100) / 100,
    rental_price: locacao == null ? null : Math.round(locacao * 100) / 100,
    product_line: input.linha.trim() || null,
    kind: KIND_TO_DB[input.tipo],
    allowed_modes: modes.map((m) => MODE_TO_DB[m]),
    kit_price_mode: input.tipo === "kit" && input.kitPreco === "soma" ? "sum" : "fixed",
    brand: text(input.marca) ?? null,
    size: text(input.bitola) ?? null,
    standard: text(input.norma) ?? null,
    pressure_bar: pressao,
    compatibility: text(input.compatibilidade) ?? null,
    ncm: text(input.ncm) ?? null,
    notes: text(input.observacoes) ?? null,
  };
}

async function writeComponents(kitId: string, input: ProductInput) {
  const sb = getSupabaseAdmin();
  const del = await sb.from("product_components").delete().eq("kit_id", kitId);
  if (del.error) throw new Error(del.error.message);
  if (input.tipo !== "kit") return;

  const items = (input.componentes ?? []).filter((c) => isUuid(c.productId) && Number(c.qtd) > 0);
  if (!items.length) throw new Error("Um kit precisa de pelo menos um produto na composição.");
  if (new Set(items.map((c) => c.productId)).size !== items.length) throw new Error("Há produto repetido na composição do kit.");
  if (items.some((c) => c.productId === kitId)) throw new Error("Um kit não pode conter a si mesmo.");

  const found = await sb.from("products").select("id, kind").eq("organization_id", TAWPER_ORG_ID).in("id", items.map((c) => c.productId));
  if (found.error) throw new Error(found.error.message);
  const kinds = new Map((found.data ?? []).map((p) => [p.id as string, p.kind as string]));
  for (const c of items) {
    const kind = kinds.get(c.productId);
    if (!kind) throw new Error("Há componente que não existe mais no catálogo.");
    if (kind === "kit") throw new Error("Um kit só pode ser montado com produtos unitários, não com outros kits.");
  }

  const ins = await sb.from("product_components").insert(
    items.map((c, position) => ({ organization_id: TAWPER_ORG_ID, kit_id: kitId, component_id: c.productId, quantity: Number(c.qtd), position })),
  );
  if (ins.error) throw new Error(ins.error.message);
}

export async function saveProduct(input: ProductInput): Promise<Product> {
  const sb = getSupabaseAdmin();
  const row = toRow(input);
  const res = input.id
    ? await sb.from("products").update(row).eq("id", input.id).eq("organization_id", TAWPER_ORG_ID).select("id").single()
    : await sb.from("products").insert({ ...row, organization_id: TAWPER_ORG_ID }).select("id").single();
  if (res.error) {
    if (res.error.code === "23505") throw new Error(`Já existe um produto com o código ${row.sku}.`);
    throw new Error(res.error.message);
  }
  const id = res.data.id as string;
  try {
    await writeComponents(id, input);
  } catch (e) {
    // Kit novo sem composição válida não deve ficar gravado pela metade.
    if (!input.id) await sb.from("products").delete().eq("id", id);
    throw e;
  }
  const saved = (await loadAll()).find((p) => p.id === id);
  if (!saved) throw new Error("Produto salvo, mas não foi possível relê-lo.");
  return saved;
}

export async function setProductActive(id: string, ativo: boolean): Promise<Product> {
  const res = await getSupabaseAdmin().from("products").update({ is_active: ativo }).eq("id", id).eq("organization_id", TAWPER_ORG_ID).select("id").single();
  if (res.error) throw new Error(res.error.message);
  const saved = (await loadAll()).find((p) => p.id === id);
  if (!saved) throw new Error("Produto não encontrado.");
  return saved;
}
