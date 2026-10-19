"use client";

// Catálogo de produtos vindo do banco (/api/catalog). Não é persistido no navegador.

import { create } from "zustand";
import type { Product } from "./types";

export type ProductDraft = Omit<Product, "id" | "ativo" | "componentes" | "kitPreco"> & {
  id?: string;
  ativo?: boolean;
  kitPreco?: "soma" | "fixo";
  componentes?: { productId: string; qtd: number }[];
};

interface CatalogState {
  products: Product[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  save: (product: ProductDraft) => Promise<Product>;
  setActive: (id: string, ativo: boolean) => Promise<void>;
}

async function call<T>(init?: RequestInit): Promise<T> {
  const res = await fetch("/api/catalog", init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || "Falha ao falar com o catálogo.");
  return body;
}

function upsert(list: Product[], p: Product) {
  const rest = list.filter((x) => x.id !== p.id);
  return [...rest, p].sort((a, b) => a.linha.localeCompare(b.linha) || a.sku.localeCompare(b.sku));
}

export const useCatalog = create<CatalogState>()((set, get) => ({
  products: [],
  loaded: false,
  loading: false,
  error: null,
  load: async (force = false) => {
    if (get().loading || (get().loaded && !force)) return;
    set({ loading: true, error: null });
    try {
      const { products } = await call<{ products: Product[] }>();
      set({ products, loaded: true, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Falha ao carregar o catálogo." });
    }
  },
  save: async (product) => {
    const { product: saved } = await call<{ product: Product }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", product }),
    });
    set((s) => ({ products: upsert(s.products, saved) }));
    return saved;
  },
  setActive: async (id, ativo) => {
    const { product } = await call<{ product: Product }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setActive", id, ativo }),
    });
    set((s) => ({ products: upsert(s.products, product) }));
  },
}));
