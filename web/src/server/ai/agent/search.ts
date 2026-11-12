import { FUNNELS, papelRotulo } from "@/lib/constants";
import type { Activity, Company, Contact, Deal } from "@/lib/types";
import { nameSimilarity, normalize } from "@/lib/utils";
import { fmtWhen } from "./dates";

export type CompanyMatch = { company: Company; score: number; motivos: string[] };

type Base = { companies: Company[]; contacts: Contact[] };

function digits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

/** Palavras que aparecem em quase todo nome de cliente: sozinhas não identificam ninguém. */
const GENERICAS = new Set(["usina", "usinas", "agro", "agroindustrial", "agroindustria", "bioenergia", "acucar", "alcool", "grupo", "empresa", "cia", "ltda", "sa", "de", "da", "do", "dos", "das", "e", "fazenda", "sitio"]);

/** O que sobra do nome sem as palavras genéricas. Vazio = o nome é só "Usina", "Agro"…: não serve para achar por inclusão. */
function significativas(value: string) {
  return normalize(value).split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !GENERICAS.has(word));
}

/** Procura empresas por nome aproximado, CNPJ, telefone ou nome de contato. Mais forte primeiro. */
export function findCompanies(base: Base, query: string, limit = 5, min = 0.6): CompanyMatch[] {
  const q = normalize(query).trim();
  const qDigits = digits(query);
  if (q.length < 2 && qDigits.length < 8) return [];
  const matches: CompanyMatch[] = [];
  for (const company of base.companies) {
    let score = 0;
    const motivos: string[] = [];
    const name = normalize(company.nome);
    // "Usina Zzyx Bela Vista" contém "usina", mas não é a empresa cadastrada só como "USINA": nome só de palavra genérica só casa se for igual.
    const incluso = (q.length >= 3 && name.includes(q)) || (q.includes(name) && (name === q || significativas(company.nome).length > 0));
    if (incluso) {
      score = 1.2;
      motivos.push("nome");
    } else {
      const similarity = nameSimilarity(query, company.nome);
      if (similarity >= min) {
        score = similarity;
        motivos.push("nome parecido");
      }
    }
    if (qDigits.length >= 8) {
      if (digits(company.cnpj) === qDigits) {
        score = 2;
        motivos.push("mesmo CNPJ");
      }
      const tail = qDigits.slice(-8);
      if (base.contacts.some((contact) => contact.companyId === company.id && digits(contact.whatsapp).endsWith(tail))) {
        score = Math.max(score, 1.5);
        motivos.push("mesmo telefone");
      }
    }
    if (q.length >= 4 && base.contacts.some((contact) => contact.companyId === company.id && normalize(contact.nome).includes(q))) {
      score = Math.max(score, 0.9);
      motivos.push("nome de contato");
    }
    if (score >= min) matches.push({ company, score, motivos });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function stageName(deal: Deal) {
  return FUNNELS[deal.funnel]?.stages.find((stage) => stage.id === deal.stageId)?.nome ?? deal.stageId;
}

/** Resumo de uma empresa para o modelo: o suficiente para identificar e decidir o próximo passo. */
export function companyBrief(
  company: Company,
  base: Base & { deals: Deal[]; activities: Activity[] },
  ownerName: (id: string) => string,
) {
  const deal = base.deals.find((item) => item.companyId === company.id && item.status === "aberta");
  const pending = base.activities
    .filter((activity) => activity.companyId === company.id && activity.status === "pendente")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return {
    id: company.id,
    codigo: company.codigo,
    nome: company.nome,
    cidade: company.cidade ? `${company.cidade}${company.uf ? `/${company.uf}` : ""}` : undefined,
    status: company.status,
    responsavel: ownerName(company.ownerId),
    contatos: base.contacts
      .filter((contact) => contact.companyId === company.id && contact.ativo)
      .slice(0, 8)
      .map((contact) => ({ id: contact.id, nome: contact.nome, cargo: contact.cargo || "(não cadastrado)", papel_na_compra: papelRotulo(contact.papel), whatsapp: contact.whatsapp || "(não cadastrado)", email: contact.email || "(não cadastrado)" })),
    negocio_aberto: deal ? { id: deal.id, funil: FUNNELS[deal.funnel]?.nome ?? deal.funnel, etapa: stageName(deal) } : null,
    tarefas_pendentes: pending.slice(0, 6).map((task) => ({ id: task.id, tipo: task.tipo, titulo: task.titulo, prazo: fmtWhen(task.dueAt) })),
  };
}
