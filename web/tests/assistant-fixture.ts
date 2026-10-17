import { normalizeText } from "../src/server/assistant/knowledge";
import type { CrmQuery, CrmReader, CrmRow } from "../src/server/assistant/schema";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const fixture: Record<string, CrmRow[]> = {
  companies: [
    { id: id(1), trade_name: "Usina Alfa", normalized_name: "usina alfa", city: "Monte Aprazível", state: "SP" },
    { id: id(2), trade_name: "Usina Alfa Nordeste", normalized_name: "usina alfa nordeste", city: "Maceió", state: "AL" },
    { id: id(3), trade_name: "Usina Beta", normalized_name: "usina beta", city: "Frutal", state: "MG" },
  ],
  profiles: [{ id: id(10), full_name: "Phedro Borges" }, { id: id(11), full_name: "Murilo Souza" }],
  activities: [
    { id: id(20), company_id: id(1), owner_id: id(10), type: "visit", status: "done", due_at: "2026-10-08T10:00:00Z", completed_at: "2026-10-10T15:00:00Z", title: "Visita técnica", outcome: "Phedro esteve na unidade. Cliente solicitou teste em duas colhedoras; aguardando medidas." },
    { id: id(21), company_id: id(1), owner_id: id(11), type: "visit", status: "done", completed_at: "2026-10-16T15:00:00Z", title: "Visita de Murilo", outcome: "Pedido de compra recebido por Murilo." },
    { id: id(22), company_id: id(2), owner_id: id(10), type: "visit", status: "done", completed_at: "2026-10-15T15:00:00Z", title: "Visita à outra usina", outcome: "Negociação encerrada na unidade Nordeste." },
    { id: id(23), company_id: id(1), owner_id: id(10), type: "visit", status: "pending", due_at: "2026-10-20T15:00:00Z", title: "Visita futura", outcome: null },
  ],
  interactions: [{ id: id(30), company_id: id(1), author_id: id(10), channel: "visit", occurred_at: "2026-10-09T15:00:00Z", title: "Visita anterior", content: "Apresentação institucional." }],
};

export class FixtureReader implements CrmReader {
  calls: CrmQuery[] = [];
  constructor(private records = fixture) {}
  async query(input: CrmQuery) {
    this.calls.push(input);
    const rows = (this.records[input.table] ?? []).filter((row) => input.filters.every((f) => {
      const value = row[f.field];
      if (value === undefined || value === null) return false;
      if (f.op === "eq") return String(value) === f.value;
      if (f.op === "ilike") return normalizeText(String(value)).includes(normalizeText(f.value));
      return f.op === "lte" ? String(value) <= f.value : String(value) >= f.value;
    }));
    if (input.orderBy) rows.sort((a, b) => String(a[input.orderBy!] ?? "").localeCompare(String(b[input.orderBy!] ?? "")) * (input.descending ? -1 : 1));
    return { rows: rows.slice(input.offset, input.offset + input.limit), total: rows.length, hasMore: input.offset + input.limit < rows.length };
  }
}
