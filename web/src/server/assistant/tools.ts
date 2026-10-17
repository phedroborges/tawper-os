import { z } from "zod";
import type { AssistantSource } from "@/lib/assistant-contract";
import { knowledgeCoverage, normalizeText, readKnowledge, searchKnowledge } from "./knowledge";
import { querySchema, TABLES, type CrmReader, type CrmQuery, type CrmRow } from "./schema";

const searchSchema = z.object({ query: z.string().max(200) }).strict();
const readSchema = z.object({ slideIds: z.array(z.string().regex(/^slide-\d{2}$/)).min(1).max(12) }).strict();
const visitSchema = z.object({ company: z.string().min(1).max(200), person: z.string().max(200).nullable() }).strict();

const FIELD_NAMES: Record<string, string> = {
  trade_name: "Empresa", legal_name: "Razão social", code: "Código", full_name: "Nome", short_name: "Nome curto", title: "Título", name: "Nome", city: "Cidade", state: "Estado", status: "Situação", type: "Tipo", description: "Descrição", outcome: "Resultado", completed_at: "Concluída em", occurred_at: "Registrada em", due_at: "Agendada para", content: "Registro", channel: "Canal", body: "Mensagem", sent_at: "Enviada em", notes: "Observações", summary: "Resumo", raw_text: "Relato", client_pending: "Pendência do cliente", recorded_at: "Registrado em", sku: "SKU", unit: "Unidade", list_price: "Preço de tabela", currency: "Moeda", product_line: "Linha", net_total: "Total líquido", number: "Número", payment_terms: "Condições de pagamento", validity_days: "Validade em dias", amount: "Valor", sold_at: "Venda registrada em", is_active: "Ativo", updated_at: "Atualizado em",
};

function sourceExcerpt(row: CrmRow) {
  return Object.entries(row).filter(([key, value]) => value !== null && value !== undefined && key !== "id" && !key.endsWith("_id") && key !== "normalized_name").map(([key, value]) => `${FIELD_NAMES[key] ?? key.replaceAll("_", " ")}: ${String(value)}`).join("\n");
}

export const toolDefinitions = [
  { name: "search_knowledge", description: "Localiza tópicos na apresentação comercial interna. Retorna índice, não evidência completa; leia os slides com read_knowledge. Nunca busca na internet.", schema: searchSchema },
  { name: "read_knowledge", description: "Lê slides internos com texto original, IDs de fonte e limites. Slides 01–32; a ação de evento do 33 não é conhecimento comercial.", schema: readSchema },
  { name: "query_crm", description: `Consulta somente dados internos reais, sem escrita. Resolva nomes consultando companies/profiles; relacione tabelas por IDs retornados. Filtros são AND. Paginação com total exato; não faça soma de amostra como total. Tabelas: ${Object.entries(TABLES).map(([name, d]) => `${name}: ${d.description} Colunas: ${d.columns}.`).join("\n")}`, schema: querySchema },
  { name: "latest_visit", description: "Use para qualquer pergunta sobre a última visita. Resolve nome/UUID de empresa e pessoa, recusa ambiguidade e busca apenas visitas realizadas e interações de visita, com data e autoria. company pode ser UUID da página. person null significa qualquer pessoa.", schema: visitSchema },
];

export class AssistantTools {
  readonly sources = new Map<string, AssistantSource>();
  readonly calls: string[] = [];
  private queryNumber = 0;
  constructor(private reader: CrmReader | null, private now = new Date()) {}

  private remember(source: AssistantSource) { this.sources.set(source.id, source); return source; }

  private async query(input: CrmQuery) {
    if (!this.reader) return { status: "unavailable", message: "CRM indisponível: credenciais do banco não configuradas. Nenhum dado fictício foi usado." };
    const result = await this.reader.query(input);
    const rows = result.rows.map((row) => {
      const sourceId = `crm:${input.table}:${row.id}`;
      const title = String(row.trade_name ?? row.full_name ?? row.title ?? row.name ?? row.number ?? input.table);
      const companyId = input.table === "companies" ? row.id : row.company_id;
      const source = this.remember({ id: sourceId, title: `CRM · ${title}`, excerpt: sourceExcerpt(row), ...(typeof companyId === "string" && z.string().uuid().safeParse(companyId).success ? { href: `/empresas/${companyId}` } : {}) });
      return { ...row, sourceId: source.id };
    });
    const source = this.remember({ id: `query:${++this.queryNumber}`, title: `Consulta ao CRM · ${input.table}`, excerpt: JSON.stringify({ filters: input.filters, total: result.total, offset: input.offset, returned: rows.length, hasMore: result.hasMore, consultedAt: this.now.toISOString() }, null, 2) });
    return { status: "ok", ...result, rows, sourceId: source.id };
  }

