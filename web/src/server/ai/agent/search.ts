import { FUNNELS } from "@/lib/constants";
import type { Activity, Company, Contact, Deal } from "@/lib/types";
import { nameSimilarity, normalize } from "@/lib/utils";

export type CompanyMatch = { company: Company; score: number; motivos: string[] };

type Base = { companies: Company[]; contacts: Contact[] };

function digits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
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
    if (q.length >= 3 && (name.includes(q) || q.includes(name))) {
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
  const next = base.activities
    .filter((activity) => activity.companyId === company.id && activity.status === "pendente")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  return {
    id: company.id,
    codigo: company.codigo,
    nome: company.nome,
    cidade: company.cidade ? `${company.cidade}${company.uf ? `/${company.uf}` : ""}` : undefined,
    status: company.status,
    responsavel: ownerName(company.ownerId),
    contatos: base.contacts
      .filter((contact) => contact.companyId === company.id && contact.ativo)
      .slice(0, 4)
      .map((contact) => ({ nome: contact.nome, cargo: contact.cargo, papel: contact.papel, whatsapp: contact.whatsapp })),
    negocio_aberto: deal ? { id: deal.id, funil: FUNNELS[deal.funnel]?.nome ?? deal.funnel, etapa: stageName(deal) } : null,
    proximo_passo: next ? { titulo: next.titulo, prazo: next.dueAt } : null,
  };
}