  private async resolve(table: "companies" | "profiles", query: string) {
    const id = z.string().uuid().safeParse(query);
    const field = table === "companies" ? "normalized_name" : "full_name";
    const result = await this.query({ table, filters: [{ field: id.success ? "id" : field, op: id.success ? "eq" : "ilike", value: id.success ? query : table === "companies" ? normalizeText(query) : query }], orderBy: null, descending: false, offset: 0, limit: 50 });
    if (result.status !== "ok" || !("rows" in result)) return result;
    const exact = result.rows.filter((r: CrmRow) => normalizeText(String(r[table === "companies" ? "trade_name" : "full_name"])) === normalizeText(query));
    const matches = exact.length && !result.hasMore ? exact : result.rows;
    if (matches.length !== 1 || result.hasMore) return { status: matches.length ? "ambiguous" : "not_found", entity: table, candidates: matches, hasMore: result.hasMore, sourceId: result.sourceId };
    return { status: "resolved", row: matches[0] as CrmRow };
  }

  private async latestVisit(input: z.infer<typeof visitSchema>) {
    if (!this.reader) return { status: "unavailable", message: "CRM indisponível neste ambiente. Não é possível confirmar visitas nem identificar pessoas." };
    const company = await this.resolve("companies", input.company);
    if (company.status !== "resolved" || !("row" in company) || !company.row) return company;
    const person = input.person ? await this.resolve("profiles", input.person) : null;
    if (person && (person.status !== "resolved" || !("row" in person))) return person;
    const companyId = String(company.row.id);
    const personId = person && "row" in person && person.row ? String(person.row.id) : null;
    const filters: CrmQuery["filters"] = [{ field: "company_id", op: "eq", value: companyId }];
    const [activities, interactions] = await Promise.all([
      this.query({ table: "activities", filters: [...filters, { field: "type", op: "eq", value: "visit" }, { field: "status", op: "eq", value: "done" }, { field: "completed_at", op: "lte", value: this.now.toISOString() }, ...(personId ? [{ field: "owner_id", op: "eq" as const, value: personId }] : [])], orderBy: "completed_at", descending: true, offset: 0, limit: 1 }),
      this.query({ table: "interactions", filters: [...filters, { field: "channel", op: "eq", value: "visit" }, { field: "occurred_at", op: "lte", value: this.now.toISOString() }, ...(personId ? [{ field: "author_id", op: "eq" as const, value: personId }] : [])], orderBy: "occurred_at", descending: true, offset: 0, limit: 1 }),
    ]);
    return {
      status: "ok", company: company.row, person: person && "row" in person ? person.row : null,
      activities, interactions,
      instruction: "Compare completed_at e occurred_at para escolher o registro mais recente. Atividade indica responsável (owner_id), interação indica autor (author_id); não comprovam por si só quem esteve fisicamente no local. Preserve essa distinção. Se não houver resultado, diga que não consta. Não confunda data agendada due_at com data realizada. Para detalhe adicional leia activity_results pelo activity_id.",
    };
  }

  async execute(name: string, raw: unknown): Promise<unknown> {
    this.calls.push(name);
    try {
      if (name === "search_knowledge") return searchKnowledge(searchSchema.parse(raw).query);
      if (name === "read_knowledge") {
        const input = readSchema.parse(raw);
        const sources = readKnowledge(input.slideIds).map((s) => this.remember(s));
        return { coverage: knowledgeCoverage, sources, missing: input.slideIds.filter((id) => !sources.some((s) => s.id.endsWith(`:${id}`))) };
      }
      if (name === "query_crm") return await this.query(querySchema.parse(raw));
      if (name === "latest_visit") return await this.latestVisit(visitSchema.parse(raw));
      return { status: "invalid_tool", message: "Ferramenta não permitida." };
    } catch (error) {
      if (error instanceof z.ZodError) return { status: "invalid_arguments", message: "Parâmetros inválidos. Confira nomes de campos, UUIDs e limites no contrato da ferramenta." };
      return { status: "unavailable", message: "Falha ao consultar os registros internos. Não conclua que registros inexistem e não use dados fictícios." };
    }
  }
}
